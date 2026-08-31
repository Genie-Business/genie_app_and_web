import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'gift_models.dart';

class GiftsRepository {
  GiftsRepository(this._api);
  final ApiClient _api;

  /// A shared wishlist by id — no auth needed (friends follow a link).
  Future<PublicWishlist> publicWishlist(String id) async {
    final data = await _api.get<Map<String, dynamic>>('/v1/public/wishlists/$id', auth: false);
    return PublicWishlist.fromJson(data);
  }

  Future<GiftQuote> quote(String wishlistItemId, {int quantity = 1}) async {
    final data = await _api.post<Map<String, dynamic>>('/v1/gifts/quote',
        body: {'wishlistItemId': wishlistItemId, 'quantity': quantity});
    return GiftQuote.fromJson(data);
  }

  /// Pay for a gift from the wallet. Returns the raw result (status / intent).
  Future<Map<String, dynamic>> pay({
    required String wishlistItemId,
    int quantity = 1,
    bool isAnonymous = false,
    String? message,
    String method = 'WALLET',
  }) =>
      _api.post<Map<String, dynamic>>('/v1/gifts', body: {
        'wishlistItemId': wishlistItemId,
        'quantity': quantity,
        'isAnonymous': isAnonymous,
        'method': method,
        if (message != null && message.trim().isNotEmpty) 'message': message.trim(),
      });

  Future<List<ReceivedGift>> received() async {
    final data = await _api.get<List<dynamic>>('/v1/gifts/received');
    return data.map((e) => ReceivedGift.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> reveal(String giftId) =>
      _api.post<Map<String, dynamic>>('/v1/gifts/$giftId/reveal');
}

final giftsRepositoryProvider =
    Provider<GiftsRepository>((ref) => GiftsRepository(ref.watch(apiClientProvider)));

final receivedGiftsProvider =
    FutureProvider<List<ReceivedGift>>((ref) => ref.watch(giftsRepositoryProvider).received());

/// [id] may be a full share URL or a bare wishlist id.
final publicWishlistProvider = FutureProvider.family<PublicWishlist, String>((ref, id) {
  final clean = id.contains('/') ? id.split('/').last.split('?').first : id;
  return ref.watch(giftsRepositoryProvider).publicWishlist(clean);
});
