import { createHash } from 'node:crypto';

/**
 * Best-effort normalisation to E.164 for Nigerian numbers (the only market in
 * v1). Accepts `0803…`, `803…`, `+234803…`, `234803…`, with spaces / dashes /
 * parens. Returns `+234XXXXXXXXXX` or `null` when it clearly isn't an NG mobile
 * number. Non-NG `+` numbers are passed through if they look plausible.
 */
export function normalizePhoneNG(raw: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/[\s()\-.]/g, '');
  if (s.startsWith('+')) {
    if (s.startsWith('+234')) s = '0' + s.slice(4);
    else return /^\+\d{8,15}$/.test(s) ? s : null; // some other country — keep as-is
  }
  if (s.startsWith('234')) s = '0' + s.slice(3);
  if (/^\d{10}$/.test(s)) s = '0' + s; // bare 10-digit (missing leading 0)
  if (!/^0\d{10}$/.test(s)) return null;
  return '+234' + s.slice(1);
}

/**
 * Stable, non-reversible hash of a normalised phone number for privacy-preserving
 * contact matching. `pepper` should be a server secret so the hashes aren't a
 * rainbow-table target. Returns null for an unparseable number.
 */
export function hashPhone(raw: string, pepper: string): string | null {
  const e164 = normalizePhoneNG(raw);
  if (!e164) return null;
  return createHash('sha256').update(`${pepper}:${e164}`).digest('hex');
}
