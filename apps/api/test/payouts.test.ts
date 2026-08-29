import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setPaymentProvider } from '../src/modules/payments/provider';
import { ensureWallet } from '../src/modules/payments/wallet.service';
import { getBalanceKobo, postEntry } from '../src/modules/payments/ledger.service';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, makeMerchant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  payouts.test.ts skipped — needs a disposable test DB.');

let seq = 0;
async function fund(userId: string, kobo: bigint) {
  await ensureWallet(userId);
  await postEntry({
    userId,
    direction: 'CREDIT',
    amountKobo: kobo,
    reason: 'FUNDING',
    idempotencyKey: `test-fund:${userId}:${(seq += 1)}`,
  });
}

const ACCOUNT = {
  bankName: 'GTBank',
  bankCode: '058',
  accountNumber: '0123456789',
  accountName: 'Test Store Ltd',
};

d('cards, payouts & withdrawals (E012)', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setPaymentProvider(null);
  });
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('adds, defaults and removes saved cards (PAN never stored)', async () => {
    const { auth } = await makeCelebrant();

    const a = await app.request('/v1/payments/cards', post({ providerToken: 'tok_visa_abc123', last4: '4242', brand: 'visa', expMonth: 4, expYear: 2030 }, auth));
    expect(a.status).toBe(201);
    expect((await body(a)).data.isDefault).toBe(true); // first card

    const b = await app.request('/v1/payments/cards', post({ providerToken: 'tok_mc_def456', last4: '5100', brand: 'mastercard', makeDefault: true }, auth));
    expect(b.status).toBe(201);

    const list = (await body(await app.request('/v1/payments/cards', { headers: auth }))).data;
    expect(list).toHaveLength(2);
    expect(list.find((c: { last4: string }) => c.last4 === '5100').isDefault).toBe(true);
    expect(list.find((c: { last4: string }) => c.last4 === '4242').isDefault).toBe(false);
    // No PAN / token leaks in the response.
    expect(JSON.stringify(list)).not.toContain('tok_');

    const defaultId = list.find((c: { last4: string }) => c.last4 === '5100').id;
    const del = await app.request(`/v1/payments/cards/${defaultId}`, { method: 'DELETE', headers: auth });
    expect(del.status).toBe(200);

    const after = (await body(await app.request('/v1/payments/cards', { headers: auth }))).data;
    expect(after).toHaveLength(1);
    expect(after[0].isDefault).toBe(true); // default reassigned
  });

  it('lets a merchant set a settlement account and withdraw to bank', async () => {
    const merchant = await makeMerchant();
    await fund(merchant.user.id, 500_000n);

    const set = await app.request('/v1/payouts/account', { method: 'PUT', headers: merchant.auth, body: JSON.stringify(ACCOUNT) });
    expect(set.status).toBe(200);
    expect((await body(set)).data.isVerified).toBe(true); // mock provider auto-verifies

    const w = await app.request('/v1/payments/withdraw', post({ amountKobo: 300_000, ...ACCOUNT }, merchant.auth));
    expect(w.status).toBe(201);
    const res = (await body(w)).data;
    expect(res.status).toBe('PAID'); // mock nipTransfer settles immediately
    expect(await getBalanceKobo(merchant.user.id)).toBe(200_000n);

    const history = (await body(await app.request('/v1/payouts', { headers: merchant.auth }))).data;
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('PAID');
  });

  it('rejects a withdrawal that exceeds the wallet balance', async () => {
    const merchant = await makeMerchant();
    await fund(merchant.user.id, 50_000n);

    const w = await app.request('/v1/payments/withdraw', post({ amountKobo: 100_000, ...ACCOUNT }, merchant.auth));
    expect(w.status).toBe(409);
    expect((await body(w)).error.code).toBe('insufficient_funds');
    expect(await getBalanceKobo(merchant.user.id)).toBe(50_000n); // untouched
  });

  it('only merchants can read/write the settlement account', async () => {
    const celebrant = await makeCelebrant();
    expect((await app.request('/v1/payouts/account', { headers: celebrant.auth })).status).toBe(403);
    expect(
      (await app.request('/v1/payouts/account', { method: 'PUT', headers: celebrant.auth, body: JSON.stringify(ACCOUNT) })).status,
    ).toBe(403);
  });
});

d('merchant orders & delivery (E014)', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setPaymentProvider(null);
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

  it('shows the merchant a paid order and advances its delivery status', async () => {
    const merchant = await makeMerchant();
    const category = await prisma.category.create({ data: { name: `C ${seq += 1}`, slug: `c-${seq}` } });
    const product = await prisma.product.create({
      data: {
        merchantId: merchant.user.id,
        categoryId: category.id,
        name: 'Blender',
        description: 'x',
        priceKobo: 20_000_00n,
        status: 'ACTIVE',
        inventory: { create: { availableStock: 5 } },
      },
    });

    // Celebrant builds a wishlist, a friend gifts the item from their wallet.
    const celebrant = await makeCelebrant();
    const ev = await app.request('/v1/events', post({ type: 'Birthday', name: 'P', eventDate: new Date(Date.now() + 6e8).toISOString(), deliveryAddress: '2 Rd' }, celebrant.auth));
    const eventId = (await body(ev)).data.id;
    const wl = await app.request('/v1/wishlists', post({ eventId, name: 'L' }, celebrant.auth));
    const wishlistId = (await body(wl)).data.id;
    const wlRes = await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: product.id, quantityWanted: 1 }, celebrant.auth));
    const wishlistItemId = (await body(wlRes)).data.items[0].id;

    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 30_000_00n);
    const paid = await app.request('/v1/gifts', post({ wishlistItemId, method: 'WALLET' }, gifter.auth));
    expect(paid.status).toBe(201);

    const orders = (await body(await app.request('/v1/merchant/orders', { headers: merchant.auth }))).data;
    expect(orders).toHaveLength(1);
    expect(orders[0].isGift).toBe(true);
    expect(orders[0].proceedsKobo).toBe('1900000'); // 2,000,000 − 5%
    expect(orders[0].delivery.status).toBe('PENDING');

    const orderId = orders[0].id;
    const patch = await app.request(`/v1/merchant/orders/${orderId}/delivery`, {
      method: 'PATCH',
      headers: merchant.auth,
      body: JSON.stringify({ status: 'DISPATCHED', courierName: 'GIG', courierRef: 'GIG-1' }),
    });
    expect(patch.status).toBe(200);

    const delivered = await app.request(`/v1/merchant/orders/${orderId}/delivery`, {
      method: 'PATCH',
      headers: merchant.auth,
      body: JSON.stringify({ status: 'DELIVERED' }),
    });
    expect(delivered.status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { gift: true } });
    expect(order.status).toBe('DELIVERED');
    expect(order.gift?.status).toBe('DELIVERED');

    // The buyer sees it in their orders too.
    const mine = (await body(await app.request('/v1/orders', { headers: gifter.auth }))).data;
    expect(mine).toHaveLength(1);
    expect(mine[0].deliveryStatus).toBe('DELIVERED');
  });

  it("won't let a merchant touch another merchant's order", async () => {
    const m1 = await makeMerchant();
    const m2 = await makeMerchant();
    const category = await prisma.category.create({ data: { name: `C ${seq += 1}`, slug: `c-${seq}` } });
    const product = await prisma.product.create({
      data: { merchantId: m1.user.id, categoryId: category.id, name: 'P', description: 'x', priceKobo: 5_000_00n, status: 'ACTIVE', inventory: { create: { availableStock: 3 } } },
    });
    const celebrant = await makeCelebrant();
    const ev = await app.request('/v1/events', post({ type: 'Birthday', name: 'P', eventDate: new Date(Date.now() + 6e8).toISOString() }, celebrant.auth));
    const eventId = (await body(ev)).data.id;
    const wl = await app.request('/v1/wishlists', post({ eventId, name: 'L' }, celebrant.auth));
    const wishlistId = (await body(wl)).data.id;
    const wlRes = await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: product.id }, celebrant.auth));
    const wishlistItemId = (await body(wlRes)).data.items[0].id;
    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 10_000_00n);
    await app.request('/v1/gifts', post({ wishlistItemId, method: 'WALLET' }, gifter.auth));

    const orderId = (await prisma.order.findFirstOrThrow({ where: { merchantId: m1.user.id } })).id;
    const res = await app.request(`/v1/merchant/orders/${orderId}/delivery`, {
      method: 'PATCH',
      headers: m2.auth,
      body: JSON.stringify({ status: 'DISPATCHED' }),
    });
    expect(res.status).toBe(404);
  });
});
