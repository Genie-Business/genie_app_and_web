import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  Bank,
  InitializeChargeInput,
  InitializedCharge,
  PaymentProvider,
  RecipientInput,
  ResolvedAccount,
  TransferInput,
  TransferResult,
  VerifiedCharge,
  WebhookVerification,
} from './types';
import {
  AccountNotFoundError,
  AccountResolutionUnavailableError,
  ProviderNotConfiguredError,
  TransferError,
} from './types';

/** A non-2xx answer from Paystack, with the status kept so callers can tell "no such account" from "down". */
export class PaystackHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PaystackHttpError';
  }
}

/** The hex HMAC-SHA512 Paystack puts in `x-paystack-signature`: the raw body, keyed with the secret key. */
export function paystackSignature(secretKey: string, rawBody: string): string {
  return createHmac('sha512', secretKey).update(rawBody).digest('hex');
}

/**
 * Paystack transfer references must be lowercase letters, digits, `-` or `_`, and
 * 16 to 50 characters long. genie's own references are uppercase and can be shorter.
 */
export function paystackTransferReference(reference: string): string {
  const cleaned = reference.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return cleaned.padEnd(16, '0').slice(0, 50);
}

type Envelope<T> = { status?: boolean; message?: string; data: T; meta?: { next?: string | null } };

/**
 * Real Paystack client (https://paystack.com/docs/api). Bearer auth with the secret
 * key; every amount is in kobo, which is what genie stores. Until PAYSTACK_SECRET_KEY is
 * present every call throws ProviderNotConfiguredError so a half-configured deploy fails
 * loudly instead of silently.
 *
 * Request and response shapes follow Paystack's public API reference; confirm them
 * against a test-mode key before relying on them in production.
 */
export class PaystackPaymentProvider implements PaymentProvider {
  readonly name = 'paystack';

  constructor(private readonly config: { baseUrl: string; secretKey: string }) {}

  private assertConfigured() {
    if (!this.config.secretKey) throw new ProviderNotConfiguredError();
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Envelope<T>> {
    this.assertConfigured();
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json: Envelope<T> | null = null;
    try {
      json = text ? (JSON.parse(text) as Envelope<T>) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json?.status === false) {
      throw new PaystackHttpError(res.status, `Paystack ${method} ${path} failed (${res.status}): ${json?.message ?? res.statusText}`);
    }
    return json as Envelope<T>;
  }

  async initializeCharge(input: InitializeChargeInput): Promise<InitializedCharge> {
    const res = await this.request<{ authorization_url: string; access_code?: string }>(
      'POST',
      '/transaction/initialize',
      {
        email: input.email,
        amount: Number(input.amountKobo),
        currency: 'NGN',
        reference: input.reference,
        ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    );
    return { checkoutUrl: res.data.authorization_url, accessCode: res.data.access_code };
  }

  async verifyCharge(reference: string): Promise<VerifiedCharge> {
    try {
      const res = await this.request<{
        status?: string;
        amount?: number;
        currency?: string;
        paid_at?: string | null;
      }>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
      const d = res.data;
      const status = d.status === 'success' ? 'SUCCESS' : d.status === 'failed' || d.status === 'reversed' ? 'FAILED' : 'PENDING';
      return {
        reference,
        status,
        amountKobo: BigInt(Math.round(d.amount ?? 0)),
        currency: d.currency ?? 'NGN',
        paidAt: d.paid_at ?? null,
      };
    } catch (err) {
      // Never started on Paystack's side yet: nothing paid.
      if (err instanceof PaystackHttpError && err.status === 404) {
        return { reference, status: 'PENDING', amountKobo: 0n, currency: 'NGN', paidAt: null };
      }
      throw err;
    }
  }

  async listBanks(): Promise<Bank[]> {
    const banks: Bank[] = [];
    let cursor: string | null | undefined;
    for (let page = 0; page < 10; page += 1) {
      const res = await this.request<
        Array<{ name?: string; code?: string; active?: boolean; is_deleted?: boolean | null; currency?: string; type?: string }>
      >('GET', `/bank?country=nigeria&perPage=100&use_cursor=true${cursor ? `&next=${encodeURIComponent(cursor)}` : ''}`);
      for (const b of res.data ?? []) {
        if (!b.code || !b.name) continue;
        if (b.active === false || b.is_deleted === true) continue;
        if (b.currency && b.currency !== 'NGN') continue;
        if (b.type && b.type !== 'nuban') continue;
        banks.push({ code: b.code, name: b.name });
      }
      cursor = res.meta?.next;
      if (!cursor) break;
    }
    return banks;
  }

  async resolveAccount(input: { bankCode: string; accountNumber: string }): Promise<ResolvedAccount> {
    try {
      const res = await this.request<{ account_name?: string; account_number?: string }>(
        'GET',
        `/bank/resolve?account_number=${encodeURIComponent(input.accountNumber)}&bank_code=${encodeURIComponent(input.bankCode)}`,
      );
      const name = res.data?.account_name;
      if (!name) throw new AccountNotFoundError();
      return {
        accountName: name,
        accountNumber: res.data.account_number ?? input.accountNumber,
        bankCode: input.bankCode,
      };
    } catch (err) {
      if (err instanceof AccountNotFoundError || err instanceof AccountResolutionUnavailableError) throw err;
      if (err instanceof ProviderNotConfiguredError) throw new AccountResolutionUnavailableError();
      // 400/404/422 = the bank doesn't know the account; anything else (5xx, rate limit, network) = unavailable.
      if (err instanceof PaystackHttpError && [400, 404, 422].includes(err.status)) throw new AccountNotFoundError();
      throw new AccountResolutionUnavailableError();
    }
  }

  async createRecipient(input: RecipientInput): Promise<{ recipientCode: string }> {
    const res = await this.request<{ recipient_code: string }>('POST', '/transferrecipient', {
      type: 'nuban',
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: 'NGN',
    });
    return { recipientCode: res.data.recipient_code };
  }

  async transfer(input: TransferInput): Promise<TransferResult> {
    let res: Envelope<{ transfer_code?: string; status?: string; reference?: string }>;
    try {
      res = await this.request('POST', '/transfer', {
        source: 'balance',
        amount: Number(input.amountKobo),
        recipient: input.recipientCode,
        reference: paystackTransferReference(input.reference),
        reason: input.reason,
      });
    } catch (err) {
      // A 4xx is Paystack refusing the transfer outright (not enough balance, bad recipient, ...).
      // A 5xx or a dropped connection is ambiguous: it may or may not have gone through, so it is
      // left as a plain error for the caller to settle later with verifyTransfer.
      if (err instanceof PaystackHttpError && err.status < 500) throw new TransferError(err.message);
      throw err;
    }
    const providerRef = res.data.transfer_code ?? res.data.reference ?? input.reference;
    switch ((res.data.status ?? '').toLowerCase()) {
      case 'success':
        return { providerRef, status: 'PAID' };
      case 'otp':
        throw new TransferError(
          'Paystack is asking for an OTP to approve transfers. Turn off "Confirm transfers before sending" in the Paystack dashboard (Settings > Preferences).',
        );
      case 'failed':
      case 'reversed':
      case 'rejected':
      case 'blocked':
        return { providerRef, status: 'FAILED' };
      default:
        return { providerRef, status: 'PROCESSING' };
    }
  }

  async verifyTransfer(reference: string): Promise<TransferResult | null> {
    try {
      const res = await this.request<{ transfer_code?: string; status?: string }>(
        'GET',
        `/transfer/verify/${encodeURIComponent(paystackTransferReference(reference))}`,
      );
      const providerRef = res.data.transfer_code ?? reference;
      switch ((res.data.status ?? '').toLowerCase()) {
        case 'success':
          return { providerRef, status: 'PAID' };
        case 'failed':
        case 'reversed':
        case 'rejected':
        case 'blocked':
          return { providerRef, status: 'FAILED' };
        default:
          return { providerRef, status: 'PROCESSING' };
      }
    } catch (err) {
      if (err instanceof PaystackHttpError && err.status === 404) return null;
      throw err;
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookVerification {
    if (!this.config.secretKey) return { valid: false, reason: 'PAYSTACK_SECRET_KEY not set' };
    const provided = headers['x-paystack-signature'];
    if (!provided) return { valid: false, reason: 'missing x-paystack-signature' };
    const a = Buffer.from(provided);
    const b = Buffer.from(paystackSignature(this.config.secretKey, rawBody));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: 'signature mismatch' };
    return parseWebhook(rawBody);
  }
}

/** Shared by the real and mock providers: pull the event name and a stable id out of a webhook body. */
export function parseWebhook(rawBody: string): WebhookVerification {
  try {
    const parsed = JSON.parse(rawBody) as {
      event?: string;
      data?: { id?: number | string; reference?: string; transfer_code?: string };
    };
    const event = parsed.event ?? 'unknown';
    const key = parsed.data?.id ?? parsed.data?.transfer_code ?? parsed.data?.reference;
    return {
      valid: true,
      eventType: event,
      externalId: key == null ? null : `${event}:${key}`,
      payload: parsed,
    };
  } catch {
    return { valid: false, reason: 'invalid json' };
  }
}
