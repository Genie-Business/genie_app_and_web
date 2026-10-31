import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genie/core/api_client.dart';
import 'package:genie/features/auth/auth_controller.dart';
import 'package:genie/features/auth/presentation/sign_up_merchant_screen.dart';
import 'package:genie/features/banking/bank_repository.dart';
import 'package:google_fonts/google_fonts.dart';

/// An auth controller whose merchant sign-up calls are scripted by the test.
class _FakeAuth extends AuthController {
  final requestedCodes = <String>[];
  final verified = <({String email, String code})>[];
  Map<String, dynamic>? registered;
  bool wrongCode = false;

  @override
  AuthState build() => const AuthState(status: AuthStatus.unauthenticated);

  @override
  Future<String?> requestMerchantCode(String email) async {
    requestedCodes.add(email);
    return null;
  }

  @override
  Future<String> verifyMerchantCode({required String email, required String code}) async {
    if (wrongCode) throw ApiException('bad_request', 'That code is incorrect.', statusCode: 400);
    verified.add((email: email, code: code));
    return 'signup-token-${'x' * 30}';
  }

  @override
  Future<void> registerMerchant(Map<String, dynamic> body) async {
    registered = body;
  }
}

Future<_FakeAuth> _pump(WidgetTester tester) async {
  final fake = _FakeAuth();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(() => fake),
        banksProvider.overrideWith((ref) async => const [Bank(code: '058', name: 'Guaranty Trust Bank (GTBank)')]),
      ],
      child: const MaterialApp(home: SignUpMerchantScreen()),
    ),
  );
  await tester.pumpAndSettle();
  return fake;
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('starts with just the email step', (tester) async {
    await _pump(tester);
    expect(find.text('Send code'), findsOneWidget);
    expect(find.text('Business name'), findsNothing);
    expect(find.text('Create account'), findsNothing);
  });

  testWidgets('does not send a code to an invalid email', (tester) async {
    final fake = await _pump(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Business email'), 'not-an-email');
    await tester.tap(find.text('Send code'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a valid email address.'), findsOneWidget);
    expect(fake.requestedCodes, isEmpty);
  });

  testWidgets('emails a code, verifies it, then reveals the rest of the form', (tester) async {
    final fake = await _pump(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Business email'), 'ada@example.com');
    await tester.tap(find.text('Send code'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(fake.requestedCodes, ['ada@example.com']);
    expect(find.textContaining('We sent a 6-digit code to ada@example.com'), findsOneWidget);
    expect(find.textContaining('Resend in'), findsOneWidget); // cooldown running

    await tester.enterText(find.widgetWithText(TextField, 'Merchant code'), '123456');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(fake.verified, [(email: 'ada@example.com', code: '123456')]);
    expect(find.text('ada@example.com'), findsOneWidget); // shown as confirmed
    expect(find.text('Business name'), findsOneWidget);
    expect(find.text('Create account'), findsOneWidget);
    expect(find.text('Send code'), findsNothing);
  });

  testWidgets('keeps the merchant on the code step when the code is wrong', (tester) async {
    final fake = await _pump(tester);
    fake.wrongCode = true;
    await tester.enterText(find.widgetWithText(TextFormField, 'Business email'), 'ada@example.com');
    await tester.tap(find.text('Send code'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.enterText(find.widgetWithText(TextField, 'Merchant code'), '000000');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('That code is incorrect.'), findsOneWidget);
    expect(find.text('Business name'), findsNothing);
    expect(find.text('Verify'), findsOneWidget);
  });

  testWidgets('"Change email" goes back to the first step', (tester) async {
    await _pump(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Business email'), 'ada@example.com');
    await tester.tap(find.text('Send code'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.tap(find.text('Change email'));
    await tester.pump();
    expect(find.text('Send code'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Business email'), findsOneWidget);
  });
}
