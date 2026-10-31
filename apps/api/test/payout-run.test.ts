import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setPaymentProvider, MockPaymentProvider } from '../src/modules/payments/provider';
import { runPayouts } from '../src/modules/payouts/payouts.service';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeMerchant, post } from './helpers/factory';

const json = { 'content-type': 'application/json' };

// getEnv() reads this lazily, when the app is first built, and caches it for this test file.
process.env.CRON_SECRET = 'test-cron-secret';

describe('POST /v1/internal/payouts/run: who may start a payout run', () => {
  const app = createApp();

  it('refuses a request with no credentials or the wrong ones', async () => {
    expect((await app.request('/v1/internal/payouts/run', { method: 'POST' })).status).toBe(401);
    expect((await app.request('/v1/internal/payouts/run', { method: 'POST', headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await app.request('/v1/internal/payouts/run', { headers: { authorization: 'Basic dGVzdC1jcm9uLXNlY3JldA==' } })).status).toBe(401);
  });
});

// ── Integration (disposable DB only) ─────────────────────────────────────
const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  payout-run.test.ts integration cases skipped — needs a disposable test DB.');

let seq = 0;
const ACCOUNT = { bankName: 'GTBank', bankCode: '058', accountNumber: '0123456789', accountName: 'Whatever' };

/** An order genie owes `netKobo` for. */
async function orderFor(merchantId: string, netKobo: bigint, status: 'PAID' | 'FULFILLING' | 'DELIVERED' = 'DELIVERED') {
  seq += 1;
  return prisma.order.create({
    data: {
      orderNumber: `ORD-PO-${seq}-${merchantId.slice(-5)}`,
      merchantId,
      status,
      subtotalKobo: netKobo,
      commissionKobo: 0n,
      merchantNetKobo: netKobo,
      totalKobo: netKobo,
      delivery: { create: { status: status === 'DELIVERED' ? 'DELIVERED' : 'PENDING', deliveredAt: status === 'DELIVERED' ? new Date() : null } },
    },
  });
}

d('paying merchants after delivery (E014)', () => {
  const app = createApp();
  let mock: MockPaymentProvider;

  beforeEach(async () => {
    await resetDb();
    mock = new MockPaymentProvider({ simulateAccountLookups: true });
    __setPaymentProvider(mock);
  });
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  /** A merchant with a settlement account the bank has confirmed. */
  async function paidMerchant() {
    const merchant = await makeMerchant();
    const res = await app.request('/v1/payouts/account', { method: 'PUT', headers: merchant.auth, body: JSON.stringify(ACCOUNT) });
    expect((await body(res)).data.isVerified).toBe(true);
    return merchant;
  }

  it('pays one transfer covering every delivered order, once', async () => {
    const merchant = await paidMerchant();
    const o1 = await orderFor(merchant.user.id, 950_000n);
    const o2 = await orderFor(merchant.user.id, 760_000n);

    const first = await runPayouts();
    expect(first).toMatchObject({ paid: 1, processing: 0, failed: 0, paidKobo: '1710000' });

    const payout = await prisma.payout.findFirstOrThrow({ where: { merchantId: merchant.user.id }, include: { orders: true } });
    expect(payout.status).toBe('PAID');
    expect(payout.netAmountKobo).toBe(1_710_000n);
    expect(payout.orders.map((o) => o.id).sort()).toEqual([o1.id, o2.id].sort());
    const txn = await prisma.transaction.findFirstOrThrow({ where: { payoutId: payout.id } });
    expect(txn).toMatchObject({ type: 'PAYOUT', status: 'COMPLETED' });
    expect((await prisma.payoutAccount.findUniqueOrThrow({ where: { merchantId: merchant.user.id } })).providerRecipientId).toBeTruthy();
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: merchant.user.id, type: 'payout.sent' } });
    expect(note.body).toContain('2 orders');

    // Running again finds nothing owed: no second payout.
    expect(await runPayouts()).toMatchObject({ paid: 0, skipped: 0, paidKobo: '0' });
    expect(await prisma.payout.count()).toBe(1);
  });

  it('does not pay for orders that have not been delivered', async () => {
    const merchant = await paidMerchant();
    await orderFor(merchant.user.id, 950_000n, 'PAID');
    await orderFor(merchant.user.id, 950_000n, 'FULFILLING');

    expect(await runPayouts()).toMatchObject({ paid: 0 });
    expect(await prisma.payout.count()).toBe(0);
  });

  it('lets small amounts wait for the next run instead of sending a tiny transfer', async () => {
    const merchant = await paidMerchant();
    await orderFor(merchant.user.id, 5_000n); // ₦50
    expect(await runPayouts()).toMatchObject({ paid: 0, skipped: 1 });
    await orderFor(merchant.user.id, 6_000n); // together ₦110
    expect(await runPayouts()).toMatchObject({ paid: 1, paidKobo: '11000' });
  });

  it('asks a merchant with no settlement account to add one, once a week', async () => {
    const merchant = await makeMerchant();
    await orderFor(merchant.user.id, 950_000n);
    expect(await runPayouts()).toMatchObject({ paid: 0, skipped: 1 });
    await runPayouts();
    expect(await prisma.notification.count({ where: { userId: merchant.user.id, type: 'payout.needs_account' } })).toBe(1);
    expect(await prisma.order.count({ where: { payoutId: null } })).toBe(1); // still owed
  });

  it('will not send money to an account the bank has not confirmed', async () => {
    mock = new MockPaymentProvider({ simulateAccountLookups: false });
    __setPaymentProvider(mock);
    const merchant = await makeMerchant();
    const saved = await app.request('/v1/payouts/account', { method: 'PUT', headers: merchant.auth, body: JSON.stringify(ACCOUNT) });
    expect((await body(saved)).data.isVerified).toBe(false); // typed name kept, unverified
    await orderFor(merchant.user.id, 950_000n);

    expect(await runPayouts()).toMatchObject({ paid: 0, skipped: 1 });
    expect(await prisma.payout.count()).toBe(0);

    // Once the bank can be asked, the account is confirmed and the merchant is paid.
    mock = new MockPaymentProvider({ simulateAccountLookups: true });
    __setPaymentProvider(mock);
    expect(await runPayouts()).toMatchObject({ paid: 1 });
    expect((await prisma.payoutAccount.findUniqueOrThrow({ where: { merchantId: merchant.user.id } })).isVerified).toBe(true);
  });

  it('puts the orders back in line when the provider refuses the transfer', async () => {
    const merchant = await paidMerchant();
    await orderFor(merchant.user.id, 950_000n);
    mock.failNextTransfers = 1; // e.g. genie's Paystack balance is too low

    expect(await runPayouts()).toMatchObject({ paid: 0, failed: 1 });
    const failed = await prisma.payout.findFirstOrThrow({});
    expect(failed.status).toBe('FAILED');
    expect(failed.failureReason).toContain('balance');
    expect(await prisma.order.count({ where: { payoutId: null } })).toBe(1);

    expect(await runPayouts()).toMatchObject({ paid: 1 }); // next run pays them
    expect(await prisma.order.count({ where: { payoutId: null } })).toBe(0);
  });

  it('does not pay twice when the answer to a transfer was lost', async () => {
    const merchant = await paidMerchant();
    await orderFor(merchant.user.id, 950_000n);
    mock.dropNextTransfers = 1; // the provider took the transfer, the connection dropped

    expect(await runPayouts()).toMatchObject({ paid: 0, processing: 1 });
    const stuck = await prisma.payout.findFirstOrThrow({});
    expect(stuck.status).toBe('PROCESSING');

    // Right away nothing more happens: the orders are claimed and the payout is not stale yet.
    expect(await runPayouts()).toMatchObject({ paid: 0, reconciled: 0 });
    expect(await prisma.payout.count()).toBe(1);

    // Later, the run asks the provider, which did send it: settled, with no second transfer.
    await prisma.payout.update({ where: { id: stuck.id }, data: { updatedAt: new Date(Date.now() - 30 * 60_000) } });
    expect(await runPayouts()).toMatchObject({ reconciled: 1, paid: 0 });
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe('PAID');
    expect(await prisma.payout.count()).toBe(1);
  });

  it('retries a payout the provider never received', async () => {
    const merchant = await paidMerchant();
    const order = await orderFor(merchant.user.id, 950_000n);
    const lost = await prisma.payout.create({
      data: {
        reference: 'PO-LOST-000001',
        merchantId: merchant.user.id,
        amountKobo: 950_000n,
        netAmountKobo: 950_000n,
        status: 'PROCESSING',
        updatedAt: new Date(Date.now() - 30 * 60_000),
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { payoutId: lost.id } });

    // The provider has no record of PO-LOST-000001, so nothing was sent: release and pay properly.
    expect(await runPayouts()).toMatchObject({ reconciled: 1, paid: 1 });
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: lost.id } })).status).toBe('FAILED');
    expect(await prisma.payout.count({ where: { status: 'PAID' } })).toBe(1);
  });

  describe('transfer webhooks', () => {
    const send = (event: ReturnType<MockPaymentProvider['buildTransferEvent']>) =>
      app.request('/v1/payments/webhooks/paystack', { method: 'POST', headers: { ...json, 'x-paystack-signature': event.signature }, body: event.body });

    it('settles a slow payout when the provider confirms it', async () => {
      const merchant = await paidMerchant();
      await orderFor(merchant.user.id, 950_000n);
      mock.holdNextTransfers = 1;
      expect(await runPayouts()).toMatchObject({ processing: 1 });
      const payout = await prisma.payout.findFirstOrThrow({});

      expect((await send(mock.buildTransferEvent('transfer.success', payout.reference))).status).toBe(200);
      expect((await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe('PAID');
      expect(await prisma.notification.count({ where: { userId: merchant.user.id, type: 'payout.sent' } })).toBe(1);
    });

    it('releases the orders when the provider reports a failure', async () => {
      const merchant = await paidMerchant();
      await orderFor(merchant.user.id, 950_000n);
      mock.holdNextTransfers = 1;
      await runPayouts();
      const payout = await prisma.payout.findFirstOrThrow({});

      await send(mock.buildTransferEvent('transfer.failed', payout.reference));
      expect((await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe('FAILED');
      expect(await prisma.order.count({ where: { payoutId: null } })).toBe(1);
    });

    it('takes a transfer back if the provider later reverses it', async () => {
      const merchant = await paidMerchant();
      await orderFor(merchant.user.id, 950_000n);
      await runPayouts();
      const payout = await prisma.payout.findFirstOrThrow({});
      expect(payout.status).toBe('PAID');

      await send(mock.buildTransferEvent('transfer.reversed', payout.reference));
      expect((await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe('FAILED');
      expect(await prisma.order.count({ where: { payoutId: null } })).toBe(1); // owed again
    });

    it('ignores an event for a payout it does not know', async () => {
      expect((await send(mock.buildTransferEvent('transfer.success', 'PO-NOT-OURS-01'))).status).toBe(200);
    });
  });

  it('shows a merchant what is owed at each stage', async () => {
    const merchant = await paidMerchant();
    await orderFor(merchant.user.id, 300_000n, 'PAID');
    await orderFor(merchant.user.id, 200_000n, 'FULFILLING');
    await orderFor(merchant.user.id, 950_000n, 'DELIVERED');
    await runPayouts(); // pays the delivered one
    await orderFor(merchant.user.id, 400_000n, 'DELIVERED');

    const res = await app.request('/v1/merchant/earnings', { headers: merchant.auth });
    expect(res.status).toBe(200);
    expect((await body(res)).data).toMatchObject({
      awaitingDeliveryKobo: '500000',
      awaitingDeliveryOrders: 2,
      readyForPayoutKobo: '400000',
      readyForPayoutOrders: 1,
      payingOutKobo: '0',
      paidOutKobo: '950000',
      hasSettlementAccount: true,
      settlementVerified: true,
    });
    // another merchant cannot read it
    const stranger = await makeMerchant();
    expect((await body(await app.request('/v1/merchant/earnings', { headers: stranger.auth }))).data.paidOutKobo).toBe('0');
  });

  it('runs on a valid cron request', async () => {
    const merchant = await paidMerchant();
    await orderFor(merchant.user.id, 950_000n);
    const res = await app.request('/v1/internal/payouts/run', { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } });
    expect(res.status).toBe(200);
    expect((await body(res)).data).toMatchObject({ paid: 1, paidKobo: '950000' });

    const posted = await app.request('/v1/internal/payouts/run', post({}, { authorization: 'Bearer test-cron-secret' }));
    expect(posted.status).toBe(200);
  });
});
