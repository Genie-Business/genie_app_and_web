import type { banks as B } from '@genie/contracts';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { getPaymentProvider } from '../payments/provider';
import {
  AccountNotFoundError,
  AccountResolutionUnavailableError,
  ProviderNotConfiguredError,
  type Bank,
} from '../payments/provider/types';
import { NG_BANKS, bundledBank } from './banks.data';

const LIVE_TTL_MS = 6 * 60 * 60_000;
const FALLBACK_TTL_MS = 5 * 60_000; // retry the provider soon after it failed

let cache: { banks: Bank[]; expiresAt: number } | null = null;

/** Test helper — forget the cached bank list. */
export function __resetBankCache() {
  cache = null;
}

/**
 * Banks the app offers in its picker: the payment provider's live list when it
 * has one, otherwise the bundled list. Cached per process.
 */
export async function listBanks(): Promise<Bank[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.banks;

  let live: Bank[] = [];
  try {
    live = await getPaymentProvider().listBanks();
  } catch (err) {
    logger.warn({ err }, 'provider bank list unavailable, using the bundled list');
  }

  const source = live.length > 0 ? live : [...NG_BANKS];
  const byCode = new Map(source.map((b) => [b.code, b]));
  const banks = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
  cache = { banks, expiresAt: Date.now() + (live.length > 0 ? LIVE_TTL_MS : FALLBACK_TTL_MS) };
  return banks;
}

async function bankNameFor(code: string): Promise<string | undefined> {
  return (await listBanks()).find((b) => b.code === code)?.name ?? bundledBank(code)?.name;
}

const NOT_FOUND_MESSAGE =
  "We couldn't find an account with that number at that bank. Check the bank and the number and try again.";
const UNAVAILABLE_MESSAGE =
  "We can't check account names right now. You can enter the name yourself and we'll verify it later.";

/**
 * Name enquiry. Throws 422 `account_not_found` when the bank has no such
 * account and 503 `account_lookup_unavailable` when the check can't be made.
 */
export async function resolveAccount(input: { bankCode: string; accountNumber: string }): Promise<B.ResolvedAccount> {
  try {
    const found = await getPaymentProvider().resolveAccount(input);
    return {
      accountName: found.accountName.trim(),
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
      bankName: (await bankNameFor(input.bankCode)) ?? found.bankName ?? input.bankCode,
    };
  } catch (err) {
    if (err instanceof AccountNotFoundError) throw new AppError(422, 'account_not_found', NOT_FOUND_MESSAGE);
    if (!(err instanceof AccountResolutionUnavailableError) && !(err instanceof ProviderNotConfiguredError)) {
      logger.error({ err, bankCode: input.bankCode }, 'account name lookup failed');
    }
    throw new AppError(503, 'account_lookup_unavailable', UNAVAILABLE_MESSAGE);
  }
}

export type SettledBankDetails = {
  bankName: string;
  bankCode: string | null;
  /** Null only when no name could be looked up and the caller supplied none. */
  accountName: string | null;
  /** True when the name came from the bank itself rather than from the caller. */
  verified: boolean;
};

/**
 * The bank details to store for a merchant. With a bank code the account name is
 * looked up and the caller's own is ignored; a wrong account number is rejected.
 * If the lookup is merely unavailable we keep the caller's name, unverified, so a
 * provider outage doesn't block sign-up or settlement setup.
 */
export async function settleBankDetails(input: {
  bankName: string;
  bankCode?: string;
  accountNumber: string;
  claimedName?: string;
}): Promise<SettledBankDetails> {
  const claimed = input.claimedName?.trim() || null;
  if (!input.bankCode) {
    return { bankName: input.bankName.trim(), bankCode: null, accountName: claimed, verified: false };
  }

  const bankName = (await bankNameFor(input.bankCode)) ?? input.bankName.trim();
  try {
    const found = await resolveAccount({ bankCode: input.bankCode, accountNumber: input.accountNumber });
    return { bankName, bankCode: input.bankCode, accountName: found.accountName, verified: true };
  } catch (err) {
    if (err instanceof AppError && err.code === 'account_lookup_unavailable') {
      return { bankName, bankCode: input.bankCode, accountName: claimed, verified: false };
    }
    throw err;
  }
}
