import { getEnv } from '../../../env';
import { AnchorPaymentProvider } from './anchor';
import { MockPaymentProvider } from './mock';
import type { PaymentProvider } from './types';

let instance: PaymentProvider | null = null;

/** Resolve the configured payment provider (singleton per process). */
export function getPaymentProvider(): PaymentProvider {
  if (instance) return instance;
  const env = getEnv();
  instance =
    env.PAYMENTS_PROVIDER === 'anchor'
      ? new AnchorPaymentProvider({
          baseUrl: env.ANCHOR_BASE_URL,
          apiKey: env.ANCHOR_KEY,
          webhookSecret: env.ANCHOR_WEBHOOK_SECRET,
        })
      : new MockPaymentProvider();
  return instance;
}

/** Test helper — force a specific provider instance. */
export function __setPaymentProvider(p: PaymentProvider | null) {
  instance = p;
}

export { MockPaymentProvider, AnchorPaymentProvider };
export * from './types';
