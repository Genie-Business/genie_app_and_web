import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __lastOtp } from '../src/modules/auth/auth.service';
import { hasDb, prisma, resetDb } from './helpers/db';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) {
  console.warn('⚠  auth.test.ts skipped — needs a disposable test DB (a Neon branch whose name contains "test", or ALLOW_DB_RESET=1).');
}

d('auth flow (integration)', () => {
  const app = createApp();
  const json = (body: unknown) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const read = (res: Response): Promise<any> => res.json();

  const celebrant = {
    firstName: 'Ada',
    lastName: 'Obi',
    email: 'ada@example.com',
    username: 'ada_obi',
    password: 'Abcdef1!',
    phone: '+2348012345678',
    stateOfResidence: 'Lagos',
    deviceId: 'test-device-0001',
  };

  beforeAll(async () => {
    await resetDb();
  });
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function latestOtp(email: string, purpose = 'EMAIL_VERIFY') {
    // Presence check only. The plaintext code is read from the test-only
    // `__lastOtp` map that auth.service populates when NODE_ENV=test.
    const token = await prisma.otpToken.findFirst({
      where: { email, purpose: purpose as 'EMAIL_VERIFY' },
      orderBy: { createdAt: 'desc' },
    });
    return token;
  }

  it('registers a celebrant and creates an unverified user + OTP', async () => {
    const res = await app.request('/v1/auth/register', json(celebrant));
    expect(res.status).toBe(201);
    const user = await prisma.user.findFirst({ where: { email: celebrant.email } });
    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.referralCode).toMatch(/^GEN/);
    expect(await latestOtp(celebrant.email)).toBeTruthy();
  });

  it('rejects a duplicate email with 409', async () => {
    await app.request('/v1/auth/register', json(celebrant));
    const res = await app.request('/v1/auth/register', json(celebrant));
    expect(res.status).toBe(409);
    expect((await read(res)).error.code).toBe('email_taken');
  });

  it('rejects a weak password with 400', async () => {
    const res = await app.request('/v1/auth/register', json({ ...celebrant, password: 'weak' }));
    expect(res.status).toBe(400);
  });

  it('rejects an unknown referral code', async () => {
    const res = await app.request(
      '/v1/auth/register',
      json({ ...celebrant, referralCode: 'NOPE1234' }),
    );
    expect(res.status).toBe(400);
  });

  it('verifies email → issues tokens → /v1/me works → login → refresh', async () => {
    await app.request('/v1/auth/register', json(celebrant));

    const code = __lastOtp.get(`EMAIL_VERIFY:${celebrant.email}`)!;
    expect(code).toMatch(/^\d{6}$/);

    const verifyRes = await app.request(
      '/v1/auth/verify-email',
      json({ email: celebrant.email, code, deviceId: celebrant.deviceId }),
    );
    expect(verifyRes.status).toBe(200);
    const { data } = await read(verifyRes);
    expect(data.tokens.accessToken).toBeTruthy();

    const meRes = await app.request('/v1/me', {
      headers: { authorization: `Bearer ${data.tokens.accessToken}` },
    });
    expect(meRes.status).toBe(200);
    expect((await read(meRes)).data.emailVerified).toBe(true);

    const loginRes = await app.request(
      '/v1/auth/login',
      json({ identifier: 'ada_obi', password: celebrant.password, deviceId: celebrant.deviceId }),
    );
    expect(loginRes.status).toBe(200);
    const loginData = (await read(loginRes)).data;

    const refreshRes = await app.request(
      '/v1/auth/refresh',
      json({ refreshToken: loginData.tokens.refreshToken, deviceId: celebrant.deviceId }),
    );
    expect(refreshRes.status).toBe(200);
    // old refresh token is now revoked
    const reuse = await app.request(
      '/v1/auth/refresh',
      json({ refreshToken: loginData.tokens.refreshToken, deviceId: celebrant.deviceId }),
    );
    expect(reuse.status).toBe(401);
  });

  it('login with a wrong password returns a uniform 401', async () => {
    await app.request('/v1/auth/register', json(celebrant));
    const res = await app.request(
      '/v1/auth/login',
      json({ identifier: celebrant.email, password: 'Wrongxx1!', deviceId: celebrant.deviceId }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects an OTP after too many wrong attempts', async () => {
    await app.request('/v1/auth/register', json(celebrant));
    for (let i = 0; i < 5; i += 1) {
      await app.request(
        '/v1/auth/verify-email',
        json({ email: celebrant.email, code: '000000', deviceId: celebrant.deviceId }),
      );
    }
    const res = await app.request(
      '/v1/auth/verify-email',
      json({ email: celebrant.email, code: '000000', deviceId: celebrant.deviceId }),
    );
    expect(res.status).toBe(429);
  });
});
