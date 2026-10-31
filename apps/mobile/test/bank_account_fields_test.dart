import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genie/core/api_client.dart';
import 'package:genie/features/banking/bank_account_fields.dart';
import 'package:genie/features/banking/bank_repository.dart';

const _banks = [
  Bank(code: '044', name: 'Access Bank'),
  Bank(code: '058', name: 'Guaranty Trust Bank (GTBank)'),
  Bank(code: '057', name: 'Zenith Bank'),
];

class _Harness {
  _Harness(this.lookup);
  final AccountLookup lookup;
  final controller = BankAccountController();
  final form = GlobalKey<FormState>();
}

Future<_Harness> _pump(WidgetTester tester, AccountLookup lookup) async {
  final h = _Harness(lookup);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [banksProvider.overrideWith((ref) async => _banks)],
      child: MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: Form(
              key: h.form,
              child: BankAccountFields(controller: h.controller, lookup: lookup),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return h;
}

Future<void> _chooseBank(WidgetTester tester, String search, String name) async {
  await tester.tap(find.byType(InputDecorator).first);
  await tester.pumpAndSettle();
  await tester.enterText(find.widgetWithText(TextField, 'Search banks'), search);
  await tester.pumpAndSettle();
  await tester.tap(find.text(name));
  await tester.pumpAndSettle();
}

/// [settle] false while a lookup is still pending: its spinner never stops animating.
Future<void> _typeNumber(WidgetTester tester, String number, {bool settle = true}) async {
  await tester.enterText(find.widgetWithText(TextFormField, 'Account number'), number);
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

void main() {
  testWidgets('lists banks, filters them by search, and picks one', (tester) async {
    final h = await _pump(tester, ({required bankCode, required accountNumber}) async =>
        const ResolvedAccount(accountName: 'X', bankName: 'X'));

    await tester.tap(find.byType(InputDecorator).first);
    await tester.pumpAndSettle();
    expect(find.text('Access Bank'), findsOneWidget);
    expect(find.text('Zenith Bank'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Search banks'), 'zen');
    await tester.pumpAndSettle();
    expect(find.text('Access Bank'), findsNothing);

    await tester.tap(find.text('Zenith Bank'));
    await tester.pumpAndSettle();
    expect(h.controller.bank?.code, '057');
  });

  testWidgets('shows the name on the account once bank and 10 digits are in', (tester) async {
    final calls = <String>[];
    final h = await _pump(tester, ({required bankCode, required accountNumber}) async {
      calls.add('$bankCode:$accountNumber');
      return const ResolvedAccount(accountName: 'ADA OBI STORES', bankName: 'Guaranty Trust Bank (GTBank)');
    });

    await _chooseBank(tester, 'guar', 'Guaranty Trust Bank (GTBank)');
    await _typeNumber(tester, '012345678'); // nine digits: no lookup yet
    expect(calls, isEmpty);

    await _typeNumber(tester, '0123456789');
    expect(calls, ['058:0123456789']);
    expect(find.byKey(const ValueKey('resolved-account-name')), findsOneWidget);
    expect(find.text('ADA OBI STORES'), findsOneWidget);
    expect(h.controller.verified, isTrue);
    expect(h.controller.accountName, 'ADA OBI STORES');
    expect(h.form.currentState!.validate(), isTrue);
  });

  testWidgets('blocks submit when the bank does not know the account', (tester) async {
    final h = await _pump(tester, ({required bankCode, required accountNumber}) async {
      throw ApiException('account_not_found', "We couldn't find an account with that number at that bank.");
    });

    await _chooseBank(tester, 'access', 'Access Bank');
    await _typeNumber(tester, '0123456789');

    expect(find.textContaining("couldn't find an account"), findsOneWidget);
    expect(h.controller.status, LookupStatus.notFound);
    expect(h.controller.accountName, isNull);
    expect(h.form.currentState!.validate(), isFalse);
  });

  testWidgets('asks for the name to be typed when the lookup is unavailable', (tester) async {
    final h = await _pump(tester, ({required bankCode, required accountNumber}) async {
      throw ApiException('account_lookup_unavailable', 'unavailable', statusCode: 503);
    });

    await _chooseBank(tester, 'access', 'Access Bank');
    await _typeNumber(tester, '0123456789');

    expect(h.controller.status, LookupStatus.unavailable);
    expect(h.controller.verified, isFalse);
    expect(h.form.currentState!.validate(), isFalse); // name still empty

    await tester.enterText(find.widgetWithText(TextFormField, 'Account name'), 'Ada Obi');
    await tester.pumpAndSettle();
    expect(h.controller.accountName, 'Ada Obi');
    expect(h.form.currentState!.validate(), isTrue);
  });

  testWidgets('offers a retry after a failed check', (tester) async {
    var attempts = 0;
    final h = await _pump(tester, ({required bankCode, required accountNumber}) async {
      attempts += 1;
      if (attempts == 1) throw ApiException('network_error', 'Could not reach genie. Check your connection.');
      return const ResolvedAccount(accountName: 'ADA OBI STORES', bankName: 'Access Bank');
    });

    await _chooseBank(tester, 'access', 'Access Bank');
    await _typeNumber(tester, '0123456789');
    expect(h.controller.status, LookupStatus.failed);
    expect(h.form.currentState!.validate(), isFalse);

    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(h.controller.status, LookupStatus.resolved);
    expect(h.controller.accountName, 'ADA OBI STORES');
  });

  testWidgets('ignores an answer for a number that has since been changed', (tester) async {
    final pending = <String, Completer<ResolvedAccount>>{};
    final h = await _pump(tester, ({required bankCode, required accountNumber}) {
      return (pending[accountNumber] = Completer<ResolvedAccount>()).future;
    });

    await _chooseBank(tester, 'access', 'Access Bank');
    await _typeNumber(tester, '0123456789', settle: false);
    expect(h.controller.status, LookupStatus.resolving);
    expect(h.form.currentState!.validate(), isFalse); // still checking

    await _typeNumber(tester, '0123456780', settle: false);
    pending['0123456789']!.complete(const ResolvedAccount(accountName: 'OLD NAME', bankName: 'Access Bank'));
    await tester.pump();
    expect(h.controller.status, LookupStatus.resolving); // the stale answer was dropped

    pending['0123456780']!.complete(const ResolvedAccount(accountName: 'NEW NAME', bankName: 'Access Bank'));
    await tester.pumpAndSettle();
    expect(h.controller.accountName, 'NEW NAME');
  });

  testWidgets('re-checks a saved account that was never verified', (tester) async {
    final calls = <String>[];
    final h = _Harness(({required bankCode, required accountNumber}) async {
      calls.add('$bankCode:$accountNumber');
      return const ResolvedAccount(accountName: 'ADA OBI STORES', bankName: 'Access Bank');
    });
    h.controller.seed(bank: _banks.first, number: '0123456789', name: 'Ada (typed)');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [banksProvider.overrideWith((ref) async => _banks)],
        child: MaterialApp(
          home: Scaffold(
            body: Form(child: BankAccountFields(controller: h.controller, lookup: h.lookup)),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(calls, ['044:0123456789']);
    expect(h.controller.verified, isTrue);
    expect(h.controller.accountName, 'ADA OBI STORES');
  });
}
