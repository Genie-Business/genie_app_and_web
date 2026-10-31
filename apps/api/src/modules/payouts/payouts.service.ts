import { payoutReference, transactionReference } from '@genie/core';
import { prisma, type PayoutAccount, type Prisma } from '@genie/db';
import type { gifts as G } from '@genie/contracts';
import { getEnv } from '../../env';
import { badRequest } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { recordActivity } from '../activities/activities.service';
import { settleBankDetails } from '../banks/banks.service';
import { notify } from '../notifications/notify.service';
import { getPaymentProvider } from '../payments/provider';
import { AccountNotFoundError, TransferError } from '../payments/provider/types';

type Account = G.PayoutAccountBody;

/** Below this, orders wait and are paid with the next ones rather than sent as a tiny transfer. */
export const MIN_PAYOUT_KOBO = 10_000n; // ₦100

/** A payout still "processing" after this long has an outcome we never heard; ask the provider. */
const STALE_PROCESSING_MS = 10 * 60_000;

/** Most merchants one run will pay, so a single request stays well inside the function time limit. */
const MAX_MERCHANTS_PER_RUN = 100;

const money = (kobo: bigint) => `₦${(Number(kobo) / 100).toLocaleString()}`;

// ── Settlement account ────────────────────────────────────────────────

/**
 * Save / update a merchant's settlement bank account. With a bank code the
 * account name is looked up from the bank (the app's own name is ignored); a
 * number the bank doesn't recognise is rejected.
 */
export async function setPayoutAccount(merchantId: string, input: Account) {
  const bank = await settleBankDetails({
    bankName: input.bankName,
    bankCode: input.bankCode,
    accountNumber: input.accountNumber,
    claimedName: input.accountName,
  });
  if (!bank.accountName) throw badRequest('Enter the name on the bank account.');

  const data = {
    bankName: bank.bankName,
    bankCode: bank.bankCode,
    accountNumber: input.accountNumber,
    accountName: bank.accountName,
    isVerified: bank.verified,
    // A different account is a different payee: the next payout registers it afresh.
    providerRecipientId: null,
  };
  const account = await prisma.payoutAccount.upsert({
    where: { merchantId },
    create: { merchantId, ...data },
    update: data,
  });
  return presentAccount(account);
}

function presentAccount(a: {
  bankName: string;
  bankCode: string | null;
  accountNumber: string;
  accountName: string;
  isVerified: boolean;
}) {
  return {
    bankName: a.bankName,
    bankCode: a.bankCode,
    accountNumber: a.accountNumber,
    accountName: a.accountName,
    isVerified: a.isVerified,
  };
}

export async function getPayoutAccount(merchantId: string) {
  const a = await prisma.payoutAccount.findUnique({ where: { merchantId } });
  return a ? presentAccount(a) : null;
}

// ── Paying merchants out ──────────────────────────────────────────────

export type PayoutRunSummary = {
  /** Payouts the provider confirmed as sent. */
  paid: number;
  /** Sent but not yet confirmed: the provider's webhook (or the next run) settles these. */
  processing: number;
  /** Merchants passed over this time (no settlement account, nothing big enough yet, ...). */
  skipped: number;
  /** Payouts the provider refused; their orders go back in line for the next run. */
  failed: number;
  /** Earlier payouts whose outcome was looked up and settled at the start of this run. */
  reconciled: number;
  paidKobo: string;
};

/** Orders genie owes a merchant for: delivered (and past any hold), not yet part of a payout. */
function owedOrders(cutoff: Date, merchantId?: string): Prisma.OrderWhereInput {
  return {
    status: 'DELIVERED',
    payoutId: null,
    merchantNetKobo: { gt: 0n },
    ...(getEnv().PAYOUT_HOLD_HOURS > 0 ? { delivery: { is: { deliveredAt: { lte: cutoff } } } } : {}),
    ...(merchantId ? { merchantId } : {}),
  };
}

/**
 * Pay every merchant what they are owed for delivered orders: one transfer per merchant,
 * covering all their unpaid delivered orders. Safe to run as often as you like: an order
 * belongs to at most one payout, and a transfer whose result was never heard is looked up
 * rather than sent twice.
 */
export async function runPayouts(opts: { merchantId?: string } = {}): Promise<PayoutRunSummary> {
  const summary = { paid: 0, processing: 0, skipped: 0, failed: 0, reconciled: 0, paidKobo: 0n };
  summary.reconciled = await reconcileOpenPayouts();

  const cutoff = new Date(Date.now() - getEnv().PAYOUT_HOLD_HOURS * 3_600_000);
  const owed = await prisma.order.findMany({
    where: owedOrders(cutoff, opts.merchantId),
    select: { merchantId: true },
    distinct: ['merchantId'],
    take: MAX_MERCHANTS_PER_RUN,
  });

  for (const { merchantId } of owed) {
    try {
      const outcome = await payOutMerchant(merchantId, cutoff);
      if (outcome.status === 'paid') {
        summary.paid += 1;
        summary.paidKobo += outcome.amountKobo;
      } else {
        summary[outcome.status] += 1;
      }
    } catch (err) {
      // One merchant's problem must not stop everyone else being paid.
      logger.error({ err, merchantId }, 'payout failed unexpectedly');
      summary.failed += 1;
    }
  }

  logger.info({ ...summary, paidKobo: summary.paidKobo.toString() }, 'payout run finished');
  return { ...summary, paidKobo: summary.paidKobo.toString() };
}

type MerchantOutcome =
  | { status: 'paid'; amountKobo: bigint }
  | { status: 'processing' | 'skipped' | 'failed' };

async function payOutMerchant(merchantId: string, cutoff: Date): Promise<MerchantOutcome> {
  const account = await prisma.payoutAccount.findUnique({ where: { merchantId } });
  if (!account) {
    await nudge(merchantId, 'payout.needs_account', 'Add your settlement account', 'You have delivered orders waiting to be paid. Add the bank account genie should pay them into.');
    return { status: 'skipped' };
  }
  const verified = await ensureVerifiedAccount(account);
  if (!verified) return { status: 'skipped' };

  const orders = await prisma.order.findMany({
    where: owedOrders(cutoff, merchantId),
    select: { id: true, merchantNetKobo: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  const total = orders.reduce((sum, o) => sum + o.merchantNetKobo, 0n);
  if (orders.length === 0 || total < MIN_PAYOUT_KOBO) return { status: 'skipped' };

  // Claim the orders for a new payout before any money moves, so a second run can't pay them again.
  const reference = payoutReference();
  let payoutId: string;
  try {
    payoutId = await prisma.$transaction(
      async (tx) => {
        const payout = await tx.payout.create({
          data: {
            reference,
            merchantId,
            amountKobo: total,
            feeKobo: 0n, // genie absorbs the transfer fee
            netAmountKobo: total,
            status: 'PROCESSING',
            periodStart: orders[0]!.createdAt,
            periodEnd: orders[orders.length - 1]!.createdAt,
          },
        });
        const claimed = await tx.order.updateMany({
          where: { id: { in: orders.map((o) => o.id) }, payoutId: null, status: 'DELIVERED' },
          data: { payoutId: payout.id },
        });
        if (claimed.count !== orders.length) throw new Error('another payout run claimed these orders');
        await tx.transaction.create({
          data: {
            reference: transactionReference(),
            userId: merchantId,
            type: 'PAYOUT',
            amountKobo: total,
            status: 'PROCESSING',
            payoutId: payout.id,
            narration: `Payout ${reference}`,
          },
        });
        return payout.id;
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (err) {
    logger.warn({ err, merchantId }, 'could not claim orders for a payout');
    return { status: 'skipped' };
  }

  const provider = getPaymentProvider();
  try {
    let recipientCode = verified.providerRecipientId;
    if (!recipientCode) {
      recipientCode = (
        await provider.createRecipient({
          name: verified.accountName,
          accountNumber: verified.accountNumber,
          bankCode: verified.bankCode!,
        })
      ).recipientCode;
      await prisma.payoutAccount.update({ where: { id: verified.id }, data: { providerRecipientId: recipientCode } });
    }

    const result = await provider.transfer({
      amountKobo: total,
      recipientCode,
      reference,
      reason: `genie payout ${reference}`,
    });

    if (result.status === 'PAID') {
      await markPaid(payoutId, result.providerRef);
      return { status: 'paid', amountKobo: total };
    }
    if (result.status === 'FAILED') {
      await failPayout(payoutId, 'The payment provider reported the transfer as failed.');
      return { status: 'failed' };
    }
    await prisma.payout.update({ where: { id: payoutId }, data: { providerTransferRef: result.providerRef } });
    return { status: 'processing' };
  } catch (err) {
    if (err instanceof TransferError) {
      // A definite refusal: nothing was sent, so the orders can go back in line.
      await failPayout(payoutId, err.message);
      return { status: 'failed' };
    }
    // Anything else (a timeout, a dropped connection) may have gone through. Leave the payout
    // processing; reconcileOpenPayouts asks the provider what happened before anything is retried.
    logger.error({ err, payoutId, reference }, 'payout transfer result unknown, left processing');
    return { status: 'processing' };
  }
}

/**
 * A saved account is only paid once the bank has confirmed who owns it. Accounts saved while
 * name lookups were unavailable are checked now; a typo'd number is caught here rather than
 * sending money to a stranger.
 */
async function ensureVerifiedAccount(account: PayoutAccount): Promise<(PayoutAccount & { bankCode: string }) | null> {
  if (!account.bankCode) {
    await nudge(account.merchantId, 'payout.fix_account', 'Check your settlement account', 'Pick your bank again in Settlement account so genie can verify it and pay your delivered orders.');
    return null;
  }
  if (account.isVerified) return account as PayoutAccount & { bankCode: string };

  try {
    const found = await getPaymentProvider().resolveAccount({ bankCode: account.bankCode, accountNumber: account.accountNumber });
    const updated = await prisma.payoutAccount.update({
      where: { id: account.id },
      data: { accountName: found.accountName, isVerified: true, providerRecipientId: null },
    });
    return updated as PayoutAccount & { bankCode: string };
  } catch (err) {
    if (err instanceof AccountNotFoundError) {
      await nudge(account.merchantId, 'payout.fix_account', 'Your settlement account was not found', 'Your bank has no account with the number you saved. Update it in Settlement account so genie can pay you.');
    } else {
      logger.warn({ err, merchantId: account.merchantId }, 'could not verify a settlement account, payout postponed');
    }
    return null;
  }
}

/** Tell a merchant something once a week, rather than on every payout run. */
async function nudge(userId: string, type: string, title: string, body: string) {
  const recent = await prisma.notification.findFirst({
    where: { userId, type, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    select: { id: true },
  });
  if (!recent) await notify({ userId, type, title, body });
}

/** The money reached the merchant's bank (or the provider says it is on its way and will). Idempotent. */
async function markPaid(payoutId: string, providerRef?: string) {
  const changed = await prisma.payout.updateMany({
    where: { id: payoutId, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'PAID', ...(providerRef ? { providerTransferRef: providerRef } : {}) },
  });
  if (changed.count === 0) return false;

  await prisma.transaction.updateMany({
    where: { payoutId },
    data: { status: 'COMPLETED', ...(providerRef ? { providerRef } : {}) },
  });

  const payout = await prisma.payout.findUniqueOrThrow({
    where: { id: payoutId },
    include: { _count: { select: { orders: true } }, merchant: { include: { payoutAccount: true } } },
  });
  const bank = payout.merchant.payoutAccount;
  try {
    await notify({
      userId: payout.merchantId,
      type: 'payout.sent',
      title: 'Payout sent',
      body: `${money(payout.netAmountKobo)} for ${payout._count.orders} order${payout._count.orders === 1 ? '' : 's'} is on its way${
        bank ? ` to ${bank.bankName} ****${bank.accountNumber.slice(-4)}` : ''
      }.`,
      payload: { reference: payout.reference },
    });
    await recordActivity({
      userId: payout.merchantId,
      category: 'TRANSACTION',
      action: 'payout.sent',
      entityType: 'Payout',
      entityId: payout.id,
      metadata: { amountKobo: payout.netAmountKobo.toString(), orders: payout._count.orders },
    });
  } catch (err) {
    logger.error({ err, payoutId }, 'payout notifications failed');
  }
  return true;
}

/** The provider did not send the money. Release the orders so the next run can pay them. Idempotent. */
async function failPayout(
  payoutId: string,
  reason: string,
  from: Array<'PENDING' | 'PROCESSING' | 'PAID'> = ['PENDING', 'PROCESSING'],
) {
  const changed = await prisma.$transaction(async (tx) => {
    const res = await tx.payout.updateMany({
      where: { id: payoutId, status: { in: from } },
      data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
    });
    if (res.count === 0) return false;
    await tx.order.updateMany({ where: { payoutId }, data: { payoutId: null } });
    await tx.transaction.updateMany({ where: { payoutId }, data: { status: 'FAILED' } });
    return true;
  });
  if (changed) logger.warn({ payoutId, reason }, 'payout failed; its orders will be retried');
  return changed;
}

/**
 * Settle payouts whose outcome we never heard: the transfer was sent but the answer was lost, or
 * the provider's webhook didn't arrive. Asks the provider; if it has no record, nothing was sent.
 */
async function reconcileOpenPayouts(): Promise<number> {
  const open = await prisma.payout.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    select: { id: true, reference: true },
    take: 100,
  });
  let settled = 0;
  for (const p of open) {
    try {
      const found = await getPaymentProvider().verifyTransfer(p.reference);
      if (found === null) {
        if (await failPayout(p.id, 'The transfer never reached the payment provider.')) settled += 1;
      } else if (found.status === 'PAID') {
        if (await markPaid(p.id, found.providerRef)) settled += 1;
      } else if (found.status === 'FAILED') {
        if (await failPayout(p.id, 'The payment provider reported the transfer as failed.')) settled += 1;
      }
    } catch (err) {
      logger.warn({ err, reference: p.reference }, 'could not look up a transfer');
    }
  }
  return settled;
}

/** A transfer outcome pushed by the provider's webhook. */
export async function applyTransferEvent(eventType: string, data: Record<string, unknown> | undefined) {
  const reference = String(data?.reference ?? '');
  if (!reference) return;
  // Paystack lowercases the reference it was given; ours are uppercase.
  const payout = await prisma.payout.findFirst({ where: { reference: { equals: reference, mode: 'insensitive' } } });
  if (!payout) {
    logger.info({ reference, eventType }, 'transfer event for a payout genie does not know');
    return;
  }
  const code = typeof data?.transfer_code === 'string' ? data.transfer_code : undefined;
  if (eventType === 'transfer.success') {
    await markPaid(payout.id, code);
  } else if (eventType === 'transfer.failed') {
    await failPayout(payout.id, 'The payment provider reported the transfer as failed.');
  } else if (eventType === 'transfer.reversed') {
    // The money came back after being sent: the merchant has not been paid, so pay them again.
    await failPayout(payout.id, 'The payment provider reversed the transfer.', ['PENDING', 'PROCESSING', 'PAID']);
  }
}

// ── Reads ─────────────────────────────────────────────────────────────

export async function listPayouts(userId: string) {
  const rows = await prisma.payout.findMany({
    where: { merchantId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((p) => ({
    reference: p.reference,
    amountKobo: p.amountKobo,
    netAmountKobo: p.netAmountKobo,
    status: p.status,
    providerRef: p.providerTransferRef,
    createdAt: p.createdAt.toISOString(),
  }));
}

/** What genie owes a merchant, where it is in the journey, and what they have already been paid. */
export async function getEarnings(merchantId: string) {
  const unpaid = (status: Array<'PAID' | 'FULFILLING' | 'DELIVERED'>) =>
    prisma.order.aggregate({
      where: { merchantId, payoutId: null, status: { in: status } },
      _sum: { merchantNetKobo: true },
      _count: true,
    });
  const payouts = (status: 'PROCESSING' | 'PAID') =>
    prisma.payout.aggregate({ where: { merchantId, status }, _sum: { netAmountKobo: true } });

  const [awaiting, ready, sending, paid, account] = await Promise.all([
    unpaid(['PAID', 'FULFILLING']),
    unpaid(['DELIVERED']),
    payouts('PROCESSING'),
    payouts('PAID'),
    prisma.payoutAccount.findUnique({ where: { merchantId }, select: { isVerified: true } }),
  ]);

  return {
    /** Paid for by the buyer, not delivered yet. */
    awaitingDeliveryKobo: awaiting._sum.merchantNetKobo ?? 0n,
    awaitingDeliveryOrders: awaiting._count,
    /** Delivered, and will go out with the next payout run. */
    readyForPayoutKobo: ready._sum.merchantNetKobo ?? 0n,
    readyForPayoutOrders: ready._count,
    /** Sent to the bank, not yet confirmed. */
    payingOutKobo: sending._sum.netAmountKobo ?? 0n,
    paidOutKobo: paid._sum.netAmountKobo ?? 0n,
    hasSettlementAccount: account != null,
    settlementVerified: account?.isVerified ?? false,
    holdHours: getEnv().PAYOUT_HOLD_HOURS,
    minimumPayoutKobo: MIN_PAYOUT_KOBO,
  };
}
