import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  events.test.ts skipped — needs a disposable test DB.');

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

d('events (E003)', () => {
  const app = createApp();

  beforeEach(async () => resetDb());
  afterAll(async () => prisma.$disconnect());

  it('creates an event with an inline wishlist and lists it', async () => {
    const { auth } = await makeCelebrant();
    const res = await app.request(
      '/v1/events',
      post({ type: 'Birthday', name: '30th Birthday', eventDate: inDays(30), wishlistName: 'Main list' }, auth),
    );
    expect(res.status).toBe(201);
    const data = (await body(res)).data;
    expect(data.wishlistCount).toBe(1);
    expect(data.fulfilmentPct).toBe(0);

    const list = await app.request('/v1/events', { headers: auth });
    expect((await body(list)).data).toHaveLength(1);
  });

  it('rejects a duplicate event name (case-insensitive)', async () => {
    const { auth } = await makeCelebrant();
    await app.request('/v1/events', post({ type: 'Wedding', name: 'Our Day', eventDate: inDays(60) }, auth));
    const dupe = await app.request('/v1/events', post({ type: 'Wedding', name: 'our day', eventDate: inDays(60) }, auth));
    expect(dupe.status).toBe(409);
    expect((await body(dupe)).error.code).toBe('event_name_taken');
  });

  it('enforces createdAt ≤ expiresAt ≤ eventDate', async () => {
    const { auth } = await makeCelebrant();
    const past = await app.request('/v1/events', post({ type: 'X', name: 'Past', eventDate: inDays(-1) }, auth));
    expect(past.status).toBe(400);

    const badExpiry = await app.request(
      '/v1/events',
      post({ type: 'X', name: 'BadExpiry', eventDate: inDays(10), expiresAt: inDays(20) }, auth),
    );
    expect(badExpiry.status).toBe(400);
  });

  it('soft-deletes: gone from the list, kept in the DB', async () => {
    const { user, auth } = await makeCelebrant();
    const created = await app.request('/v1/events', post({ type: 'X', name: 'ToDelete', eventDate: inDays(5) }, auth));
    const id = (await body(created)).data.id;

    const del = await app.request(`/v1/events/${id}`, { method: 'DELETE', headers: auth });
    expect(del.status).toBe(200);

    expect((await body(await app.request('/v1/events', { headers: auth }))).data).toHaveLength(0);
    const row = await prisma.event.findUnique({ where: { id } });
    expect(row?.status).toBe('DELETED');

    // The name is free again after deletion.
    const reuse = await app.request('/v1/events', post({ type: 'X', name: 'ToDelete', eventDate: inDays(5) }, auth));
    expect(reuse.status).toBe(201);
    expect(await prisma.event.count({ where: { userId: user.id } })).toBe(2);
  });

  it('dashboard returns totals + recent events', async () => {
    const { auth } = await makeCelebrant();
    await app.request('/v1/events', post({ type: 'X', name: 'E1', eventDate: inDays(5) }, auth));
    await app.request('/v1/events', post({ type: 'X', name: 'E2', eventDate: inDays(9) }, auth));
    const dash = (await body(await app.request('/v1/events/dashboard', { headers: auth }))).data;
    expect(dash.totalEvents).toBe(2);
    expect(dash.recentEvents).toHaveLength(2);
  });

  it("won't touch another user's event", async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    const created = await app.request('/v1/events', post({ type: 'X', name: 'Mine', eventDate: inDays(5) }, a.auth));
    const id = (await body(created)).data.id;
    const res = await app.request(`/v1/events/${id}`, { headers: b.auth });
    expect(res.status).toBe(404);
  });
});
