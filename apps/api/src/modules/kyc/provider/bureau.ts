import { logger } from '../../../lib/logger';
import { KycNotConfiguredError, type KycCheckInput, type KycCheckResult, type KycProvider } from './types';

export type BureauConfig = { baseUrl: string; apiKey: string };

/**
 * Skeleton for a real identity bureau (Dojah / Smile ID / Prembly). The BVN +
 * selfie liveness match lands when an account exists; until then every call
 * throws KycNotConfiguredError, which the KYC service turns into a PENDING
 * verification (nothing is auto-approved without a real check).
 */
export class BureauKycProvider implements KycProvider {
  readonly name = 'bureau';

  constructor(private readonly config: BureauConfig) {}

  async verifyIdentity(input: KycCheckInput): Promise<KycCheckResult> {
    if (!this.config.apiKey) throw new KycNotConfiguredError();
    // TODO(kyc): POST the BVN + selfie to the bureau's liveness/match endpoint,
    // map their confidence score to APPROVED / PENDING / REJECTED.
    logger.warn({ userId: input.userId }, 'BureauKycProvider.verifyIdentity not implemented');
    throw new KycNotConfiguredError('BureauKycProvider is not implemented yet.');
  }
}
