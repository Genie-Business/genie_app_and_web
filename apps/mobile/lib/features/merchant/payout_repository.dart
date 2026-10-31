import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class PayoutAccount {
  const PayoutAccount({
    required this.bankName,
    this.bankCode,
    required this.accountNumber,
    required this.accountName,
    required this.isVerified,
  });
  final String bankName;
  final String? bankCode;
  final String accountNumber;
  final String accountName;
  final bool isVerified;

  static PayoutAccount? fromJson(Map<String, dynamic> j) {
    if (j['accountNumber'] == null) return null;
    return PayoutAccount(
      bankName: (j['bankName'] as String?) ?? '',
      bankCode: j['bankCode'] as String?,
      accountNumber: (j['accountNumber'] as String?) ?? '',
      accountName: (j['accountName'] as String?) ?? '',
      isVerified: j['isVerified'] as bool? ?? false,
    );
  }
}

class Payout {
  const Payout({
    required this.reference,
    required this.amountKobo,
    required this.netAmountKobo,
    required this.status,
    required this.createdAt,
  });
  final String reference;
  final String amountKobo;
  final String netAmountKobo;
  final String status;
  final String createdAt;

  factory Payout.fromJson(Map<String, dynamic> j) => Payout(
        reference: (j['reference'] as String?) ?? '',
        amountKobo: j['amountKobo'].toString(),
        netAmountKobo: (j['netAmountKobo'] ?? j['amountKobo']).toString(),
        status: (j['status'] as String?) ?? 'PENDING',
        createdAt: (j['createdAt'] ?? DateTime.now().toIso8601String()) as String,
      );
}

class PayoutRepository {
  PayoutRepository(this._api);
  final ApiClient _api;

  Future<PayoutAccount?> account() async =>
      PayoutAccount.fromJson(await _api.get<Map<String, dynamic>>('/v1/payouts/account'));

  /// The server looks up the account name itself when [bankCode] is given;
  /// [accountName] is only used when that lookup isn't available.
  Future<PayoutAccount?> save({
    required String bankName,
    required String bankCode,
    required String accountNumber,
    String? accountName,
  }) async {
    final data = await _api.put<Map<String, dynamic>>('/v1/payouts/account', body: {
      'bankName': bankName.trim(),
      'bankCode': bankCode,
      'accountNumber': accountNumber.trim(),
      if (accountName != null && accountName.trim().isNotEmpty) 'accountName': accountName.trim(),
    });
    return PayoutAccount.fromJson(data);
  }

  Future<List<Payout>> history() async {
    final data = await _api.get<List<dynamic>>('/v1/payouts');
    return data.map((e) => Payout.fromJson(e as Map<String, dynamic>)).toList();
  }
}

final payoutRepositoryProvider =
    Provider<PayoutRepository>((ref) => PayoutRepository(ref.watch(apiClientProvider)));

final payoutAccountProvider =
    FutureProvider<PayoutAccount?>((ref) => ref.watch(payoutRepositoryProvider).account());

final payoutHistoryProvider =
    FutureProvider<List<Payout>>((ref) => ref.watch(payoutRepositoryProvider).history());
