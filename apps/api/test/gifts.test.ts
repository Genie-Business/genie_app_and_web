import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setPaymentProvider } from '../src/modules/payments/provider';
import { invalidateFeeCache } from '../src/modules/fees/fees.service';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, makeMerchant, makeProduct, post } from './helpers/factory';
import { confirmPayment, payForGift } from './helpers/pay';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  gifts.test.ts skipped — needs a disposable test DB.');

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

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

  it('pays for a gift: checkout first, then fees split, the order records what the merchant is owed, fulfilment + stock track', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 10_000_00, stock: 5 });
    const { celebrant, wishlistItemId } = await wishlistItemFor(app, product.id, 2);

    const gifter = await makeCelebrant();

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

    // Starting to pay only opens a checkout: nothing is fulfilled yet.
    const payRes = await app.request(
      '/v1/gifts',
      post({ wishlistItemId, quantity: 1, message: 'Happy birthday!' }, gifter.auth),
    );
    expect(payRes.status).toBe(201);
    const pending = (await body(payRes)).data;
    expect(pending.status).toBe('PENDING');
    expect(pending.checkoutUrl).toBeTruthy();
    expect(await prisma.gift.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { reference: pending.reference } });
    expect(intent.amountKobo).toBe(1_165_000n); // what the buyer is charged
    expect(intent.status).toBe('PENDING');

    // The buyer pays; the confirmed payment fulfils the gift.
    expect((await confirmPayment(app, pending.reference)).status).toBe(200);
    expect((await prisma.paymentIntent.findUniqueOrThrow({ where: { reference: pending.reference } })).status).toBe('COMPLETED');

    // Fulfilment + stock.
    const item = await prisma.wishlistItem.findUniqueOrThrow({ where: { id: wishlistItemId } });
    expect(item.quantityFulfilled).toBe(1);
    const inv = await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } });
    expect(inv.availableStock).toBe(4);

    // An order + delivery row exist for the merchant, recording what genie owes them.
    const order = await prisma.order.findFirstOrThrow({ where: { merchantId: merchant.user.id }, include: { delivery: true } });
    expect(order.orderNumber).toMatch(/^ORD-/);
    expect(order.status).toBe('PAID');
    expect(order.totalKobo).toBe(1_165_000n);
    expect(order.merchantNetKobo).toBe(950_000n); // subtotal − 5% commission, paid out after delivery
    expect(order.payoutId).toBeNull();
    expect(order.delivery?.status).toBe('PENDING');

    // Both parties were notified.
    const notifs = await prisma.notification.findMany({});
    expect(notifs.some((n) => n.userId === celebrant.user.id && n.type === 'gift.received')).toBe(true);
    expect(notifs.some((n) => n.userId === merchant.user.id && n.type === 'order.new')).toBe(true);
  });

  it('hides an anonymous gifter from the celebrant until the gift is delivered', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { celebrant, wishlistItemId } = await wishlistItemFor(app, product.id);

    const gifter = await makeCelebrant();
    const { res: payRes } = await payForGift(app, gifter.auth, { wishlistItemId, quantity: 1, isAnonymous: true, message: 'guess who' });
    expect(payRes.status).toBe(201);

    let received = (await body(await app.request('/v1/gifts/received', { headers: celebrant.auth }))).data;
    expect(received).toHaveLength(1);
    expect(received[0].from).toBeNull();
    expect(received[0].message).toBe('guess who');
    // Not delivered yet — the surprise holds and reveal is refused.
    expect(received[0].canReveal).toBe(false);
    const giftId = received[0].id;
    expect(
      (await app.request(`/v1/gifts/${giftId}/reveal`, { method: 'POST', headers: celebrant.auth })).status,
    ).toBe(400);

    // Merchant delivers the order.
    const order = await prisma.order.findFirstOrThrow({ where: { merchantId: merchant.user.id } });
    const deliver = await app.request(
      `/v1/merchant/orders/${order.id}/delivery`,
      { method: 'PATCH', headers: merchant.auth, body: JSON.stringify({ status: 'DELIVERED' }) },
    );
    expect(deliver.status).toBe(200);

    received = (await body(await app.request('/v1/gifts/received', { headers: celebrant.auth }))).data;
    expect(received[0].canReveal).toBe(true);

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
    await payForGift(app, gifter.auth, { wishlistItemId, isAnonymous: true });
    const gift = await prisma.gift.findFirstOrThrow({});

    const stranger = await makeCelebrant();
    const res = await app.request(`/v1/gifts/${gift.id}/reveal`, { method: 'POST', headers: stranger.auth });
    expect(res.status).toBe(403);
  });

  it('blocks gifting an item on your own wishlist', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { celebrant, wishlistItemId } = await wishlistItemFor(app, product.id);

    const res = await app.request('/v1/gifts', post({ wishlistItemId }, celebrant.auth));
    expect(res.status).toBe(400);
    expect(await prisma.paymentIntent.count()).toBe(0); // no checkout was opened
  });

  it('returns 409 when the merchant is out of stock', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00, stock: 0 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();

    const res = await app.request('/v1/gifts', post({ wishlistItemId }, gifter.auth));
    expect(res.status).toBe(409);
    expect((await body(res)).error.code).toBe('out_of_stock');
  });

  it('will not let an item be over-fulfilled', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00, stock: 10 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id, 1);

    const g1 = await makeCelebrant();
    expect((await payForGift(app, g1.auth, { wishlistItemId })).res.status).toBe(201);

    const g2 = await makeCelebrant();
    const res = await app.request('/v1/gifts', post({ wishlistItemId }, g2.auth));
    expect(res.status).toBe(409);
    expect((await body(res)).error.code).toBe('over_fulfilled');
  });

  it('fulfils a gift exactly once however many times the payment is confirmed', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 8_000_00, stock: 3 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();

    const payRes = await app.request('/v1/gifts', post({ wishlistItemId, quantity: 1 }, gifter.auth));
    expect(payRes.status).toBe(201);
    const pending = (await body(payRes)).data;
    expect(pending.status).toBe('PENDING');
    expect(await prisma.gift.count()).toBe(0); // no gift until the payment is confirmed

    // The webhook and a status check can both fire; run several confirmations at once.
    await Promise.all([confirmPayment(app, pending.reference), confirmPayment(app, pending.reference), confirmPayment(app, pending.reference)]);
    await confirmPayment(app, pending.reference);

    expect(await prisma.gift.count()).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    const gift = await prisma.gift.findFirstOrThrow({});
    expect(gift.status).toBe('PAID');
    const order = await prisma.order.findFirstOrThrow({});
    expect(order.merchantNetKobo).toBe(760_000n); // 800,000 − 5% commission
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).availableStock).toBe(2);
  });

  it('does not fulfil a payment that is less than the amount due', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 8_000_00, stock: 3 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();

    const pending = (await body(await app.request('/v1/gifts', post({ wishlistItemId }, gifter.auth)))).data;
    expect((await confirmPayment(app, pending.reference, 1_000)).status).toBe(200);

    expect(await prisma.gift.count()).toBe(0);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { reference: pending.reference } });
    expect(intent.status).toBe('FAILED');
    expect((intent.metadata as Record<string, unknown>).failure).toBe('amount_mismatch');
  });

  it("answers a status check from the provider when the webhook never arrived", async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();
    const pending = (await body(await app.request('/v1/gifts', post({ wishlistItemId }, gifter.auth)))).data;

    const before = await app.request(`/v1/payments/intents/${pending.reference}`, { headers: gifter.auth });
    expect((await body(before)).data.status).toBe('PENDING');
    expect(await prisma.gift.count()).toBe(0);

    // The provider now says it was paid, but no webhook was delivered.
    const { getPaymentProvider } = await import('../src/modules/payments/provider');
    (getPaymentProvider() as unknown as { markPaid: (r: string) => void }).markPaid(pending.reference);

    const after = await app.request(`/v1/payments/intents/${pending.reference}`, { headers: gifter.auth });
    expect((await body(after)).data.status).toBe('COMPLETED');
    expect(await prisma.gift.count()).toBe(1);
  });

  it("only shows a payment to the person who started it", async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();
    const pending = (await body(await app.request('/v1/gifts', post({ wishlistItemId }, gifter.auth)))).data;

    const stranger = await makeCelebrant();
    const res = await app.request(`/v1/payments/intents/${pending.reference}`, { headers: stranger.auth });
    expect(res.status).toBe(404);
  });

  it('lists gifts the gifter has given', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { wishlistItemId } = await wishlistItemFor(app, product.id);
    const gifter = await makeCelebrant();
    await payForGift(app, gifter.auth, { wishlistItemId });

    const given = (await body(await app.request('/v1/gifts', { headers: gifter.auth }))).data;
    expect(given).toHaveLength(1);
    expect(given[0].productName).toBe(product.name);
    expect(given[0].orderNumber).toMatch(/^ORD-/);
  });

  it('lets a guest (no account) buy wishlist items through checkout', async () => {
    const merchant = await makeMerchant();
    const p1 = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const p2 = await makeProduct(merchant.user.id, { priceKobo: 3_000_00 });
    const { celebrant, wishlistId } = await wishlistItemFor(app, p1.id);
    const added = await app.request(
      `/v1/wishlists/${wishlistId}/items`,
      post({ productId: p2.id }, celebrant.auth),
    );
    const ids = (await body(added)).data.items.map((i: { id: string }) => i.id);

    const checkout = await app.request(`/v1/public/wishlists/${wishlistId}/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wishlistItemIds: ids,
        gifterName: 'Chidi Guest',
        gifterEmail: 'chidi@example.com',
        isAnonymous: false,
      }),
    });
    expect(checkout.status).toBe(201);
    const { reference, checkoutUrl, breakdown } = (await body(checkout)).data;
    expect(checkoutUrl).toBeTruthy();
    expect(breakdown).toHaveLength(2);

    // The guest pays → both gifts finalise with no gifter account.
    await app.request(`/v1/public/payments/${reference}/_simulate`, { method: 'POST' });

    const status = await app.request(`/v1/public/payments/${reference}`);
    expect((await body(status)).data.status).toBe('COMPLETED');

    const gifts = await prisma.gift.findMany({ where: { status: 'PAID' } });
    expect(gifts).toHaveLength(2);
    expect(gifts.every((g) => g.gifterUserId === null)).toBe(true);
    expect(gifts.every((g) => g.giftedByName === 'Chidi Guest')).toBe(true);

    // The celebrant sees them as received gifts, from "Chidi Guest".
    const received = (await body(await app.request('/v1/gifts/received', { headers: celebrant.auth })))
      .data;
    expect(received).toHaveLength(2);
    expect(received[0].from).toBe('Chidi Guest');
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
