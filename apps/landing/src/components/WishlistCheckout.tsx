'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatKobo } from '@/lib/money';
import { site } from '@/lib/site';

export type WishlistItem = {
  id: string;
  productName: string;
  productImageUrl: string | null;
  unitPriceKobo: string;
  quantityWanted: number;
  quantityFulfilled: number;
  note: string | null;
};

type Breakdown = { wishlistItemId: string; productName: string; amountKobo: string };
type VirtualAccount = { accountNumber: string; bankName: string; accountName: string; expiresAt: string | null };
type CheckoutResult = { reference: string; totalKobo: string; breakdown: Breakdown[]; virtualAccount: VirtualAccount };

const api = site.apiBaseUrl;

export function WishlistCheckout({
  wishlistId,
  celebrantFirstName,
  items,
}: {
  wishlistId: string;
  celebrantFirstName: string;
  items: WishlistItem[];
}) {
  const available = items.filter((i) => i.quantityFulfilled < i.quantityWanted);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selTotal = useMemo(
    () =>
      available
        .filter((i) => selected.has(i.id))
        .reduce((sum, i) => sum + BigInt(i.unitPriceKobo), 0n),
    [available, selected],
  );
  const allTotal = useMemo(
    () => available.reduce((sum, i) => sum + BigInt(i.unitPriceKobo), 0n),
    [available],
  );

  const startCheckout = (targetIds: string[]) => {
    if (targetIds.length === 0) return;
    setIds(targetIds);
    setOpen(true);
  };

  return (
    <>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {items.map((item) => {
          const done = item.quantityFulfilled >= item.quantityWanted;
          const isSel = selected.has(item.id);
          return (
            <li
              key={item.id}
              className={`flex gap-4 rounded-2xl border bg-surface p-4 transition-colors ${
                isSel ? 'border-primary ring-1 ring-primary' : 'border-line'
              }`}
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-subtle">
                {item.productImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.productImageUrl} alt={item.productName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ink-muted">🎁</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{item.productName}</p>
                <p className="mt-0.5 text-sm text-ink-secondary">{formatKobo(item.unitPriceKobo)}</p>
                {item.note && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">“{item.note}”</p>}
                {done ? (
                  <p className="mt-2 text-xs font-semibold text-ink-muted">Gifted 🎉</p>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        isSel
                          ? 'bg-primary text-white'
                          : 'border border-primary text-primary hover:bg-primary-soft'
                      }`}
                    >
                      {isSel ? '✓ Selected' : 'Select'}
                    </button>
                    <button
                      type="button"
                      onClick={() => startCheckout([item.id])}
                      className="text-xs font-semibold text-primary underline underline-offset-2"
                    >
                      Buy now
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {available.length > 0 && (
        <div className="sticky bottom-4 z-10 mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 p-4 shadow-lg backdrop-blur">
            <span className="text-sm text-ink-secondary">
              {selected.size > 0
                ? `${selected.size} selected · ${formatKobo(selTotal.toString())}`
                : `${available.length} item${available.length === 1 ? '' : 's'} available`}
            </span>
            <div className="flex gap-2">
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => startCheckout([...selected])}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
                >
                  Buy selected · {formatKobo(selTotal.toString())}
                </button>
              )}
              <button
                type="button"
                onClick={() => startCheckout(available.map((i) => i.id))}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  selected.size > 0
                    ? 'border border-primary text-primary hover:bg-primary-soft'
                    : 'bg-primary text-white hover:bg-primary-hover'
                }`}
              >
                Buy all · {formatKobo(allTotal.toString())}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <CheckoutDialog
          wishlistId={wishlistId}
          itemIds={ids}
          items={available}
          celebrantFirstName={celebrantFirstName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Checkout dialog ───────────────────────────────────────────────────
function CheckoutDialog({
  wishlistId,
  itemIds,
  items,
  celebrantFirstName,
  onClose,
}: {
  wishlistId: string;
  itemIds: string[];
  items: WishlistItem[];
  celebrantFirstName: string;
  onClose: () => void;
}) {
  const chosen = items.filter((i) => itemIds.includes(i.id));
  const [step, setStep] = useState<'form' | 'pay' | 'done'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [anon, setAnon] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [status, setStatus] = useState<string>('PENDING');

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return setError('Enter a valid email.');
    setBusy(true);
    try {
      const res = await fetch(`${api}/v1/public/wishlists/${encodeURIComponent(wishlistId)}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          wishlistItemIds: itemIds,
          gifterName: name.trim(),
          gifterEmail: email.trim(),
          gifterPhone: phone.trim() || undefined,
          isAnonymous: anon,
          message: message.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not start the payment. Try again.');
      setResult(json.data as CheckoutResult);
      setStep('pay');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      setError(/failed to fetch|networkerror/i.test(msg) ? 'Could not reach genie. Check your connection and try again.' : msg);
    } finally {
      setBusy(false);
    }
  };

  // Poll payment status while on the "pay" step.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const poll = useCallback(async () => {
    if (!result) return;
    try {
      const r = await fetch(`${api}/v1/public/payments/${encodeURIComponent(result.reference)}`);
      const j = await r.json();
      const s = j?.data?.status as string | undefined;
      if (s) setStatus(s);
      if (s === 'COMPLETED') setStep('done');
    } catch {
      /* keep polling */
    }
  }, [result]);

  useEffect(() => {
    if (step !== 'pay') return;
    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, poll]);

  const chosenTotal = chosen.reduce((s, i) => s + BigInt(i.unitPriceKobo), 0n);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'form' && (
          <>
            <h2 className="font-display text-xl font-bold text-ink">
              Gift {chosen.length === 1 ? (chosen[0]?.productName ?? "this gift") : `${chosen.length} items`}
            </h2>
            <p className="mt-1 text-sm text-ink-secondary">
              {formatKobo(chosenTotal.toString())} total, including delivery and fees.
            </p>
            {error && <p className="mt-3 text-sm text-error">{error}</p>}
            <div className="mt-4 space-y-3">
              <Field label="Your name" value={name} onChange={setName} placeholder="Ada Obi" />
              <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@email.com" />
              <Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="0801 234 5678" />
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
                Keep it a surprise — {celebrantFirstName || 'they'} won&apos;t see it&apos;s from me until it arrives
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a message (optional)"
                rows={2}
                maxLength={280}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="mt-5 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? 'Starting…' : `Continue to payment · ${formatKobo(chosenTotal.toString())}`}
            </button>
            <button type="button" onClick={onClose} className="mt-2 w-full text-sm text-ink-muted">
              Cancel
            </button>
          </>
        )}

        {step === 'pay' && result && (
          <PayStep
            result={result}
            status={status}
            celebrantFirstName={celebrantFirstName}
            onDone={() => setStep('done')}
          />
        )}

        {step === 'done' && (
          <div className="py-6 text-center">
            <p className="text-4xl">🎁</p>
            <h2 className="mt-3 font-display text-xl font-bold text-ink">Gift on its way</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              Thank you! {celebrantFirstName || 'They'} will get{' '}
              {chosen.length === 1 ? (chosen[0]?.productName ?? "this gift") : `your ${chosen.length} gifts`}
              {anon ? ' — as a surprise' : ''}. A receipt is on the way to your email.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PayStep({
  result,
  status,
  celebrantFirstName,
  onDone,
}: {
  result: CheckoutResult;
  status: string;
  celebrantFirstName: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [simBusy, setSimBusy] = useState(false);
  const va = result.virtualAccount;
  const isMock = /mock/i.test(va.bankName);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(va.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const simulate = async () => {
    setSimBusy(true);
    try {
      await fetch(`${api}/v1/public/payments/${encodeURIComponent(result.reference)}/_simulate`, {
        method: 'POST',
      });
    } finally {
      setSimBusy(false);
    }
  };

  return (
    <>
      <h2 className="font-display text-xl font-bold text-ink">Transfer {formatKobo(result.totalKobo)}</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Send exactly this amount from your bank app. We confirm it automatically.
      </p>

      <div className="mt-4 space-y-2 rounded-2xl border border-line bg-canvas p-4 text-sm">
        <Row label="Bank" value={va.bankName} />
        <Row
          label="Account number"
          value={
            <span className="inline-flex items-center gap-2">
              <span className="font-mono text-base font-semibold text-ink">{va.accountNumber}</span>
              <button type="button" onClick={copy} className="text-xs font-semibold text-primary">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </span>
          }
        />
        <Row label="Account name" value={va.accountName} />
        <Row label="Amount" value={<span className="font-semibold">{formatKobo(result.totalKobo)}</span>} />
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-secondary">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
        {status === 'EXPIRED'
          ? 'This request expired — close and start again.'
          : `Waiting for your transfer… (${status.toLowerCase()})`}
      </div>

      {isMock && (
        <button
          type="button"
          disabled={simBusy}
          onClick={simulate}
          className="mt-4 w-full rounded-full border border-dashed border-primary px-4 py-2 text-xs font-semibold text-primary"
        >
          {simBusy ? 'Simulating…' : 'Simulate payment (test environment)'}
        </button>
      )}

      <button type="button" onClick={onDone} className="mt-4 w-full text-sm text-ink-muted">
        I&apos;ll finish this later
      </button>
      <p className="mt-3 text-center text-[11px] text-ink-muted">
        {celebrantFirstName || 'The celebrant'} only sees the gift once your transfer clears.
      </p>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}
