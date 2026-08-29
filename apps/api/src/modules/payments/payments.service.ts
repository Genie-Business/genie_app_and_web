import { paymentReference, transactionReference } from '@genie/core';
import { prisma } from '@genie/db';
import { badRequest, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { postEntry } from './ledger.service';
import { getPaymentProvider } from './provider';
import { ensureWallet } from './wallet.service';

const MIN_FUNDING_KOBO = 10_000n; // ₦100

/** Create an ADD_FUNDS intent + a dynamic virtual account to pay into. */
export async function createAddFundsIntent(userId: string, amountKobo: number) {
  const amount = BigInt(amountKobo);
  if (amount < MIN_FUNDING_KOBO) throw badRequest('The minimum top-up is ₦100.');

  const wallet = await ensureWallet(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const provider = getPaymentProvider();
  const reference = paymentReference();

  const dva = await provider.createDynamicVirtualAccount({
    amountKobo: amount,
    reference,
    customerName: `${user.firstName} ${user.lastName}`.trim(),
    providerCustomerId: wallet.providerCustomerId ?? undefined,
    ttlSeconds: 1800,
  });

  const intent = await prisma.paymentIntent.create({
    data: {
      reference,
      userId,
      purpose: 'ADD_FUNDS',
      amountKobo: amount,
      provider: provider.name,
      method: 'BANK_TRANSFER',
      status: 'PENDING',
      dynamicVirtualNuban: {
        accountNumber: dva.accountNumber,
        bankName: dva.bankName,
        accountName: dva.accountName,
      },
      expiresAt: dva.expiresAt ? new Date(dva.expiresAt) : null,
    },
  });

  return {
    reference: intent.reference,
    purpose: intent.purpose,
    amountKobo: intent.amountKobo,
    status: intent.status,
    method: intent.method,
    virtualAccount: {
      accountNumber: dva.accountNumber,
      bankName: dva.bankName,
      accountName: dva.accountName,
      expiresAt: dva.expiresAt,
    },
    checkoutUrl: null,
  };
}

export async function getIntent(userId: string, reference: string) {
  const intent = await prisma.paymentIntent.findFirst({ where: { reference, userId } });
  if (!intent) throw notFound('Payment not found.');
  const nuban = intent.dynamicVirtualNuban as
    | { accountNumber: string; bankName: string; accountName: string }
    | null;
  return {
    reference: intent.reference,
    purpose: intent.purpose,
    amountKobo: intent.amountKobo,
    status: intent.status,
    method: intent.method,
    virtualAccount: nuban
      ? { ...nuban, expiresAt: intent.expiresAt?.toISOString() ?? null }
      : null,
    checkoutUrl: null,
  };
}

/**
 * Apply a confirmed inbound payment to an ADD_FUNDS intent: credit the wallet
 * ledger, mark the intent COMPLETED, write a Transaction. Idempotent on the
 * intent reference.
 */
export async function settleAddFunds(reference: string, paidAmountKobo: bigint) {
  const intent = await prisma.paymentIntent.findUnique({ where: { reference } });
  if (!intent) throw notFound(`No payment intent for reference ${reference}.`);
  if (intent.purpose !== 'ADD_FUNDS') throw badRequest('Not a funding intent.');
  if (intent.status === 'COMPLETED') {
    return { alreadySettled: true, intentReference: reference };
  }

  const amount = paidAmountKobo > 0n ? paidAmountKobo : intent.amountKobo;

  await prisma.$transaction(async (tx) => {
    await postEntry(
      {
        userId: intent.userId,
        direction: 'CREDIT',
        amountKobo: amount,
        reason: 'FUNDING',
        refType: 'PaymentIntent',
        refId: intent.id,
        narration: `Wallet top-up ${reference}`,
        idempotencyKey: `funding:${intent.id}`,
      },
      tx,
    );
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await tx.transaction.create({
      data: {
        reference: transactionReference(),
        userId: intent.userId,
        type: 'FUNDING',
        amountKobo: amount,
        status: 'COMPLETED',
        paymentIntentId: intent.id,
        narration: `Wallet top-up ${reference}`,
      },
    });
  });

  logger.info({ reference, amount: amount.toString() }, 'add-funds settled');
  return { alreadySettled: false, intentReference: reference };
}
