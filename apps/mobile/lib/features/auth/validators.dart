/// Client-side validation mirroring packages/contracts/src/auth.ts so the user
/// gets instant feedback; the API re-validates authoritatively.
class Validators {
  static final _email = RegExp(
    r'^[A-Za-z0-9](?:[A-Za-z0-9.+_-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$',
  );
  static final _username = RegExp(r'^(?!\.)(?!.*\.\.)[A-Za-z0-9._]{3,20}(?<!\.)$');
  static final _phone = RegExp(r'^\+?[0-9]{7,15}$');

  static String? required(String? v, [String label = 'This field']) =>
      (v == null || v.trim().isEmpty) ? '$label is required.' : null;

  static String? email(String? v) =>
      (v != null && _email.hasMatch(v.trim())) ? null : 'Enter a valid email address.';

  static String? username(String? v) => (v != null && _username.hasMatch(v.trim()))
      ? null
      : 'Username must be 3–20 letters, numbers, dots or underscores.';

  static String? phone(String? v) =>
      (v != null && _phone.hasMatch(v.trim())) ? null : 'Enter a valid phone number.';

  static String? password(String? v) {
    final s = v ?? '';
    if (s.length < 8) return 'At least 8 characters.';
    if (!RegExp(r'[A-Z]').hasMatch(s)) return 'Add an upper-case letter.';
    if (!RegExp(r'[a-z]').hasMatch(s)) return 'Add a lower-case letter.';
    if (!RegExp(r'[0-9]').hasMatch(s)) return 'Add a number.';
    if (!RegExp(r'[^A-Za-z0-9]').hasMatch(s)) return 'Add a symbol.';
    return null;
  }

  static String? accountNumber(String? v) =>
      (v != null && RegExp(r'^\d{10}$').hasMatch(v.trim())) ? null : 'Enter a valid 10-digit account number.';

  static String? otp(String? v) =>
      (v != null && RegExp(r'^\d{6}$').hasMatch(v.trim())) ? null : 'Enter the 6-digit code.';
}
