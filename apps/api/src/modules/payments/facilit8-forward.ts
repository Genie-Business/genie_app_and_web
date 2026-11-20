/**
 * genie and Facilit8 take payments through the same Paystack account, and Paystack allows one live
 * webhook URL per account: genie's. So every event for either product lands here, and the ones that
 * belong to Facilit8 are handed on, byte for byte, to Facilit8's own webhook. Facilit8 checks the same
 * signature with the same secret key, so nothing is re-signed or altered on the way.
 *
 * Nothing here applies unless FACILIT8_WEBHOOK_URL is set: without it every event is handled by genie
 * exactly as before.
 */

/** Event families genie never consumes and Facilit8 does: virtual-account setup and identity checks. */
const FACILIT8_EVENT_PREFIXES = ['dedicatedaccount.', 'assigndedicatedaccount.', 'customeridentification.'];

/**
 * Facilit8 references its withdrawals "wd-<user>-<id>". genie's payout references are "po-...", so a
 * transfer event can be told apart by its reference alone.
 */
const FACILIT8_TRANSFER_REFERENCE_PREFIX = 'wd-';

/** Paystack's channel name for a bank transfer into a dedicated virtual account (Facilit8 wallet deposits). */
const VIRTUAL_ACCOUNT_CHANNEL = 'dedicated_nuban';

const FORWARD_TIMEOUT_MS = 8_000;

/**
 * Where to forward Facilit8's events, or null when forwarding is off. A blank or malformed value turns
 * forwarding off rather than failing: this is the same environment that boots the whole API, and a typo
 * here must never be able to take genie's own payments down.
 */
export function facilit8WebhookUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** True for an event that belongs to Facilit8 and must not be processed (or even stored) by genie. */
export function isFacilit8Event(eventType: string, payload: unknown): boolean {
  if (FACILIT8_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix))) return true;

  const data = ((payload as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;

  if (eventType === 'charge.success') {
    // genie's own payments are hosted-checkout charges (card, bank, ...); only a transfer into a
    // virtual account reports this channel.
    const authorization = data.authorization as { channel?: unknown } | undefined;
    return (data.channel ?? authorization?.channel) === VIRTUAL_ACCOUNT_CHANNEL;
  }

  if (eventType.startsWith('transfer.')) {
    return typeof data.reference === 'string' && data.reference.toLowerCase().startsWith(FACILIT8_TRANSFER_REFERENCE_PREFIX);
  }

  return false;
}

/**
 * Hands the original request to Facilit8. Throws unless Facilit8 accepted it, so genie answers Paystack
 * with an error and Paystack redelivers; Facilit8 ignores a repeat of an event it already has, so a
 * retry can't pay anyone twice.
 */
export async function forwardToFacilit8(url: string, rawBody: string, signature: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-paystack-signature': signature },
    body: rawBody,
    signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Facilit8's webhook answered ${res.status}`);
}
