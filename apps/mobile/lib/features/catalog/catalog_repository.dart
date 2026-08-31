import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'catalog_models.dart';

class CatalogRepository {
  CatalogRepository(this._api);
  final ApiClient _api;

  Future<List<Category>> categories() async {
    final data = await _api.get<List<dynamic>>('/v1/categories');
    return data.map((e) => Category.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// One page of the catalogue. [category] is a category id or slug.
  Future<List<Product>> products({String? category, String? query, int page = 1}) async {
    final res = await _api.getPaged<List<dynamic>>(
      '/v1/products',
      query: {
        'page': page,
        'pageSize': 30,
        if (category != null) 'category': category,
        if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
      },
    );
    return res.data.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Product> product(String id) async {
    final data = await _api.get<Map<String, dynamic>>('/v1/products/$id');
    return Product.fromJson(data);
  }
}

final catalogRepositoryProvider =
    Provider<CatalogRepository>((ref) => CatalogRepository(ref.watch(apiClientProvider)));

final categoriesProvider = FutureProvider<List<Category>>(
    (ref) => ref.watch(catalogRepositoryProvider).categories());
