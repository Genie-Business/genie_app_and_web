import { describe, expect, it } from 'vitest';
import { otpEchoEnabled } from '../src/modules/auth/auth.service';

/**
 * Echoing a freshly-issued OTP in the API response is an account-takeover
 * primitive (forgot-password → read code → reset). It must be OFF unless
 * explicitly opened. The test env sets neither OTP_DEBUG_ECHO nor
 * OTP_ECHO_EMAILS, so both forms must be false.
 */
describe('otpEchoEnabled — hardening', () => {
  it('is off by default, for any address and with no address', () => {
    expect(otpEchoEnabled('victim@example.com')).toBe(false);
    expect(otpEchoEnabled('abiolaakinwoleola@gmail.com')).toBe(false);
    expect(otpEchoEnabled()).toBe(false);
  });
});
