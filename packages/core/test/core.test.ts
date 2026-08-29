import { describe, expect, it } from 'vitest';
import {
  checkPassword,
  computeFee,
  formatNaira,
  generateOtp,
  hashOtp,
  hashPassword,
  isValidEmail,
  isValidUsername,
  koboToNaira,
  nairaToKobo,
  verifyOtp,
  verifyPassword,
} from '../src/index';

describe('password policy', () => {
  it('accepts a compliant password', () => {
    expect(checkPassword('Abcdef1!').valid).toBe(true);
  });
  it('rejects on each missing class', () => {
    expect(checkPassword('Shrt1!a').errors.some((e) => e.includes('8 characters'))).toBe(true);
    expect(checkPassword('abcdefg1!').errors.some((e) => e.includes('upper-case'))).toBe(true);
    expect(checkPassword('ABCDEFG1!').errors.some((e) => e.includes('lower-case'))).toBe(true);
    expect(checkPassword('Abcdefgh!').errors.some((e) => e.includes('number'))).toBe(true);
    expect(checkPassword('Abcdefg1').errors.some((e) => e.includes('symbol'))).toBe(true);
  });
});

describe('password hashing', () => {
  it('round-trips', async () => {
    const hash = await hashPassword('Abcdef1!');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Abcdef1!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('email + username', () => {
  it('validates emails per the doc rules', () => {
    expect(isValidEmail('a.b-c@example.com')).toBe(true);
    expect(isValidEmail('x@y.c')).toBe(false); // TLD < 2
    expect(isValidEmail('no-at-sign.com')).toBe(false);
  });
  it('validates usernames', () => {
    expect(isValidUsername('genie_user.1')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('.leadingdot')).toBe(false);
  });
});

describe('otp', () => {
  it('generates 6 digits and verifies', () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
    const h = hashOtp(code, 'pepper');
    expect(verifyOtp(code, h, 'pepper')).toBe(true);
    expect(verifyOtp('000000', h, 'pepper')).toBe(false);
  });
});

describe('money', () => {
  it('converts naira <-> kobo', () => {
    expect(nairaToKobo('1500.50')).toBe(150050n);
    expect(koboToNaira(150050n)).toBe('1500.50');
    expect(formatNaira(150050n)).toBe('₦1,500.50');
  });
  it('computes percent and flat fees with cap/min', () => {
    expect(computeFee(100000n, { type: 'PERCENT', value: 1.5 })).toBe(1500n);
    expect(computeFee(100000n, { type: 'FLAT', value: 5000 })).toBe(5000n);
    expect(computeFee(100000n, { type: 'PERCENT', value: 1.5, capKobo: 1000n })).toBe(1000n);
    expect(computeFee(100000n, { type: 'PERCENT', value: 1.5, minKobo: 2000n })).toBe(2000n);
  });
});
