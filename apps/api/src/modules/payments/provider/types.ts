/**
 * The payment-rail abstraction. genie's own database (orders, payouts,
 * payment intents) is the source of truth; a PaymentProvider is just the pipe to
 * the outside world: take a payment, look up banks and account names, and send
 * money out to merchants.
 *
 * Two implementations:
 *   - MockPaymentProvider     — in-memory, deterministic, no external account.
 *   - PaystackPaymentProvider — real calls to https://api.paystack.co.
 */

export type InitializeChargeInput = {
  email: string;
  amountKobo: bigint;
  reference: string;
  /** Where the buyer lands after the hosted checkout page. */
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
};

export type InitializedCharge = {
  /** Hosted checkout page (card, bank transfer, USSD) to send the buyer to. */
  checkoutUrl: string;
  /** The provider's handle on this charge, kept as PaymentIntent.providerRef. */
  accessCode?: string;
};

export type VerifiedCharge = {
  reference: string;
  /** PENDING covers "not paid yet" (including abandoned): the buyer can still pay. */
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  amountKobo: bigint;
  currency: string;
  paidAt: string | null;
};

/** A bank a transfer can be sent to. `code` is the provider's own institution code. */
export type Bank = { code: string; name: string };

export type ResolvedAccount = {
  accountName: string;
  accountNumber: string;
  bankCode: string;
  /** The provider's name for the bank, when it returns one. */
  bankName?: string;
};

export type RecipientInput = {
  name: string;
  accountNumber: string;
  bankCode: string;
};

export type TransferInput = {
  amountKobo: bigint;
  recipientCode: string;
  reference: string;
  reason: string;
};

export type TransferResult = {
  providerRef: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
};

export type WebhookVerification =
  | { valid: true; eventType: string; externalId: string | null; payload: unknown }
  | { valid: false; reason: string };

export interface PaymentProvider {
  readonly name: string;

  /** Start a hosted-checkout payment. Money lands in genie's provider balance. */
  initializeCharge(input: InitializeChargeInput): Promise<InitializedCharge>;

  /** Ask the provider what became of a charge. The source of truth for "was it paid, and for how much". */
  verifyCharge(reference: string): Promise<VerifiedCharge>;

  /**
   * Banks that can receive transfers. Providers without a live list return an
   * empty array and callers fall back to the bundled list (see banks.data.ts).
   */
  listBanks(): Promise<Bank[]>;

  /**
   * Name enquiry: who owns this account? Throws AccountNotFoundError when the
   * bank says the account does not exist, AccountResolutionUnavailableError when
   * the lookup can't be done right now (not configured, provider down, ...).
   */
  resolveAccount(input: { bankCode: string; accountNumber: string }): Promise<ResolvedAccount>;

  /** Register a bank account as a payee; the returned code is what `transfer` pays to. */
  createRecipient(input: RecipientInput): Promise<{ recipientCode: string }>;

  /** Pay a recipient out of genie's provider balance. */
  transfer(input: TransferInput): Promise<TransferResult>;

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookVerification;
}

export class ProviderNotConfiguredError extends Error {
  constructor(message = 'The Paystack payment provider is selected but PAYSTACK_SECRET_KEY is not set.') {
    super(message);
    this.name = 'ProviderNotConfiguredError';
  }
}

/** The bank has no account with that number. */
export class AccountNotFoundError extends Error {
  constructor(message = 'No account found with that number at that bank.') {
    super(message);
    this.name = 'AccountNotFoundError';
  }
}

/** Name enquiry isn't possible right now; callers degrade to manual entry. */
export class AccountResolutionUnavailableError extends Error {
  constructor(message = 'Account name lookup is not available.') {
    super(message);
    this.name = 'AccountResolutionUnavailableError';
  }
}

/** A transfer could not be sent (provider refused it, or needs an action genie can't take). */
export class TransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferError';
  }
}
