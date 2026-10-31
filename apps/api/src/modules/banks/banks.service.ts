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
import { NG_BANKS } from './banks.data';

const LIVE_TTL_MS = 6 * 60 * 60_000;

let cache: { banks: Bank[]; expiresAt: number } | null = null;

/** Test helper — forget the cached bank list. */
export function __resetBankCache() {
  cache = null;
}

/**
 * Banks the app offers in its picker: the payment provider's live list. The bundled
 * list stands in only for the mock provider; a real provider has its own bank codes
 * (Paystack's differ from the CBN ones for several fintechs), so offering the bundled
 * list there would produce accounts that cannot be resolved or paid. If a real
 * provider's list can't be fetched we keep serving the last good one, or say so.
 * Cached per process.
 */
export async function listBanks(): Promise<Bank[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.banks;

  const provider = getPaymentProvider();
  let live: Bank[] = [];
  try {
    live = await provider.listBanks();
  } catch (err) {
    logger.warn({ err }, 'provider bank list unavailable');
  }

  if (live.length === 0) {
    if (provider.name !== 'mock') {
      if (cache) return cache.banks; // stale, but real
      throw new AppError(503, 'bank_list_unavailable', "We can't load the list of banks right now. Please try again in a moment.");
    }
    live = [...NG_BANKS];
  }

  const byCode = new Map(live.map((b) => [b.code, b]));
  const banks = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
  cache = { banks, expiresAt: Date.now() + LIVE_TTL_MS };
  return banks;
}

async function bankNameFor(code: string): Promise<string | undefined> {
  try {
    return (await listBanks()).find((b) => b.code === code)?.name;
  } catch {
    return undefined; // a missing list must not stop an account lookup that otherwise worked
  }
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
