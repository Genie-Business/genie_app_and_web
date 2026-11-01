import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genie/features/gifts/gift_models.dart';
import 'package:genie/features/gifts/gifts_repository.dart';
import 'package:genie/features/gifts/presentation/gifts_received_screen.dart';
import 'package:genie/features/merchant/merchant_models.dart';
import 'package:genie/features/merchant/merchant_repository.dart';
import 'package:genie/features/merchant/presentation/merchant_orders_screen.dart';
import 'package:google_fonts/google_fonts.dart';

class _FakeGifts implements GiftsRepository {
  final confirmed = <String>[];

  @override
  Future<void> confirmReceived(String giftId) async => confirmed.add(giftId);

  @override
  Future<List<ReceivedGift>> received() async => const [];

  @override
  noSuchMethod(Invocation invocation) => throw UnimplementedError('${invocation.memberName}');
}

ReceivedGift _gift({String delivery = 'PENDING', bool canConfirm = false, String status = 'PAID'}) => ReceivedGift(
      id: 'gift-1',
      productName: 'Stand mixer',
      eventName: 'Ada’s birthday',
      amountKobo: '1000000',
      isAnonymous: false,
      revealed: false,
      canReveal: false,
      status: status,
      deliveryStatus: delivery,
      canConfirmReceived: canConfirm,
      from: 'Chidi',
    );

Future<_FakeGifts> _pumpReceived(WidgetTester tester, ReceivedGift gift) async {
  final fake = _FakeGifts();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        giftsRepositoryProvider.overrideWithValue(fake),
        receivedGiftsProvider.overrideWith((ref) async => [gift]),
      ],
      child: const MaterialApp(home: GiftsReceivedScreen()),
    ),
  );
  await tester.pumpAndSettle();
  return fake;
}

MerchantOrder _order(String delivery) => MerchantOrder(
      id: 'order-1',
      orderNumber: 'ORD-261101-ABC123',
      status: delivery == 'DELIVERED' ? 'DELIVERED' : 'PAID',
      proceedsKobo: '950000',
      subtotalKobo: '1000000',
      isGift: true,
      createdAt: '2026-11-01T10:00:00.000Z',
      items: const [OrderItem(description: 'Stand mixer', quantity: 1, lineTotalKobo: '1000000')],
      delivery: MerchantDelivery(status: delivery),
    );

Future<void> _pumpOrders(WidgetTester tester, String delivery) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [merchantOrdersProvider.overrideWith((ref) async => [_order(delivery)])],
      child: const MaterialApp(home: Scaffold(body: MerchantOrdersScreen())),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  group('the person a gift is for', () {
    testWidgets('can confirm it arrived once it has been sent', (tester) async {
      final fake = await _pumpReceived(tester, _gift(delivery: 'DISPATCHED', canConfirm: true));
      expect(find.text('Sent by the merchant'), findsOneWidget);
      await tester.tap(find.text('I’ve received it'));
      await tester.pumpAndSettle();
      expect(fake.confirmed, ['gift-1']);
    });

    testWidgets('cannot confirm a gift that has not been sent yet', (tester) async {
      await _pumpReceived(tester, _gift());
      expect(find.text('Being prepared'), findsOneWidget);
      expect(find.text('I’ve received it'), findsNothing);
    });

    testWidgets('sees a delivered gift as delivered, with nothing left to confirm', (tester) async {
      await _pumpReceived(tester, _gift(delivery: 'DELIVERED', status: 'DELIVERED'));
      expect(find.text('Delivered'), findsOneWidget);
      expect(find.text('I’ve received it'), findsNothing);
    });
  });

  group('a merchant', () {
    testWidgets('can send an order on its way', (tester) async {
      await _pumpOrders(tester, 'PENDING');
      expect(find.text('Mark dispatched'), findsOneWidget);
    });

    testWidgets('cannot mark an order delivered, and is told who does', (tester) async {
      await _pumpOrders(tester, 'IN_TRANSIT');
      expect(find.text('Mark delivered'), findsNothing);
      expect(find.text('Mark in transit'), findsNothing);
      expect(find.byKey(const ValueKey('awaiting-confirmation')), findsOneWidget);
      expect(find.textContaining('paid straight away'), findsOneWidget);
    });

    testWidgets('sees that payment is on its way once delivery is confirmed', (tester) async {
      await _pumpOrders(tester, 'DELIVERED');
      expect(find.byKey(const ValueKey('delivered-note')), findsOneWidget);
      expect(find.byKey(const ValueKey('awaiting-confirmation')), findsNothing);
    });
  });
}
