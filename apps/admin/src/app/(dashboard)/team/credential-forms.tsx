'use client';

import { useActionState } from 'react';
import { createAdmin, resetAdminPassword, type CredentialResult } from './actions';

function Result({ state }: { state: CredentialResult }) {
  if (!state) return null;
  if (!state.ok) return <p className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error-fg">{state.error}</p>;
  return (
    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <div>
        <span className="text-emerald-700">{state.email}</span> — temporary password:
      </div>
      <code className="mt-1 block select-all break-all rounded bg-white px-2 py-1.5 font-mono text-sm">{state.password}</code>
      <div className="mt-1 text-xs text-emerald-800">{state.note} It won’t be shown again.</div>
    </div>
  );
}

export function CreateAdminForm({ roles }: { roles: Array<[value: string, label: string]> }) {
  const [state, action, pending] = useActionState(createAdmin, null);
  return (
    <form action={action}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <label className="block">
          <span className="text-xs font-medium text-ink-secondary">Name</span>
          <input name="name" required maxLength={80} className="input mt-1" placeholder="Ada Obi" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-secondary">Work email</span>
          <input name="email" type="email" required className="input mt-1" placeholder="ada@genieapps.co" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-secondary">Role</span>
          <select name="role" required defaultValue="" className="input mt-1">
            <option value="" disabled>
              Choose…
            </option>
            {roles.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" disabled={pending}>
          {pending ? 'Creating…' : 'Create admin'}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resetAdminPassword, null);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg border border-[var(--genie-border-strong)] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:bg-[var(--genie-bg-subtle)] disabled:opacity-60"
      >
        {pending ? 'Resetting…' : 'Reset password'}
      </button>
      {state && (
        <div className="mt-2 max-w-xs text-left">
          <Result state={state} />
        </div>
      )}
    </form>
  );
}
