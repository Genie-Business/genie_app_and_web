class Category {
  const Category({required this.id, required this.name, required this.slug, this.imageUrl});
  final String id;
  final String name;
  final String slug;
  final String? imageUrl;

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: j['id'] as String,
        name: j['name'] as String,
        slug: j['slug'] as String,
        imageUrl: j['imageUrl'] as String?,
      );
}

class ProductImage {
  const ProductImage({required this.url});
  final String url;
  factory ProductImage.fromJson(Map<String, dynamic> j) =>
      ProductImage(url: j['url'] as String);
}

class Product {
  const Product({
    required this.id,
    required this.name,
    required this.description,
    required this.priceKobo,
    required this.categoryId,
    required this.images,
    this.location,
    this.availableStock,
  });

  final String id;
  final String name;
  final String description;
  final String priceKobo;
  final String categoryId;
  final List<ProductImage> images;
  final String? location;
  final int? availableStock;

  String? get imageUrl => images.isEmpty ? null : images.first.url;
  bool get inStock => availableStock == null || availableStock! > 0;

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: j['id'] as String,
        name: j['name'] as String,
        description: (j['description'] as String?) ?? '',
        priceKobo: j['priceKobo'].toString(),
        categoryId: (j['categoryId'] as String?) ?? '',
        images: ((j['images'] as List?) ?? [])
            .map((e) => ProductImage.fromJson(e as Map<String, dynamic>))
            .toList(),
        location: j['location'] as String?,
        availableStock: (j['availableStock'] as num?)?.toInt(),
      );
}
