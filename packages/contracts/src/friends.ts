import { z } from 'zod';

// ── Friends (E007) ──────────────────────────────────────────────────────

export const sendFriendRequestBody = z
  .object({
    username: z.string().trim().min(1).max(30).optional(),
    userId: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.username || v.userId, { message: 'Provide a username or a userId.' });
export type SendFriendRequestBody = z.infer<typeof sendFriendRequestBody>;

export const friendDto = z.object({
  userId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  username: z.string(),
  since: z.string(),
});

export const friendRequestDto = z.object({
  id: z.string(),
  direction: z.enum(['incoming', 'outgoing']),
  user: z.object({
    userId: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    username: z.string(),
  }),
  createdAt: z.string(),
});

export const blockedUserDto = z.object({
  userId: z.string(),
  username: z.string(),
  since: z.string(),
});

export const importContactsBody = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().trim().max(140).optional(),
        phone: z.string().trim().min(4).max(24),
      }),
    )
    .min(1)
    .max(2000),
});
export type ImportContactsBody = z.infer<typeof importContactsBody>;

export const contactMatchDto = z.object({
  userId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  username: z.string(),
  contactName: z.string().nullable(),
  friendStatus: z.enum(['none', 'friends', 'request_sent', 'request_received', 'blocked']),
});
