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

// Notifications & contact-import contracts moved to ./notifications and ./friends.
// Referral & activity contracts live in ./referrals and ./activities.
