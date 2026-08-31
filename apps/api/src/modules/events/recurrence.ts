/**
 * ANNUAL events repeat every year. Nothing is persisted — the stored
 * `eventDate` keeps pointing at the original occasion; callers roll the
 * *displayed* date forward so the celebrant and gifters always see the next
 * upcoming occurrence (and gifting stays open past a birthday that has gone by).
 */
export function nextOccurrence(
  eventDate: Date,
  expiresAt: Date,
  recurrence: 'ONE_OFF' | 'ANNUAL',
  now: number = Date.now(),
): { eventDate: Date; expiresAt: Date } {
  if (recurrence !== 'ANNUAL' || eventDate.getTime() > now) {
    return { eventDate, expiresAt };
  }
  const window = Math.max(0, expiresAt.getTime() - eventDate.getTime());
  const next = new Date(eventDate);
  while (next.getTime() <= now) next.setFullYear(next.getFullYear() + 1);
  return { eventDate: next, expiresAt: new Date(next.getTime() + window) };
}
