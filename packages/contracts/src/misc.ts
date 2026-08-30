import { z } from 'zod';

export const waitlistSignupBody = z.object({
  email: z.string().email(),
  source: z.string().max(60).optional(),
  referrer: z.string().max(200).optional(),
});

// Domain contracts now live in their own files:
//   ./friends ./notifications ./referrals ./activities ./kyc ./settings ./support
