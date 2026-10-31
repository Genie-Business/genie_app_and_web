import { SignJWT } from 'jose';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { getEnv } from '../src/env';
import { signAccessToken, signMerchantSignupToken, verifyAccessToken, verifyMerchantSignupToken } from '../src/lib/jwt';
import { emailFromSignupToken, peekOtp } from '../src/modules/auth/auth.service';
import { __setPaymentProvider, MockPaymentProvider } from '../src/modules/payments/provider';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, post } from './helpers/factory';

const json = { 'content-type': 'application/json' };

describe('merchant signup token', () => {
  it('round-trips the verified email', async () => {
    const { token, expiresIn } = await signMerchantSignupToken('ada@example.com');
    expect(expiresIn).toBe(30 * 60);
    expect(await verifyMerchantSignupToken(token)).toEqual({ email: 'ada@example.com' });
    expect(await emailFromSignupToken(token)).toBe('ada@example.com');
  });

  it('is not usable as a session, and a session is not usable as a signup token', async () => {
    const { token } = await signMerchantSignupToken('ada@example.com');
    await expect(verifyAccessToken(token)).rejects.toThrow();
    await expect(verifyMerchantSignupToken(await signAccessToken('user_1', 'MERCHANT'))).rejects.toThrow();
  });

  it('rejects an expired or tampered token with a message the app can show', async () => {
    const secret = new TextEncoder().encode(getEnv().JWT_ACCESS_SECRET);
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ typ: 'merchant-signup', email: 'ada@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now - 3600)
      .setIssuer('genie-api')
      .setAudience('genie-merchant-signup')
      .setExpirationTime(now - 1800)
      .sign(secret);
    await expect(emailFromSignupToken(expired)).rejects.toMatchObject({ status: 400 });

    const { token } = await signMerchantSignupToken('ada@example.com');
    const [h, , s] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ typ: 'merchant-signup', email: 'victim@example.com' })).toString('base64url');
    await expect(emailFromSignupToken(`${h}.${forgedPayload}.${s}`)).rejects.toMatchObject({ status: 400 });
    await expect(emailFromSignupToken('not-a-token')).rejects.toMatchObject({ status: 400 });
  });
});

describe('merchant registration gate (no database needed)', () => {
  const app = createApp();
  const registration = (overrides: Record<string, unknown>) => ({
    businessName: 'Ada Stores',
    signupToken: 'x'.repeat(40),
    email: 'ada@example.com',
    username: 'adastores',
    password: 'Abcdef1!',
    businessPhone: '+2348012345678',
    businessState: 'Lagos',
    bankName: 'GTBank',
    bankAccountNumber: '0123456789',
    deviceId: 'device-12345',
    ...overrides,
  });

  it('refuses a forged signup token', async () => {
    const res = await app.request('/v1/auth/register/merchant', post(registration({}), json));
    expect(res.status).toBe(400);
  });

  it('refuses a token that vouches for a different email', async () => {
    const { token } = await signMerchantSignupToken('someone-else@example.com');
    const res = await app.request('/v1/auth/register/merchant', post(registration({ signupToken: token }), json));
    expect(res.status).toBe(400);
    expect((await body(res)).error.message).toContain('does not match');
  });

  it('no longer accepts an invite code in place of the token', async () => {
    const rest: Record<string, unknown> = registration({});
    delete rest.signupToken;
    const res = await app.request('/v1/auth/register/merchant', post({ ...rest, confirmationCode: 'GENIE-ABC123' }, json));
    expect(res.status).toBe(400); // validation: signupToken is required
  });
});

// ── Integration (disposable DB only) ─────────────────────────────────────
const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  merchant-signup.test.ts integration cases skipped — needs a disposable test DB.');

d('emailed merchant code, end to end (DB)', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setPaymentProvider(new MockPaymentProvider({ simulateAccountLookups: true }));
  });
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('emails a code, exchanges it for a token, and registers the merchant already verified', async () => {
    const email = 'ada@example.com';
    expect((await app.request('/v1/auth/register/merchant/code', post({ email }, json))).status).toBe(200);
    const code = peekOtp(email, 'MERCHANT_SIGNUP');
    expect(code).toMatch(/^\d{6}$/);

    // A wrong code is refused; the right one yields the token.
    const wrong = await app.request('/v1/auth/register/merchant/verify', post({ email, code: '000000' }, json));
    expect(wrong.status).toBe(400);
    const ok = await app.request('/v1/auth/register/merchant/verify', post({ email, code }, json));
    expect(ok.status).toBe(200);
    const { signupToken } = (await body(ok)).data;

    const reg = await app.request(
      '/v1/auth/register/merchant',
      post(
        {
          businessName: 'Ada Stores',
          signupToken,
          email,
          username: 'adastores',
          password: 'Abcdef1!',
          businessPhone: '+2348012345678',
          businessState: 'Lagos',
          bankName: 'GTBank',
          bankCode: '058',
          bankAccountNumber: '0123456789',
          deviceId: 'device-12345',
        },
        json,
      ),
    );
    expect(reg.status).toBe(201);
    const user = await prisma.user.findFirstOrThrow({ where: { email } });
    expect(user.role).toBe('MERCHANT');
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it('will not send a code to an address that already has an account', async () => {
    await prisma.user.create({
      data: {
        role: 'MERCHANT',
        firstName: 'Taken',
        lastName: '(Merchant)',
        email: 'taken@example.com',
        username: 'taken',
        referralCode: 'TAKEN1',
        passwordHash: 'x',
      },
    });
    const res = await app.request('/v1/auth/register/merchant/code', post({ email: 'taken@example.com' }, json));
    expect(res.status).toBe(409);
  });

  it('limits how often one address can be asked for a code', async () => {
    const email = 'spam@example.com';
    for (let i = 0; i < 4; i += 1) {
      expect((await app.request('/v1/auth/register/merchant/code', post({ email }, json))).status).toBe(200);
    }
    expect((await app.request('/v1/auth/register/merchant/code', post({ email }, json))).status).toBe(429);
  });
});
