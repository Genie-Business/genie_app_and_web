import { z } from 'zod';

// ── Instant messaging (E007) — 1:1 DMs between friends ────────────────

export const startThreadBody = z
  .object({
    username: z.string().trim().min(1).max(30).optional(),
    userId: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.username || v.userId, { message: 'Provide a username or a userId.' });
export type StartThreadBody = z.infer<typeof startThreadBody>;

export const sendMessageBody = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type SendMessageBody = z.infer<typeof sendMessageBody>;

export const messageThreadListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const messageThreadDtoQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const messageDto = z.object({
  id: z.string(),
  mine: z.boolean(),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
});

export const threadSummaryDto = z.object({
  id: z.string(),
  withUser: z.object({
    userId: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    username: z.string(),
  }),
  lastMessage: z.string().nullable(),
  lastMessageAt: z.string(),
  unreadCount: z.number().int(),
});
export type ThreadSummaryDto = z.infer<typeof threadSummaryDto>;

export const threadDetailDto = threadSummaryDto.extend({
  messages: z.array(messageDto),
});
export type ThreadDetailDto = z.infer<typeof threadDetailDto>;
