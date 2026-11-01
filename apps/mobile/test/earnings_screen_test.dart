import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genie/features/merchant/payout_repository.dart';
import 'package:genie/features/merchant/presentation/earnings_screen.dart';
import 'package:google_fonts/google_fonts.dart';

Earnings _earnings({bool account = true, bool verified = true, int hold = 0}) => Earnings(
      awaitingDeliveryKobo: '500000',
      awaitingDeliveryOrders: 2,
      readyForPayoutKobo: '950000',
      readyForPayoutOrders: 1,
      payingOutKobo: '0',
      paidOutKobo: '1200000',
      hasSettlementAccount: account,
      settlementVerified: verified,
      holdHours: hold,
      minimumPayoutKobo: '10000',
    );

Future<void> _pump(WidgetTester tester, Earnings e, {List<Payout> payouts = const []}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        earningsProvider.overrideWith((ref) async => e),
        payoutHistoryProvider.overrideWith((ref) async => payouts),
      ],
      child: const MaterialApp(home: EarningsScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('shows what is owed at each stage', (tester) async {
    await _pump(tester, _earnings());
    expect(find.text('Delivered, being paid out'), findsOneWidget);
    expect(find.text('₦9,500'), findsOneWidget); // delivered, going out next
    expect(find.text('₦5,000'), findsOneWidget); // waiting for delivery
    expect(find.text('₦12,000'), findsOneWidget); // already paid
    expect(find.textContaining('2 orders paid for, not delivered yet'), findsOneWidget);
    expect(find.text('Add your settlement account'), findsNothing);
  });

  testWidgets('asks for a settlement account when there is none', (tester) async {
    await _pump(tester, _earnings(account: false));
    expect(find.text('Add your settlement account'), findsOneWidget);
  });

  testWidgets('says when the account has not been confirmed with the bank yet', (tester) async {
    await _pump(tester, _earnings(verified: false));
    expect(find.textContaining('hasn’t been confirmed with your bank'), findsOneWidget);
  });

  testWidgets('does not mention a holding period when there is none', (tester) async {
    await _pump(tester, _earnings());
    expect(find.textContaining('hours after delivery'), findsNothing);
  });

  testWidgets('mentions the holding period when there is one', (tester) async {
    await _pump(tester, _earnings(hold: 24));
    expect(find.textContaining('24 hours after delivery'), findsOneWidget);
  });

  testWidgets('lists recent payouts', (tester) async {
    await _pump(tester, _earnings(), payouts: [
      Payout(
        reference: 'PO-261031-ABC123',
        amountKobo: '950000',
        netAmountKobo: '950000',
        status: 'PAID',
        createdAt: DateTime.now().toIso8601String(),
      ),
    ]);
    await tester.scrollUntilVisible(find.textContaining('PO-261031-ABC123'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('PO-261031-ABC123'), findsOneWidget);
    expect(find.text('Paid'), findsOneWidget);
  });
}
