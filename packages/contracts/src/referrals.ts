import { z } from 'zod';
import { koboString } from './common';

// ── Referrals (E011 / onboarding) ──────────────────────────────────────

export const refereeStatus = z.enum(['PENDING', 'SIGNED_UP', 'REWARDED']);

export const refereeDto = z.object({
  firstName: z.string(),
  username: z.string(),
  status: refereeStatus,
  rewardKobo: koboString,
  joinedAt: z.string(),
});

export const referralSummaryDto = z.object({
  code: z.string(),
  link: z.string(),
  totalReferred: z.number().int(),
  signedUp: z.number().int(),
  rewarded: z.number().int(),
  totalEarnedKobo: koboString,
  /** What you'd earn if every not-yet-rewarded referee converts. */
  pendingRewardKobo: koboString,
  rewardPerReferralKobo: koboString,
  referees: z.array(refereeDto),
});
