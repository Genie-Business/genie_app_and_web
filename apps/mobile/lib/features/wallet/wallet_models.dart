class WalletBalance {
  const WalletBalance({required this.balanceKobo, required this.currency, required this.status});
  final String balanceKobo;
  final String currency;
  final String status;

  bool get isActive => status == 'ACTIVE';

  factory WalletBalance.fromJson(Map<String, dynamic> j) => WalletBalance(
        balanceKobo: (j['balanceKobo'] ?? '0').toString(),
        currency: (j['currency'] as String?) ?? 'NGN',
        status: (j['status'] as String?) ?? 'ACTIVE',
      );
}

class VirtualAccount {
  const VirtualAccount({required this.accountNumber, required this.bankName, required this.accountName});
  final String accountNumber;
  final String bankName;
  final String accountName;

  factory VirtualAccount.fromJson(Map<String, dynamic> j) => VirtualAccount(
        accountNumber: j['accountNumber'] as String,
        bankName: j['bankName'] as String,
        accountName: j['accountName'] as String,
      );
}

class PaymentIntent {
  const PaymentIntent({
    required this.reference,
    required this.amountKobo,
    required this.status,
    this.virtualAccount,
  });

  final String reference;
  final String amountKobo;
  final String status;
  final VirtualAccount? virtualAccount;

  bool get completed => status == 'COMPLETED';

  factory PaymentIntent.fromJson(Map<String, dynamic> j) => PaymentIntent(
        reference: j['reference'] as String,
        amountKobo: j['amountKobo'].toString(),
        status: (j['status'] as String?) ?? 'PENDING',
        virtualAccount: j['virtualAccount'] == null
            ? null
            : VirtualAccount.fromJson(j['virtualAccount'] as Map<String, dynamic>),
      );
}
