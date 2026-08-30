import { z } from 'zod';

// ── Notifications (E010) ────────────────────────────────────────────────

export const notificationCategory = z.enum(['GIFT', 'EVENT', 'FRIEND', 'PAYMENT', 'SYSTEM']);
export type NotificationCategory = z.infer<typeof notificationCategory>;

export const notificationDto = z.object({
  id: z.string(),
  category: notificationCategory,
  type: z.string(),
  title: z.string(),
  body: z.string(),
  payload: z.record(z.unknown()).nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});

export const notificationListQuery = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  category: notificationCategory.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const markReadBody = z
  .object({
    ids: z.array(z.string()).max(500).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all || (v.ids && v.ids.length > 0), {
    message: 'Provide `ids` or `all: true`.',
  });
export type MarkReadBody = z.infer<typeof markReadBody>;

export const registerDeviceBody = z.object({
  fcmToken: z.string().trim().min(10).max(4096),
  platform: z.enum(['IOS', 'ANDROID']),
});
export type RegisterDeviceBody = z.infer<typeof registerDeviceBody>;

export const notificationPreferenceDto = z.object({
  category: notificationCategory,
  push: z.boolean(),
  email: z.boolean(),
  inApp: z.literal(true),
});

export const updatePreferencesBody = z.object({
  preferences: z
    .array(
      z.object({
        category: notificationCategory,
        push: z.boolean().optional(),
        email: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(5),
});
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesBody>;
