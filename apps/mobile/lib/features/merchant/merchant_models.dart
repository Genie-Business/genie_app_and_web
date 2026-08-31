class OrderItem {
  const OrderItem({required this.description, required this.quantity, required this.lineTotalKobo});
  final String description;
  final int quantity;
  final String lineTotalKobo;

  factory OrderItem.fromJson(Map<String, dynamic> j) => OrderItem(
        description: j['description'] as String,
        quantity: (j['quantity'] as num).toInt(),
        lineTotalKobo: j['lineTotalKobo'].toString(),
      );
}

class MerchantDelivery {
  const MerchantDelivery({required this.status, this.courierName, this.courierRef});
  final String status;
  final String? courierName;
  final String? courierRef;

  factory MerchantDelivery.fromJson(Map<String, dynamic> j) => MerchantDelivery(
        status: j['status'] as String,
        courierName: j['courierName'] as String?,
        courierRef: j['courierRef'] as String?,
      );
}

class MerchantOrder {
  const MerchantOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.proceedsKobo,
    required this.subtotalKobo,
    required this.items,
    required this.isGift,
    required this.createdAt,
    this.delivery,
  });

  final String id;
  final String orderNumber;
  final String status;
  final String proceedsKobo;
  final String subtotalKobo;
  final List<OrderItem> items;
  final bool isGift;
  final String createdAt;
  final MerchantDelivery? delivery;

  String get deliveryStatus => delivery?.status ?? 'PENDING';

  factory MerchantOrder.fromJson(Map<String, dynamic> j) => MerchantOrder(
        id: j['id'] as String,
        orderNumber: j['orderNumber'] as String,
        status: j['status'] as String,
        proceedsKobo: (j['proceedsKobo'] ?? '0').toString(),
        subtotalKobo: (j['subtotalKobo'] ?? '0').toString(),
        isGift: (j['isGift'] as bool?) ?? false,
        createdAt: j['createdAt'] as String,
        delivery: j['delivery'] == null
            ? null
            : MerchantDelivery.fromJson(j['delivery'] as Map<String, dynamic>),
        items: ((j['items'] as List?) ?? [])
            .map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
