import { prisma, type KycVerification } from '@genie/db';
import type { kyc as K } from '@genie/contracts';
import { badRequest } from '../../lib/errors';
import { uploadBlob } from '../../lib/blob';
import { logger } from '../../lib/logger';
import { recordActivity } from '../activities/activities.service';
import { notify } from '../notifications/notify.service';
import { getKycProvider, KycNotConfiguredError } from './provider';

export const MAX_KYC_FILE_BYTES = 8 * 1024 * 1024;

function toDto(row: KycVerification | null): K.KycStatusDto {
  return {
    level: 'LEVEL_1',
    status: (row?.status ?? 'NONE') as K.KycStatusDto['status'],
    idDocType: (row?.idDocType ?? null) as K.KycStatusDto['idDocType'],
    bvnLast4: row?.bvnLast4 ?? null,
    hasSelfie: row?.selfieBlobUrl != null,
    hasIdDoc: row?.idDocBlobUrl != null,
    rejectionReason: row?.rejectionReason ?? null,
    submittedAt: row?.createdAt.toISOString() ?? null,
    reviewedAt: row?.reviewedAt?.toISOString() ?? null,
  };
}

export async function getMyKyc(userId: string): Promise<K.KycStatusDto> {
  const row = await prisma.kycVerification.findUnique({
    where: { userId_level: { userId, level: 'LEVEL_1' } },
  });
  return toDto(row);
}

export function kycRequirements(): K.KycRequirementsDto {
  return {
    level: 'LEVEL_1',
    unlocks: ['Higher wallet limits', 'Faster merchant settlement', 'Sending gifts above the starter cap'],
    requires: [
      { field: 'selfie', label: 'A clear selfie', type: 'file' },
      { field: 'idDoc', label: 'Photo of a government ID', type: 'file' },
      { field: 'idDocType', label: 'Which ID is it?', type: 'select' },
      { field: 'bvn', label: 'Bank Verification Number (optional but speeds things up)', type: 'text' },
    ],
    acceptedIdDocs: ['NIN', 'DRIVERS_LICENSE', 'PASSPORT', 'VOTERS_CARD'],
    maxFileBytes: MAX_KYC_FILE_BYTES,
  };
}

type SubmitFile = { bytes: Uint8Array; contentType: string };

export async function submitLevel1(
  userId: string,
  fields: K.KycLevel1Fields,
  files: { selfie: SubmitFile; idDoc: SubmitFile },
): Promise<K.KycStatusDto> {
  const existing = await prisma.kycVerification.findUnique({
    where: { userId_level: { userId, level: 'LEVEL_1' } },
  });
  if (existing?.status === 'APPROVED') {
    throw badRequest('Your identity is already verified.');
  }
  if (existing?.status === 'PENDING' && existing.selfieBlobUrl) {
    throw badRequest('You have a submission under review. Please wait for the result.');
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { firstName: true, lastName: true, dateOfBirth: true },
  });

  const stamp = Date.now();
  const [selfie, idDoc] = await Promise.all([
    uploadBlob(`kyc/${userId}/selfie-${stamp}`, files.selfie.bytes, files.selfie.contentType),
    uploadBlob(`kyc/${userId}/iddoc-${stamp}`, files.idDoc.bytes, files.idDoc.contentType),
  ]);

  const row = await prisma.kycVerification.upsert({
    where: { userId_level: { userId, level: 'LEVEL_1' } },
    create: {
      userId,
      level: 'LEVEL_1',
      status: 'PENDING',
      selfieBlobUrl: selfie.url,
      idDocType: fields.idDocType,
      idDocBlobUrl: idDoc.url,
      bvnLast4: fields.bvn?.slice(-4),
      rejectionReason: null,
    },
    update: {
      status: 'PENDING',
      selfieBlobUrl: selfie.url,
      idDocType: fields.idDocType,
      idDocBlobUrl: idDoc.url,
      bvnLast4: fields.bvn?.slice(-4),
      rejectionReason: null,
      reviewedAt: null,
      providerRef: null,
    },
  });

  let result;
  try {
    result = await getKycProvider().verifyIdentity({
      userId,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
      idDocType: fields.idDocType,
      idDocNumber: fields.idDocNumber,
      bvn: fields.bvn,
      selfieUrl: selfie.url,
      idDocUrl: idDoc.url,
    });
  } catch (err) {
    if (!(err instanceof KycNotConfiguredError)) throw err;
    // No bureau configured — leave it PENDING for an admin to review manually.
    logger.warn({ userId }, 'KYC provider not configured — submission left PENDING');
    result = { status: 'PENDING' as const, providerRef: null, reason: undefined };
  }

  const terminal = result.status === 'APPROVED' || result.status === 'REJECTED';
  const final = await prisma.kycVerification.update({
    where: { id: row.id },
    data: {
      status: result.status,
      providerRef: result.providerRef ?? undefined,
      rejectionReason: result.status === 'REJECTED' ? result.reason ?? 'Verification failed.' : null,
      reviewedAt: terminal ? new Date() : null,
    },
  });

  await recordActivity({
    userId,
    category: 'ACCOUNT',
    action: `kyc.${result.status.toLowerCase()}`,
    entityType: 'KycVerification',
    entityId: final.id,
  });
  await notify({
    userId,
    type: `kyc.${result.status.toLowerCase()}`,
    title:
      result.status === 'APPROVED'
        ? 'Identity verified ✅'
        : result.status === 'REJECTED'
          ? 'Identity check failed'
          : 'Identity check under review',
    body:
      result.status === 'APPROVED'
        ? 'Your Level 1 verification is complete.'
        : result.status === 'REJECTED'
          ? (result.reason ?? 'We could not verify your details. You can submit again.')
          : "We're reviewing your documents — this usually takes a few minutes.",
    category: 'SYSTEM',
    payload: { level: 'LEVEL_1' },
  });

  return toDto(final);
}
