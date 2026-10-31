import 'package:flutter_test/flutter_test.dart';
import 'package:genie/features/gifts/gift_models.dart';

void main() {
  test('a quote without a discount charges the full price', () {
    final q = GiftQuote.fromJson({
      'quantity': 1,
      'subtotalKobo': '1000000',
      'transactionFeeKobo': '15000',
      'logisticsFeeKobo': '150000',
      'gifterPaysKobo': '1165000',
    });
    expect(q.hasDiscount, isFalse);
    expect(q.discountKobo, '0');
    expect(q.payKobo, '1165000');
  });

  test('a referral credit lowers what the buyer pays, not the price', () {
    final q = GiftQuote.fromJson({
      'quantity': 1,
      'subtotalKobo': '1000000',
      'transactionFeeKobo': '15000',
      'logisticsFeeKobo': '150000',
      'gifterPaysKobo': '1165000',
      'discountKobo': '50000',
      'payKobo': '1115000',
    });
    expect(q.hasDiscount, isTrue);
    expect(q.gifterPaysKobo, '1165000');
    expect(q.payKobo, '1115000');
  });
}
