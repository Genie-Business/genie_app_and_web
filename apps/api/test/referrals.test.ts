import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setPaymentProvider } from '../src/modules/payments/provider';
import { invalidateReferralCache } from '../src/modules/referrals/referrals.service';
import { invalidateFeeCache } from '../src/modules/fees/fees.service';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, makeMerchant, makeProduct, post } from './helpers/factory';
import { confirmPayment, payForGift } from './helpers/pay';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  referrals.test.ts skipped — needs a disposable test DB.');

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
async function refer(referrerId: string, code: string) {
  const referee = await makeCelebrant();
  await prisma.user.update({ where: { id: referee.user.id }, data: { referredById: referrerId } });
  await prisma.referral.create({
    data: { referrerId, refereeId: referee.user.id, code, status: 'SIGNED_UP' },
  });
  return referee;
}

async function giftableItem(app: ReturnType<typeof createApp>) {
  const merchant = await makeMerchant();
  const product = await makeProduct(merchant.user.id, { priceKobo: 10_000_00, stock: 5 });
  const celebrant = await makeCelebrant();
  const ev = await app.request(
    '/v1/events',
    post({ type: 'Birthday', name: 'P', eventDate: inDays(15), deliveryAddress: '1 Rd', wishlistName: 'L' }, celebrant.auth),
  );
  const wid = (await body(await app.request(`/v1/events/${(await body(ev)).data.id}`, { headers: celebrant.auth }))).data.wishlists[0].id;
  const wl = await app.request(`/v1/wishlists/${wid}/items`, post({ productId: product.id, quantityWanted: 3 }, celebrant.auth));
  return (await body(wl)).data.items[0].id as string;
}

d('referrals (E011)', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setPaymentProvider(null);
    invalidateReferralCache();
    invalidateFeeCache();
    for (const [key, type, value] of [
      ['TRANSACTION_FEE', 'PERCENT', 1.5],
      ['PRODUCT_FEE', 'PERCENT', 5],
      ['LOGISTICS_FEE', 'FLAT', 150_000],
    ] as const) {
      await prisma.feeConfig.upsert({ where: { key }, create: { key, type, value }, update: { type, value } });
    }
    await prisma.appSetting.upsert({
      where: { key: 'referral.reward' },
      create: { key: 'referral.reward', value: { enabled: true, referrerKobo: 50000, refereeKobo: 0 } },
      update: { value: { enabled: true, referrerKobo: 50000, refereeKobo: 0 } },
    });
    invalidateReferralCache();
  });
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('summarises my code, link and referees', async () => {
    const me = await makeCelebrant();
    await refer(me.user.id, me.user.referralCode);
    await refer(me.user.id, me.user.referralCode);

    const r = (await body(await app.request('/v1/referrals', { headers: me.auth }))).data;
    expect(r.code).toBe(me.user.referralCode);
    expect(r.link).toContain(`ref=${me.user.referralCode}`);
    expect(r.totalReferred).toBe(2);
    expect(r.signedUp).toBe(2);
    expect(r.rewarded).toBe(0);
    expect(r.totalEarnedKobo).toBe('0');
    expect(r.pendingRewardKobo).toBe('100000'); // 2 × ₦500
    expect(r.referees).toHaveLength(2);
  });

  it("rewards the referrer with an order discount on the referee's first paid gift, once", async () => {
    const referrer = await makeCelebrant();
    const referee = await refer(referrer.user.id, referrer.user.referralCode);

    const item = await giftableItem(app);
    const g1 = await payForGift(app, referee.auth, { wishlistItemId: item });
    expect(g1.res.status).toBe(201);

    // The reward is money off a later purchase, not cash.
    const credits = await prisma.discountCredit.findMany({ where: { userId: referrer.user.id } });
    expect(credits).toHaveLength(1);
    expect(credits[0]!.amountKobo).toBe(50_000n); // ₦500 off
    expect(credits[0]!.source).toBe('REFERRAL');
    expect(credits[0]!.usedAt).toBeNull();

    const row = await prisma.referral.findFirstOrThrow({ where: { refereeId: referee.user.id } });
    expect(row.status).toBe('REWARDED');
    expect(row.rewardKobo).toBe(50_000n);
    expect(row.rewardedAt).not.toBeNull();

    // referrer got a notification + an activity entry
    const notifs = (await body(await app.request('/v1/notifications', { headers: referrer.auth }))).data;
    expect(notifs.some((n: { type: string }) => n.type === 'referral.rewarded')).toBe(true);
    const acts = (await body(await app.request('/v1/activities?action=referral', { headers: referrer.auth }))).data;
    expect(acts.some((a: { action: string }) => a.action === 'referral.rewarded')).toBe(true);

    // A second gift does not reward again.
    await payForGift(app, referee.auth, { wishlistItemId: item });
    expect(await prisma.discountCredit.count({ where: { userId: referrer.user.id } })).toBe(1);

    const summary = (await body(await app.request('/v1/referrals', { headers: referrer.auth }))).data;
    expect(summary.rewarded).toBe(1);
    expect(summary.totalEarnedKobo).toBe('50000');
    expect(summary.pendingRewardKobo).toBe('0');
  });

  it('gives both sides a discount when configured', async () => {
    await prisma.appSetting.update({
      where: { key: 'referral.reward' },
      data: { value: { enabled: true, referrerKobo: 50000, refereeKobo: 20000 } },
    });
    invalidateReferralCache();

    const referrer = await makeCelebrant();
    const referee = await refer(referrer.user.id, referrer.user.referralCode);
    const item = await giftableItem(app);
    await payForGift(app, referee.auth, { wishlistItemId: item });

    const referrerCredit = await prisma.discountCredit.findFirstOrThrow({ where: { userId: referrer.user.id } });
    const refereeCredit = await prisma.discountCredit.findFirstOrThrow({ where: { userId: referee.user.id } });
    expect(referrerCredit.amountKobo).toBe(50_000n);
    expect(refereeCredit.amountKobo).toBe(20_000n);
  });

  it('does nothing for a gifter who was not referred', async () => {
    const gifter = await makeCelebrant();
    const item = await giftableItem(app);
    const { res } = await payForGift(app, gifter.auth, { wishlistItemId: item });
    expect(res.status).toBe(201);
    // no referral rows, no credits, no crash
    expect(await prisma.referral.count()).toBe(0);
    expect(await prisma.discountCredit.count()).toBe(0);
  });


  describe('referral credit as an order discount', () => {
    const credit = (userId: string, amountKobo: bigint) =>
      prisma.discountCredit.create({ data: { userId, amountKobo, source: 'REFERRAL' } });
    const quote = async (auth: Record<string, string>, wishlistItemId: string) =>
      (await body(await app.request('/v1/gifts/quote', post({ wishlistItemId, quantity: 1 }, auth)))).data;

    it('takes the credit off what the buyer pays, and spends it once the payment is confirmed', async () => {
      const buyer = await makeCelebrant();
      const earned = await credit(buyer.user.id, 50_000n);
      const item = await giftableItem(app);

      const q = await quote(buyer.auth, item);
      expect(q.availableCreditKobo).toBe('50000');
      expect(q.discountKobo).toBe('50000');
      expect(q.gifterPaysKobo).toBe('1165000');
      expect(q.payKobo).toBe('1115000');

      const res = await app.request('/v1/gifts', post({ wishlistItemId: item }, buyer.auth));
      expect(res.status).toBe(201);
      const pending = (await body(res)).data;
      expect(pending.discountKobo).toBe('50000');
      expect(pending.payKobo).toBe('1115000');

      // The buyer is charged the discounted amount; the credit is held for this payment.
      const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { reference: pending.reference } });
      expect(intent.amountKobo).toBe(1_115_000n);
      expect(intent.discountKobo).toBe(50_000n);
      const held = await prisma.discountCredit.findUniqueOrThrow({ where: { id: earned.id } });
      expect(held.reservedIntentId).toBe(intent.id);
      expect(held.usedAt).toBeNull();

      await confirmPayment(app, pending.reference);
      const spent = await prisma.discountCredit.findUniqueOrThrow({ where: { id: earned.id } });
      expect(spent.usedAt).not.toBeNull();

      // The merchant is paid in full: the discount came out of genie's share.
      const order = await prisma.order.findFirstOrThrow({});
      expect(order.merchantNetKobo).toBe(950_000n);

      // Spent credit is gone: the next gift is full price.
      const item2 = await giftableItem(app);
      expect((await quote(buyer.auth, item2)).payKobo).toBe('1165000');
    });

    it("never discounts more than genie keeps on the purchase, and splits a bigger credit", async () => {
      const buyer = await makeCelebrant();
      const big = await credit(buyer.user.id, 1_000_000n); // ₦10,000
      const item = await giftableItem(app);

      const pending = (await body(await app.request('/v1/gifts', post({ wishlistItemId: item }, buyer.auth)))).data;
      expect(pending.discountKobo).toBe('215000'); // fees + commission, nothing more
      expect(pending.payKobo).toBe('950000'); // always at least what the merchant is owed

      await confirmPayment(app, pending.reference);
      const rows = await prisma.discountCredit.findMany({ where: { userId: buyer.user.id }, orderBy: { amountKobo: 'asc' } });
      expect(rows.map((r) => r.amountKobo)).toEqual([215_000n, 785_000n]);
      expect(rows[0]!.usedAt).not.toBeNull(); // the part that was spent
      expect(rows[1]!.id).toBe(big.id);
      expect(rows[1]!.usedAt).toBeNull(); // the rest is still there
    });

    it('does not let one credit pay for two checkouts at once', async () => {
      const buyer = await makeCelebrant();
      await credit(buyer.user.id, 50_000n);
      const item1 = await giftableItem(app);
      const item2 = await giftableItem(app);

      const first = (await body(await app.request('/v1/gifts', post({ wishlistItemId: item1 }, buyer.auth)))).data;
      const second = (await body(await app.request('/v1/gifts', post({ wishlistItemId: item2 }, buyer.auth)))).data;
      expect(first.discountKobo).toBe('50000');
      expect(second.discountKobo).toBe('0'); // already held by the first checkout
    });

    it('gives the credit back when the payment fails', async () => {
      const buyer = await makeCelebrant();
      const earned = await credit(buyer.user.id, 50_000n);
      const item = await giftableItem(app);
      const pending = (await body(await app.request('/v1/gifts', post({ wishlistItemId: item }, buyer.auth)))).data;

      await confirmPayment(app, pending.reference, 1_000); // far too little: refused
      expect((await prisma.paymentIntent.findUniqueOrThrow({ where: { reference: pending.reference } })).status).toBe('FAILED');
      const back = await prisma.discountCredit.findUniqueOrThrow({ where: { id: earned.id } });
      expect(back.reservedIntentId).toBeNull();
      expect(back.usedAt).toBeNull();
      expect((await quote(buyer.auth, item)).discountKobo).toBe('50000'); // spendable again
    });

    it('does not discount a guest, who has no account to hold credit', async () => {
      const merchant = await makeMerchant();
      const product = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
      const celebrant = await makeCelebrant();
      const ev = await app.request(
        '/v1/events',
        post({ type: 'Birthday', name: 'P', eventDate: inDays(15), deliveryAddress: '1 Rd', wishlistName: 'L' }, celebrant.auth),
      );
      const wid = (await body(await app.request(`/v1/events/${(await body(ev)).data.id}`, { headers: celebrant.auth }))).data.wishlists[0].id;
      const added = await app.request(`/v1/wishlists/${wid}/items`, post({ productId: product.id, quantityWanted: 1 }, celebrant.auth));
      const itemId = (await body(added)).data.items[0].id;

      const res = await app.request(`/v1/public/wishlists/${wid}/checkout`, post({
        wishlistItemIds: [itemId], gifterName: 'Chidi', gifterEmail: 'chidi@example.com', isAnonymous: false,
      }, { 'content-type': 'application/json' }));
      expect(res.status).toBe(201);
      const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { reference: (await body(res)).data.reference } });
      expect(intent.discountKobo).toBe(0n);
    });

    it('shows the credit a person has on their referral summary', async () => {
      const me = await makeCelebrant();
      await credit(me.user.id, 50_000n);
      await credit(me.user.id, 20_000n);
      const r = (await body(await app.request('/v1/referrals', { headers: me.auth }))).data;
      expect(r.creditAvailableKobo).toBe('70000');
    });
  });
});
