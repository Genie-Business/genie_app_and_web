import { getEnv } from '../../../env';
import { MockPaymentProvider } from './mock';
import { PaystackPaymentProvider } from './paystack';
import type { PaymentProvider } from './types';

let instance: PaymentProvider | null = null;

/** Resolve the configured payment provider (singleton per process). */
export function getPaymentProvider(): PaymentProvider {
  if (instance) return instance;
  const env = getEnv();
  instance =
    env.PAYMENTS_PROVIDER === 'paystack'
      ? new PaystackPaymentProvider({ baseUrl: env.PAYSTACK_BASE_URL, secretKey: env.PAYSTACK_SECRET_KEY })
      : new MockPaymentProvider();
  return instance;
}

/** Test helper: force a specific provider instance. */
export function __setPaymentProvider(p: PaymentProvider | null) {
  instance = p;
}

export { MockPaymentProvider, PaystackPaymentProvider };
export * from './types';
