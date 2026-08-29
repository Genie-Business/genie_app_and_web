import { prisma } from '@genie/db';
import type { catalog as C } from '@genie/contracts';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';

type CreateProduct = C.CreateProductBody;
type UpdateProduct = Partial<CreateProduct>;

const INCLUDE = { images: true, inventory: true, category: true } as const;

async function assertCategory(categoryId: string) {
  const cat = await prisma.category.findFirst({ where: { id: categoryId, isActive: true } });
  if (!cat) throw badRequest('That category does not exist. Request it to be added first.');
}

export async function createProduct(merchantId: string, input: CreateProduct) {
  await assertCategory(input.categoryId);
  const product = await prisma.product.create({
    data: {
      merchantId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      priceKobo: BigInt(input.priceKobo),
      location: input.location,
      deliveryOption: input.deliveryOption,
      status: 'ACTIVE',
      images: {
        create: (input.imageUrls ?? []).map((url, position) => ({ blobUrl: url, position })),
      },
      inventory: { create: { availableStock: input.quantity ?? 0 } },
    },
    include: INCLUDE,
  });
  logger.info({ merchantId, productId: product.id }, 'product created');
  return product;
}

async function ownedProduct(merchantId: string, id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: INCLUDE });
  if (!product || product.status === 'DELETED') throw notFound('Product not found.');
  if (product.merchantId !== merchantId) throw forbidden('This product belongs to another merchant.');
  return product;
}

export async function updateProduct(merchantId: string, id: string, input: UpdateProduct) {
  await ownedProduct(merchantId, id);
  if (input.categoryId) await assertCategory(input.categoryId);

  const product = await prisma.$transaction(async (tx) => {
    if (input.imageUrls) {
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.productImage.createMany({
        data: input.imageUrls.map((url, position) => ({ productId: id, blobUrl: url, position })),
      });
    }
    if (input.quantity != null) {
      await tx.inventory.upsert({
        where: { productId: id },
        create: { productId: id, availableStock: input.quantity },
        update: { availableStock: input.quantity },
      });
    }
    return tx.product.update({
      where: { id },
      data: {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        priceKobo: input.priceKobo != null ? BigInt(input.priceKobo) : undefined,
        location: input.location,
        deliveryOption: input.deliveryOption,
      },
      include: INCLUDE,
    });
  });
  return product;
}

export async function deleteProduct(merchantId: string, id: string) {
  await ownedProduct(merchantId, id);
  await prisma.product.update({ where: { id }, data: { status: 'DELETED' } });
}

export async function listProducts(merchantId: string) {
  return prisma.product.findMany({
    where: { merchantId, status: { not: 'DELETED' } },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

export async function setInventory(merchantId: string, id: string, availableStock: number) {
  await ownedProduct(merchantId, id);
  const inv = await prisma.inventory.upsert({
    where: { productId: id },
    create: { productId: id, availableStock },
    update: { availableStock },
  });
  return inv;
}
