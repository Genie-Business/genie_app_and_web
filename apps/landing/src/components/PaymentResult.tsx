'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Gift } from 'lucide-react';
import { site } from '@/lib/site';

const api = site.apiBaseUrl;

type Outcome = 'checking' | 'paid' | 'waiting' | 'failed' | 'unknown';

/**
 * Where Paystack sends a buyer back to. It asks the API how the payment went (a guest
 * checkout can be looked up by reference; a payment made in the app cannot, and is
 * shown a gentle pointer back to the app instead).
 */
export function PaymentResult() {
  const reference = useSearchParams().get('reference') ?? '';
  const [outcome, setOutcome] = useState<Outcome>(reference ? 'checking' : 'unknown');
  const [wishlistId, setWishlistId] = useState<string | null>(null);
  const tries = useRef(0);

  useEffect(() => {
    if (!reference) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      tries.current += 1;
      try {
        const r = await fetch(`${api}/v1/public/payments/${encodeURIComponent(reference)}`, { cache: 'no-store' });
        if (r.status === 404) {
          if (!stopped) setOutcome('unknown');
          return;
        }
        const j = await r.json();
        const status = j?.data?.status as string | undefined;
        if (j?.data?.wishlistId) setWishlistId(j.data.wishlistId as string);
        if (stopped) return;
        if (status === 'COMPLETED') return setOutcome('paid');
        if (status === 'FAILED' || status === 'EXPIRED') return setOutcome('failed');
      } catch {
        /* keep trying */
      }
      // The confirmation can lag a few seconds behind the redirect.
      if (!stopped) {
        setOutcome(tries.current > 20 ? 'waiting' : 'checking');
        if (tries.current <= 40) timer = setTimeout(check, 3000);
      }
    };
    void check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [reference]);

  const backToList = wishlistId ? (
    <Link
      href={`/w/${wishlistId}`}
      className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
    >
      Back to the wishlist
    </Link>
  ) : (
    <Link
      href="/"
      className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
    >
      Go to genie
    </Link>
  );

  return (
    <div className="mx-auto max-w-md text-center">
      {outcome === 'paid' && (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Gift on its way</h1>
          <p className="mt-3 text-ink-secondary">
            Thank you! Your payment went through and the gift is being arranged. A receipt is on its way to your email.
          </p>
          {backToList}
        </>
      )}

      {outcome === 'checking' && (
        <>
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Confirming your payment</h1>
          <p className="mt-3 text-ink-secondary">This only takes a moment. Please keep this page open.</p>
        </>
      )}

      {outcome === 'waiting' && (
        <>
          <Gift className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Still confirming</h1>
          <p className="mt-3 text-ink-secondary">
            Your bank is taking a little longer than usual. If you were charged, the gift will appear once it confirms and you will get a receipt by email. You can safely close this page.
          </p>
          {backToList}
        </>
      )}

      {outcome === 'failed' && (
        <>
          <h1 className="font-display text-2xl font-bold text-ink">That payment didn’t go through</h1>
          <p className="mt-3 text-ink-secondary">No gift was sent and you have not been charged for it. You can try again whenever you’re ready.</p>
          {backToList}
        </>
      )}

      {outcome === 'unknown' && (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Thanks</h1>
          <p className="mt-3 text-ink-secondary">
            If you paid from the genie app, head back to it to see your gift. It updates as soon as the payment is confirmed.
          </p>
          {backToList}
        </>
      )}
    </div>
  );
}
