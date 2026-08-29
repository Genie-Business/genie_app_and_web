/**
 * Password + email + username rules, straight from the requirements doc
 * (US0001, US0004, US0023). Shared so the API, the admin portal and the
 * Flutter client all validate identically.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordCheck = { valid: boolean; errors: string[] };

export function checkPassword(password: string): PasswordCheck {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
  }
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an upper-case letter.');
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lower-case letter.');
  if (!/[0-9]/.test(password)) errors.push('Password must contain a number.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain a symbol.');
  return { valid: errors.length === 0, errors };
}

export function isValidPassword(password: string): boolean {
  return checkPassword(password).valid;
}

/**
 * Email: letters, numbers, dashes in the local + domain parts; the TLD must be
 * at least two characters (doc: ".com, .org, .cc").
 */
const EMAIL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9.+_-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Username: 3–20 chars, letters/numbers/underscore/dot, no leading/trailing dot. */
const USERNAME_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9._]{3,20}(?<!\.)$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
