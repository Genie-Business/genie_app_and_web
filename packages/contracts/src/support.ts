import { z } from 'zod';

// ── Support — "Talk to us" (E011) ──────────────────────────────────────

export const createSupportThreadBody = z.object({
  subject: z.string().trim().min(1).max(140).optional(),
  message: z.string().trim().min(1).max(4000),
});
export type CreateSupportThreadBody = z.infer<typeof createSupportThreadBody>;

export const supportMessageBody = z.object({
  message: z.string().trim().min(1).max(4000),
});
export type SupportMessageBody = z.infer<typeof supportMessageBody>;

export const supportMessageDto = z.object({
  id: z.string(),
  from: z.enum(['USER', 'AGENT']),
  body: z.string(),
  createdAt: z.string(),
});

export const supportThreadDto = z.object({
  id: z.string(),
  subject: z.string().nullable(),
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']),
  messageCount: z.number().int(),
  lastMessageAt: z.string(),
  createdAt: z.string(),
  messages: z.array(supportMessageDto).optional(),
});
export type SupportThreadDto = z.infer<typeof supportThreadDto>;
