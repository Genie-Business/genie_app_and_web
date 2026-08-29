import type { Prisma } from '@genie/db';

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: { images: true; inventory: true; category: true };
}>;

export function toProductDto(p: ProductWithRelations) {
  const images = [...p.images].sort((a, b) => a.position - b.position);
  return {
    id: p.id,
    merchantId: p.merchantId,
    categoryId: p.categoryId,
    categoryName: p.category.name,
    name: p.name,
    description: p.description,
    priceKobo: p.priceKobo,
    currency: p.currency,
    location: p.location,
    deliveryOption: p.deliveryOption,
    status: p.status,
    images: images.map((i) => ({ id: i.id, url: i.blobUrl, position: i.position })),
    primaryImageUrl: images[0]?.blobUrl ?? null,
    availableStock: p.inventory?.availableStock ?? null,
  };
}

export function toCategoryDto(c: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageBlobUrl: string | null;
}) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: c.imageBlobUrl,
  };
}
