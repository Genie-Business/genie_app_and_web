import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'wishlist_models.dart';

class WishlistsRepository {
  WishlistsRepository(this._api);
  final ApiClient _api;

  Future<Wishlist> get(String id) async {
    final data = await _api.get<Map<String, dynamic>>('/v1/wishlists/$id');
    return Wishlist.fromJson(data);
  }

  Future<Wishlist> create({required String eventId, required String name}) async {
    final data = await _api.post<Map<String, dynamic>>('/v1/wishlists',
        body: {'eventId': eventId, 'name': name});
    return Wishlist.fromJson(data);
  }

  Future<Wishlist> addItem(
    String wishlistId, {
    required String productId,
    int quantityWanted = 1,
    String? note,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/v1/wishlists/$wishlistId/items',
      body: {
        'productId': productId,
        'quantityWanted': quantityWanted,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
    );
    return Wishlist.fromJson(data);
  }

  Future<Wishlist> updateItem(
    String wishlistId,
    String itemId, {
    int? quantityWanted,
    String? note,
  }) async {
    final data = await _api.patch<Map<String, dynamic>>(
      '/v1/wishlists/$wishlistId/items/$itemId',
      body: {
        if (quantityWanted != null) 'quantityWanted': quantityWanted,
        if (note != null) 'note': note.trim(),
      },
    );
    return Wishlist.fromJson(data);
  }

  Future<Wishlist> removeItem(String wishlistId, String itemId) async {
    final data =
        await _api.delete<Map<String, dynamic>>('/v1/wishlists/$wishlistId/items/$itemId');
    return Wishlist.fromJson(data);
  }

  Future<WishlistShare> share(String wishlistId) async {
    final data = await _api.get<Map<String, dynamic>>('/v1/wishlists/$wishlistId/share');
    return WishlistShare.fromJson(data);
  }
}

final wishlistsRepositoryProvider =
    Provider<WishlistsRepository>((ref) => WishlistsRepository(ref.watch(apiClientProvider)));

final wishlistProvider = FutureProvider.family<Wishlist, String>(
    (ref, id) => ref.watch(wishlistsRepositoryProvider).get(id));
