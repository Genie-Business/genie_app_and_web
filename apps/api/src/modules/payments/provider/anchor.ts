import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  Bank,
  BookTransferInput,
  DynamicVirtualAccount,
  NipTransferInput,
  PaymentProvider,
  ProviderCustomer,
  ProviderDepositAccount,
  ResolvedAccount,
  TransferResult,
  WebhookVerification,
} from './types';
import {
  AccountNotFoundError,
  AccountResolutionUnavailableError,
  ProviderNotConfiguredError,
} from './types';

/** A non-2xx answer from Anchor, with the status kept so callers can tell "no such account" from "down". */
class AnchorHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AnchorHttpError';
  }
}

/**
 * Real Anchor (https://getanchor.co) client — JSON:API over HTTPS, auth via the
 * `x-anchor-key` header. Every method is wired but guarded: until ANCHOR_KEY is
 * present it throws ProviderNotConfiguredError so a misconfigured deploy fails
 * loudly instead of silently. Endpoint paths follow docs.getanchor.co; confirm
 * request/response bodies against the live sandbox when the account exists
 * (listBanks / resolveAccount in particular: GET /banks and
 * GET /payments/verify-account/{bankCode}/{accountNumber}).
 */
export class AnchorPaymentProvider implements PaymentProvider {
  readonly name = 'anchor';

  constructor(
    private readonly config: { baseUrl: string; apiKey: string; webhookSecret: string },
  ) {}

  private assertConfigured() {
    if (!this.config.apiKey) throw new ProviderNotConfiguredError();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.assertConfigured();
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'x-anchor-key': this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const detail =
        (json as { errors?: Array<{ detail?: string }> })?.errors?.[0]?.detail ?? res.statusText;
      throw new AnchorHttpError(res.status, `Anchor ${method} ${path} failed (${res.status}): ${detail}`);
    }
    return json as T;
  }

  async ensureCustomer(input: {
    userId: string;
    type: 'individual' | 'business';
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
  }): Promise<ProviderCustomer> {
    const type = input.type === 'business' ? 'BusinessCustomer' : 'IndividualCustomer';
    const res = await this.request<{ data: { id: string } }>('POST', '/customers', {
      data: {
        type,
        attributes: {
          email: input.email,
          ...(input.type === 'individual'
            ? {
                fullName: { firstName: input.firstName, lastName: input.lastName },
                phoneNumber: input.phone ?? undefined,
              }
            : { basicDetail: { businessName: input.firstName } }),
        },
      },
    });
    return { providerCustomerId: res.data.id };
  }

  async ensureDepositAccount(input: {
    providerCustomerId: string;
  }): Promise<ProviderDepositAccount> {
    const res = await this.request<{
      data: { id: string; attributes?: { virtualNubans?: Array<{ accountNumber: string }> } };
    }>('POST', '/accounts', {
      data: {
        type: 'DepositAccount',
        attributes: { productName: 'CURRENT' },
        relationships: {
          customer: { data: { id: input.providerCustomerId, type: 'IndividualCustomer' } },
        },
      },
    });
    return {
      providerAccountId: res.data.id,
      virtualNuban: res.data.attributes?.virtualNubans?.[0]?.accountNumber ?? null,
    };
  }

  async createDynamicVirtualAccount(input: {
    amountKobo: bigint;
    reference: string;
    customerName: string;
    providerCustomerId?: string;
    ttlSeconds?: number;
  }): Promise<DynamicVirtualAccount> {
    const res = await this.request<{
      data: {
        attributes: {
          accountNumber: string;
          bankName?: string;
          bankId?: string;
          accountName?: string;
          expiresAt?: string;
        };
      };
    }>('POST', '/payments/virtual-nubans', {
      data: {
        type: 'DynamicVirtualNuban',
        attributes: {
          amount: Number(input.amountKobo),
          reference: input.reference,
          description: `genie funding ${input.reference}`,
          expiresIn: input.ttlSeconds ?? 1800,
        },
      },
    });
    const a = res.data.attributes;
    return {
      reference: input.reference,
      accountNumber: a.accountNumber,
      bankName: a.bankName ?? 'Anchor',
      accountName: a.accountName ?? `GENIE/${input.customerName}`,
      expiresAt: a.expiresAt ?? null,
    };
  }

  async bookTransfer(input: BookTransferInput): Promise<TransferResult> {
    const res = await this.request<{ data: { id: string; attributes?: { status?: string } } }>(
      'POST',
      '/transfers',
      {
        data: {
          type: 'BookTransfer',
          attributes: {
            amount: Number(input.amountKobo),
            currency: 'NGN',
            reason: input.narration,
            reference: input.reference,
          },
          relationships: {
            destinationAccount: { data: { id: input.toProviderAccountId, type: 'DepositAccount' } },
            account: { data: { id: input.fromProviderAccountId, type: 'DepositAccount' } },
          },
        },
      },
    );
    return { providerRef: res.data.id, status: mapStatus(res.data.attributes?.status) };
  }

  async nipTransfer(input: NipTransferInput): Promise<TransferResult> {
    const res = await this.request<{ data: { id: string; attributes?: { status?: string } } }>(
      'POST',
      '/transfers',
      {
        data: {
          type: 'NIPTransfer',
          attributes: {
            amount: Number(input.amountKobo),
            currency: 'NGN',
            reason: input.narration,
            reference: input.reference,
            counterParty: {
              accountName: input.accountName,
              accountNumber: input.accountNumber,
              bankCode: input.bankCode,
            },
          },
        },
      },
    );
    return { providerRef: res.data.id, status: mapStatus(res.data.attributes?.status) };
  }

  async getBalance(providerAccountId: string): Promise<bigint> {
    const res = await this.request<{ data: { attributes: { availableBalance: number } } }>(
      'GET',
      `/accounts/balance/${providerAccountId}`,
    );
    return BigInt(Math.round(res.data.attributes.availableBalance));
  }

  async listBanks(): Promise<Bank[]> {
    const res = await this.request<{
      data: Array<{ id?: string; attributes?: { name?: string; nipCode?: string; cbnCode?: string } }>;
    }>('GET', '/banks');
    return (res.data ?? []).flatMap((b) => {
      const code = b.attributes?.nipCode ?? b.attributes?.cbnCode;
      const name = b.attributes?.name;
      return code && name ? [{ code, name }] : [];
    });
  }

  async resolveAccount(input: { bankCode: string; accountNumber: string }): Promise<ResolvedAccount> {
    try {
      const res = await this.request<{
        data: { attributes?: { accountName?: string; accountNumber?: string; bank?: { name?: string } } };
      }>('GET', `/payments/verify-account/${encodeURIComponent(input.bankCode)}/${encodeURIComponent(input.accountNumber)}`);
      const a = res.data?.attributes;
      if (!a?.accountName) throw new AccountNotFoundError();
      return {
        accountName: a.accountName,
        accountNumber: a.accountNumber ?? input.accountNumber,
        bankCode: input.bankCode,
        bankName: a.bank?.name,
      };
    } catch (err) {
      if (err instanceof AccountNotFoundError || err instanceof AccountResolutionUnavailableError) throw err;
      if (err instanceof ProviderNotConfiguredError) throw new AccountResolutionUnavailableError();
      // 400/404/422 = the bank doesn't know the account; anything else (5xx, rate limit, network) = unavailable.
      if (err instanceof AnchorHttpError && [400, 404, 422].includes(err.status)) throw new AccountNotFoundError();
      throw new AccountResolutionUnavailableError();
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookVerification {
    if (!this.config.webhookSecret) return { valid: false, reason: 'ANCHOR_WEBHOOK_SECRET not set' };
    const provided = headers['x-anchor-signature'];
    if (!provided) return { valid: false, reason: 'missing x-anchor-signature' };
    const expected = createHmac('sha256', this.config.webhookSecret).update(rawBody).digest('hex');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: 'signature mismatch' };
    }
    try {
      const parsed = JSON.parse(rawBody) as { data?: { type?: string; id?: string } };
      return {
        valid: true,
        eventType: parsed.data?.type ?? 'unknown',
        externalId: parsed.data?.id ?? null,
        payload: parsed,
      };
    } catch {
      return { valid: false, reason: 'invalid json' };
    }
  }
}

function mapStatus(status?: string): TransferResult['status'] {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED':
    case 'SUCCESS':
      return 'PAID';
    case 'FAILED':
    case 'REVERSED':
      return 'FAILED';
    case 'PROCESSING':
      return 'PROCESSING';
    default:
      return 'PENDING';
  }
}
