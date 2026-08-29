import 'package:flutter_test/flutter_test.dart';
import 'package:genie/features/auth/validators.dart';

void main() {
  group('password policy mirrors the API', () {
    test('accepts a compliant password', () {
      expect(Validators.password('Abcdef1!'), isNull);
    });
    test('flags each missing character class', () {
      expect(Validators.password('short1!A'), contains('8'));
      expect(Validators.password('abcdefg1!'), contains('upper'));
      expect(Validators.password('ABCDEFG1!'), contains('lower'));
      expect(Validators.password('Abcdefgh!'), contains('number'));
      expect(Validators.password('Abcdefg1'), contains('symbol'));
    });
  });

  group('email', () {
    test('rejects a 1-char TLD', () {
      expect(Validators.email('a@b.c'), isNotNull);
      expect(Validators.email('ada@example.com'), isNull);
    });
  });

  group('username / account number / otp', () {
    test('username rules', () {
      expect(Validators.username('ada_obi.1'), isNull);
      expect(Validators.username('ab'), isNotNull);
    });
    test('account number is 10 digits', () {
      expect(Validators.accountNumber('0123456789'), isNull);
      expect(Validators.accountNumber('123'), isNotNull);
    });
    test('otp is 6 digits', () {
      expect(Validators.otp('123456'), isNull);
      expect(Validators.otp('12345'), isNotNull);
    });
  });
}
