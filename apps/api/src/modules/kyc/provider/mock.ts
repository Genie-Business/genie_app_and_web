import { makeReference } from '@genie/core';
import { logger } from '../../../lib/logger';
import type { KycCheckInput, KycCheckResult, KycProvider } from './types';

/**
 * Deterministic identity check for local dev / tests.
 *   - BVN ending `0000`  → REJECTED
 *   - BVN ending `9999`  → PENDING (manual review)
 *   - otherwise          → APPROVED
 * A missing selfie or ID doc is always REJECTED.
 */
export class MockKycProvider implements KycProvider {
  readonly name = 'mock';

  async verifyIdentity(input: KycCheckInput): Promise<KycCheckResult> {
    const providerRef = makeReference('MOCKKYC');
    if (!input.selfieUrl || !input.idDocUrl) {
      return { status: 'REJECTED', providerRef, reason: 'A clear selfie and ID document are both required.' };
    }
    if (input.bvn?.endsWith('0000')) {
      return { status: 'REJECTED', providerRef, reason: 'Your BVN details could not be matched. Please check and retry.' };
    }
    const status = input.bvn?.endsWith('9999') ? 'PENDING' : 'APPROVED';
    logger.info({ userId: input.userId, status }, '🪪 [mock KYC]');
    return { status, providerRef };
  }
}
