import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hasDb, prisma, resetDb } from './helpers/db';
import { body, makeCategory, makeCelebrant, makeMerchant, post } from './helpers/factory';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  catalog.test.ts skipped — needs a disposable test DB.');

d('catalog + merchant products (E013)', () => {
  const app = createApp();

  beforeEach(async () => resetDb());
  afterAll(async () => {
    await resetDb().catch(() => {});
    await prisma.$disconnect();
  });

  it('merchant creates → edits stock → deletes a product; catalog reflects it', async () => {
    const merchant = await makeMerchant();
    const cat = await makeCategory('Gadgets');

    const create = await app.request(
      '/v1/merchant/products',
      post(
        {
          categoryId: cat.id,
          name: 'Smart Speaker',
          description: 'Voice assistant speaker.',
          priceKobo: 3_500_000,
          quantity: 5,
          imageUrls: ['https://example.com/s.jpg'],
        },
        merchant.auth,
      ),
    );
    expect(create.status).toBe(201);
    const product = (await body(create)).data;
    expect(product.priceKobo).toBe('3500000');
    expect(product.availableStock).toBe(5);

    // shows up in the public catalogue
    const browse = await app.request('/v1/products?q=speaker');
    expect((await body(browse)).data).toHaveLength(1);

    const inv = await app.request(`/v1/merchant/products/${product.id}/inventory`, {
      method: 'PUT',
      headers: merchant.auth,
      body: JSON.stringify({ availableStock: 20 }),
    });
    expect((await body(inv)).data.availableStock).toBe(20);

    const del = await app.request(`/v1/merchant/products/${product.id}`, {
      method: 'DELETE',
      headers: merchant.auth,
    });
    expect(del.status).toBe(200);
    expect((await body(await app.request('/v1/products'))).data).toHaveLength(0);
  });

  it('celebrants cannot use merchant endpoints', async () => {
    const { auth } = await makeCelebrant();
    const cat = await makeCategory();
    const res = await app.request(
      '/v1/merchant/products',
      post({ categoryId: cat.id, name: 'x', description: 'x', priceKobo: 100 }, auth),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a product in another merchant's hands", async () => {
    const m1 = await makeMerchant();
    const m2 = await makeMerchant();
    const cat = await makeCategory();
    const created = await app.request(
      '/v1/merchant/products',
      post({ categoryId: cat.id, name: 'Mine', description: 'x', priceKobo: 100 }, m1.auth),
    );
    const id = (await body(created)).data.id;
    const res = await app.request(`/v1/merchant/products/${id}`, {
      method: 'PATCH',
      headers: m2.auth,
      body: JSON.stringify({ name: 'Hijacked' }),
    });
    expect(res.status).toBe(403);
  });
});
