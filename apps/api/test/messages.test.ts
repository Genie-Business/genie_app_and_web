import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  messages.test.ts skipped — needs a disposable test DB.');

async function befriend(aId: string, bId: string) {
  await prisma.friendship.create({ data: { requesterId: aId, addresseeId: bId, status: 'ACCEPTED' } });
}

d('instant messaging (E007)', () => {
  const app = createApp();

  beforeEach(async () => resetDb());
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('runs a full conversation between friends and tracks unread + notifications', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    await befriend(a.user.id, b.user.id);

    const thread = (await body(await app.request('/v1/messages/threads', post({ username: b.user.username }, a.auth)))).data;
    expect(thread.withUser.username).toBe(b.user.username);

    await app.request(`/v1/messages/threads/${thread.id}/messages`, post({ body: 'hey, thanks for the gift!' }, a.auth));

    // b sees it as unread + gets a notification
    const bThreads = (await body(await app.request('/v1/messages/threads', { headers: b.auth }))).data;
    expect(bThreads).toHaveLength(1);
    expect(bThreads[0].unreadCount).toBe(1);
    expect(bThreads[0].lastMessage).toContain('thanks');
    expect((await body(await app.request('/v1/messages/unread-count', { headers: b.auth }))).data.count).toBe(1);

    const bNotifs = (await body(await app.request('/v1/notifications?category=MESSAGE', { headers: b.auth }))).data;
    expect(bNotifs.some((n: { type: string }) => n.type === 'message.new')).toBe(true);

    // b opens the thread — messages appear oldest-first, unread clears
    const opened = (await body(await app.request(`/v1/messages/threads/${thread.id}`, { headers: b.auth }))).data;
    expect(opened.messages).toHaveLength(1);
    expect(opened.messages[0].mine).toBe(false);
    expect(opened.unreadCount).toBe(0);
    expect((await body(await app.request('/v1/messages/unread-count', { headers: b.auth }))).data.count).toBe(0);

    // b replies, a sees it
    await app.request(`/v1/messages/threads/${thread.id}/messages`, post({ body: 'you are welcome!' }, b.auth));
    const aOpened = (await body(await app.request(`/v1/messages/threads/${thread.id}`, { headers: a.auth }))).data;
    expect(aOpened.messages.map((m: { body: string }) => m.body)).toEqual(['hey, thanks for the gift!', 'you are welcome!']);
    expect(aOpened.messages[0].mine).toBe(true); // a sent the first
    expect(aOpened.messages[1].mine).toBe(false); // b sent the reply
  });

  it('opening a thread is idempotent (one thread per pair)', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    await befriend(a.user.id, b.user.id);

    const t1 = (await body(await app.request('/v1/messages/threads', post({ username: b.user.username }, a.auth)))).data;
    const t2 = (await body(await app.request('/v1/messages/threads', post({ username: a.user.username }, b.auth)))).data;
    expect(t1.id).toBe(t2.id);
    expect(await prisma.messageThread.count()).toBe(1);
  });

  it('only notifies once while a conversation stays unread', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    await befriend(a.user.id, b.user.id);
    const thread = (await body(await app.request('/v1/messages/threads', post({ userId: b.user.id }, a.auth)))).data;

    for (const text of ['one', 'two', 'three']) {
      await app.request(`/v1/messages/threads/${thread.id}/messages`, post({ body: text }, a.auth));
    }
    const notifs = (await body(await app.request('/v1/notifications', { headers: b.auth }))).data;
    expect(notifs.filter((n: { type: string }) => n.type === 'message.new')).toHaveLength(1);
    expect((await body(await app.request('/v1/messages/unread-count', { headers: b.auth }))).data.count).toBe(3);
  });

  it('refuses to message someone who is not a friend', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();

    const res = await app.request('/v1/messages/threads', post({ username: b.user.username }, a.auth));
    expect(res.status).toBe(403);

    // a pending request is not enough
    await prisma.friendship.create({ data: { requesterId: a.user.id, addresseeId: b.user.id, status: 'PENDING' } });
    expect((await app.request('/v1/messages/threads', post({ username: b.user.username }, a.auth))).status).toBe(403);
  });

  it('blocks messaging in an existing thread once the friendship is removed', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    await befriend(a.user.id, b.user.id);
    const thread = (await body(await app.request('/v1/messages/threads', post({ username: b.user.username }, a.auth)))).data;
    await app.request(`/v1/messages/threads/${thread.id}/messages`, post({ body: 'hi' }, a.auth));

    await prisma.friendship.deleteMany({ where: { requesterId: a.user.id, addresseeId: b.user.id } });

    const res = await app.request(`/v1/messages/threads/${thread.id}/messages`, post({ body: 'still there?' }, a.auth));
    expect(res.status).toBe(403);
  });

  it("won't reveal a thread to a non-participant", async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    const c = await makeCelebrant();
    await befriend(a.user.id, b.user.id);
    const thread = (await body(await app.request('/v1/messages/threads', post({ username: b.user.username }, a.auth)))).data;

    expect((await app.request(`/v1/messages/threads/${thread.id}`, { headers: c.auth })).status).toBe(404);
  });
});
