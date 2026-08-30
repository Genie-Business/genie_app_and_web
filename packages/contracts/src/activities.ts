import { z } from 'zod';

// ── Activity feed (E009) ───────────────────────────────────────────────

export const activityCategory = z.enum(['APP', 'EVENT', 'TRANSACTION', 'ACCOUNT']);
export type ActivityCategory = z.infer<typeof activityCategory>;

export const activityListQuery = z.object({
  category: activityCategory.optional(),
  /** Prefix match on the dotted action, e.g. `gift` or `event.created`. */
  action: z.string().trim().max(60).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
export type ActivityListQuery = z.infer<typeof activityListQuery>;

export const activityDto = z.object({
  id: z.string(),
  category: activityCategory,
  action: z.string(),
  title: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});
