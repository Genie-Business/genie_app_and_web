import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { __setPaymentProvider, MockPaymentProvider } from '../src/modules/payments/provider';
import { PaystackPaymentProvider, paystackSignature, paystackTransferReference } from '../src/modules/payments/provider/paystack';
import {
  AccountNotFoundError,
  AccountResolutionUnavailableError,
  ProviderNotConfiguredError,
  TransferError,
} from '../src/modules/payments/provider/types';
import { body, post } from './helpers/factory';

const KEY = 'sk_test_example_key';

/** Queue canned responses for `fetch`; returns the recorded calls. */
function stubFetch(...responses: Array<{ status?: number; json?: unknown } | Error>) {
  const queue = [...responses];
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = queue.shift();
      if (!next) throw new Error('unexpected fetch');
      if (next instanceof Error) throw next;
      const status = next.status ?? 200;
      return new Response(next.json === undefined ? '' : JSON.stringify(next.json), { status });
    }),
  );
  return calls;
}

const paystack = (secretKey = KEY) => new PaystackPaymentProvider({ baseUrl: 'https://api.paystack.test', secretKey });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PaystackPaymentProvider: taking payments', () => {
  it('starts a hosted checkout in kobo, with the buyer, reference and return link', async () => {
    const calls = stubFetch({
      json: { status: true, data: { authorization_url: 'https://checkout.paystack.com/abc', access_code: 'abc' } },
    });
    const res = await paystack().initializeCharge({
      email: 'ada@example.com',
      amountKobo: 1_165_000n,
      reference: 'PAY-261031-ABC123',
      callbackUrl: 'https://www.getgenie.gift/pay/done?reference=PAY-261031-ABC123',
      metadata: { intent: 'PAY-261031-ABC123' },
    });

    expect(res).toEqual({ checkoutUrl: 'https://checkout.paystack.com/abc', accessCode: 'abc' });
    expect(calls[0]!.url).toBe('https://api.paystack.test/transaction/initialize');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      email: 'ada@example.com',
      amount: 1_165_000,
      currency: 'NGN',
      reference: 'PAY-261031-ABC123',
      callback_url: 'https://www.getgenie.gift/pay/done?reference=PAY-261031-ABC123',
      metadata: { intent: 'PAY-261031-ABC123' },
    });
  });

  it('reads a verified payment: success carries the amount, abandoned stays open', async () => {
    stubFetch(
      { json: { status: true, data: { status: 'success', amount: 1_165_000, currency: 'NGN', paid_at: '2026-10-31T10:00:00Z' } } },
      { json: { status: true, data: { status: 'abandoned', amount: 1_165_000, currency: 'NGN' } } },
      { json: { status: true, data: { status: 'failed', amount: 1_165_000, currency: 'NGN' } } },
      { status: 404, json: { status: false, message: 'Transaction reference not found' } },
    );
    const p = paystack();
    expect(await p.verifyCharge('R1')).toMatchObject({ status: 'SUCCESS', amountKobo: 1_165_000n, currency: 'NGN' });
    expect(await p.verifyCharge('R2')).toMatchObject({ status: 'PENDING' });
    expect(await p.verifyCharge('R3')).toMatchObject({ status: 'FAILED' });
    expect(await p.verifyCharge('R4')).toMatchObject({ status: 'PENDING', amountKobo: 0n });
  });

  it('refuses to do anything without a secret key', async () => {
    stubFetch();
    await expect(paystack('').initializeCharge({ email: 'a@b.co', amountKobo: 100n, reference: 'R' })).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
    expect(paystack('').verifyWebhook('{}', { 'x-paystack-signature': 'x' })).toMatchObject({ valid: false });
  });
});

describe('PaystackPaymentProvider: banks and account names', () => {
  it('lists active Nigerian bank accounts across pages', async () => {
    const calls = stubFetch(
      {
        json: {
          status: true,
          data: [
            { name: 'Access Bank', code: '044', active: true, currency: 'NGN', type: 'nuban' },
            { name: 'Closed Bank', code: '999', active: false, currency: 'NGN', type: 'nuban' },
            { name: 'Ghana Bank', code: '300', active: true, currency: 'GHS', type: 'ghipss' },
          ],
          meta: { next: 'cursor-2' },
        },
      },
      { json: { status: true, data: [{ name: 'Kuda', code: '50211', active: true, currency: 'NGN', type: 'nuban' }], meta: { next: null } } },
    );
    expect(await paystack().listBanks()).toEqual([
      { code: '044', name: 'Access Bank' },
      { code: '50211', name: 'Kuda' },
    ]);
    expect(calls[0]!.url).toContain('/bank?country=nigeria');
    expect(calls[1]!.url).toContain('next=cursor-2');
  });

  it('resolves the name on an account', async () => {
    const calls = stubFetch({ json: { status: true, data: { account_name: 'ADA OBI STORES', account_number: '0123456789' } } });
    expect(await paystack().resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).toMatchObject({
      accountName: 'ADA OBI STORES',
      bankCode: '058',
    });
    expect(calls[0]!.url).toBe('https://api.paystack.test/bank/resolve?account_number=0123456789&bank_code=058');
  });

  it('tells "no such account" apart from "cannot check right now"', async () => {
    stubFetch(
      { status: 422, json: { status: false, message: 'Could not resolve account name' } },
      { status: 500, json: { status: false, message: 'oops' } },
      new Error('network down'),
    );
    const p = paystack();
    await expect(p.resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).rejects.toBeInstanceOf(AccountNotFoundError);
    await expect(p.resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).rejects.toBeInstanceOf(AccountResolutionUnavailableError);
    await expect(p.resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).rejects.toBeInstanceOf(AccountResolutionUnavailableError);
    await expect(paystack('').resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).rejects.toBeInstanceOf(
      AccountResolutionUnavailableError,
    );
  });
});

describe('PaystackPaymentProvider: paying merchants out', () => {
  it('registers a bank account as a recipient', async () => {
    const calls = stubFetch({ json: { status: true, data: { recipient_code: 'RCP_abc' } } });
    expect(await paystack().createRecipient({ name: 'ADA OBI STORES', accountNumber: '0123456789', bankCode: '058' })).toEqual({
      recipientCode: 'RCP_abc',
    });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      type: 'nuban',
      name: 'ADA OBI STORES',
      account_number: '0123456789',
      bank_code: '058',
      currency: 'NGN',
    });
  });

  it('maps transfer outcomes, and refuses one that needs an OTP', async () => {
    const calls = stubFetch(
      { json: { status: true, data: { transfer_code: 'TRF_1', status: 'success' } } },
      { json: { status: true, data: { transfer_code: 'TRF_2', status: 'pending' } } },
      { json: { status: true, data: { transfer_code: 'TRF_3', status: 'otp' } } },
      { status: 400, json: { status: false, message: 'Your balance is not enough to fulfil this request' } },
    );
    const p = paystack();
    const input = { amountKobo: 950_000n, recipientCode: 'RCP_abc', reference: 'PO-261031-ABC123', reason: 'genie payout' };
    expect(await p.transfer(input)).toEqual({ providerRef: 'TRF_1', status: 'PAID' });
    expect(await p.transfer(input)).toEqual({ providerRef: 'TRF_2', status: 'PROCESSING' });
    await expect(p.transfer(input)).rejects.toThrow(/OTP/);
    await expect(p.transfer(input)).rejects.toBeInstanceOf(TransferError);

    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent).toMatchObject({ source: 'balance', amount: 950_000, recipient: 'RCP_abc' });
    expect(sent.reference).toBe('po-261031-abc123'); // lowercase, padded to Paystack's 16-character minimum
  });

  it('treats a server error on a transfer as unknown (it may have gone through), not as a refusal', async () => {
    stubFetch({ status: 502, json: { status: false, message: 'Bad gateway' } }, new Error('socket hang up'));
    const p = paystack();
    const input = { amountKobo: 950_000n, recipientCode: 'RCP_abc', reference: 'PO-261031-ABC123', reason: 'genie payout' };
    const first = await p.transfer(input).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(Error);
    expect(first).not.toBeInstanceOf(TransferError);
    const second = await p.transfer(input).catch((e: unknown) => e);
    expect(second).not.toBeInstanceOf(TransferError);
  });

  it('looks up what became of a transfer, and says so when Paystack has no record', async () => {
    const calls = stubFetch(
      { json: { status: true, data: { transfer_code: 'TRF_1', status: 'success' } } },
      { json: { status: true, data: { transfer_code: 'TRF_2', status: 'reversed' } } },
      { json: { status: true, data: { transfer_code: 'TRF_3', status: 'pending' } } },
      { status: 404, json: { status: false, message: 'Transfer not found' } },
    );
    const p = paystack();
    expect(await p.verifyTransfer('PO-261031-ABC123')).toEqual({ providerRef: 'TRF_1', status: 'PAID' });
    expect(await p.verifyTransfer('PO-2')).toEqual({ providerRef: 'TRF_2', status: 'FAILED' });
    expect(await p.verifyTransfer('PO-3')).toEqual({ providerRef: 'TRF_3', status: 'PROCESSING' });
    expect(await p.verifyTransfer('PO-4')).toBeNull();
    expect(calls[0]!.url).toBe('https://api.paystack.test/transfer/verify/po-261031-abc123');
  });

  it('shapes transfer references the way Paystack requires', () => {
    expect(paystackTransferReference('PO-261031-ABC123')).toBe('po-261031-abc123');
    expect(paystackTransferReference('PO-1')).toHaveLength(16);
    expect(paystackTransferReference('A B/C'.padEnd(80, 'x'))).toMatch(/^[a-z0-9_-]{16,50}$/);
    expect(paystackTransferReference('x'.repeat(80))).toHaveLength(50);
  });
});

describe('Paystack webhook signatures', () => {
  const rawBody = '{"event":"charge.success","data":{"reference":"PAY-1"}}';
  // HMAC-SHA512 of rawBody keyed with KEY, computed independently of the code under test.
  const knownSignature =
    'aa59f7602fad90f1d5b7d8ed1f4be19670b2dd0a4c1a2cc2745dcb30f3768969bc1bd01d8fd64a34296e6ff460166fa6ba4190b8882deb84800072d6dd38d8a2';

  it('matches a known SHA-512 signature', () => {
    expect(paystackSignature(KEY, rawBody)).toBe(knownSignature);
  });

  it('accepts a genuine event and surfaces its type and a stable id', () => {
    const r = paystack().verifyWebhook(rawBody, { 'x-paystack-signature': knownSignature });
    expect(r).toMatchObject({ valid: true, eventType: 'charge.success', externalId: 'charge.success:PAY-1' });
  });

  it('rejects a tampered body, a wrong key, and a missing signature', () => {
    const p = paystack();
    expect(p.verifyWebhook(rawBody.replace('PAY-1', 'PAY-2'), { 'x-paystack-signature': knownSignature })).toMatchObject({
      valid: false,
      reason: 'signature mismatch',
    });
    expect(paystack('sk_test_other').verifyWebhook(rawBody, { 'x-paystack-signature': knownSignature })).toMatchObject({ valid: false });
    expect(p.verifyWebhook(rawBody, {})).toMatchObject({ valid: false, reason: 'missing x-paystack-signature' });
    // A SHA-256 style signature (the common default elsewhere) is not accepted.
    expect(p.verifyWebhook(rawBody, { 'x-paystack-signature': knownSignature.slice(0, 64) })).toMatchObject({ valid: false });
  });
});

describe('POST /v1/payments/webhooks/paystack', () => {
  const app = createApp();

  beforeEach(() => {
    __setPaymentProvider(new MockPaymentProvider());
  });

  it('rejects an unsigned or forged event without touching the database', async () => {
    const unsigned = await app.request('/v1/payments/webhooks/paystack', post({ event: 'charge.success', data: { reference: 'PAY-1' } }, {}));
    expect(unsigned.status).toBe(202);
    expect((await body(unsigned)).accepted).toBe(false);

    const forged = await app.request(
      '/v1/payments/webhooks/paystack',
      post({ event: 'charge.success', data: { reference: 'PAY-1' } }, { 'x-paystack-signature': 'f'.repeat(128) }),
    );
    expect(forged.status).toBe(202);
    expect((await body(forged)).accepted).toBe(false);
  });
});

describe('the scheduled payout endpoint', () => {
  const app = createApp();

  it('stays shut when no CRON_SECRET is configured', async () => {
    const res = await app.request('/v1/internal/payouts/run', { headers: { authorization: 'Bearer anything' } });
    expect(res.status).toBe(503);
  });
});

describe('MockPaymentProvider payments', () => {
  it('only reports a charge as paid once the buyer has finished it', async () => {
    const mock = new MockPaymentProvider();
    const started = await mock.initializeCharge({ email: 'a@b.co', amountKobo: 500_000n, reference: 'PAY-X' });
    expect(started.checkoutUrl).toContain('PAY-X');
    expect(await mock.verifyCharge('PAY-X')).toMatchObject({ status: 'PENDING', amountKobo: 500_000n });
    mock.markPaid('PAY-X');
    expect(await mock.verifyCharge('PAY-X')).toMatchObject({ status: 'SUCCESS', amountKobo: 500_000n });
  });

  it('can be told to fail a transfer, like a real balance shortfall', async () => {
    const mock = new MockPaymentProvider();
    mock.failNextTransfers = 1;
    const input = { amountKobo: 100n, recipientCode: 'RCP', reference: 'PO-1', reason: 'x' };
    await expect(mock.transfer(input)).rejects.toBeInstanceOf(TransferError);
    expect((await mock.transfer(input)).status).toBe('PAID');
  });
});
