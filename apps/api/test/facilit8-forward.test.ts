import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as GenieDb from '@genie/db';

// These tests must never touch a real database (the DB suites only run against a disposable one),
// so the one table the webhook handler writes to is replaced with a recorder.
const webhookEvent = vi.hoisted(() => ({
  findUnique: vi.fn(async () => null),
  create: vi.fn(async () => ({ id: 'evt_1' })),
  update: vi.fn(async () => ({})),
}));
vi.mock('@genie/db', async (importOriginal) => ({
  ...(await importOriginal<typeof GenieDb>()),
  prisma: { webhookEvent },
}));

import { createApp } from '../src/app';
import { getEnv } from '../src/env';
import { __setPaymentProvider, MockPaymentProvider } from '../src/modules/payments/provider';
import { paystackSignature } from '../src/modules/payments/provider/paystack';
import { facilit8WebhookUrl, isFacilit8Event } from '../src/modules/payments/facilit8-forward';

const FACILIT8_URL = 'https://usefacilit8.training/api/webhooks/paystack';

describe('which events belong to Facilit8', () => {
  it('claims virtual-account setup and identity events, under either spelling Paystack uses', () => {
    for (const event of [
      'dedicatedaccount.assign.success',
      'dedicatedaccount.assign.failed',
      'assigndedicatedaccount.success',
      'customeridentification.success',
      'customeridentification.failed',
    ]) {
      expect(isFacilit8Event(event, { event, data: {} }), event).toBe(true);
    }
  });

  it('claims a transfer into a virtual account, wherever Paystack puts the channel', () => {
    expect(isFacilit8Event('charge.success', { data: { channel: 'dedicated_nuban' } })).toBe(true);
    expect(isFacilit8Event('charge.success', { data: { authorization: { channel: 'dedicated_nuban' } } })).toBe(true);
  });

  it("leaves genie's own payments alone", () => {
    expect(isFacilit8Event('charge.success', { data: { channel: 'card', reference: 'PAY-1' } })).toBe(false);
    expect(isFacilit8Event('charge.success', { data: { authorization: { channel: 'bank_transfer' } } })).toBe(false);
    expect(isFacilit8Event('charge.success', { data: { reference: 'PAY-1' } })).toBe(false);
  });

  it('tells transfer outcomes apart by the reference, so genie payouts are never forwarded', () => {
    for (const event of ['transfer.success', 'transfer.failed', 'transfer.reversed']) {
      expect(isFacilit8Event(event, { data: { reference: 'wd-clx123-abc' } }), event).toBe(true);
      expect(isFacilit8Event(event, { data: { reference: 'WD-CLX123-ABC' } }), `${event} upper-case`).toBe(true);
      expect(isFacilit8Event(event, { data: { reference: 'po-261101-abc123' } }), `${event} genie`).toBe(false);
    }
    expect(isFacilit8Event('transfer.success', { data: {} })).toBe(false);
    expect(isFacilit8Event('transfer.success', { data: { reference: 42 } })).toBe(false);
  });

  it('claims nothing else, and copes with odd payloads', () => {
    expect(isFacilit8Event('refund.processed', { data: { reference: 'wd-1' } })).toBe(false);
    expect(isFacilit8Event('charge.success', null)).toBe(false);
    expect(isFacilit8Event('transfer.success', undefined)).toBe(false);
    expect(isFacilit8Event('charge.success', { data: null })).toBe(false);
  });
});

describe('FACILIT8_WEBHOOK_URL', () => {
  it('is off when blank, unset or not a web address, so a typo cannot take the API down', () => {
    expect(facilit8WebhookUrl(undefined)).toBeNull();
    expect(facilit8WebhookUrl('')).toBeNull();
    expect(facilit8WebhookUrl('   ')).toBeNull();
    expect(facilit8WebhookUrl('usefacilit8.training/api/webhooks/paystack')).toBeNull();
    expect(facilit8WebhookUrl('ftp://usefacilit8.training/x')).toBeNull();
    expect(facilit8WebhookUrl('javascript:alert(1)')).toBeNull();
  });

  it('accepts an http(s) address', () => {
    expect(facilit8WebhookUrl(` ${FACILIT8_URL} `)).toBe(FACILIT8_URL);
    expect(facilit8WebhookUrl('http://localhost:3000/api/webhooks/paystack')).toBe('http://localhost:3000/api/webhooks/paystack');
  });
});

describe('POST /v1/payments/webhooks/paystack with Facilit8 forwarding on', () => {
  const app = createApp();
  const secret = process.env.PAYSTACK_SECRET_KEY || 'mock-paystack-secret'; // what MockPaymentProvider signs with
  let original: string | undefined;

  const signed = (event: string, data: Record<string, unknown>) => {
    const body = JSON.stringify({ event, data });
    return { body, signature: paystackSignature(secret, body) };
  };
  const send = ({ body, signature }: { body: string; signature: string }) =>
    app.request('/v1/payments/webhooks/paystack', { method: 'POST', headers: { 'x-paystack-signature': signature }, body });

  beforeEach(() => {
    vi.clearAllMocks();
    __setPaymentProvider(new MockPaymentProvider());
    original = getEnv().FACILIT8_WEBHOOK_URL;
    getEnv().FACILIT8_WEBHOOK_URL = FACILIT8_URL;
  });

  afterEach(() => {
    getEnv().FACILIT8_WEBHOOK_URL = original;
    vi.unstubAllGlobals();
  });

  it("hands a Facilit8 event on exactly as received, signature included, and doesn't process it", async () => {
    const fetchMock = vi.fn(async () => new Response('{"received":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const event = signed('dedicatedaccount.assign.success', { customer: { customer_code: 'CUS_x' }, dedicated_account: { account_number: '0123456789' } });
    const res = await send(event);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, accepted: true, forwarded: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(FACILIT8_URL);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(event.body); // byte for byte, or the signature would no longer match
    expect((init.headers as Record<string, string>)['x-paystack-signature']).toBe(event.signature);
    expect(webhookEvent.create).not.toHaveBeenCalled(); // genie keeps no record of Facilit8's events
  });

  it('forwards a Facilit8 withdrawal outcome and a virtual-account deposit', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect((await send(signed('transfer.success', { id: 1, reference: 'wd-clx123-abc' }))).status).toBe(200);
    expect((await send(signed('charge.success', { id: 2, channel: 'dedicated_nuban', amount: 100000 }))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('answers with an error when Facilit8 does not accept it, so Paystack sends it again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    expect((await send(signed('customeridentification.failed', { customer: { email: 'a@b.co' } }))).status).toBe(500);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect((await send(signed('customeridentification.failed', { customer: { email: 'a@b.co' } }))).status).toBe(500);
  });

  it('never forwards a forged or unsigned event', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const body = JSON.stringify({ event: 'dedicatedaccount.assign.success', data: {} });
    const forged = await send({ body, signature: 'f'.repeat(128) });
    const unsigned = await app.request('/v1/payments/webhooks/paystack', { method: 'POST', body });

    expect(forged.status).toBe(202);
    expect(unsigned.status).toBe(202);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not forward anything when no address is set', async () => {
    getEnv().FACILIT8_WEBHOOK_URL = undefined;
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // Genie's own handling takes over: it records the event and ignores a type it doesn't consume.
    const res = await send(signed('dedicatedaccount.assign.success', { id: 99 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: true, duplicate: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(webhookEvent.create).toHaveBeenCalledTimes(1);
  });

  it("keeps handling events that aren't Facilit8's itself, even with forwarding on", async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // An event type genie doesn't consume is still recorded by genie and not sent anywhere. (Card
    // charges and "po-" payouts, which need the real database to settle, are covered by the
    // classification tests above and by the existing payment and payout suites.)
    const res = await send(signed('refund.processed', { id: 7, reference: 'PAY-1' }));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(webhookEvent.create).toHaveBeenCalledTimes(1);
  });
});
