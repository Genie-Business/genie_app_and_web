import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class Bank {
  const Bank({required this.code, required this.name});
  final String code;
  final String name;

  factory Bank.fromJson(Map<String, dynamic> j) =>
      Bank(code: (j['code'] as String?) ?? '', name: (j['name'] as String?) ?? '');

  @override
  bool operator ==(Object other) => other is Bank && other.code == code;

  @override
  int get hashCode => code.hashCode;
}

/// The name a bank holds against an account number.
class ResolvedAccount {
  const ResolvedAccount({required this.accountName, required this.bankName});
  final String accountName;
  final String bankName;

  factory ResolvedAccount.fromJson(Map<String, dynamic> j) => ResolvedAccount(
        accountName: (j['accountName'] as String?) ?? '',
        bankName: (j['bankName'] as String?) ?? '',
      );
}

class BankRepository {
  BankRepository(this._api);
  final ApiClient _api;

  /// Public: merchants pick a bank while signing up, before they have an account.
  Future<List<Bank>> list() async {
    final data = await _api.get<List<dynamic>>('/v1/banks', auth: false);
    return data.map((e) => Bank.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Ask the bank who owns [accountNumber]. While signing up there is no session
  /// yet, so the [signupToken] from confirming the email (with `auth: false`)
  /// identifies the merchant instead.
  Future<ResolvedAccount> resolve({
    required String bankCode,
    required String accountNumber,
    String? signupToken,
    bool auth = true,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/v1/banks/resolve',
      auth: auth,
      body: {
        'bankCode': bankCode,
        'accountNumber': accountNumber,
        if (signupToken != null) 'signupToken': signupToken,
      },
    );
    return ResolvedAccount.fromJson(data);
  }
}

final bankRepositoryProvider =
    Provider<BankRepository>((ref) => BankRepository(ref.watch(apiClientProvider)));

/// The bank list changes rarely, so it is fetched once per app run.
final banksProvider = FutureProvider<List<Bank>>((ref) => ref.watch(bankRepositoryProvider).list());
