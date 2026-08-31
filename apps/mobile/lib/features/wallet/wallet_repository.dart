import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'wallet_models.dart';

class WalletRepository {
  WalletRepository(this._api);
  final ApiClient _api;

  Future<WalletBalance> balance() async {
    final data = await _api.get<Map<String, dynamic>>('/v1/payments/wallet');
    return WalletBalance.fromJson(data);
  }

  Future<PaymentIntent> addFunds(int amountKobo, {String method = 'BANK_TRANSFER'}) async {
    final data = await _api.post<Map<String, dynamic>>('/v1/payments/add-funds',
        body: {'amountKobo': amountKobo, 'method': method});
    return PaymentIntent.fromJson(data);
  }

  /// Preview/mock only: simulates the inbound bank transfer for [reference].
  Future<void> simulatePayment(String reference, int amountKobo) => _api.post<Map<String, dynamic>>(
        '/v1/payments/_mock/settle',
        body: {'reference': reference, 'amountKobo': amountKobo},
      );

  Future<void> withdraw({
    required int amountKobo,
    required String bankName,
    required String accountNumber,
    required String accountName,
  }) =>
      _api.post<Map<String, dynamic>>('/v1/payments/withdraw', body: {
        'amountKobo': amountKobo,
        'bankName': bankName,
        'accountNumber': accountNumber,
        'accountName': accountName,
      });
}

final walletRepositoryProvider =
    Provider<WalletRepository>((ref) => WalletRepository(ref.watch(apiClientProvider)));

final walletBalanceProvider =
    FutureProvider<WalletBalance>((ref) => ref.watch(walletRepositoryProvider).balance());
