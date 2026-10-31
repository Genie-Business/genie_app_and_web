import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

/// Where a payment stands. COMPLETED means it was confirmed and whatever it paid for was created.
class PaymentStatus {
  const PaymentStatus({
    required this.reference,
    required this.status,
    required this.amountKobo,
    this.checkoutUrl,
  });
  final String reference;
  final String status;
  final String amountKobo;

  /// The hosted payment page, so an unfinished payment can be reopened.
  final String? checkoutUrl;

  bool get isDone => status == 'COMPLETED';
  bool get isFailed => status == 'FAILED' || status == 'EXPIRED';

  factory PaymentStatus.fromJson(Map<String, dynamic> j) => PaymentStatus(
        reference: (j['reference'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'PENDING',
        amountKobo: (j['amountKobo'] ?? '0').toString(),
        checkoutUrl: j['checkoutUrl'] as String?,
      );
}

class PaymentRepository {
  PaymentRepository(this._api);
  final ApiClient _api;

  /// Asks the server, which in turn asks the payment provider if the payment is still open,
  /// so the answer is current even before the provider's webhook lands.
  Future<PaymentStatus> status(String reference) async => PaymentStatus.fromJson(
        await _api.get<Map<String, dynamic>>('/v1/payments/intents/${Uri.encodeComponent(reference)}'),
      );
}

final paymentRepositoryProvider =
    Provider<PaymentRepository>((ref) => PaymentRepository(ref.watch(apiClientProvider)));
