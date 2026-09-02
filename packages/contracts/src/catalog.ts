import { z } from 'zod';
import { koboString } from './common';

export const deliveryOption = z.enum(['PICKUP', 'DELIVERY', 'BOTH']);

export const categoryDto = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

export const productImageDto = z.object({ id: z.string(), url: z.string(), position: z.number() });

export const productDto = z.object({
  id: z.string(),
  merchantId: z.string(),
  categoryId: z.string(),
  name: z.string(),
  description: z.string(),
  priceKobo: koboString,
  currency: z.string(),
  location: z.string().nullable(),
  deliveryOption,
  status: z.enum(['DRAFT', 'ACTIVE', 'DELETED']),
  images: z.array(productImageDto),
  availableStock: z.number().int().nullable(),
});

// Merchant-authored (E013)
export const createProductBody = z.object({
  categoryId: z.string(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
  priceKobo: z.number().int().positive().max(1_000_000_000), // ≤ ₦10,000,000
  location: z.string().trim().max(160).optional(),
  deliveryOption: deliveryOption.default('BOTH'),
  quantity: z.number().int().min(0).max(1_000_000).default(0),
  imageUrls: z.array(z.string().url().startsWith('https://').max(2048)).max(8).default([]),
});
export type CreateProductBody = z.infer<typeof createProductBody>;

export const updateProductBody = createProductBody.partial();
export type UpdateProductBody = z.infer<typeof updateProductBody>;

export const setInventoryBody = z.object({ availableStock: z.number().int().min(0) });

export const requestCategoryBody = z.object({
  name: z.string().trim().min(1).max(80),
  note: z.string().trim().max(500).optional(),
});
