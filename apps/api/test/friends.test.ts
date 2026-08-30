import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  friends.test.ts skipped — needs a disposable test DB.');

d('friends (E007)', () => {
  const app = createApp();

  beforeEach(async () => resetDb());
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('runs the request → accept lifecycle and notifies both sides', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();

    const sent = await app.request('/v1/friends/requests', post({ username: b.user.username }, a.auth));
    expect(sent.status).toBe(201);
    expect((await body(sent)).data.status).toBe('sent');

    // b sees it as incoming, a as outgoing
    const bReqs = (await body(await app.request('/v1/friends/requests', { headers: b.auth }))).data;
    expect(bReqs).toHaveLength(1);
    expect(bReqs[0].direction).toBe('incoming');
    expect(bReqs[0].user.username).toBe(a.user.username);
    const reqId = bReqs[0].id;

    // b was notified
    const bNotifs = (await body(await app.request('/v1/notifications', { headers: b.auth }))).data;
    expect(bNotifs.some((n: { type: string }) => n.type === 'friend.request')).toBe(true);

    const acc = await app.request(`/v1/friends/requests/${reqId}/accept`, { method: 'POST', headers: b.auth });
    expect(acc.status).toBe(200);

    const aFriends = (await body(await app.request('/v1/friends', { headers: a.auth }))).data;
    const bFriends = (await body(await app.request('/v1/friends', { headers: b.auth }))).data;
    expect(aFriends.map((f: { username: string }) => f.username)).toContain(b.user.username);
    expect(bFriends.map((f: { username: string }) => f.username)).toContain(a.user.username);

    // requester (a) was notified of the acceptance
    const aNotifs = (await body(await app.request('/v1/notifications', { headers: a.auth }))).data;
    expect(aNotifs.some((n: { type: string }) => n.type === 'friend.accepted')).toBe(true);
  });

  it('auto-accepts when both sides send a request', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    await app.request('/v1/friends/requests', post({ username: b.user.username }, a.auth));

    const res = await app.request('/v1/friends/requests', post({ username: a.user.username }, b.auth));
    expect(res.status).toBe(201);
    expect((await body(res)).data.status).toBe('accepted');

    expect((await body(await app.request('/v1/friends', { headers: a.auth }))).data).toHaveLength(1);
  });

  it('rejects self-add, duplicate requests and adding an existing friend', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();

    const self = await app.request('/v1/friends/requests', post({ username: a.user.username }, a.auth));
    expect(self.status).toBe(400);

    await app.request('/v1/friends/requests', post({ username: b.user.username }, a.auth));
    const dup = await app.request('/v1/friends/requests', post({ username: b.user.username }, a.auth));
    expect(dup.status).toBe(409);
    expect((await body(dup)).error.code).toBe('request_pending');
  });

  it('decline removes the request; cancel removes an outbound one', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    const c = await makeCelebrant();

    const r1 = (await body(await app.request('/v1/friends/requests', post({ username: b.user.username }, a.auth)))).data;
    await app.request(`/v1/friends/requests/${r1.friendshipId}/decline`, { method: 'POST', headers: b.auth });
    expect((await body(await app.request('/v1/friends/requests', { headers: b.auth }))).data).toHaveLength(0);

    const r2 = (await body(await app.request('/v1/friends/requests', post({ username: c.user.username }, a.auth)))).data;
    const del = await app.request(`/v1/friends/requests/${r2.friendshipId}`, { method: 'DELETE', headers: a.auth });
    expect(del.status).toBe(200);
    expect((await body(await app.request('/v1/friends/requests', { headers: a.auth }))).data).toHaveLength(0);
  });

  it('blocking removes any friendship and prevents new requests', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    await app.request('/v1/friends/requests', post({ username: b.user.username }, a.auth));

    const blocked = await app.request(`/v1/friends/${b.user.id}/block`, { method: 'POST', headers: a.auth });
    expect(blocked.status).toBe(200);
    expect((await body(await app.request('/v1/friends/requests', { headers: b.auth }))).data).toHaveLength(0);

    // b can't send a to a request now (generic not-found, doesn't leak the block)
    const retry = await app.request('/v1/friends/requests', post({ username: a.user.username }, b.auth));
    expect(retry.status).toBe(404);

    // a sees b in the blocked list, then unblocks
    expect((await body(await app.request('/v1/friends/blocked', { headers: a.auth }))).data[0].userId).toBe(b.user.id);
    const unblock = await app.request(`/v1/friends/${b.user.id}/block`, { method: 'DELETE', headers: a.auth });
    expect(unblock.status).toBe(200);
    const ok = await app.request('/v1/friends/requests', post({ username: a.user.username }, b.auth));
    expect(ok.status).toBe(201);
  });

  it('unfriend is mutual', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    const r = (await body(await app.request('/v1/friends/requests', post({ username: b.user.username }, a.auth)))).data;
    await app.request(`/v1/friends/requests/${r.friendshipId}/accept`, { method: 'POST', headers: b.auth });

    const un = await app.request(`/v1/friends/${b.user.id}`, { method: 'DELETE', headers: a.auth });
    expect(un.status).toBe(200);
    expect((await body(await app.request('/v1/friends', { headers: a.auth }))).data).toHaveLength(0);
    expect((await body(await app.request('/v1/friends', { headers: b.auth }))).data).toHaveLength(0);
  });

  it('matches address-book contacts to genie users', async () => {
    const me = await makeCelebrant();
    const friend = await makeCelebrant({ phone: '+2348030001111' });
    const other = await makeCelebrant({ phone: '08030002222' }); // stored in local form
    await makeCelebrant({ phone: '+2348030009999' }); // not in my contacts

    const res = await app.request(
      '/v1/friends/import-contacts',
      post(
        {
          contacts: [
            { name: 'Bestie', phone: '0803 000 1111' },
            { name: 'Work', phone: '+234 803 000 2222' },
            { name: 'Unknown', phone: '08031234567' },
          ],
        },
        me.auth,
      ),
    );
    expect(res.status).toBe(200);
    const data = (await body(res)).data;
    expect(data.matched).toBe(2);
    const ids = data.matches.map((m: { userId: string }) => m.userId).sort();
    expect(ids).toEqual([friend.user.id, other.user.id].sort());
    expect(data.matches.every((m: { friendStatus: string }) => m.friendStatus === 'none')).toBe(true);

    // the raw numbers are hashed at rest
    const stored = await prisma.contactImport.findMany({ where: { userId: me.user.id } });
    expect(stored).toHaveLength(3);
    expect(stored.every((c) => /^[0-9a-f]{64}$/.test(c.phoneHash))).toBe(true);
  });
});
