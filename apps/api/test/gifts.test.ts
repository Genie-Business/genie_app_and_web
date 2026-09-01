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
if (!dbUp) console.warn('⚠  gifts.test.ts skipped — needs a disposable test DB.');

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

let fundSeq = 0;
async function fund(userId: string, kobo: bigint) {
  await ensureWallet(userId);
  await postEntry({
    userId,
    direction: 'CREDIT',
    amountKobo: kobo,
    reason: 'FUNDING',
    idempotencyKey: `test-fund:${userId}:${(fundSeq += 1)}`,
  });
}

/** Celebrant + event + wishlist + one item for `product`, returns the item id. */
async function wishlistItemFor(
  app: ReturnType<typeof createApp>,
  productId: string,
  quantityWanted = 1,
) {
  const celebrant = await makeCelebrant();
  const ev = await app.request(
    '/v1/events',
    post({ type: 'Birthday', name: 'Party', eventDate: inDays(20), deliveryAddress: '1 Test Rd, Lagos' }, celebrant.auth),
  );
  const eventId = (await body(ev)).data.id;
  const wl = await app.request('/v1/wishlists', post({ eventId, name: 'Gifts' }, celebrant.auth));
  const wishlistId = (await body(wl)).data.id;
  const added = await app.request(
    `/v1/wishlists/${wishlistId}/items`,
    post({ productId, quantityWanted }, celebrant.auth),
  );
  const wl2 = (await body(added)).data;
  const item = wl2.items.find((i: { productId: string }) => i.productId === productId);
  return { celebrant, eventId, wishlistId, wishlistItemId: item.id as string };
}

d('gifting (E005 / E012)', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setPaymentProvider(null);
    // Pin the fee schedule so the arithmetic assertions are deterministic.
    for (const [key, type, value] of [
      ['TRANSACTION_FEE', 'PERCENT', 1.5],
      ['PRODUCT_FEE', 'PERCENT', 5],
      ['LOGISTICS_FEE', 'FLAT', 150_000],
    ] as const) {
      await prisma.feeConfig.upsert({
        where: { key },
        create: { key, type, value },
        update: { type, value },
      });
    }
    invalidateFeeCache();
  });
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('pays for a gift from the wallet: fees split, ledgers move, fulfilment + stock track', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 10_000_00, stock: 5 });
    const { celebrant, wishlistItemId } = await wishlistItemFor(app, product.id, 2);

    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 20_000_00n);

    // Quote first.
    const quoteRes = await app.request(
      '/v1/gifts/quote',
      post({ wishlistItemId, quantity: 1 }, gifter.auth),
    );
    expect(quoteRes.status).toBe(200);
    const q = (await body(quoteRes)).data;
    expect(q.subtotalKobo).toBe('1000000');
    expect(q.transactionFeeKobo).toBe('15000'); // 1.5%
    expect(q.logisticsFeeKobo).toBe('150000'); // flat
    expect(q.gifterPaysKobo).toBe('1165000');
    expect(q.commissionKobo).toBe('50000'); // 5%
    expect(q.merchantReceivesKobo).toBe('950000');
    expect(q.genieRetainsKobo).toBe('215000');

    const payRes = await app.request(
      '/v1/gifts',
      post({ wishlistItemId, quantity: 1, method: 'WALLET', message: 'Happy birthday!' }, gifter.auth),
    );
    expect(payRes.status).toBe(201);
    const paid = (await body(payRes)).data;
    expect(paid.status).toBe('PAID');
    expect(paid.orderNumber).toMatch(/^ORD-/);

    // Ledgers: gifter debited the full charge, merchant credited proceeds.
    expect(await getBalanceKobo(gifter.user.id)).toBe(20_000_00n - 1_165_000n);
    expect(await getBalanceKobo(merchant.user.id)).toBe(950_000n);

    // Fulfilment + stock.
    const item = await prisma.wishlistItem.findUniqueOrThrow({ where: { id: wishlistItemId } });
    expect(item.quantityFulfilled).toBe(1);
    const inv = await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } });
    expect(inv.availableStock).toBe(4);

    // An order + delivery row exist for the merchant.
    const order = await prisma.order.findFirstOrThrow({ where: { merchantId: merchant.user.id }, include: { delivery: true } });
    expect(order.status).toBe('PAID');
    expect(order.delivery?.status).toBe('PENDING');

    // Both parties were notified.
    const notifs = await prisma.notification.findMany({});
    expect(notifs.some((n) => n.userId === celebrant.user.id && n.type === 'gift.received')).toBe(true);
    expect(notifs.some((n) => n.userId === merchant.user.id && n.type === 'order.new')).toBe(true);
  });

  it('hides an anonymous gifter from the celebrant until it is revealed', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { celebrant, wishlistItemId } = await wishlistItemFor(app, product.id);

    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 10_000_00n);
    const payRes = await app.request(
      '/v1/gifts',
      post({ wishlistItemId, quantity: 1, method: 'WALLET', isAnonymous: true, message: 'guess who' }, gifter.auth),
    );
    expect(payRes.status).toBe(201);

    let received = (await body(await app.request('/v1/gifts/received', { headers: celebrant.auth }))).data;
    expect(received).toHaveLength(1);
    expect(received[0].from).toBeNull();
    expect(received[0].canReveal).toBe(true);
    expect(received[0].message).toBe('guess who');

    const giftId = received[0].id;
    const revealRes = await app.request(`/v1/gifts/${giftId}/reveal`, { method: 'POST', headers: celebrant.auth });
    expect(revealRes.status).toBe(200);
    expect((await body(revealRes)).data.from).toContain('Test');

    received = (await body(await app.request('/v1/gifts/received', { headers: celebrant.auth }))).data;
    expect(received[0].from).not.toBeNull();
    expect(received[0].revealed).toBe(true);

    // A second reveal is rejected.
    expect((await app.request(`/v1/gifts/${giftId}/reveal`, { method: 'POST', headers: celebrant.auth })).status).toBe(400);
  });

  it('rejects a reveal by someone who does not own the event', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 10_000_00n);
    const paid = (await body(await app.request('/v1/gifts', post({ wishlistItemId, method: 'WALLET', isAnonymous: true }, gifter.auth)))).data;

    const stranger = await makeCelebrant();
    const res = await app.request(`/v1/gifts/${paid.giftId}/reveal`, { method: 'POST', headers: stranger.auth });
    expect(res.status).toBe(403);
  });

  it('blocks gifting an item on your own wishlist', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { celebrant, wishlistItemId } = await wishlistItemFor(app, product.id);
    await fund(celebrant.user.id, 10_000_00n);

    const res = await app.request('/v1/gifts', post({ wishlistItemId, method: 'WALLET' }, celebrant.auth));
    expect(res.status).toBe(400);
  });

  it('returns 409 when the wallet cannot cover the charge', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 10_000_00 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 5_000_00n); // not enough for 1,165,000

    const res = await app.request('/v1/gifts', post({ wishlistItemId, method: 'WALLET' }, gifter.auth));
    expect(res.status).toBe(409);
    expect((await body(res)).error.code).toBe('insufficient_funds');
  });

  it('returns 409 when the merchant is out of stock', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00, stock: 0 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 10_000_00n);

    const res = await app.request('/v1/gifts', post({ wishlistItemId, method: 'WALLET' }, gifter.auth));
    expect(res.status).toBe(409);
    expect((await body(res)).error.code).toBe('out_of_stock');
  });

  it('will not let an item be over-fulfilled', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00, stock: 10 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id, 1);

    const g1 = await makeCelebrant();
    await fund(g1.user.id, 10_000_00n);
    expect((await app.request('/v1/gifts', post({ wishlistItemId, method: 'WALLET' }, g1.auth))).status).toBe(201);

    const g2 = await makeCelebrant();
    await fund(g2.user.id, 10_000_00n);
    const res = await app.request('/v1/gifts', post({ wishlistItemId, method: 'WALLET' }, g2.auth));
    expect(res.status).toBe(409);
    expect((await body(res)).error.code).toBe('over_fulfilled');
  });

  it('pays for a gift by bank transfer: pending until the webhook settles', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 8_000_00, stock: 3 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();

    const payRes = await app.request(
      '/v1/gifts',
      post({ wishlistItemId, quantity: 1, method: 'BANK_TRANSFER' }, gifter.auth),
    );
    expect(payRes.status).toBe(201);
    const pending = (await body(payRes)).data;
    expect(pending.status).toBe('PENDING');
    expect(pending.virtualAccount.accountNumber).toBeTruthy();

    // No gift yet.
    expect(await prisma.gift.count()).toBe(0);

    const settleRes = await app.request('/v1/payments/_mock/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: pending.reference }),
    });
    expect(settleRes.status).toBe(200);

    const gift = await prisma.gift.findFirstOrThrow({});
    expect(gift.status).toBe('PAID');
    expect(await getBalanceKobo(merchant.user.id)).toBe(760_000n); // 800,000 − 5% commission

    // Idempotent: settling again does not double-post.
    await app.request('/v1/payments/_mock/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: pending.reference }),
    });
    expect(await prisma.gift.count()).toBe(1);
    expect(await getBalanceKobo(merchant.user.id)).toBe(760_000n);
  });

  it('lists gifts the gifter has given', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();
    await fund(gifter.user.id, 10_000_00n);
    await app.request('/v1/gifts', post({ wishlistItemId, method: 'WALLET' }, gifter.auth));

    const given = (await body(await app.request('/v1/gifts', { headers: gifter.auth }))).data;
    expect(given).toHaveLength(1);
    expect(given[0].productName).toBe(product.name);
    expect(given[0].orderNumber).toMatch(/^ORD-/);
  });

  it("shows a friend's shareable wishlist as a gift invitation", async () => {
    const merchant = await makeMerchant();
    const p1 = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const p2 = await makeProduct(merchant.user.id, { priceKobo: 3_000_00 });
    const { celebrant, wishlistId } = await wishlistItemFor(app, p1.id);
    await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: p2.id }, celebrant.auth));

    const gifter = await makeCelebrant();

    // Not friends yet → nothing.
    const before = (await body(await app.request('/v1/gifts/invitations', { headers: gifter.auth }))).data;
    expect(before).toHaveLength(0);

    // Become friends (request + accept).
    await app.request(
      '/v1/friends/requests',
      post({ userId: gifter.user.id }, celebrant.auth),
    );
    const reqs = (await body(await app.request('/v1/friends/requests', { headers: gifter.auth }))).data;
    await app.request(`/v1/friends/requests/${reqs[0].id}/accept`, {
      method: 'POST',
      headers: gifter.auth,
    });

    const after = (await body(await app.request('/v1/gifts/invitations', { headers: gifter.auth }))).data;
    expect(after).toHaveLength(1);
    expect(after[0].wishlistId).toBe(wishlistId);
    expect(after[0].itemCount).toBe(2);
    expect(after[0].outstandingCount).toBe(2);
  });
});
