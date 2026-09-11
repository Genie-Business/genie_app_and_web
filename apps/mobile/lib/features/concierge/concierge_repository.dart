import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'concierge_models.dart';

class ConciergeRepository {
  ConciergeRepository(this._api);
  final ApiClient _api;

  Future<ConciergeRequest> create({
    required String wishlistId,
    required String sourceUrl,
    required String name,
    String? note,
    int? estimatedPriceKobo,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/v1/concierge',
      body: {
        'wishlistId': wishlistId,
        'sourceUrl': sourceUrl,
        'name': name,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (estimatedPriceKobo != null) 'estimatedPriceKobo': estimatedPriceKobo,
      },
    );
    return ConciergeRequest.fromJson(data);
  }

  Future<List<ConciergeRequest>> myRequests() async {
    final data = await _api.get<List<dynamic>>('/v1/concierge');
    return data.map((e) => ConciergeRequest.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> cancel(String id) => _api.delete<Map<String, dynamic>>('/v1/concierge/$id');
}

final conciergeRepositoryProvider =
    Provider<ConciergeRepository>((ref) => ConciergeRepository(ref.watch(apiClientProvider)));
