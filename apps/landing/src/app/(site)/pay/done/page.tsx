import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PayShell } from '@/components/PayShell';
import { PaymentResult } from '@/components/PaymentResult';

export const metadata: Metadata = { title: 'Payment', robots: { index: false } };

export default function PaymentDonePage() {
  return (
    <PayShell>
      <Suspense>
        <PaymentResult />
      </Suspense>
    </PayShell>
  );
}
