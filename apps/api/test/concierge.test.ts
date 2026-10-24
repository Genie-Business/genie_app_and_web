import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { __setPaymentProvider } from '../src/modules/payments/provider';
import { ensureWallet } from '../src/modules/payments/wallet.service';
import { postEntry } from '../src/modules/payments/ledger.service';
import { invalidateFeeCache } from '../src/modules/fees/fees.service';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCategory, makeCelebrant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  concierge.test.ts skipped — needs a disposable test DB.');

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

/** The service resolves this exact email — mirrors packages/db/prisma/seed.ts's seedConcierge(). */
async function makeConciergeMerchant() {
  return prisma.user.create({
    data: {
      role: 'MERCHANT',
      firstName: 'genie Concierge',
      lastName: '(Service)',
      email: 'concierge@genieapps.co',
      username: 'genie_concierge_test',
      referralCode: 'CONCIERGETEST',
      passwordHash: 'unused',
      emailVerifiedAt: new Date(),
      merchantProfile: { create: { businessName: 'genie Concierge', kybStatus: 'VERIFIED' } },
    },
  });
}

async function wishlistFor(app: ReturnType<typeof createApp>, auth: Record<string, string>) {
  const ev = await app.request(
    '/v1/events',
    post({ type: 'Birthday', name: 'Concierge Test', eventDate: inDays(20), wishlistName: 'List' }, auth),
  );
  return (await body(ev)).data.wishlists[0].id as string;
}

d('Concierge service (import a gift)', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetDb();
    __setPaymentProvider(null);
    invalidateFeeCache();
    await makeCategory('General');
  });
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('creates a pending wishlist item that cannot be gifted until activated', async () => {
    await makeConciergeMerchant();
    const celebrant = await makeCelebrant();
    const wishlistId = await wishlistFor(app, celebrant.auth);

    const res = await app.request(
      '/v1/concierge',
      post(
        { wishlistId, sourceUrl: 'https://amazon.com/dp/B000X', name: 'Fancy Blender', estimatedPriceKobo: 4_500_00 },
        celebrant.auth,
      ),
    );
    expect(res.status).toBe(201);
    const dto = (await body(res)).data;
    expect(dto.status).toBe('NEW');
    expect(dto.estimatedPriceKobo).toBe('450000');

    const wl = (await body(await app.request(`/v1/wishlists/${wishlistId}`, { headers: celebrant.auth }))).data;
    expect(wl.items).toHaveLength(1);
    expect(wl.items[0].productId).toBe(dto.productId);
    expect(wl.items[0].isPending).toBe(true);

    // Not giftable while pending.
    const gifter = await makeCelebrant();
    await ensureWallet(gifter.user.id);
    await postEntry({ userId: gifter.user.id, direction: 'CREDIT', amountKobo: 10_000_00n, reason: 'FUNDING', idempotencyKey: 'ct1' });
    const payRes = await app.request(
      '/v1/gifts',
      post({ wishlistItemId: wl.items[0].id, quantity: 1, method: 'WALLET' }, gifter.auth),
    );
    expect(payRes.status).toBe(400);
  });

  it('becomes an ordinary giftable item once a concierge activates it', async () => {
    await makeConciergeMerchant();
    const celebrant = await makeCelebrant();
    const wishlistId = await wishlistFor(app, celebrant.auth);
    const created = (
      await body(
        await app.request(
          '/v1/concierge',
          post({ wishlistId, sourceUrl: 'https://amazon.com/dp/B000X', name: 'Fancy Blender' }, celebrant.auth),
        ),
      )
    ).data;

    // Simulate what the admin portal's Activate action does directly via Prisma
    // (that flow lives in the admin portal under apps/landing, which has no API surface).
    const category = await prisma.category.findFirstOrThrow();
    await prisma.$transaction([
      prisma.product.update({
        where: { id: created.productId },
        data: { priceKobo: 12_000_00n, categoryId: category.id, status: 'ACTIVE' },
      }),
      prisma.inventory.update({ where: { productId: created.productId }, data: { availableStock: 1 } }),
      prisma.conciergeRequest.update({ where: { id: created.id }, data: { status: 'ACTIVE' } }),
    ]);

    const wl = (await body(await app.request(`/v1/wishlists/${wishlistId}`, { headers: celebrant.auth }))).data;
    expect(wl.items[0].isPending).toBe(false);
    expect(wl.isShareable).toBe(false); // still only one item

    const gifter = await makeCelebrant();
    await ensureWallet(gifter.user.id);
    await postEntry({ userId: gifter.user.id, direction: 'CREDIT', amountKobo: 30_000_00n, reason: 'FUNDING', idempotencyKey: 'ct2' });
    const payRes = await app.request(
      '/v1/gifts',
      post({ wishlistItemId: wl.items[0].id, quantity: 1, method: 'WALLET' }, gifter.auth),
    );
    expect(payRes.status).toBe(201);

    // Confirm the sale actually landed against the concierge merchant.
    const concierge = await prisma.user.findUniqueOrThrow({ where: { email: 'concierge@genieapps.co' } });
    const conciergeOrder = await prisma.order.findFirstOrThrow({ where: { merchantId: concierge.id } });
    expect(conciergeOrder.status).toBe('PAID');
  });

  it('lets the requester cancel before review, but not after', async () => {
    await makeConciergeMerchant();
    const celebrant = await makeCelebrant();
    const wishlistId = await wishlistFor(app, celebrant.auth);
    const created = (
      await body(
        await app.request(
          '/v1/concierge',
          post({ wishlistId, sourceUrl: 'https://jumia.com.ng/x', name: 'Air Fryer' }, celebrant.auth),
        ),
      )
    ).data;

    const cancelRes = await app.request(`/v1/concierge/${created.id}`, { method: 'DELETE', headers: celebrant.auth });
    expect(cancelRes.status).toBe(200);

    const wl = (await body(await app.request(`/v1/wishlists/${wishlistId}`, { headers: celebrant.auth }))).data;
    expect(wl.items).toHaveLength(0);

    const again = await app.request(`/v1/concierge/${created.id}`, { method: 'DELETE', headers: celebrant.auth });
    expect(again.status).toBe(400);
  });

  it('rejects a request for someone else’s wishlist', async () => {
    await makeConciergeMerchant();
    const owner = await makeCelebrant();
    const stranger = await makeCelebrant();
    const wishlistId = await wishlistFor(app, owner.auth);

    const res = await app.request(
      '/v1/concierge',
      post({ wishlistId, sourceUrl: 'https://amazon.com/dp/B000X', name: 'Fancy Blender' }, stranger.auth),
    );
    expect(res.status).toBe(404);
  });
});
