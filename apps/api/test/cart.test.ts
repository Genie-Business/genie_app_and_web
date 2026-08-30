import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setPaymentProvider } from '../src/modules/payments/provider';
import { ensureWallet } from '../src/modules/payments/wallet.service';
import { getBalanceKobo, postEntry } from '../src/modules/payments/ledger.service';
import { invalidateFeeCache } from '../src/modules/fees/fees.service';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, makeMerchant, makeProduct, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  cart.test.ts skipped — needs a disposable test DB.');

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
let seq = 0;

async function fund(userId: string, kobo: bigint) {
  await ensureWallet(userId);
  await postEntry({ userId, direction: 'CREDIT', amountKobo: kobo, reason: 'FUNDING', idempotencyKey: `cf:${userId}:${(seq += 1)}` });
}

/** Two wishlist items on one celebrant's list, returns their ids + product refs. */
async function wishlistWithItems(app: ReturnType<typeof createApp>) {
  const merchant = await makeMerchant();
  const p1 = await makeProduct(merchant.user.id, { priceKobo: 10_000_00, stock: 5 });
  const p2 = await makeProduct(merchant.user.id, { priceKobo: 4_000_00, stock: 5 });
  const celebrant = await makeCelebrant();
  const ev = await app.request(
    '/v1/events',
    post({ type: 'Birthday', name: 'Bash', eventDate: inDays(20), deliveryAddress: '1 Rd', wishlistName: 'L' }, celebrant.auth),
  );
  const wid = (await body(await app.request(`/v1/events/${(await body(ev)).data.id}`, { headers: celebrant.auth }))).data.wishlists[0].id;
  await app.request(`/v1/wishlists/${wid}/items`, post({ productId: p1.id, quantityWanted: 2 }, celebrant.auth));
  const r2 = await app.request(`/v1/wishlists/${wid}/items`, post({ productId: p2.id, quantityWanted: 2 }, celebrant.auth));
  const items = (await body(r2)).data.items as { id: string; productId: string }[];
  return {
    celebrant,
    p1,
    p2,
    item1: items.find((i) => i.productId === p1.id)!.id,
    item2: items.find((i) => i.productId === p2.id)!.id,
  };
}

d('gift cart (E013)', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setPaymentProvider(null);
    invalidateFeeCache();
    for (const [key, type, value] of [
      ['TRANSACTION_FEE', 'PERCENT', 1.5],
      ['PRODUCT_FEE', 'PERCENT', 5],
      ['LOGISTICS_FEE', 'FLAT', 150_000],
    ] as const) {
      await prisma.feeConfig.upsert({ where: { key }, create: { key, type, value }, update: { type, value } });
    }
  });
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('adds, updates and removes items with live pricing', async () => {
    const { item1, item2 } = await wishlistWithItems(app);
    const gifter = await makeCelebrant();

    let cart = (await body(await app.request('/v1/cart/items', post({ wishlistItemId: item1, quantity: 1 }, gifter.auth)))).data;
    expect(cart.itemCount).toBe(1);
    expect(cart.items[0].lineTotalKobo).toBe('1165000'); // 1,000,000 + 1.5% + ₦1,500

    cart = (await body(await app.request('/v1/cart/items', post({ wishlistItemId: item2, quantity: 2, isAnonymous: true }, gifter.auth)))).data;
    expect(cart.itemCount).toBe(2);
    expect(cart.allGiftable).toBe(true);
    // item2 ×2: subtotal 800,000 + 1.5% (12,000) + ₦1,500 logistics (150,000) = 962,000
    expect(cart.totalKobo).toBe(String(1_165_000 + 962_000));

    const line2 = cart.items.find((i: { wishlistItemId: string }) => i.wishlistItemId === item2);
    expect(line2.isAnonymous).toBe(true);
    cart = (await body(await app.request(`/v1/cart/items/${line2.id}`, { method: 'PATCH', headers: gifter.auth, body: JSON.stringify({ quantity: 1 }) }))).data;
    expect(cart.items.find((i: { wishlistItemId: string }) => i.wishlistItemId === item2).quantity).toBe(1);

    cart = (await body(await app.request(`/v1/cart/items/${line2.id}`, { method: 'DELETE', headers: gifter.auth }))).data;
    expect(cart.itemCount).toBe(1);
  });

  it('checks out the whole cart from the wallet — one payment, many gifts', async () => {
    const { celebrant, item1, item2 } = await wishlistWithItems(app);
    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 50_000_00n);

    await app.request('/v1/cart/items', post({ wishlistItemId: item1, quantity: 1 }, gifter.auth));
    await app.request('/v1/cart/items', post({ wishlistItemId: item2, quantity: 2 }, gifter.auth));

    const res = await app.request('/v1/cart/checkout', post({ method: 'WALLET' }, gifter.auth));
    expect(res.status).toBe(201);
    const out = (await body(res)).data;
    expect(out.status).toBe('PAID');
    expect(out.gifts).toHaveLength(2);
    expect(out.gifts.every((g: { giftId: string }) => g.giftId)).toBe(true);

    // wallet debited the cart total
    expect(await getBalanceKobo(gifter.user.id)).toBe(50_000_00n - BigInt(out.totalKobo));

    // two gifts landed on the celebrant's events
    const received = (await body(await app.request('/v1/gifts/received', { headers: celebrant.auth }))).data;
    expect(received).toHaveLength(2);

    // a fresh cart is empty
    const fresh = (await body(await app.request('/v1/cart', { headers: gifter.auth }))).data;
    expect(fresh.itemCount).toBe(0);
    expect(fresh.status).toBe('OPEN');
  });

  it('rejects checkout when the wallet cannot cover the total', async () => {
    const { item1 } = await wishlistWithItems(app);
    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 5_000_00n);
    await app.request('/v1/cart/items', post({ wishlistItemId: item1, quantity: 1 }, gifter.auth));

    const res = await app.request('/v1/cart/checkout', post({ method: 'WALLET' }, gifter.auth));
    expect(res.status).toBe(409);
    expect((await body(res)).error.code).toBe('insufficient_funds');
    // cart survives
    expect((await body(await app.request('/v1/cart', { headers: gifter.auth }))).data.itemCount).toBe(1);
  });

  it('flags a non-giftable line and blocks checkout', async () => {
    const { p1, item1 } = await wishlistWithItems(app);
    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 50_000_00n);
    await app.request('/v1/cart/items', post({ wishlistItemId: item1, quantity: 1 }, gifter.auth));

    await prisma.inventory.update({ where: { productId: p1.id }, data: { availableStock: 0 } });

    const cart = (await body(await app.request('/v1/cart', { headers: gifter.auth }))).data;
    expect(cart.items[0].giftable).toBe(false);
    expect(cart.allGiftable).toBe(false);

    const res = await app.request('/v1/cart/checkout', post({ method: 'WALLET' }, gifter.auth));
    expect(res.status).toBe(409);
  });

  it('blocks adding an item from your own wishlist', async () => {
    const { celebrant, item1 } = await wishlistWithItems(app);
    const res = await app.request('/v1/cart/items', post({ wishlistItemId: item1, quantity: 1 }, celebrant.auth));
    expect(res.status).toBe(400);
  });

  it('checks out by bank transfer — pending until the webhook settles', async () => {
    const { celebrant, item1, item2 } = await wishlistWithItems(app);
    const gifter = await makeCelebrant();
    await app.request('/v1/cart/items', post({ wishlistItemId: item1, quantity: 1 }, gifter.auth));
    await app.request('/v1/cart/items', post({ wishlistItemId: item2, quantity: 1 }, gifter.auth));

    const res = await app.request('/v1/cart/checkout', post({ method: 'BANK_TRANSFER' }, gifter.auth));
    expect(res.status).toBe(201);
    const pending = (await body(res)).data;
    expect(pending.status).toBe('PENDING');
    expect(pending.virtualAccount.accountNumber).toBeTruthy();
    expect(await prisma.gift.count()).toBe(0);

    const settle = await app.request('/v1/payments/_mock/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: pending.reference }),
    });
    expect(settle.status).toBe(200);
    expect(await prisma.gift.count()).toBe(2);
    expect((await body(await app.request('/v1/gifts/received', { headers: celebrant.auth }))).data).toHaveLength(2);

    // idempotent
    await app.request('/v1/payments/_mock/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: pending.reference }),
    });
    expect(await prisma.gift.count()).toBe(2);
  });
});
