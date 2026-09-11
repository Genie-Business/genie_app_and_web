/// A celebrant's request to import a gift from a link outside genie's
/// catalogue. NEW/IN_REVIEW mean a concierge hasn't priced it yet — the
/// linked wishlist item shows as "Sourcing…" until it's ACTIVE.
class ConciergeRequest {
  const ConciergeRequest({
    required this.id,
    required this.sourceUrl,
    required this.name,
    required this.status,
    required this.productId,
    required this.wishlistItemId,
    this.note,
    this.estimatedPriceKobo,
    this.rejectionReason,
  });

  final String id;
  final String sourceUrl;
  final String name;
  final String? note;
  final String? estimatedPriceKobo;
  final String status;
  final String? rejectionReason;
  final String productId;
  final String wishlistItemId;

  bool get isPending => status == 'NEW' || status == 'IN_REVIEW';

  factory ConciergeRequest.fromJson(Map<String, dynamic> j) => ConciergeRequest(
        id: j['id'] as String,
        sourceUrl: j['sourceUrl'] as String,
        name: j['name'] as String,
        note: j['note'] as String?,
        estimatedPriceKobo: j['estimatedPriceKobo']?.toString(),
        status: (j['status'] as String?) ?? 'NEW',
        rejectionReason: j['rejectionReason'] as String?,
        productId: j['productId'] as String,
        wishlistItemId: j['wishlistItemId'] as String,
      );
}
