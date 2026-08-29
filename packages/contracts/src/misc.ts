import { z } from 'zod';

export const waitlistSignupBody = z.object({
  email: z.string().email(),
  source: z.string().max(60).optional(),
  referrer: z.string().max(200).optional(),
});

export const kycLevel1Body = z.object({
  idDocType: z.enum(['NIN', 'DRIVERS_LICENSE', 'PASSPORT', 'VOTERS_CARD']),
  bvn: z.string().regex(/^\d{11}$/).optional(),
  // selfie + idDoc are multipart file parts, validated in the route
});

export const supportMessageBody = z.object({
  subject: z.string().trim().max(140).optional(),
  message: z.string().trim().min(1).max(4000),
});

export const referralInfoDto = z.object({
  code: z.string(),
  totalReferred: z.number().int(),
  rewardedCount: z.number().int(),
  pendingRewardKobo: z.string(),
});

export const notificationDto = z.object({
  id: z.string(),
  channel: z.enum(['PUSH', 'EMAIL', 'IN_APP']),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
});

export const importContactsBody = z.object({
  contacts: z
    .array(z.object({ name: z.string().max(140).optional(), phone: z.string().min(4).max(20) }))
    .max(2000),
});
