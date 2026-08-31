import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../catalog/catalog_models.dart';
import 'merchant_models.dart';

class MerchantRepository {
  MerchantRepository(this._api);
  final ApiClient _api;

  Future<List<Product>> products() async {
    final data = await _api.get<List<dynamic>>('/v1/merchant/products');
    return data.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Product> createProduct({
    required String categoryId,
    required String name,
    required String description,
    required int priceKobo,
    required int quantity,
    String deliveryOption = 'BOTH',
    String? location,
    List<String> imageUrls = const [],
  }) async {
    final data = await _api.post<Map<String, dynamic>>('/v1/merchant/products', body: {
      'categoryId': categoryId,
      'name': name,
      'description': description,
      'priceKobo': priceKobo,
      'quantity': quantity,
      'deliveryOption': deliveryOption,
      if (location != null && location.trim().isNotEmpty) 'location': location.trim(),
      'imageUrls': imageUrls,
    });
    return Product.fromJson(data);
  }

  Future<Product> updateProduct(String id, Map<String, dynamic> patch) async {
    final data = await _api.patch<Map<String, dynamic>>('/v1/merchant/products/$id', body: patch);
    return Product.fromJson(data);
  }

  Future<void> deleteProduct(String id) =>
      _api.delete<Map<String, dynamic>>('/v1/merchant/products/$id');

  Future<void> setInventory(String id, int availableStock) => _api.put<Map<String, dynamic>>(
        '/v1/merchant/products/$id/inventory',
        body: {'availableStock': availableStock},
      );

  Future<List<MerchantOrder>> orders() async {
    final data = await _api.get<List<dynamic>>('/v1/merchant/orders');
    return data.map((e) => MerchantOrder.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> updateDelivery(String orderId, String status, {String? courierName, String? courierRef}) =>
      _api.patch<Map<String, dynamic>>('/v1/merchant/orders/$orderId/delivery', body: {
        'status': status,
        if (courierName != null && courierName.trim().isNotEmpty) 'courierName': courierName.trim(),
        if (courierRef != null && courierRef.trim().isNotEmpty) 'courierRef': courierRef.trim(),
      });
}

final merchantRepositoryProvider =
    Provider<MerchantRepository>((ref) => MerchantRepository(ref.watch(apiClientProvider)));

final merchantProductsProvider =
    FutureProvider<List<Product>>((ref) => ref.watch(merchantRepositoryProvider).products());

final merchantOrdersProvider =
    FutureProvider<List<MerchantOrder>>((ref) => ref.watch(merchantRepositoryProvider).orders());
