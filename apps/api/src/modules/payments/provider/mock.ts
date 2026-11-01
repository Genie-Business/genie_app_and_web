import { makeReference } from '@genie/core';
import { NG_BANKS, bundledBank } from '../../banks/banks.data';
import { parseWebhook, paystackSignature } from './paystack';
import type {
  Bank,
  InitializeChargeInput,
  InitializedCharge,
  PaymentProvider,
  RecipientInput,
  RefundInput,
  RefundResult,
  ResolvedAccount,
  TransferInput,
  TransferResult,
  VerifiedCharge,
  WebhookVerification,
} from './types';
import { AccountNotFoundError, AccountResolutionUnavailableError, TransferError } from './types';

/**
 * Deterministic in-memory provider for local dev, tests and preview deploys
 * without a Paystack account. Pair it with `POST /v1/payments/_mock/pay` to
 * simulate a buyer completing the hosted checkout.
 *
 * State lives in this process only, which is fine for dev and tests but means a
 * multi-instance deploy shouldn't rely on the mock to settle payments.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  /** reference -> amount, for charges that have been started */
  private readonly started = new Map<string, bigint>();
  /** reference -> amount, for charges the "buyer" has completed */
  private readonly paid = new Map<string, bigint>();

  /** Test hook: make the next N transfers fail (e.g. "balance not enough"). */
  failNextTransfers = 0;
  /** Test hook: make the next N transfers fail in the ambiguous way (a dropped connection). */
  dropNextTransfers = 0;
  /** Test hook: leave the next N transfers pending, as a slow bank would. */
  holdNextTransfers = 0;
  /** Test hook: make the next N refunds fail. */
  failNextRefunds = 0;
  /** Every refund the "provider" was asked for, so a test can see what was given back. */
  readonly refunds: Array<RefundInput & { providerRef: string }> = [];
  /** reference -> what the "provider" recorded for each transfer it accepted */
  private readonly transfers = new Map<string, TransferResult>();

  private readonly secret = process.env.PAYSTACK_SECRET_KEY || 'mock-paystack-secret';

  /**
   * Whether name enquiry returns made-up names. On for dev and tests; off in
   * production, where a mock-provider deploy has no real account to look up and
   * must not show a merchant a name that isn't theirs.
   */
  private readonly simulateLookups: boolean;

  constructor(opts: { simulateAccountLookups?: boolean } = {}) {
    this.simulateLookups = opts.simulateAccountLookups ?? process.env.NODE_ENV !== 'production';
  }

  async initializeCharge(input: InitializeChargeInput): Promise<InitializedCharge> {
    this.started.set(input.reference, input.amountKobo);
    const base = process.env.APP_PUBLIC_URL || 'https://www.getgenie.gift';
    return {
      checkoutUrl: `${base}/pay/mock?reference=${encodeURIComponent(input.reference)}`,
      accessCode: `mock_ac_${input.reference}`,
    };
  }

  /** Simulate the buyer finishing checkout. Returns the amount that was "paid". */
  markPaid(reference: string, amountKobo?: bigint): bigint {
    const amount = amountKobo ?? this.started.get(reference) ?? 0n;
    this.paid.set(reference, amount);
    return amount;
  }

  async verifyCharge(reference: string): Promise<VerifiedCharge> {
    const paidAmount = this.paid.get(reference);
    return paidAmount === undefined
      ? { reference, status: 'PENDING', amountKobo: this.started.get(reference) ?? 0n, currency: 'NGN', paidAt: null }
      : { reference, status: 'SUCCESS', amountKobo: paidAmount, currency: 'NGN', paidAt: new Date().toISOString() };
  }

  async listBanks(): Promise<Bank[]> {
    return [...NG_BANKS];
  }

  /**
   * Simulated name enquiry: any 10-digit number resolves to `TEST ACCOUNT <last 4>`,
   * except numbers starting `0000`, which the "bank" doesn't recognise.
   */
  async resolveAccount(input: { bankCode: string; accountNumber: string }): Promise<ResolvedAccount> {
    if (!this.simulateLookups) {
      throw new AccountResolutionUnavailableError(
        'Account name lookup needs a live payment provider (set PAYMENTS_PROVIDER=paystack and PAYSTACK_SECRET_KEY).',
      );
    }
    if (input.accountNumber.startsWith('0000')) throw new AccountNotFoundError();
    return {
      accountName: `TEST ACCOUNT ${input.accountNumber.slice(-4)}`,
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
      bankName: bundledBank(input.bankCode)?.name,
    };
  }

  async createRecipient(input: RecipientInput): Promise<{ recipientCode: string }> {
    return { recipientCode: `RCP_mock_${input.bankCode}_${input.accountNumber}` };
  }

  async transfer(input: TransferInput): Promise<TransferResult> {
    if (this.failNextTransfers > 0) {
      this.failNextTransfers -= 1;
      throw new TransferError('Your balance is not enough to fulfil this request');
    }
    const status = this.holdNextTransfers > 0 ? 'PROCESSING' : 'PAID';
    if (this.holdNextTransfers > 0) this.holdNextTransfers -= 1;
    const result: TransferResult = { providerRef: makeReference('MOCKTRF'), status };
    this.transfers.set(input.reference, result);
    if (this.dropNextTransfers > 0) {
      // The provider took the transfer, but the answer never made it back.
      this.dropNextTransfers -= 1;
      throw new Error('socket hang up');
    }
    return result;
  }

  async refundCharge(input: RefundInput): Promise<RefundResult> {
    if (this.failNextRefunds > 0) {
      this.failNextRefunds -= 1;
      throw new Error('refund refused');
    }
    const providerRef = makeReference('MOCKRF');
    this.refunds.push({ ...input, providerRef });
    return { providerRef, status: 'PROCESSED' };
  }

  async verifyTransfer(reference: string): Promise<TransferResult | null> {
    return this.transfers.get(reference) ?? null;
  }

  /** Test hook: change what the "provider" says happened to a transfer. */
  setTransferStatus(reference: string, status: TransferResult['status']) {
    const existing = this.transfers.get(reference);
    if (existing) this.transfers.set(reference, { ...existing, status });
  }

  /** Build the signed `charge.success` webhook body the real provider would send. */
  buildChargeSuccessEvent(reference: string, amountKobo?: bigint): { body: string; signature: string } {
    const amount = this.markPaid(reference, amountKobo);
    const body = JSON.stringify({
      event: 'charge.success',
      data: {
        id: Math.floor(Math.random() * 1e9),
        reference,
        status: 'success',
        amount: Number(amount),
        currency: 'NGN',
      },
    });
    return { body, signature: paystackSignature(this.secret, body) };
  }

  /** Build a signed transfer webhook (`transfer.success` / `transfer.failed` / `transfer.reversed`). */
  buildTransferEvent(
    event: 'transfer.success' | 'transfer.failed' | 'transfer.reversed',
    reference: string,
  ): { body: string; signature: string } {
    const body = JSON.stringify({
      event,
      data: { id: Math.floor(Math.random() * 1e9), reference: reference.toLowerCase(), status: event.split('.')[1] },
    });
    return { body, signature: paystackSignature(this.secret, body) };
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookVerification {
    const provided = headers['x-paystack-signature'];
    if (!provided) return { valid: false, reason: 'missing x-paystack-signature' };
    if (provided !== paystackSignature(this.secret, rawBody)) return { valid: false, reason: 'signature mismatch' };
    return parseWebhook(rawBody);
  }
}
