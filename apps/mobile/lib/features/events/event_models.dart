class EventWishlistRef {
  const EventWishlistRef({required this.id, required this.name, required this.itemCount});
  final String id;
  final String name;
  final int itemCount;

  factory EventWishlistRef.fromJson(Map<String, dynamic> j) => EventWishlistRef(
        id: j['id'] as String,
        name: j['name'] as String,
        itemCount: (j['itemCount'] as num).toInt(),
      );
}

class Event {
  const Event({
    required this.id,
    required this.type,
    required this.name,
    required this.eventDate,
    required this.expiresAt,
    required this.status,
    required this.wishlistCount,
    required this.itemCount,
    required this.fulfilmentPct,
    required this.wishlists,
    this.deliveryAddress,
  });

  final String id;
  final String type;
  final String name;
  final String eventDate;
  final String expiresAt;
  final String status;
  final int wishlistCount;
  final int itemCount;
  final int fulfilmentPct;
  final List<EventWishlistRef> wishlists;
  final String? deliveryAddress;

  bool get isActive => status == 'ACTIVE';

  factory Event.fromJson(Map<String, dynamic> j) => Event(
        id: j['id'] as String,
        type: j['type'] as String,
        name: j['name'] as String,
        eventDate: j['eventDate'] as String,
        expiresAt: (j['expiresAt'] ?? j['eventDate']) as String,
        status: (j['status'] as String?) ?? 'ACTIVE',
        wishlistCount: (j['wishlistCount'] as num?)?.toInt() ?? 0,
        itemCount: (j['itemCount'] as num?)?.toInt() ?? 0,
        fulfilmentPct: (j['fulfilmentPct'] as num?)?.toInt() ?? 0,
        deliveryAddress: j['deliveryAddress'] as String?,
        wishlists: ((j['wishlists'] as List?) ?? [])
            .map((e) => EventWishlistRef.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
