import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { peekOtp } from '../src/modules/auth/auth.service';
import { ensureWallet } from '../src/modules/payments/wallet.service';
import { postEntry } from '../src/modules/payments/ledger.service';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  settings.test.ts skipped — needs a disposable test DB.');

let seq = 0;
async function session(userId: string, deviceId: string, name: string) {
  return prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: `hash-${(seq += 1)}-${deviceId}`,
      deviceId,
      deviceName: name,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      lastUsedAt: new Date(),
    },
  });
}

d('settings (E011)', () => {
  const app = createApp();

  beforeEach(async () => resetDb());
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('serves allowed countries without auth', async () => {
    const res = await app.request('/v1/settings/allowed-countries');
    expect(res.status).toBe(200);
    const rows = (await body(res)).data;
    const ng = rows.find((c: { code: string }) => c.code === 'NG');
    expect(ng).toBeTruthy();
    expect(ng.states.length).toBeGreaterThan(30);
  });

  it('updates editable profile fields and rejects a bad DOB', async () => {
    const u = await makeCelebrant();
    const ok = await app.request(
      '/v1/me/profile',
      { method: 'PATCH', headers: u.auth, body: JSON.stringify({ dateOfBirth: '1996-04-01T00:00:00.000Z', city: 'Ibadan', addressLine: '12 Test Cl' }) },
    );
    expect(ok.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } });
    expect(user.city).toBe('Ibadan');
    expect(user.dateOfBirth?.getUTCFullYear()).toBe(1996);

    const bad = await app.request(
      '/v1/me/profile',
      { method: 'PATCH', headers: u.auth, body: JSON.stringify({ dateOfBirth: '2020-01-01T00:00:00.000Z' }) },
    );
    expect(bad.status).toBe(400);
  });

  it('lists sessions, revokes one, and signs out other devices', async () => {
    const u = await makeCelebrant();
    await session(u.user.id, 'dev-a', 'Pixel');
    const b = await session(u.user.id, 'dev-b', 'iPhone');
    await session(u.user.id, 'dev-c', 'Web');

    let list = (await body(await app.request('/v1/me/sessions?deviceId=dev-a', { headers: u.auth }))).data;
    expect(list).toHaveLength(3);
    expect(list.find((s: { deviceId: string }) => s.deviceId === 'dev-a').current).toBe(true);

    const del = await app.request(`/v1/me/sessions/${b.id}`, { method: 'DELETE', headers: u.auth });
    expect(del.status).toBe(200);
    list = (await body(await app.request('/v1/me/sessions', { headers: u.auth }))).data;
    expect(list).toHaveLength(2);

    const revoked = await app.request('/v1/me/sessions/revoke-others', post({ deviceId: 'dev-a' }, u.auth));
    expect((await body(revoked)).data.revoked).toBe(1); // only dev-c left besides dev-a
    list = (await body(await app.request('/v1/me/sessions', { headers: u.auth }))).data;
    expect(list.map((s: { deviceId: string }) => s.deviceId)).toEqual(['dev-a']);
  });

  it('blocks deletion while the wallet holds money, then completes it with an OTP', async () => {
    const u = await makeCelebrant();
    await ensureWallet(u.user.id);
    await postEntry({ userId: u.user.id, direction: 'CREDIT', amountKobo: 5_000n, reason: 'FUNDING', idempotencyKey: `t:${u.user.id}` });

    const blocked = await app.request('/v1/me/delete/request', { method: 'POST', headers: u.auth });
    expect(blocked.status).toBe(400);
    expect((await body(blocked)).error.message).toContain('Withdraw');

    // drain the wallet
    await postEntry({ userId: u.user.id, direction: 'DEBIT', amountKobo: 5_000n, reason: 'WITHDRAWAL', idempotencyKey: `t2:${u.user.id}` });

    const req = await app.request('/v1/me/delete/request', { method: 'POST', headers: u.auth });
    expect(req.status).toBe(200);

    const code = peekOtp(u.user.email, 'ACCOUNT_DELETE');
    expect(code).toMatch(/^\d{6}$/);
    await session(u.user.id, 'dev-x', 'Phone'); // a live session to be revoked

    const confirm = await app.request('/v1/me/delete/confirm', post({ code }, u.auth));
    expect(confirm.status).toBe(200);

    const gone = await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } });
    expect(gone.status).toBe('DELETED');
    expect(gone.email).toContain('@genie.deleted');
    expect(gone.originalEmail).toBe(u.user.email);
    expect(await prisma.refreshToken.count({ where: { userId: u.user.id, revokedAt: null } })).toBe(0);

    // the access token no longer works
    expect((await app.request('/v1/me', { headers: u.auth })).status).toBe(401);
  });

  it('rejects a wrong deletion code', async () => {
    const u = await makeCelebrant();
    await app.request('/v1/me/delete/request', { method: 'POST', headers: u.auth });
    const bad = await app.request('/v1/me/delete/confirm', post({ code: '000000' }, u.auth));
    expect(bad.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } })).status).toBe('ACTIVE');
  });
});
