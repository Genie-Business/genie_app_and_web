class WishlistItem {
  const WishlistItem({
    required this.id,
    required this.productId,
    required this.productName,
    required this.unitPriceKobo,
    required this.quantityWanted,
    required this.quantityFulfilled,
    required this.isAnonymousGift,
    this.productImageUrl,
    this.note,
  });

  final String id;
  final String productId;
  final String productName;
  final String unitPriceKobo;
  final int quantityWanted;
  final int quantityFulfilled;
  final bool isAnonymousGift;
  final String? productImageUrl;
  final String? note;

  bool get fulfilled => quantityFulfilled >= quantityWanted;

  factory WishlistItem.fromJson(Map<String, dynamic> j) => WishlistItem(
        id: j['id'] as String,
        productId: j['productId'] as String,
        productName: j['productName'] as String,
        unitPriceKobo: j['unitPriceKobo'].toString(),
        quantityWanted: (j['quantityWanted'] as num).toInt(),
        quantityFulfilled: (j['quantityFulfilled'] as num?)?.toInt() ?? 0,
        isAnonymousGift: (j['isAnonymousGift'] as bool?) ?? false,
        productImageUrl: j['productImageUrl'] as String?,
        note: j['note'] as String?,
      );
}

class Wishlist {
  const Wishlist({
    required this.id,
    required this.eventId,
    required this.eventName,
    required this.name,
    required this.items,
    required this.totalValueKobo,
    required this.isShareable,
  });

  final String id;
  final String eventId;
  final String eventName;
  final String name;
  final List<WishlistItem> items;
  final String totalValueKobo;
  final bool isShareable;

  int get itemCount => items.length;

  factory Wishlist.fromJson(Map<String, dynamic> j) => Wishlist(
        id: j['id'] as String,
        eventId: (j['eventId'] as String?) ?? '',
        eventName: (j['eventName'] as String?) ?? '',
        name: j['name'] as String,
        totalValueKobo: (j['totalValueKobo'] ?? '0').toString(),
        isShareable: (j['isShareable'] as bool?) ?? false,
        items: ((j['items'] as List?) ?? [])
            .map((e) => WishlistItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class WishlistShare {
  const WishlistShare({required this.shareUrl, required this.isShareable, required this.itemCount});
  final String shareUrl;
  final bool isShareable;
  final int itemCount;

  factory WishlistShare.fromJson(Map<String, dynamic> j) => WishlistShare(
        shareUrl: j['shareUrl'] as String,
        isShareable: (j['isShareable'] as bool?) ?? false,
        itemCount: (j['itemCount'] as num?)?.toInt() ?? 0,
      );
}
