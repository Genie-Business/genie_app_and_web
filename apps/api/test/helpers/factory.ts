import { hashPassword } from '@genie/core';
import { prisma } from '@genie/db';
import { signAccessToken } from '../../src/lib/jwt';

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq += 1)}`;

export async function makeCelebrant(overrides: { emailVerified?: boolean } = {}) {
  const n = uid();
  const user = await prisma.user.create({
    data: {
      role: 'CELEBRANT',
      firstName: 'Test',
      lastName: `Celebrant ${n}`,
      email: `celebrant_${n}@example.com`,
      username: `celebrant_${n}`,
      referralCode: `CEL${n.toUpperCase()}`.slice(0, 20),
      passwordHash: await hashPassword('Abcdef1!'),
      stateOfResidence: 'Lagos',
      emailVerifiedAt: overrides.emailVerified === false ? null : new Date(),
    },
  });
  const token = await signAccessToken(user.id, 'CELEBRANT');
  return { user, token, auth: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } };
}

export async function makeMerchant() {
  const n = uid();
  const user = await prisma.user.create({
    data: {
      role: 'MERCHANT',
      firstName: `Store ${n}`,
      lastName: '(Merchant)',
      email: `merchant_${n}@example.com`,
      username: `merchant_${n}`,
      referralCode: `MCH${n.toUpperCase()}`.slice(0, 20),
      passwordHash: await hashPassword('Abcdef1!'),
      emailVerifiedAt: new Date(),
      merchantProfile: { create: { businessName: `Store ${n}`, kybStatus: 'VERIFIED' } },
    },
  });
  const token = await signAccessToken(user.id, 'MERCHANT');
  return { user, token, auth: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } };
}

export async function makeCategory(name = `Cat ${uid()}`) {
  return prisma.category.create({
    data: { name, slug: name.toLowerCase().replace(/\s+/g, '-') },
  });
}

export async function makeProduct(merchantId: string, opts: { priceKobo?: number; stock?: number } = {}) {
  const category = await makeCategory();
  return prisma.product.create({
    data: {
      merchantId,
      categoryId: category.id,
      name: `Product ${uid()}`,
      description: 'A test product.',
      priceKobo: BigInt(opts.priceKobo ?? 25_000_00),
      status: 'ACTIVE',
      inventory: { create: { availableStock: opts.stock ?? 10 } },
      images: { create: { blobUrl: 'https://example.com/img.jpg', position: 0 } },
    },
  });
}

/** eslint no-explicit-any: test JSON bodies are untyped by design */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const body = (res: Response): Promise<any> => res.json();

export const post = (b: unknown, headers: Record<string, string>) => ({
  method: 'POST',
  headers,
  body: JSON.stringify(b),
});
