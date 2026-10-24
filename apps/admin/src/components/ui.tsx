import Link from 'next/link';
import { titleCase } from '@/lib/format';

export function Forbidden() {
  return (
    <div className="card text-sm text-error-fg">
      Your role doesn&apos;t have access to this section. Ask a super admin if you need it.
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-ink-muted">{children}</h2>;
}

export function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-sm text-ink-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block transition-shadow hover:shadow-md">
      {body}
    </Link>
  ) : (
    <div className="card">{body}</div>
  );
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';
const TONE: Record<Tone, string> = {
  neutral: 'bg-[var(--genie-bg-subtle)] text-ink-secondary',
  good: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-[var(--genie-accent-soft)] text-amber-700',
  bad: 'bg-red-50 text-red-700',
  info: 'bg-[var(--genie-primary-soft)] text-[var(--genie-primary-solid)]',
};

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'good', APPROVED: 'good', VERIFIED: 'good', PAID: 'good', COMPLETED: 'good', DELIVERED: 'good', REVEALED: 'good',
  RESOLVED: 'good', REWARDED: 'good', ACCEPTED: 'good',
  PENDING: 'warn', NEW: 'warn', IN_REVIEW: 'warn', PROCESSING: 'warn', PENDING_PAYMENT: 'warn', OPEN: 'warn',
  FULFILLING: 'info', DISPATCHED: 'info', IN_TRANSIT: 'info', DRAFT: 'info', SIGNED_UP: 'info', EXPIRED: 'neutral',
  REJECTED: 'bad', FAILED: 'bad', CANCELLED: 'neutral', DELETED: 'neutral', CLOSED: 'neutral', BLOCKED: 'bad', FROZEN: 'bad',
};

export function Pill({ tone, children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[tone ?? 'neutral']}`}>
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={STATUS_TONE[status] ?? 'neutral'}>{titleCase(status)}</Pill>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card text-sm text-ink-muted">{children}</div>;
}

/** Bordered, horizontally scrollable table shell. Pass <thead>/<tbody> rows built with Th/Td. */
export function Table({ children, min = 720 }: { children: React.ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--genie-border)] bg-[var(--genie-bg-surface)]">
      <table className="w-full text-left text-sm" style={{ minWidth: min }}>
        {children}
      </table>
    </div>
  );
}
export const Thead = ({ children }: { children: React.ReactNode }) => (
  <thead className="border-b border-[var(--genie-border)] text-xs uppercase tracking-wide text-ink-muted">
    <tr>{children}</tr>
  </thead>
);
export const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={`px-4 py-3 font-semibold ${right ? 'text-right' : ''}`}>{children}</th>
);
export const Tr = ({ children }: { children: React.ReactNode }) => (
  <tr className="border-b border-[var(--genie-border)] last:border-0">{children}</tr>
);
export const Td = ({ children, right, muted }: { children?: React.ReactNode; right?: boolean; muted?: boolean }) => (
  <td className={`px-4 py-3 align-top ${right ? 'text-right' : ''} ${muted ? 'text-ink-muted' : ''}`}>{children}</td>
);

export function Person({ name, sub }: { name: string; sub?: string | null }) {
  return (
    <>
      <div className="font-medium">{name}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
    </>
  );
}

export const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-medium text-[var(--genie-primary-solid)] hover:underline">
    {children}
  </Link>
);

/** A GET form: search box + optional selects. Re-submits to the same page with ?q=&status=… */
export function FilterBar({
  q,
  placeholder = 'Search…',
  selects = [],
  hidden = {},
}: {
  q: string;
  placeholder?: string;
  selects?: Array<{ name: string; value: string; label: string; options: Array<[value: string, label: string]> }>;
  /** Params to carry through the submit untouched (e.g. the active tab). */
  hidden?: Record<string, string>;
}) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input name="q" defaultValue={q} placeholder={placeholder} className="input max-w-xs" />
      {selects.map((s) => (
        <select key={s.name} name={s.name} defaultValue={s.value} aria-label={s.label} className="input w-auto">
          <option value="">{s.label}</option>
          {s.options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ))}
      <button className="btn">Filter</button>
    </form>
  );
}

/** Prev/next links that keep the other query params. */
export function Pager({
  base,
  params,
  page,
  total,
  pageSize,
}: {
  base: string;
  params: Record<string, string>;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
      <span>
        {total.toLocaleString('en-NG')} result{total === 1 ? '' : 's'} · page {Math.min(page, pages)} of {pages}
      </span>
      <span className="flex gap-3">
        {page > 1 && <Link href={href(page - 1)} className="font-medium text-[var(--genie-primary-solid)] hover:underline">← Previous</Link>}
        {page < pages && <Link href={href(page + 1)} className="font-medium text-[var(--genie-primary-solid)] hover:underline">Next →</Link>}
      </span>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export const ghostBtn =
  'inline-flex items-center justify-center rounded-lg border border-[var(--genie-border-strong)] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:bg-[var(--genie-bg-subtle)]';
export const dangerBtn =
  'inline-flex items-center justify-center rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-error-fg transition-colors hover:bg-red-50';

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'good' | 'bad'; children: React.ReactNode }) {
  const cls =
    tone === 'good' ? 'bg-emerald-50 text-emerald-800' : tone === 'bad' ? 'bg-error-bg text-error-fg' : 'bg-[var(--genie-primary-soft)] text-[var(--genie-primary-solid)]';
  return <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
