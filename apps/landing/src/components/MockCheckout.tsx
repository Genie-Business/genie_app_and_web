'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { site } from '@/lib/site';

const api = site.apiBaseUrl;

/**
 * The stand-in for Paystack's checkout page while genie runs on the mock payment provider.
 * No money moves. It exists so the whole buying journey can be walked through before a
 * real Paystack account is connected; the API refuses to simulate a payment once a real
 * provider is configured, so this page cannot be used to get a free gift in production.
 */
export function MockCheckout() {
  const reference = useSearchParams().get('reference') ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${api}/v1/public/payments/${encodeURIComponent(reference)}/_simulate`, { method: 'POST' });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error?.message ?? 'Could not complete the test payment.');
      }
      window.location.assign(`/pay/done?reference=${encodeURIComponent(reference)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  if (!reference) return <p className="text-center text-ink-secondary">This link is missing its payment reference.</p>;

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-dashed border-primary bg-primary-soft p-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Test checkout</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">No real money moves here</h1>
      <p className="mt-3 text-sm text-ink-secondary">
        genie is running without a live payment account, so this stands in for the secure payment page. Complete it to see how the journey ends.
      </p>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={pay}
        className="mt-6 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? 'Completing…' : 'Complete test payment'}
      </button>
    </div>
  );
}
