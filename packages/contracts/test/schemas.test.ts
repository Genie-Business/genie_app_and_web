import { describe, expect, it } from 'vitest';
import { auth } from '../src/index';

describe('registerCelebrantBody', () => {
  const base = {
    firstName: 'Ada',
    lastName: 'Obi',
    email: 'ada@example.com',
    username: 'ada_obi',
    password: 'Abcdef1!',
    phone: '+2348012345678',
    stateOfResidence: 'Lagos',
  };

  it('accepts a valid celebrant payload', () => {
    const parsed = auth.registerCelebrantBody.parse(base);
    expect(parsed.country).toBe('NG');
  });

  it('rejects a weak password', () => {
    const r = auth.registerCelebrantBody.safeParse({ ...base, password: 'weak' });
    expect(r.success).toBe(false);
  });

  it('rejects an email with a 1-char TLD', () => {
    const r = auth.registerCelebrantBody.safeParse({ ...base, email: 'ada@example.c' });
    expect(r.success).toBe(false);
  });
});

describe('loginBody', () => {
  it('requires a device id', () => {
    const r = auth.loginBody.safeParse({ identifier: 'ada', password: 'x' });
    expect(r.success).toBe(false);
  });
});
