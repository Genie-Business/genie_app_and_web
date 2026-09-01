/** Integer-kobo string (or number) → `"₦1,500"` / `"₦1,500.50"`. */
export function formatKobo(kobo: string | number): string {
  const n = typeof kobo === 'number' ? BigInt(Math.round(kobo)) : BigInt(kobo || '0');
  const naira = n / 100n;
  const k = Number(n % 100n);
  const grouped = naira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return k === 0 ? `₦${grouped}` : `₦${grouped}.${k.toString().padStart(2, '0')}`;
}

/** ISO date → `"12 Aug 2026"`. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
