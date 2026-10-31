import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setPaymentProvider } from '../src/modules/payments/provider';
import { invalidateReferralCache } from '../src/modules/referrals/referrals.service';
import { invalidateFeeCache } from '../src/modules/fees/fees.service';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, makeMerchant, makeProduct, post } from './helpers/factory';
import { payForGift } from './helpers/pay';

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

});
