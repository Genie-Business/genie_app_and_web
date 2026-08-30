import { getEnv } from '../../../env';
import { BureauKycProvider } from './bureau';
import { MockKycProvider } from './mock';
import type { KycProvider } from './types';

export * from './types';
export { MockKycProvider } from './mock';
export { BureauKycProvider } from './bureau';

let override: KycProvider | null = null;
let cached: KycProvider | null = null;

/** Test hook. */
export function __setKycProvider(provider: KycProvider | null): void {
  override = provider;
  cached = null;
}

export function getKycProvider(): KycProvider {
  if (override) return override;
  if (cached) return cached;
  const env = getEnv();
  cached =
    env.KYC_PROVIDER === 'bureau'
      ? new BureauKycProvider({ baseUrl: env.KYC_BASE_URL, apiKey: env.KYC_API_KEY })
      : new MockKycProvider();
  return cached;
}
