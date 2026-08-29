import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I,L,O,U)

/** Short, URL-safe, uppercase random token (e.g. for referral / invite codes). */
export function randomCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** A human-friendly, sortable-ish reference: `<PREFIX>-<yymmdd>-<rand6>`. */
export function makeReference(prefix: string): string {
  const d = new Date();
  const ymd =
    d.getUTCFullYear().toString().slice(2) +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
  return `${prefix.toUpperCase()}-${ymd}-${randomCode(6)}`;
}

export const paymentReference = () => makeReference('PAY');
export const transactionReference = () => makeReference('TXN');
export const orderNumber = () => makeReference('ORD');
export const payoutReference = () => makeReference('PO');

export { randomUUID };
