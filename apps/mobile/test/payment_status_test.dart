import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genie/core/api_client.dart';
import 'package:genie/features/payments/payment_repository.dart';
import 'package:genie/features/payments/payment_status_screen.dart';
import 'package:google_fonts/google_fonts.dart';

/// Answers each status check from a script; the last answer repeats.
class _ScriptedPayments implements PaymentRepository {
  _ScriptedPayments(this.answers);
  final List<Object> answers; // PaymentStatus, or an Exception to throw
  int calls = 0;

  @override
  Future<PaymentStatus> status(String reference) async {
    final a = answers[calls < answers.length ? calls : answers.length - 1];
    calls += 1;
    if (a is Exception) throw a;
    return a as PaymentStatus;
  }
}

PaymentStatus _status(String s) => PaymentStatus(
      reference: 'PAY-1',
      status: s,
      amountKobo: '1165000',
      checkoutUrl: 'https://checkout.example/abc',
    );

Future<_ScriptedPayments> _pump(WidgetTester tester, List<Object> answers, {int maxPolls = 100}) async {
  final repo = _ScriptedPayments(answers);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [paymentRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(
        home: PaymentStatusScreen(
          reference: 'PAY-1',
          pollEvery: const Duration(milliseconds: 100),
          maxPolls: maxPolls,
        ),
      ),
    ),
  );
  return repo;
}

Future<void> _tick(WidgetTester tester, [int ms = 120]) async {
  await tester.pump(Duration(milliseconds: ms));
  await tester.pump();
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('waits, then says the gift is on its way once the payment is confirmed', (tester) async {
    final repo = await _pump(tester, [_status('PENDING'), _status('PENDING'), _status('COMPLETED')]);
    await tester.pump();
    expect(find.text('Waiting for your payment'), findsOneWidget);
    expect(find.text('Open the payment page again'), findsOneWidget);

    await _tick(tester);
    await _tick(tester);
    expect(find.text('Gift on its way'), findsOneWidget);
    expect(find.textContaining('₦11,650'), findsOneWidget);
    expect(find.text('Done'), findsOneWidget);

    final callsWhenDone = repo.calls;
    await _tick(tester, 500);
    expect(repo.calls, callsWhenDone); // it stops asking once it has an answer
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('explains a payment that failed or expired', (tester) async {
    await _pump(tester, [_status('EXPIRED')]);
    await tester.pump();
    expect(find.text('This payment expired'), findsOneWidget);
    expect(find.textContaining('No gift was sent'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('keeps trying through a network blip', (tester) async {
    await _pump(tester, [ApiException('network_error', 'offline'), _status('COMPLETED')]);
    await tester.pump();
    expect(find.textContaining('Still trying'), findsOneWidget);

    await _tick(tester);
    expect(find.text('Gift on its way'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('stops waiting after a while and says the payment may still land', (tester) async {
    final repo = await _pump(tester, [_status('PENDING')], maxPolls: 3);
    await tester.pump();
    for (var i = 0; i < 5; i += 1) {
      await _tick(tester);
    }
    expect(find.text('Still confirming'), findsOneWidget);
    expect(repo.calls, 3);
    await tester.pumpWidget(const SizedBox());
  });
}
