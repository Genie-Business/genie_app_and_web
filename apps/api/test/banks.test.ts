import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auth as authContracts, banks as bankContracts } from '@genie/contracts';
import { createApp } from '../src/app';
import { signMerchantSignupToken } from '../src/lib/jwt';
import { NG_BANKS } from '../src/modules/banks/banks.data';
import { __resetBankCache, listBanks, resolveAccount, settleBankDetails } from '../src/modules/banks/banks.service';
import { __setPaymentProvider, MockPaymentProvider } from '../src/modules/payments/provider';
import {
  AccountNotFoundError,
  AccountResolutionUnavailableError,
  type Bank,
  type PaymentProvider,
} from '../src/modules/payments/provider/types';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, makeMerchant, post } from './helpers/factory';

/** A provider whose bank list and name enquiry the test controls. */
function fakeProvider(opts: {
  banks?: Bank[] | Error;
  resolve?: (i: { bankCode: string; accountNumber: string }) => Promise<{ accountName: string; bankName?: string }>;
}): PaymentProvider {
  const mock = new MockPaymentProvider();
  return Object.assign(Object.create(mock) as PaymentProvider, {
    async listBanks() {
      if (opts.banks instanceof Error) throw opts.banks;
      return opts.banks ?? [];
    },
    async resolveAccount(i: { bankCode: string; accountNumber: string }) {
      if (!opts.resolve) throw new AccountResolutionUnavailableError();
      const r = await opts.resolve(i);
      return { ...r, accountNumber: i.accountNumber, bankCode: i.bankCode };
    },
  });
}

beforeEach(() => {
  __resetBankCache();
  __setPaymentProvider(null);
});

describe('bundled bank list', () => {
  it('has unique, numeric institution codes and names', () => {
    expect(new Set(NG_BANKS.map((b) => b.code)).size).toBe(NG_BANKS.length);
    expect(new Set(NG_BANKS.map((b) => b.name)).size).toBe(NG_BANKS.length);
    for (const b of NG_BANKS) expect(b.code).toMatch(/^\d{3,6}$/);
  });
});

describe('listBanks', () => {
  it("serves the provider's live list, A to Z, without duplicate codes", async () => {
    __setPaymentProvider(
      fakeProvider({
        banks: [
          { code: '057', name: 'Zenith Bank' },
          { code: '044', name: 'Access Bank' },
          { code: '044', name: 'Access Bank (dup)' },
        ],
      }),
    );
    const banks = await listBanks();
    expect(banks.map((b) => b.code)).toEqual(['044', '057']);
  });

  it('falls back to the bundled list when the provider has none or errors', async () => {
    __setPaymentProvider(fakeProvider({ banks: [] }));
    expect((await listBanks()).length).toBe(NG_BANKS.length);

    __resetBankCache();
    __setPaymentProvider(fakeProvider({ banks: new Error('provider down') }));
    expect((await listBanks()).length).toBe(NG_BANKS.length);
  });

  it("does not swap in the bundled list for a real provider (its bank codes differ)", async () => {
    const real = fakeProvider({ banks: new Error('provider down') });
    Object.defineProperty(real, 'name', { value: 'paystack' });
    __setPaymentProvider(real);
    await expect(listBanks()).rejects.toMatchObject({ status: 503, code: 'bank_list_unavailable' });
  });

  it('caches the list between calls', async () => {
    let calls = 0;
    const p = fakeProvider({});
    p.listBanks = async () => {
      calls += 1;
      return [{ code: '044', name: 'Access Bank' }];
    };
    __setPaymentProvider(p);
    await listBanks();
    await listBanks();
    expect(calls).toBe(1);
  });
});

describe('resolveAccount', () => {
  it('returns the name on the account and the canonical bank name', async () => {
    __setPaymentProvider(
      fakeProvider({
        banks: [{ code: '058', name: 'Guaranty Trust Bank' }],
        resolve: async () => ({ accountName: '  ADA OBI STORES  ', bankName: 'GTB' }),
      }),
    );
    expect(await resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).toEqual({
      accountName: 'ADA OBI STORES',
      accountNumber: '0123456789',
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
    });
  });

  it('maps "no such account" to 422 account_not_found', async () => {
    __setPaymentProvider(fakeProvider({ resolve: async () => Promise.reject(new AccountNotFoundError()) }));
    await expect(resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).rejects.toMatchObject({
      status: 422,
      code: 'account_not_found',
    });
  });

  it('maps an unavailable or crashing provider to 503 account_lookup_unavailable', async () => {
    __setPaymentProvider(fakeProvider({}));
    await expect(resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).rejects.toMatchObject({
      status: 503,
      code: 'account_lookup_unavailable',
    });

    __setPaymentProvider(fakeProvider({ resolve: async () => Promise.reject(new Error('socket hang up')) }));
    await expect(resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).rejects.toMatchObject({
      status: 503,
      code: 'account_lookup_unavailable',
    });
  });
});

describe('settleBankDetails', () => {
  const base = { bankName: 'GTBank', accountNumber: '0123456789' };

  it('uses the looked-up name and ignores the one the app sent', async () => {
    __setPaymentProvider(fakeProvider({ resolve: async () => ({ accountName: 'REAL NAME' }) }));
    expect(await settleBankDetails({ ...base, bankCode: '058', claimedName: 'Somebody Else' })).toMatchObject({
      accountName: 'REAL NAME',
      bankCode: '058',
      verified: true,
    });
  });

  it('keeps the typed name, unverified, when the lookup is unavailable', async () => {
    __setPaymentProvider(fakeProvider({}));
    expect(await settleBankDetails({ ...base, bankCode: '058', claimedName: ' Ada Obi ' })).toMatchObject({
      accountName: 'Ada Obi',
      verified: false,
    });
  });

  it('rejects an account the bank does not recognise instead of storing it', async () => {
    __setPaymentProvider(fakeProvider({ resolve: async () => Promise.reject(new AccountNotFoundError()) }));
    await expect(settleBankDetails({ ...base, bankCode: '058', claimedName: 'Ada' })).rejects.toMatchObject({
      code: 'account_not_found',
    });
  });

  it('without a bank code (older app builds) trusts the input but never marks it verified', async () => {
    expect(await settleBankDetails({ ...base, claimedName: 'Ada Obi' })).toEqual({
      bankName: 'GTBank',
      bankCode: null,
      accountName: 'Ada Obi',
      verified: false,
    });
  });
});

describe('MockPaymentProvider name enquiry', () => {
  it('simulates lookups outside production', async () => {
    const mock = new MockPaymentProvider({ simulateAccountLookups: true });
    expect(await mock.resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).toMatchObject({
      accountName: 'TEST ACCOUNT 6789',
      bankName: 'Guaranty Trust Bank (GTBank)',
    });
    await expect(mock.resolveAccount({ bankCode: '058', accountNumber: '0000456789' })).rejects.toBeInstanceOf(
      AccountNotFoundError,
    );
  });

  it('never invents an account name in production', async () => {
    const mock = new MockPaymentProvider({ simulateAccountLookups: false });
    await expect(mock.resolveAccount({ bankCode: '058', accountNumber: '0123456789' })).rejects.toBeInstanceOf(
      AccountResolutionUnavailableError,
    );
  });
});

describe('contracts', () => {
  it('validates the lookup body', () => {
    const ok = bankContracts.resolveAccountBody.safeParse({ bankCode: '058', accountNumber: '0123456789' });
    expect(ok.success).toBe(true);
    expect(bankContracts.resolveAccountBody.safeParse({ bankCode: 'GTB', accountNumber: '0123456789' }).success).toBe(false);
    expect(bankContracts.resolveAccountBody.safeParse({ bankCode: '058', accountNumber: '12345' }).success).toBe(false);
  });

  it('keeps bankCode optional on merchant registration so older apps still work', () => {
    const merchant = {
      businessName: 'Ada Stores',
      signupToken: 'a'.repeat(40),
      deviceId: 'device-12345',
      email: 'ada@example.com',
      username: 'adastores',
      password: 'Abcdef1!',
      businessPhone: '+2348012345678',
      businessState: 'Lagos',
      bankName: 'GTBank',
      bankAccountNumber: '0123456789',
    };
    expect(authContracts.registerMerchantBody.safeParse(merchant).success).toBe(true);
    expect(authContracts.registerMerchantBody.safeParse({ ...merchant, bankCode: '058' }).success).toBe(true);
    expect(authContracts.registerMerchantBody.safeParse({ ...merchant, bankCode: 'not-a-code' }).success).toBe(false);
  });
});

// ── HTTP surface that needs no database ───────────────────────────────────
describe('GET /v1/banks and the lookup gate', () => {
  const app = createApp();

  it('lists banks without authentication, with a cache header', async () => {
    const res = await app.request('/v1/banks');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age');
    const data = (await body(res)).data as Bank[];
    expect(data.length).toBeGreaterThan(20);
    expect(data.find((b) => b.code === '058')).toBeTruthy();
  });

  it('refuses an anonymous lookup with no signup token, then throttles the guessing', async () => {
    const attempt = () =>
      app.request(
        '/v1/banks/resolve',
        post({ bankCode: '058', accountNumber: '0123456789' }, {
          'content-type': 'application/json',
          'x-real-ip': '203.0.113.9',
        }),
      );
    for (let i = 0; i < 5; i += 1) expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(429);
  });
});

// ── Integration (disposable DB only) ─────────────────────────────────────
const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  banks.test.ts integration cases skipped — needs a disposable test DB.');

d('bank lookup, registration and settlement (DB)', () => {
  const app = createApp();
  const ACCOUNT = { bankName: 'GTBank', bankCode: '058', accountNumber: '0123456789' };

  beforeEach(async () => {
    await resetDb();
    __resetBankCache();
    __setPaymentProvider(new MockPaymentProvider({ simulateAccountLookups: true }));
  });
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  const resolve = (payload: unknown, headers: Record<string, string> = {}) =>
    app.request('/v1/banks/resolve', post(payload, { 'content-type': 'application/json', ...headers }));

  it('resolves for a signed-in merchant, not for a celebrant', async () => {
    const merchant = await makeMerchant();
    const ok = await resolve(ACCOUNT, merchant.auth);
    expect(ok.status).toBe(200);
    expect((await body(ok)).data.accountName).toBe('TEST ACCOUNT 6789');

    const celebrant = await makeCelebrant();
    expect((await resolve(ACCOUNT, celebrant.auth)).status).toBe(403);
  });

  it('lets someone mid-sign-up resolve only with a valid signup token', async () => {
    const { token } = await signMerchantSignupToken('ada@example.com');
    expect((await resolve({ ...ACCOUNT, signupToken: token })).status).toBe(200);
    expect((await resolve({ ...ACCOUNT, signupToken: 'x'.repeat(40) })).status).toBe(400);
    expect((await resolve(ACCOUNT)).status).toBe(400);
  });

  it('reports an unknown account as 422 and an unavailable lookup as 503', async () => {
    const merchant = await makeMerchant();
    expect((await resolve({ ...ACCOUNT, accountNumber: '0000456789' }, merchant.auth)).status).toBe(422);

    __setPaymentProvider(new MockPaymentProvider({ simulateAccountLookups: false }));
    expect((await resolve(ACCOUNT, merchant.auth)).status).toBe(503);
  });

  const registration = async (email: string, extra: Record<string, unknown> = {}) => ({
    businessName: 'Ada Stores',
    signupToken: (await signMerchantSignupToken(email)).token,
    email,
    username: email.split('@')[0],
    password: 'Abcdef1!',
    businessPhone: '+2348012345678',
    businessState: 'Lagos',
    bankName: ACCOUNT.bankName,
    bankCode: ACCOUNT.bankCode,
    bankAccountNumber: ACCOUNT.accountNumber,
    deviceId: 'device-12345',
    ...extra,
  });

  it('stores the looked-up name when a merchant registers, and seeds the settlement account', async () => {
    const res = await app.request(
      '/v1/auth/register/merchant',
      post(await registration('ada@example.com', { bankAccountName: 'Name The App Made Up' }), {
        'content-type': 'application/json',
      }),
    );
    expect(res.status).toBe(201);
    expect((await body(res)).data.tokens.accessToken).toBeTruthy(); // signed straight in

    const user = await prisma.user.findFirstOrThrow({ where: { email: 'ada@example.com' } });
    expect(user.emailVerifiedAt).not.toBeNull(); // the emailed code already proved the address
    const profile = await prisma.merchantProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.bankAccountName).toBe('TEST ACCOUNT 6789');
    const payout = await prisma.payoutAccount.findUniqueOrThrow({ where: { merchantId: user.id } });
    expect(payout).toMatchObject({ accountName: 'TEST ACCOUNT 6789', bankCode: '058', isVerified: true });
  });

  it('rejects registration with an account the bank does not recognise, creating nothing', async () => {
    const res = await app.request(
      '/v1/auth/register/merchant',
      post(await registration('bad@example.com', { bankAccountNumber: '0000456789' }), {
        'content-type': 'application/json',
      }),
    );
    expect(res.status).toBe(422);
    expect(await prisma.user.count({ where: { email: 'bad@example.com' } })).toBe(0);
  });

  it('saves the settlement account with the looked-up name and resets verification on change', async () => {
    const merchant = await makeMerchant();
    const put = (payload: unknown) =>
      app.request('/v1/payouts/account', { method: 'PUT', headers: merchant.auth, body: JSON.stringify(payload) });

    const first = await body(await put({ ...ACCOUNT, accountName: 'Whatever' }));
    expect(first.data).toMatchObject({ accountName: 'TEST ACCOUNT 6789', bankCode: '058', isVerified: true });

    // Provider goes away: the typed name is kept but the account is no longer marked verified.
    __setPaymentProvider(new MockPaymentProvider({ simulateAccountLookups: false }));
    const second = await body(await put({ ...ACCOUNT, accountNumber: '0123450000', accountName: 'Ada Obi' }));
    expect(second.data).toMatchObject({ accountName: 'Ada Obi', isVerified: false });

    // And with no name at all there's nothing to store.
    expect((await put({ ...ACCOUNT, accountNumber: '0123450001' })).status).toBe(400);
  });
});
