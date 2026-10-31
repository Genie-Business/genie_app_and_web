import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MockCheckout } from '@/components/MockCheckout';
import { PayShell } from '@/components/PayShell';

export const metadata: Metadata = { title: 'Test checkout', robots: { index: false } };

export default function MockCheckoutPage() {
  return (
    <PayShell>
      <Suspense>
        <MockCheckout />
      </Suspense>
    </PayShell>
  );
}
