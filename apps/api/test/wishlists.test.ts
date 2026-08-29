import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCelebrant, makeMerchant, makeProduct, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  wishlists.test.ts skipped — needs a disposable test DB.');

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

async function celebrantWithEvent(app: ReturnType<typeof createApp>) {
  const { user, auth } = await makeCelebrant();
  const ev = await app.request('/v1/events', post({ type: 'Birthday', name: 'Party', eventDate: inDays(20) }, auth));
  const eventId = (await body(ev)).data.id;
  const wl = await app.request('/v1/wishlists', post({ eventId, name: 'Gifts' }, auth));
  const wishlistId = (await body(wl)).data.id;
  return { user, auth, eventId, wishlistId };
}

d('wishlists (E004)', () => {
  const app = createApp();

  beforeEach(async () => resetDb());
  afterAll(async () => prisma.$disconnect());

  it('adds, updates (upsert) and removes items; totals + shareability track', async () => {
    const merchant = await makeMerchant();
    const p1 = await makeProduct(merchant.user.id, { priceKobo: 10_000_00 });
    const p2 = await makeProduct(merchant.user.id, { priceKobo: 5_000_00 });
    const { auth, wishlistId } = await celebrantWithEvent(app);

    let res = await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: p1.id, quantityWanted: 2 }, auth));
    expect(res.status).toBe(200);
    let wl = (await body(res)).data;
    expect(wl.itemCount).toBe(1);
    expect(wl.totalValueKobo).toBe('2000000');
    expect(wl.isShareable).toBe(false); // needs ≥ 2 items

    // Same product again → upsert, not a second row.
    res = await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: p1.id, quantityWanted: 3 }, auth));
    wl = (await body(res)).data;
    expect(wl.itemCount).toBe(1);
    expect(wl.items[0].quantityWanted).toBe(3);

    res = await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: p2.id }, auth));
    wl = (await body(res)).data;
    expect(wl.itemCount).toBe(2);
    expect(wl.isShareable).toBe(true);

    const itemId = wl.items.find((i: { productId: string }) => i.productId === p2.id).id;
    const del = await app.request(`/v1/wishlists/${wishlistId}/items/${itemId}`, { method: 'DELETE', headers: auth });
    expect((await body(del)).data.itemCount).toBe(1);
  });

  it('rejects adding an inactive product', async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id);
    await prisma.product.update({ where: { id: product.id }, data: { status: 'DELETED' } });
    const { auth, wishlistId } = await celebrantWithEvent(app);

    const res = await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: product.id }, auth));
    expect(res.status).toBe(400);
  });

  it('share link needs ≥ 2 items; public view works once shareable', async () => {
    const merchant = await makeMerchant();
    const p1 = await makeProduct(merchant.user.id);
    const p2 = await makeProduct(merchant.user.id);
    const { auth, wishlistId } = await celebrantWithEvent(app);

    await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: p1.id }, auth));
    let share = (await body(await app.request(`/v1/wishlists/${wishlistId}/share`, { headers: auth }))).data;
    expect(share.isShareable).toBe(false);

    // Public view of a not-yet-shareable list is hidden.
    expect((await app.request(`/v1/public/wishlists/${wishlistId}`)).status).toBe(404);

    await app.request(`/v1/wishlists/${wishlistId}/items`, post({ productId: p2.id }, auth));
    share = (await body(await app.request(`/v1/wishlists/${wishlistId}/share`, { headers: auth }))).data;
    expect(share.isShareable).toBe(true);
    expect(share.shareUrl).toContain(`/w/${wishlistId}`);

    const pub = await app.request(`/v1/public/wishlists/${wishlistId}`);
    expect(pub.status).toBe(200);
    const view = (await body(pub)).data;
    expect(view.items).toHaveLength(2);
    expect(view.celebrantName).toBeTruthy();
  });

  it("won't let another user touch the wishlist", async () => {
    const merchant = await makeMerchant();
    const product = await makeProduct(merchant.user.id);
    const { wishlistId } = await celebrantWithEvent(app);
    const intruder = await makeCelebrant();

    const res = await app.request(
      `/v1/wishlists/${wishlistId}/items`,
      post({ productId: product.id }, intruder.auth),
    );
    expect(res.status).toBe(404);
  });
});
