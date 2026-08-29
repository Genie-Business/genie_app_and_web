import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@genie/core';
import { createApp } from '../src/app';
import { __setPaymentProvider, AnchorPaymentProvider } from '../src/modules/payments/provider';
import { ProviderNotConfiguredError } from '../src/modules/payments/provider/types';
import { getBalanceKobo } from '../src/modules/payments/ledger.service';
import { signAccessToken } from '../src/lib/jwt';
import { hasDb, prisma, resetDb } from './helpers/db';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  payments.test.ts skipped — needs a disposable test DB (DATABASE_URL containing "test", or ALLOW_DB_RESET=1).');

d('add-funds via mock provider', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setPaymentProvider(null); // reset to env-configured (mock)
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates an intent, mock-settles it, and credits the wallet ledger', async () => {
    const user = await prisma.user.create({
      data: {
        role: 'CELEBRANT',
        firstName: 'Pay',
        lastName: 'Er',
        email: 'payer@example.com',
        username: 'payer',
        referralCode: 'PAYER1',
        passwordHash: await hashPassword('Abcdef1!'),
        emailVerifiedAt: new Date(),
      },
    });
    const token = await signAccessToken(user.id, 'CELEBRANT');
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const createRes = await app.request('/v1/payments/add-funds', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ amountKobo: 500_00 }),
    });
    expect(createRes.status).toBe(201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intent = ((await createRes.json()) as any).data;
    expect(intent.virtualAccount.accountNumber).toBeTruthy();

    const settleRes = await app.request('/v1/payments/_mock/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: intent.reference }),
    });
    expect(settleRes.status).toBe(200);

    expect(await getBalanceKobo(user.id)).toBe(500_00n);

    // Second settle is idempotent.
    await app.request('/v1/payments/_mock/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: intent.reference }),
    });
    expect(await getBalanceKobo(user.id)).toBe(500_00n);
  });
});

describe('AnchorPaymentProvider (unit)', () => {
  it('throws ProviderNotConfiguredError when no key is set', async () => {
    const anchor = new AnchorPaymentProvider({
      baseUrl: 'https://api.sandbox.getanchor.co/api/v1',
      apiKey: '',
      webhookSecret: '',
    });
    await expect(
      anchor.ensureCustomer({
        userId: 'u1',
        type: 'individual',
        email: 'a@b.com',
        firstName: 'A',
        lastName: 'B',
      }),
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });

  it('rejects a webhook with a bad signature', () => {
    const anchor = new AnchorPaymentProvider({
      baseUrl: 'x',
      apiKey: 'k',
      webhookSecret: 'secret',
    });
    const result = anchor.verifyWebhook('{}', { 'x-anchor-signature': 'nope' });
    expect(result.valid).toBe(false);
  });
});
