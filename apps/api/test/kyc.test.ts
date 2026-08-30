import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setKycProvider } from '../src/modules/kyc/provider';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  kyc.test.ts skipped — needs a disposable test DB.');

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], 'x.jpg', { type: 'image/jpeg' });

function submit(
  app: ReturnType<typeof createApp>,
  token: string,
  opts: { bvn?: string; selfie?: boolean; idDoc?: boolean; idDocType?: string } = {},
) {
  const form = new FormData();
  form.append('idDocType', opts.idDocType ?? 'NIN');
  if (opts.bvn) form.append('bvn', opts.bvn);
  if (opts.selfie !== false) form.append('selfie', jpeg());
  if (opts.idDoc !== false) form.append('idDoc', jpeg());
  return app.request('/v1/kyc/level-1', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
}

d('KYC Level 1 (E002)', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setKycProvider(null);
  });
  afterEach(() => __setKycProvider(null));
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('approves a clean submission and reflects it on GET /kyc', async () => {
    const u = await makeCelebrant();
    expect((await body(await app.request('/v1/kyc', { headers: u.auth }))).data.status).toBe('NONE');

    const res = await submit(app, u.token, { bvn: '22222222222' });
    expect(res.status).toBe(201);
    expect((await body(res)).data.status).toBe('APPROVED');

    const status = (await body(await app.request('/v1/kyc', { headers: u.auth }))).data;
    expect(status.status).toBe('APPROVED');
    expect(status.hasSelfie).toBe(true);
    expect(status.bvnLast4).toBe('2222');
    expect(status.reviewedAt).not.toBeNull();

    const notifs = (await body(await app.request('/v1/notifications', { headers: u.auth }))).data;
    expect(notifs.some((n: { type: string }) => n.type === 'kyc.approved')).toBe(true);
    const acts = (await body(await app.request('/v1/activities?action=kyc', { headers: u.auth }))).data;
    expect(acts.some((a: { action: string }) => a.action === 'kyc.approved')).toBe(true);
  });

  it('rejects a mismatched BVN with a reason', async () => {
    const u = await makeCelebrant();
    const res = await submit(app, u.token, { bvn: '11111110000' });
    expect(res.status).toBe(201);
    const dto = (await body(res)).data;
    expect(dto.status).toBe('REJECTED');
    expect(dto.rejectionReason).toContain('BVN');
    // a rejected user may resubmit
    const retry = await submit(app, u.token, { bvn: '11111112222' });
    expect((await body(retry)).data.status).toBe('APPROVED');
  });

  it('leaves a 9999 BVN pending review', async () => {
    const u = await makeCelebrant();
    const res = await submit(app, u.token, { bvn: '11111119999' });
    expect((await body(res)).data.status).toBe('PENDING');
    // cannot resubmit while pending
    const again = await submit(app, u.token, { bvn: '22222222222' });
    expect(again.status).toBe(400);
  });

  it('400s a submission missing the selfie', async () => {
    const u = await makeCelebrant();
    const res = await submit(app, u.token, { selfie: false });
    expect(res.status).toBe(400);
  });

  it('will not re-verify an already-approved account', async () => {
    const u = await makeCelebrant();
    await submit(app, u.token, { bvn: '22222222222' });
    const res = await submit(app, u.token, { bvn: '22222222222' });
    expect(res.status).toBe(400);
  });

  it('requires a verified email', async () => {
    const u = await makeCelebrant({ emailVerified: false });
    const res = await submit(app, u.token, { bvn: '22222222222' });
    expect(res.status).toBe(403);
  });

  it('exposes the requirements', async () => {
    const u = await makeCelebrant();
    const req = (await body(await app.request('/v1/kyc/requirements', { headers: u.auth }))).data;
    expect(req.level).toBe('LEVEL_1');
    expect(req.acceptedIdDocs).toContain('PASSPORT');
    expect(req.requires.length).toBeGreaterThan(0);
  });
});
