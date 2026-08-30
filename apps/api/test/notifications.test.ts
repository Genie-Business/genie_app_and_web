import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { notify } from '../src/modules/notifications/notify.service';
import { __setPushSender } from '../src/modules/notifications/push';
import type { PushMessage, PushSender } from '../src/modules/notifications/push';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  notifications.test.ts skipped — needs a disposable test DB.');

class SpyPush implements PushSender {
  readonly name = 'spy';
  calls: { tokens: string[]; message: PushMessage }[] = [];
  async send(tokens: string[], message: PushMessage) {
    this.calls.push({ tokens, message });
    return { sent: tokens.length, failed: 0, invalidTokens: [] };
  }
}

d('notifications (E010)', () => {
  const app = createApp();
  let spy: SpyPush;

  beforeEach(async () => {
    await resetDb();
    spy = new SpyPush();
    __setPushSender(spy);
  });
  afterEach(() => __setPushSender(null));
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('lists, filters, counts and marks notifications read', async () => {
    const u = await makeCelebrant();
    await notify({ userId: u.user.id, type: 'gift.received', title: 'Gift', body: 'A gift!' });
    await notify({ userId: u.user.id, type: 'friend.request', title: 'Friend', body: 'Add me' });
    await notify({ userId: u.user.id, type: 'system.notice', title: 'Hi', body: 'Welcome' });

    const all = await body(await app.request('/v1/notifications', { headers: u.auth }));
    expect(all.data).toHaveLength(3);
    expect(all.meta.unreadCount).toBe(3);

    const gifts = await body(await app.request('/v1/notifications?category=GIFT', { headers: u.auth }));
    expect(gifts.data).toHaveLength(1);
    expect(gifts.data[0].type).toBe('gift.received');

    const count = await body(await app.request('/v1/notifications/unread-count', { headers: u.auth }));
    expect(count.data.count).toBe(3);

    // mark one read by id
    const oneId = all.data[0].id;
    let read = await app.request('/v1/notifications/read', post({ ids: [oneId] }, u.auth));
    expect((await body(read)).data.updated).toBe(1);

    const unreadOnly = await body(await app.request('/v1/notifications?unreadOnly=true', { headers: u.auth }));
    expect(unreadOnly.data).toHaveLength(2);

    // mark all read
    read = await app.request('/v1/notifications/read', post({ all: true }, u.auth));
    expect((await body(read)).data.updated).toBe(2);
    const after = await body(await app.request('/v1/notifications/unread-count', { headers: u.auth }));
    expect(after.data.count).toBe(0);
  });

  it('registers a device and pushes to it, honouring the category preference', async () => {
    const u = await makeCelebrant();

    const reg = await app.request('/v1/devices', post({ fcmToken: 'tok-abc-1234567890', platform: 'ANDROID' }, u.auth));
    expect(reg.status).toBe(201);
    expect((await body(await app.request('/v1/devices', { headers: u.auth }))).data).toHaveLength(1);

    await notify({ userId: u.user.id, type: 'gift.received', title: 'Gift', body: 'yay' });
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]?.tokens).toEqual(['tok-abc-1234567890']);
    expect(spy.calls[0]?.message.data?.type).toBe('gift.received');

    // disable push for the GIFT category
    const pref = await app.request(
      '/v1/notifications/preferences',
      { method: 'PUT', headers: u.auth, body: JSON.stringify({ preferences: [{ category: 'GIFT', push: false }] }) },
    );
    expect(pref.status).toBe(200);

    spy.calls = [];
    await notify({ userId: u.user.id, type: 'gift.received', title: 'Gift 2', body: 'again' });
    expect(spy.calls).toHaveLength(0); // muted

    // a different category still pushes
    await notify({ userId: u.user.id, type: 'friend.request', title: 'Friend', body: 'add' });
    expect(spy.calls).toHaveLength(1);

    // the in-app rows exist regardless of push preference
    expect((await body(await app.request('/v1/notifications', { headers: u.auth }))).data).toHaveLength(3);
  });

  it('returns the five preference defaults and round-trips updates', async () => {
    const u = await makeCelebrant();
    const initial = (await body(await app.request('/v1/notifications/preferences', { headers: u.auth }))).data;
    expect(initial).toHaveLength(5);
    expect(initial.every((p: { push: boolean; email: boolean; inApp: boolean }) => p.push && !p.email && p.inApp)).toBe(true);

    await app.request('/v1/notifications/preferences', {
      method: 'PUT',
      headers: u.auth,
      body: JSON.stringify({ preferences: [{ category: 'PAYMENT', email: true }, { category: 'FRIEND', push: false }] }),
    });
    const updated = (await body(await app.request('/v1/notifications/preferences', { headers: u.auth }))).data;
    expect(updated.find((p: { category: string }) => p.category === 'PAYMENT').email).toBe(true);
    expect(updated.find((p: { category: string }) => p.category === 'FRIEND').push).toBe(false);
    // untouched category keeps defaults
    expect(updated.find((p: { category: string }) => p.category === 'GIFT').push).toBe(true);
  });

  it('unregisters a device', async () => {
    const u = await makeCelebrant();
    await app.request('/v1/devices', post({ fcmToken: 'tok-to-remove-999', platform: 'IOS' }, u.auth));
    const del = await app.request('/v1/devices/tok-to-remove-999', { method: 'DELETE', headers: u.auth });
    expect(del.status).toBe(200);
    expect((await body(await app.request('/v1/devices', { headers: u.auth }))).data).toHaveLength(0);

    await notify({ userId: u.user.id, type: 'gift.received', title: 'x', body: 'y' });
    expect(spy.calls).toHaveLength(0); // no devices → no push
  });
});
