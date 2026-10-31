import { prisma } from '@genie/db';
import type { gifts as G } from '@genie/contracts';
import { badRequest } from '../../lib/errors';
import { settleBankDetails } from '../banks/banks.service';

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
