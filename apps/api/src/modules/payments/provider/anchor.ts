import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  BookTransferInput,
  DynamicVirtualAccount,
  NipTransferInput,
  PaymentProvider,
  ProviderCustomer,
  ProviderDepositAccount,
  TransferResult,
  WebhookVerification,
} from './types';
import { ProviderNotConfiguredError } from './types';

/**
 * Real Anchor (https://getanchor.co) client — JSON:API over HTTPS, auth via the
 * `x-anchor-key` header. Every method is wired but guarded: until ANCHOR_KEY is
 * present it throws ProviderNotConfiguredError so a misconfigured deploy fails
 * loudly instead of silently. Endpoint paths follow docs.getanchor.co; confirm
 * request/response bodies against the live sandbox when the account exists.
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
      throw new Error(`Anchor ${method} ${path} failed (${res.status}): ${detail}`);
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
