import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setPaymentProvider } from '../src/modules/payments/provider';
import { recordActivity } from '../src/modules/activities/activities.service';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  activities.test.ts skipped — needs a disposable test DB.');

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

d('activity feed (E009)', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setPaymentProvider(null);
  });
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('records account + event activity and returns it newest-first with a title', async () => {
    const u = await makeCelebrant();
    // factory bypasses the register flow, so seed the account event directly
    await recordActivity({ userId: u.user.id, category: 'ACCOUNT', action: 'account.registered', metadata: { role: 'CELEBRANT' } });

    await app.request('/v1/events', post({ type: 'Birthday', name: 'My Party', eventDate: inDays(20) }, u.auth));

    const feed = await body(await app.request('/v1/activities', { headers: u.auth }));
    expect(feed.meta.total).toBe(2);
    expect(feed.data[0].action).toBe('event.created'); // newest first
    expect(feed.data[0].title).toContain('My Party');
    expect(feed.data[1].action).toBe('account.registered');
  });

  it('filters by category, action prefix and date range', async () => {
    const u = await makeCelebrant();
    await recordActivity({ userId: u.user.id, category: 'ACCOUNT', action: 'account.registered' });
    await recordActivity({ userId: u.user.id, category: 'EVENT', action: 'event.created', metadata: { name: 'A' } });
    await recordActivity({ userId: u.user.id, category: 'EVENT', action: 'event.deleted' });
    await recordActivity({ userId: u.user.id, category: 'TRANSACTION', action: 'wallet.funded', metadata: { amountKobo: '500000' } });

    const events = await body(await app.request('/v1/activities?category=EVENT', { headers: u.auth }));
    expect(events.data).toHaveLength(2);

    const created = await body(await app.request('/v1/activities?action=event.created', { headers: u.auth }));
    expect(created.data).toHaveLength(1);

    const anyEvent = await body(await app.request('/v1/activities?action=event', { headers: u.auth }));
    expect(anyEvent.data).toHaveLength(2); // prefix match

    const future = await body(
      await app.request(`/v1/activities?from=${encodeURIComponent(inDays(1))}`, { headers: u.auth }),
    );
    expect(future.data).toHaveLength(0);
  });

  it('only shows my own activity', async () => {
    const a = await makeCelebrant();
    const b = await makeCelebrant();
    await recordActivity({ userId: a.user.id, category: 'ACCOUNT', action: 'account.registered' });

    const bFeed = await body(await app.request('/v1/activities', { headers: b.auth }));
    expect(bFeed.data).toHaveLength(0);
  });

  it('logs wallet.funded when funds are settled', async () => {
    const u = await makeCelebrant();
    const intent = (await body(
      await app.request('/v1/payments/add-funds', post({ amountKobo: 750_00 }, u.auth)),
    )).data;
    await app.request('/v1/payments/_mock/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: intent.reference }),
    });

    const feed = await body(await app.request('/v1/activities?action=wallet', { headers: u.auth }));
    expect(feed.data).toHaveLength(1);
    expect(feed.data[0].title).toContain('₦750');
  });
});
