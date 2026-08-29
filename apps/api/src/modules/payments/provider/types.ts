/**
 * The payment-rail abstraction. genie's own LedgerEntry table is always the
 * source of truth for balances; a PaymentProvider is just the pipe to the
 * outside world (bank transfers in, NIP transfers out, internal book moves).
 *
 * Two implementations:
 *   - MockPaymentProvider   — in-memory, deterministic, no external account.
 *   - AnchorPaymentProvider — real calls to https://api.getanchor.co.
 *
 * A future crypto on-ramp would be a third implementation of this same
 * interface (the reason v1 has no crypto but the seam exists).
 */

export type ProviderCustomer = { providerCustomerId: string };
export type ProviderDepositAccount = {
  providerAccountId: string;
  virtualNuban?: string | null;
};

export type DynamicVirtualAccount = {
  reference: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
  expiresAt: string | null;
};

export type TransferResult = {
  providerRef: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
};

export type WebhookVerification =
  | { valid: true; eventType: string; externalId: string | null; payload: unknown }
  | { valid: false; reason: string };

export type NipTransferInput = {
  amountKobo: bigint;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration: string;
  reference: string;
};

export type BookTransferInput = {
  fromProviderAccountId: string;
  toProviderAccountId: string;
  amountKobo: bigint;
  narration: string;
  reference: string;
};

export interface PaymentProvider {
  readonly name: string;

  ensureCustomer(input: {
    userId: string;
    type: 'individual' | 'business';
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
  }): Promise<ProviderCustomer>;

  ensureDepositAccount(input: {
    providerCustomerId: string;
    userId: string;
  }): Promise<ProviderDepositAccount>;

  createDynamicVirtualAccount(input: {
    amountKobo: bigint;
    reference: string;
    customerName: string;
    providerCustomerId?: string;
    ttlSeconds?: number;
  }): Promise<DynamicVirtualAccount>;

  bookTransfer(input: BookTransferInput): Promise<TransferResult>;

  nipTransfer(input: NipTransferInput): Promise<TransferResult>;

  getBalance(providerAccountId: string): Promise<bigint>;

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookVerification;
}

export class ProviderNotConfiguredError extends Error {
  constructor(message = 'The Anchor payment provider is selected but ANCHOR_KEY is not set.') {
    super(message);
    this.name = 'ProviderNotConfiguredError';
  }
}
