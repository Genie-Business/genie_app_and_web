import { orders as orderContracts } from '@genie/contracts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { getEnv } from '../src/env';
import { __setPaymentProvider, MockPaymentProvider } from '../src/modules/payments/provider';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, makeMerchant, makeProduct, post } from './helpers/factory';
import { confirmPayment, payForGift } from './helpers/pay';

const json = { 'content-type': 'application/json' };

// getEnv() reads these lazily, when the app is first built, and caches them for this test file.
process.env.COURIER_API_KEY = 'test-courier-key';
process.env.CRON_SECRET = 'test-cron-secret';

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe('who may say a gift was delivered (no database needed)', () => {
  const app = createApp();

  it('does not let a merchant send "delivered" at all', () => {
    expect(orderContracts.deliveryUpdateBody.safeParse({ status: 'DELIVERED' }).success).toBe(false);
    expect(orderContracts.deliveryUpdateBody.safeParse({ status: 'DISPATCHED' }).success).toBe(true);
    expect(orderContracts.deliveryUpdateBody.safeParse({ status: 'IN_TRANSIT' }).success).toBe(true);
  });

  it('only accepts the delivery company\'s key or the admin secret', async () => {
    const call = (headers: Record<string, string>) =>
      app.request('/v1/internal/delivery/confirm', post({ orderNumber: 'ORD-261101-ABC123' }, { ...json, ...headers }));
    expect((await call({})).status).toBe(401);
    expect((await call({ authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('rejects a confirmation that names no order', async () => {
    const res = await app.request('/v1/internal/delivery/confirm', post({}, { ...json, authorization: 'Bearer test-courier-key' }));
    expect(res.status).toBe(400);
  });
});

// ── Integration (disposable DB only) ─────────────────────────────────────
const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  delivery.test.ts integration cases skipped — needs a disposable test DB.');

d('confirming delivery pays the merchant at once', () => {
  const app = createApp();
  let mock: MockPaymentProvider;

  beforeEach(async () => {
    await resetDb();
    mock = new MockPaymentProvider({ simulateAccountLookups: true });
    __setPaymentProvider(mock);
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

  /** A merchant (with a bank-confirmed settlement account) and a paid gift waiting to be sent. */
  async function paidGift(opts: { deliveryOption?: 'PICKUP' | 'DELIVERY' } = {}) {
    const merchant = await makeMerchant();
    const acct = await app.request('/v1/payouts/account', {
      method: 'PUT',
      headers: merchant.auth,
      body: JSON.stringify({ bankName: 'GTBank', bankCode: '058', accountNumber: '0123456789' }),
    });
    expect((await body(acct)).data.isVerified).toBe(true);
    const product = await makeProduct(merchant.user.id, { priceKobo: 10_000_00, stock: 3 });
    if (opts.deliveryOption) await prisma.product.update({ where: { id: product.id }, data: { deliveryOption: opts.deliveryOption } });

    const celebrant = await makeCelebrant();
    const ev = await app.request('/v1/events', post({ type: 'Birthday', name: 'Party', eventDate: inDays(20), deliveryAddress: '1 Test Rd' }, celebrant.auth));
    const eventId = (await body(ev)).data.id;
    const wl = await app.request('/v1/wishlists', post({ eventId, name: 'Gifts' }, celebrant.auth));
    const wishlistId = (await body(wl)).data.id;
    const added = await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: product.id, quantityWanted: 1 }, celebrant.auth));
    const wishlistItemId = (await body(added)).data.items[0].id as string;

    const gifter = await makeCelebrant();
    await payForGift(app, gifter.auth, { wishlistItemId });
    const gift = await prisma.gift.findFirstOrThrow({});
    const order = await prisma.order.findFirstOrThrow({});
    return { merchant, celebrant, gifter, gift, order };
  }

  const dispatch = (merchantAuth: Record<string, string>, orderId: string) =>
    app.request(`/v1/merchant/orders/${orderId}/delivery`, { method: 'PATCH', headers: merchantAuth, body: JSON.stringify({ status: 'DISPATCHED', courierName: 'GIG' }) });

  it('refuses a merchant who tries to mark their own order delivered', async () => {
    const { merchant, order } = await paidGift();
    const res = await app.request(`/v1/merchant/orders/${order.id}/delivery`, {
      method: 'PATCH',
      headers: merchant.auth,
      body: JSON.stringify({ status: 'DELIVERED' }),
    });
    expect(res.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
  });

  it('lets the recipient confirm once it has been sent, and pays the merchant immediately', async () => {
    const { merchant, celebrant, gifter, gift, order } = await paidGift();

    // Not sent yet: nothing to confirm.
    const early = await app.request(`/v1/gifts/${gift.id}/received`, { method: 'POST', headers: celebrant.auth });
    expect(early.status).toBe(400);
    expect((await body(await app.request('/v1/gifts/received', { headers: celebrant.auth }))).data[0].canConfirmReceived).toBe(false);

    expect((await dispatch(merchant.auth, order.id)).status).toBe(200);
    const listed = (await body(await app.request('/v1/gifts/received', { headers: celebrant.auth }))).data[0];
    expect(listed).toMatchObject({ deliveryStatus: 'DISPATCHED', canConfirmReceived: true });
    // The person it is for was told it is on its way, and what to do when it arrives.
    expect(await prisma.notification.count({ where: { userId: celebrant.user.id, title: 'A gift is on its way to you' } })).toBe(1);

    const ok = await app.request(`/v1/gifts/${gift.id}/received`, { method: 'POST', headers: celebrant.auth });
    expect(ok.status).toBe(200);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DELIVERED');
    expect((await prisma.gift.findUniqueOrThrow({ where: { id: gift.id } })).status).toBe('DELIVERED');

    // The merchant was paid on the spot, to the account they gave.
    const payout = await prisma.payout.findFirstOrThrow({ where: { merchantId: merchant.user.id } });
    expect(payout.status).toBe('PAID');
    expect(payout.netAmountKobo).toBe(950_000n);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).payoutId).toBe(payout.id);

    // Everyone is told, in the app.
    expect(await prisma.notification.count({ where: { userId: gifter.user.id, type: 'order.delivery', title: 'Gift delivered' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: merchant.user.id, type: 'order.delivered' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: merchant.user.id, type: 'payout.sent' } })).toBe(1);

    // Confirming again does nothing: no second payout.
    const again = await app.request(`/v1/gifts/${gift.id}/received`, { method: 'POST', headers: celebrant.auth });
    expect(again.status).toBe(200);
    expect(await prisma.payout.count()).toBe(1);
  });

  it('only lets the person the gift is for confirm it', async () => {
    const { merchant, gifter, gift, order } = await paidGift();
    await dispatch(merchant.auth, order.id);
    for (const who of [gifter, merchant, await makeCelebrant()]) {
      const res = await app.request(`/v1/gifts/${gift.id}/received`, { method: 'POST', headers: who.auth });
      expect(res.status).toBe(403);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).not.toBe('DELIVERED');
  });

  it('lets the recipient confirm a gift collected in person straight away', async () => {
    const { celebrant, gift, order } = await paidGift({ deliveryOption: 'PICKUP' });
    const res = await app.request(`/v1/gifts/${gift.id}/received`, { method: 'POST', headers: celebrant.auth });
    expect(res.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DELIVERED');
  });

  it('accepts the delivery company\'s confirmation, by order number', async () => {
    const { merchant, celebrant, order } = await paidGift();
    const call = (headers: Record<string, string>, orderNumber = order.orderNumber) =>
      app.request('/v1/internal/delivery/confirm', post({ orderNumber }, { ...json, ...headers }));

    expect((await call({ authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await call({ authorization: 'Bearer test-courier-key' }, 'ORD-NOPE-000000')).status).toBe(404);

    const ok = await call({ authorization: 'Bearer test-courier-key' });
    expect(ok.status).toBe(200);
    expect((await body(ok)).data.alreadyDelivered).toBe(false);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DELIVERED');
    expect((await prisma.payout.findFirstOrThrow({ where: { merchantId: merchant.user.id } })).status).toBe('PAID');
    // The person it is for hears it arrived, too.
    expect(await prisma.notification.count({ where: { userId: celebrant.user.id, type: 'gift.delivered' } })).toBe(1);
  });

  it('lets an admin confirm on the courier\'s behalf with the admin secret', async () => {
    const { order } = await paidGift();
    const res = await app.request('/v1/internal/delivery/confirm', post({ orderNumber: order.orderNumber }, { ...json, authorization: 'Bearer test-cron-secret' }));
    expect(res.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DELIVERED');
  });

  it('leaves the merchant owed, not lost, when the payout cannot go out yet', async () => {
    const { merchant, celebrant, gift, order } = await paidGift();
    mock.failNextTransfers = 1; // e.g. genie\'s Paystack balance is too low right now
    await dispatch(merchant.auth, order.id);
    const res = await app.request(`/v1/gifts/${gift.id}/received`, { method: 'POST', headers: celebrant.auth });
    expect(res.status).toBe(200); // the delivery still counts
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DELIVERED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).payoutId).toBeNull(); // still owed
  });

  it('emails people about what happens, not only the app', async () => {
    const env = getEnv();
    const before = { ...env };
    Object.assign(env, { RESEND_API_KEY: 're_test' });
    const fetchMock = vi.fn(async () => new Response('{"id":"x"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { merchant, celebrant, gifter, gift, order } = await paidGift();
      await dispatch(merchant.auth, order.id);
      await app.request(`/v1/gifts/${gift.id}/received`, { method: 'POST', headers: celebrant.auth });

      const recipients = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).to as string);
      for (const u of [gifter.user, celebrant.user, merchant.user]) expect(recipients).toContain(u.email);
    } finally {
      Object.assign(env, before);
      vi.unstubAllGlobals();
    }
  });
});

d('paying for a gift twice', () => {
  const app = createApp();
  let mock: MockPaymentProvider;

  beforeEach(async () => {
    await resetDb();
    mock = new MockPaymentProvider({ simulateAccountLookups: true });
    __setPaymentProvider(mock);
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

  async function oneGift(quantityWanted = 1) {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id, { priceKobo: 10_000_00, stock: 5 });
    const celebrant = await makeCelebrant();
    const ev = await app.request('/v1/events', post({ type: 'Birthday', name: 'Party', eventDate: inDays(20), deliveryAddress: '1 Test Rd' }, celebrant.auth));
    const eventId = (await body(ev)).data.id;
    const wl = await app.request('/v1/wishlists', post({ eventId, name: 'Gifts' }, celebrant.auth));
    const wishlistId = (await body(wl)).data.id;
    const added = await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: product.id, quantityWanted }, celebrant.auth));
    return { wishlistItemId: (await body(added)).data.items[0].id as string, product };
  }

  const open = async (auth: Record<string, string>, wishlistItemId: string) => app.request('/v1/gifts', post({ wishlistItemId }, auth));
  const ageCheckout = (reference: string, minutes: number) =>
    prisma.paymentIntent.update({ where: { reference }, data: { createdAt: new Date(Date.now() - minutes * 60_000) } });

  it('holds a gift for the person already paying, so a second buyer is turned away', async () => {
    const { wishlistItemId } = await oneGift();
    const a = await makeCelebrant();
    const b = await makeCelebrant();

    expect((await open(a.auth, wishlistItemId)).status).toBe(201);
    const blocked = await open(b.auth, wishlistItemId);
    expect(blocked.status).toBe(409);
    expect((await body(blocked)).error.code).toBe('being_paid');
  });

  it('lets the gift go to someone else once the first checkout has been abandoned', async () => {
    const { wishlistItemId } = await oneGift();
    const a = await makeCelebrant();
    const b = await makeCelebrant();

    const first = (await body(await open(a.auth, wishlistItemId))).data;
    await ageCheckout(first.reference, 30); // left sitting for half an hour
    expect((await open(b.auth, wishlistItemId)).status).toBe(201);
  });

  it('retires the buyer\'s own earlier checkout when they start again', async () => {
    const { wishlistItemId } = await oneGift();
    const a = await makeCelebrant();

    const first = (await body(await open(a.auth, wishlistItemId))).data;
    const second = (await body(await open(a.auth, wishlistItemId))).data;
    expect((await prisma.paymentIntent.findUniqueOrThrow({ where: { reference: first.reference } })).status).toBe('EXPIRED');
    expect((await prisma.paymentIntent.findUniqueOrThrow({ where: { reference: second.reference } })).status).toBe('PENDING');
  });

  it('refunds the second payment if two people both pay for the same gift anyway', async () => {
    const { wishlistItemId } = await oneGift();
    const a = await makeCelebrant();
    const b = await makeCelebrant();

    // A started first but is slow; B starts after the hold lapsed; both end up paying.
    const first = (await body(await open(a.auth, wishlistItemId))).data;
    await ageCheckout(first.reference, 30);
    const second = (await body(await open(b.auth, wishlistItemId))).data;

    expect((await confirmPayment(app, first.reference)).status).toBe(200);
    expect((await confirmPayment(app, second.reference)).status).toBe(200);

    // One gift, one order, one unit of stock used.
    expect(await prisma.gift.count()).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.wishlistItem.findUniqueOrThrow({ where: { id: wishlistItemId } })).quantityFulfilled).toBe(1);

    // B's money came straight back, in full.
    expect(mock.refunds).toHaveLength(1);
    expect(mock.refunds[0]).toMatchObject({ reference: second.reference, amountKobo: 1_165_000n });
    const lost = await prisma.paymentIntent.findUniqueOrThrow({ where: { reference: second.reference } });
    expect(lost.status).toBe('FAILED');
    expect((lost.metadata as Record<string, unknown>).failure).toBe('refunded_unavailable');

    // Both are told, in the app.
    expect(await prisma.notification.count({ where: { userId: a.user.id, type: 'payment.confirmed' } })).toBe(1);
    const refunded = await prisma.notification.findFirstOrThrow({ where: { userId: b.user.id, type: 'payment.refunded' } });
    expect(refunded.body).toContain('refunding');
  });

  it('does not refund twice when the same refunded payment is confirmed again', async () => {
    const { wishlistItemId } = await oneGift();
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    const first = (await body(await open(a.auth, wishlistItemId))).data;
    await ageCheckout(first.reference, 30);
    const second = (await body(await open(b.auth, wishlistItemId))).data;
    await confirmPayment(app, first.reference);
    await confirmPayment(app, second.reference);
    await confirmPayment(app, second.reference);
    await confirmPayment(app, second.reference);
    expect(mock.refunds).toHaveLength(1);
  });

  it('still lets several people give a gift that is wanted more than once', async () => {
    const { wishlistItemId } = await oneGift(2);
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    const c = await makeCelebrant();
    expect((await open(a.auth, wishlistItemId)).status).toBe(201);
    expect((await open(b.auth, wishlistItemId)).status).toBe(201); // two wanted, two can be in flight
    expect((await open(c.auth, wishlistItemId)).status).toBe(409); // a third has to wait
  });

  it('keeps a guest from paying twice for the same gift from the shared page', async () => {
    const { wishlistItemId } = await oneGift();
    const listRes = await prisma.wishlistItem.findUniqueOrThrow({ where: { id: wishlistItemId }, select: { wishlistId: true } });
    const guest = (email: string) =>
      app.request(`/v1/public/wishlists/${listRes.wishlistId}/checkout`, post({
        wishlistItemIds: [wishlistItemId], gifterName: 'Chidi', gifterEmail: email, isAnonymous: false,
      }, json));

    expect((await guest('chidi@example.com')).status).toBe(201);
    const other = await guest('someone-else@example.com');
    expect(other.status).toBe(409);
    expect((await body(other)).error.code).toBe('being_paid');
    // The same person trying again is allowed: it replaces their earlier attempt.
    expect((await guest('chidi@example.com')).status).toBe(201);
  });
});
