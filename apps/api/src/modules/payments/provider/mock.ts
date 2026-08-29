import { createHmac, randomInt } from 'node:crypto';
import { makeReference } from '@genie/core';
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

/**
 * Deterministic in-memory provider for local dev, tests and preview deploys
 * without an Anchor account. Pair it with `POST /v1/payments/_mock/settle` to
 * simulate an inbound bank transfer landing on a dynamic virtual account.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  private customers = new Map<string, string>();
  private accounts = new Map<string, { id: string; balanceKobo: bigint }>();
  /** reference -> pending virtual account (so the mock-settle route can find it) */
  readonly pendingVirtualAccounts = new Map<string, DynamicVirtualAccount & { amountKobo: bigint }>();

  private readonly secret = process.env.ANCHOR_WEBHOOK_SECRET || 'mock-webhook-secret';

  async ensureCustomer(input: { userId: string }): Promise<ProviderCustomer> {
    const existing = this.customers.get(input.userId);
    const id = existing ?? `mock_cus_${input.userId.slice(-10)}`;
    this.customers.set(input.userId, id);
    return { providerCustomerId: id };
  }

  async ensureDepositAccount(input: { userId: string }): Promise<ProviderDepositAccount> {
    const key = input.userId;
    const existing = this.accounts.get(key);
    const acct = existing ?? { id: `mock_acc_${key.slice(-10)}`, balanceKobo: 0n };
    this.accounts.set(key, acct);
    return { providerAccountId: acct.id, virtualNuban: `9${String(randomInt(1e8, 1e9))}` };
  }

  async createDynamicVirtualAccount(input: {
    amountKobo: bigint;
    reference: string;
    customerName: string;
    ttlSeconds?: number;
  }): Promise<DynamicVirtualAccount> {
    const dva: DynamicVirtualAccount = {
      reference: input.reference,
      accountNumber: String(randomInt(1e9, 1e10)),
      bankName: 'genie Mock Bank',
      accountName: `GENIE/${input.customerName}`.slice(0, 40),
      expiresAt: new Date(Date.now() + (input.ttlSeconds ?? 1800) * 1000).toISOString(),
    };
    this.pendingVirtualAccounts.set(input.reference, { ...dva, amountKobo: input.amountKobo });
    return dva;
  }

  async bookTransfer(_input: BookTransferInput): Promise<TransferResult> {
    return { providerRef: makeReference('MOCKBK'), status: 'PAID' };
  }

  async nipTransfer(_input: NipTransferInput): Promise<TransferResult> {
    return { providerRef: makeReference('MOCKNIP'), status: 'PAID' };
  }

  async getBalance(providerAccountId: string): Promise<bigint> {
    for (const acct of this.accounts.values()) if (acct.id === providerAccountId) return acct.balanceKobo;
    return 0n;
  }

  /** Build the signed webhook body the real Anchor provider would receive. */
  buildSettlementEvent(reference: string): { body: string; signature: string } {
    const pending = this.pendingVirtualAccounts.get(reference);
    const body = JSON.stringify({
      data: {
        id: makeReference('EVT'),
        type: 'payin.received',
        attributes: {
          reference,
          amount: Number(pending?.amountKobo ?? 0n),
          currency: 'NGN',
          status: 'COMPLETED',
        },
      },
    });
    const signature = createHmac('sha256', this.secret).update(body).digest('hex');
    return { body, signature };
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookVerification {
    const provided = headers['x-anchor-signature'] ?? headers['x-genie-mock-signature'];
    const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex');
    if (!provided || provided !== expected) return { valid: false, reason: 'signature mismatch' };
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
