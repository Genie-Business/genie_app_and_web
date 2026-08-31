import { describe, expect, it } from 'vitest';
import { nextOccurrence } from '../src/modules/events/recurrence';

describe('nextOccurrence (ANNUAL event roll-forward)', () => {
  const NOW = Date.UTC(2026, 5, 15); // 2026-06-15

  it('leaves a one-off event untouched', () => {
    const date = new Date(Date.UTC(2020, 0, 1));
    const exp = new Date(Date.UTC(2020, 0, 1));
    const out = nextOccurrence(date, exp, 'ONE_OFF', NOW);
    expect(out.eventDate).toBe(date);
    expect(out.expiresAt).toBe(exp);
  });

  it('leaves a future annual event untouched', () => {
    const date = new Date(Date.UTC(2026, 11, 25));
    const exp = new Date(Date.UTC(2026, 11, 25));
    const out = nextOccurrence(date, exp, 'ANNUAL', NOW);
    expect(out.eventDate.getTime()).toBe(date.getTime());
  });

  it('rolls a past annual event forward to the next anniversary', () => {
    const date = new Date(Date.UTC(2024, 2, 10)); // 10 March 2024
    const exp = new Date(Date.UTC(2024, 2, 10));
    const out = nextOccurrence(date, exp, 'ANNUAL', NOW);
    expect(out.eventDate.toISOString()).toBe('2027-03-10T00:00:00.000Z');
  });

  it('preserves the gift window between eventDate and expiresAt', () => {
    const date = new Date(Date.UTC(2025, 0, 1));
    const exp = new Date(Date.UTC(2025, 0, 8)); // 7-day window
    const out = nextOccurrence(date, exp, 'ANNUAL', NOW);
    expect(out.expiresAt.getTime() - out.eventDate.getTime()).toBe(7 * 86_400_000);
    expect(out.eventDate.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
