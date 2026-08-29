'use client';

import { type FormEvent, useState } from 'react';

type State = { status: 'idle' | 'loading' | 'ok' | 'error'; message?: string };

export function WaitlistForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'give' | 'sell'>('give');
  const [state, setState] = useState<State>({ status: 'idle' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, source: role === 'sell' ? 'merchant' : 'celebrant' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Something went wrong.');
      setState({ status: 'ok', message: body?.data?.message ?? "You're on the list!" });
      setEmail('');
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message });
    }
  }

  if (state.status === 'ok') {
    return (
      <p className="rounded-2xl bg-[var(--genie-primary-soft)] px-5 py-4 text-sm font-medium text-[var(--genie-text-brand,inherit)]">
        🎉 {state.message}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="w-full">
      {!compact && (
        <div className="mb-3 inline-flex rounded-full border border-[var(--genie-border)] p-1 text-sm">
          {(['give', 'sell'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                role === r ? 'bg-[var(--genie-primary-solid)] text-white' : 'text-ink-secondary'
              }`}
            >
              {r === 'give' ? 'I want to give' : 'I want to sell'}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input-genie"
        />
        <button type="submit" disabled={state.status === 'loading'} className="btn-primary shrink-0">
          {state.status === 'loading' ? 'Joining…' : 'Join the waitlist'}
        </button>
      </div>
      {state.status === 'error' && (
        <p className="mt-2 text-sm text-error-fg">{state.message}</p>
      )}
    </form>
  );
}
