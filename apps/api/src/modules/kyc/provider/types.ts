/**
 * Identity-verification abstraction (E002). genie stores its own
 * `KycVerification` row regardless; a KycProvider is the bridge to a real
 * identity bureau (Smile ID, Dojah, Prembly, VerifyMe …).
 *
 *   - MockKycProvider — deterministic, approves unless the BVN ends `0000`.
 *   - <bureau>KycProvider — real HTTP calls (throws until KYC_PROVIDER is set).
 */
import type { kyc as K } from '@genie/contracts';

export type KycCheckInput = {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  idDocType: K.IdDocType;
  idDocNumber?: string;
  bvn?: string;
  selfieUrl: string;
  idDocUrl: string;
};

export type KycCheckResult = {
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  providerRef: string;
  reason?: string;
};

export interface KycProvider {
  readonly name: string;
  verifyIdentity(input: KycCheckInput): Promise<KycCheckResult>;
}

export class KycNotConfiguredError extends Error {
  constructor(message = 'KYC_PROVIDER is set to a real bureau but its credentials are missing.') {
    super(message);
    this.name = 'KycNotConfiguredError';
  }
}
