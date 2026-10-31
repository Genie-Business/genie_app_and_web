import { payoutReference, transactionReference } from '@genie/core';
import { prisma } from '@genie/db';
import type { gifts as G } from '@genie/contracts';
import { badRequest, conflict } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { recordActivity } from '../activities/activities.service';
import { settleBankDetails } from '../banks/banks.service';
import { notify } from '../notifications/notify.service';
import { getBalanceKobo, postEntry } from '../payments/ledger.service';
import { getPaymentProvider } from '../payments/provider';
import { ensureWallet } from '../payments/wallet.service';

type Withdraw = G.WithdrawBody;
type Account = G.PayoutAccountBody;

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

export async function withdrawToBank(userId: string, input: Withdraw) {
  await ensureWallet(userId);
  const amount = BigInt(input.amountKobo);
  const balance = await getBalanceKobo(userId);
  if (balance < amount) {
    throw conflict(
      'insufficient_funds',
      `Your wallet has ₦${(Number(balance) / 100).toLocaleString()}. You can't withdraw ₦${(Number(amount) / 100).toLocaleString()}.`,
    );
  }

  const reference = payoutReference();
  const { payout } = await prisma.$transaction(async (tx) => {
    await postEntry(
      {
        userId,
        direction: 'DEBIT',
        amountKobo: amount,
        reason: 'WITHDRAWAL',
        refType: 'Payout',
        refId: reference,
        narration: `Withdrawal to ${input.bankName} ****${input.accountNumber.slice(-4)}`,
        idempotencyKey: `withdrawal:${reference}`,
      },
      tx,
    );
    const payout = await tx.payout.create({
      data: {
        reference,
        merchantId: userId,
        amountKobo: amount,
        feeKobo: 0,
        netAmountKobo: amount,
        status: 'PROCESSING',
      },
    });
    await tx.transaction.create({
      data: {
        reference: transactionReference(),
        userId,
        type: 'WITHDRAWAL',
        amountKobo: amount,
        status: 'PROCESSING',
        payoutId: payout.id,
        narration: `Withdrawal ${reference}`,
      },
    });
    return { payout };
  }, { timeout: 20_000, maxWait: 10_000 });

  // Fire the transfer; reconcile the payout + ledger on the result.
  try {
    const result = await getPaymentProvider().nipTransfer({
      amountKobo: amount,
      bankCode: input.bankCode ?? '000',
      accountNumber: input.accountNumber,
      accountName: input.accountName,
      narration: `genie withdrawal ${reference}`,
      reference,
    });
    if (result.status === 'FAILED') throw new Error('provider reported FAILED');
    await prisma.$transaction([
      prisma.payout.update({
        where: { id: payout.id },
        data: { status: result.status === 'PAID' ? 'PAID' : 'PROCESSING', providerTransferRef: result.providerRef },
      }),
      prisma.transaction.updateMany({
        where: { payoutId: payout.id },
        data: { status: result.status === 'PAID' ? 'COMPLETED' : 'PROCESSING', providerRef: result.providerRef },
      }),
    ]);
    await recordActivity({
      userId,
      category: 'TRANSACTION',
      action: 'withdrawal.completed',
      entityType: 'Payout',
      entityId: payout.id,
      metadata: { amountKobo: amount.toString(), bank: input.bankName, status: result.status },
    });
    await notify({
      userId,
      type: 'withdrawal.completed',
      title: 'Withdrawal sent',
      body: `₦${(Number(amount) / 100).toLocaleString()} is on its way to ${input.bankName} ****${input.accountNumber.slice(-4)}.`,
      payload: { reference },
    });
    logger.info({ reference, status: result.status }, 'withdrawal sent');
    return { reference, status: result.status, netAmountKobo: amount };
  } catch (err) {
    logger.error({ err, reference }, 'withdrawal failed, reversing');
    await prisma.$transaction(async (tx) => {
      await postEntry(
        {
          userId,
          direction: 'CREDIT',
          amountKobo: amount,
          reason: 'REVERSAL',
          refType: 'Payout',
          refId: reference,
          narration: `Reversal: withdrawal ${reference} failed`,
          idempotencyKey: `withdrawal-reversal:${reference}`,
        },
        tx,
      );
      await tx.payout.update({ where: { id: payout.id }, data: { status: 'FAILED', failureReason: (err as Error).message } });
      await tx.transaction.updateMany({ where: { payoutId: payout.id }, data: { status: 'FAILED' } });
    }, { timeout: 20_000, maxWait: 10_000 });
    throw badRequest('The transfer could not be completed. Your wallet has been refunded.');
  }
}

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
