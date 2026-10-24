export function formatKobo(kobo: bigint | number | null | undefined): string {
  if (kobo == null) return '—';
  return `₦${(Number(kobo) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}

/** Compact naira for stat tiles: ₦1.2M, ₦45K. */
export function formatKoboCompact(kobo: bigint | number | null | undefined): string {
  if (kobo == null) return '—';
  const n = Number(kobo) / 100;
  if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 10_000) return `₦${(n / 1000).toFixed(0)}K`;
  return `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

export const fmtDate = (d: Date | null | undefined): string => (d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export const fmtDateTime = (d: Date | null | undefined): string =>
  d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const fullName = (u: { firstName: string; lastName: string }): string => `${u.firstName} ${u.lastName}`.trim();

export const titleCase = (s: string): string => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const PAGE_SIZE = 25;

/** Parse `?page=` (1-based) into skip/take + the clamped page number. */
export function pageArgs(raw: string | undefined): { page: number; skip: number; take: number } {
  const page = Math.max(1, Math.trunc(Number(raw) || 1));
  return { page, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

/** First value of a search param (Next gives string | string[] | undefined). */
export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim();

export function koboFromNaira(v: FormDataEntryValue | null): bigint {
  const n = Math.round(Number(String(v ?? '0').replace(/,/g, '')) * 100);
  return BigInt(Number.isFinite(n) && n > 0 ? n : 0);
}
