class GiftQuote {
  const GiftQuote({
    required this.quantity,
    required this.subtotalKobo,
    required this.transactionFeeKobo,
    required this.logisticsFeeKobo,
    required this.gifterPaysKobo,
  });

  final int quantity;
  final String subtotalKobo;
  final String transactionFeeKobo;
  final String logisticsFeeKobo;
  final String gifterPaysKobo;

  factory GiftQuote.fromJson(Map<String, dynamic> j) => GiftQuote(
        quantity: (j['quantity'] as num?)?.toInt() ?? 1,
        subtotalKobo: j['subtotalKobo'].toString(),
        transactionFeeKobo: (j['transactionFeeKobo'] ?? '0').toString(),
        logisticsFeeKobo: (j['logisticsFeeKobo'] ?? '0').toString(),
        gifterPaysKobo: j['gifterPaysKobo'].toString(),
      );
}

class ReceivedGift {
  const ReceivedGift({
    required this.id,
    required this.productName,
    required this.eventName,
    required this.amountKobo,
    required this.isAnonymous,
    required this.revealed,
    required this.canReveal,
    required this.status,
    this.from,
    this.message,
  });

  final String id;
  final String productName;
  final String eventName;
  final String amountKobo;
  final bool isAnonymous;
  final bool revealed;
  final bool canReveal;
  final String status;
  final String? from;
  final String? message;

  factory ReceivedGift.fromJson(Map<String, dynamic> j) => ReceivedGift(
        id: j['id'] as String,
        productName: j['productName'] as String,
        eventName: (j['eventName'] as String?) ?? '',
        amountKobo: j['amountKobo'].toString(),
        isAnonymous: (j['isAnonymous'] as bool?) ?? false,
        revealed: (j['revealed'] as bool?) ?? false,
        canReveal: (j['canReveal'] as bool?) ?? false,
        status: (j['status'] as String?) ?? '',
        from: j['from'] as String?,
        message: j['message'] as String?,
      );
}

class PublicWishlistItem {
  const PublicWishlistItem({
    required this.id,
    required this.productName,
    required this.unitPriceKobo,
    required this.quantityWanted,
    required this.quantityFulfilled,
    this.productImageUrl,
    this.note,
  });

  final String id;
  final String productName;
  final String unitPriceKobo;
  final int quantityWanted;
  final int quantityFulfilled;
  final String? productImageUrl;
  final String? note;

  bool get fulfilled => quantityFulfilled >= quantityWanted;

  factory PublicWishlistItem.fromJson(Map<String, dynamic> j) => PublicWishlistItem(
        id: j['id'] as String,
        productName: j['productName'] as String,
        unitPriceKobo: j['unitPriceKobo'].toString(),
        quantityWanted: (j['quantityWanted'] as num).toInt(),
        quantityFulfilled: (j['quantityFulfilled'] as num?)?.toInt() ?? 0,
        productImageUrl: j['productImageUrl'] as String?,
        note: j['note'] as String?,
      );
}

class PublicWishlist {
  const PublicWishlist({
    required this.wishlistName,
    required this.celebrantName,
    required this.eventName,
    required this.eventDate,
    required this.items,
  });

  final String wishlistName;
  final String celebrantName;
  final String eventName;
  final String eventDate;
  final List<PublicWishlistItem> items;

  factory PublicWishlist.fromJson(Map<String, dynamic> j) => PublicWishlist(
        wishlistName: (j['wishlistName'] as String?) ?? 'Wishlist',
        celebrantName: (j['celebrantName'] as String?) ?? '',
        eventName: (j['eventName'] as String?) ?? '',
        eventDate: (j['eventDate'] as String?) ?? '',
        items: ((j['items'] as List?) ?? [])
            .map((e) => PublicWishlistItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
