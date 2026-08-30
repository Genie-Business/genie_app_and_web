import { z } from 'zod';

// ── KYC — Level 1 identity verification (E002) ──────────────────────────

export const idDocType = z.enum(['NIN', 'DRIVERS_LICENSE', 'PASSPORT', 'VOTERS_CARD']);
export type IdDocType = z.infer<typeof idDocType>;

/**
 * The non-file fields of the Level 1 submission. `selfie` and `idDoc` are
 * `multipart/form-data` file parts, validated in the route handler.
 */
export const kycLevel1Fields = z.object({
  idDocType,
  idDocNumber: z.string().trim().min(3).max(40).optional(),
  bvn: z.string().regex(/^\d{11}$/, 'A BVN is 11 digits.').optional(),
});
export type KycLevel1Fields = z.infer<typeof kycLevel1Fields>;

export const kycStatusValue = z.enum(['NONE', 'PENDING', 'APPROVED', 'REJECTED']);
export type KycStatusValue = z.infer<typeof kycStatusValue>;

export const kycStatusDto = z.object({
  level: z.literal('LEVEL_1'),
  status: kycStatusValue,
  idDocType: idDocType.nullable(),
  bvnLast4: z.string().nullable(),
  hasSelfie: z.boolean(),
  hasIdDoc: z.boolean(),
  rejectionReason: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
});
export type KycStatusDto = z.infer<typeof kycStatusDto>;

export const kycRequirementsDto = z.object({
  level: z.literal('LEVEL_1'),
  unlocks: z.array(z.string()),
  requires: z.array(
    z.object({ field: z.string(), label: z.string(), type: z.enum(['file', 'text', 'select']) }),
  ),
  acceptedIdDocs: z.array(idDocType),
  maxFileBytes: z.number().int(),
});
export type KycRequirementsDto = z.infer<typeof kycRequirementsDto>;
