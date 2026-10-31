import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

/// Referral credit the user can spend at checkout, in kobo. It reduces what they pay for a gift.
final referralCreditProvider = FutureProvider.autoDispose<String>((ref) async {
  final data = await ref.watch(apiClientProvider).get<Map<String, dynamic>>('/v1/referrals');
  return (data['creditAvailableKobo'] ?? '0').toString();
});
