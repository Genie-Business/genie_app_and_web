import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  support.test.ts skipped — needs a disposable test DB.');

d('support threads (E011)', () => {
  const app = createApp();

  beforeEach(async () => resetDb());
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('opens a thread, lists it, and lets the user reply', async () => {
    const u = await makeCelebrant();

    const created = await app.request(
      '/v1/support/threads',
      post({ subject: 'Refund question', message: 'My gift never arrived.' }, u.auth),
    );
    expect(created.status).toBe(201);
    const thread = (await body(created)).data;
    expect(thread.status).toBe('OPEN');
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].from).toBe('USER');

    const list = (await body(await app.request('/v1/support/threads', { headers: u.auth }))).data;
    expect(list).toHaveLength(1);
    expect(list[0].messageCount).toBe(1);

    const replied = await app.request(
      `/v1/support/threads/${thread.id}/messages`,
      post({ message: 'Order number is ORD-123.' }, u.auth),
    );
    expect(replied.status).toBe(200);
    expect((await body(replied)).data.messages).toHaveLength(2);
  });

  it("won't show a thread to another user", async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    const thread = (await body(await app.request('/v1/support/threads', post({ message: 'hi' }, a.auth)))).data;

    expect((await app.request(`/v1/support/threads/${thread.id}`, { headers: b.auth })).status).toBe(404);
    expect(
      (await app.request(`/v1/support/threads/${thread.id}/messages`, post({ message: 'x' }, b.auth))).status,
    ).toBe(404);
  });

  it('re-opens a resolved thread when the user replies', async () => {
    const u = await makeCelebrant();
    const thread = (await body(await app.request('/v1/support/threads', post({ message: 'hi' }, u.auth)))).data;
    await prisma.supportThread.update({ where: { id: thread.id }, data: { status: 'RESOLVED' } });

    await app.request(`/v1/support/threads/${thread.id}/messages`, post({ message: 'still broken' }, u.auth));
    const reopened = (await body(await app.request(`/v1/support/threads/${thread.id}`, { headers: u.auth }))).data;
    expect(reopened.status).toBe('OPEN');
  });

  it('caps the number of open threads', async () => {
    const u = await makeCelebrant();
    for (let i = 0; i < 5; i += 1) {
      const r = await app.request('/v1/support/threads', post({ message: `issue ${i}` }, u.auth));
      expect(r.status).toBe(201);
    }
    const sixth = await app.request('/v1/support/threads', post({ message: 'one more' }, u.auth));
    expect(sixth.status).toBe(400);
  });
});
