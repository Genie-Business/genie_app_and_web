import { z } from 'zod';

/** Standard success envelope: `{ data, meta? }`. */
export const successEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    data,
    meta: z.record(z.unknown()).optional(),
  });

/** Standard error envelope returned for every non-2xx response. */
export const errorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Field-level validation problems, keyed by dotted path. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const paginationMeta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const cuid = z.string().min(1);

/** Amounts cross the wire as integer-kobo strings (BigInt-safe JSON). */
export const koboString = z
  .string()
  .regex(/^\d+$/, 'Expected an integer number of kobo as a string');

export const isoDateTime = z.string().datetime();
