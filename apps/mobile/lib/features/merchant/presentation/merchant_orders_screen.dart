import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../merchant_models.dart';
import '../merchant_repository.dart';

// A merchant sends the parcel on its way. They cannot mark it delivered: that comes from the delivery
// company or the person receiving the gift, and it is what releases their payment.
const _nextStatus = {
  'PENDING': 'DISPATCHED',
  'DISPATCHED': 'IN_TRANSIT',
};
const _statusLabel = {
  'PENDING': 'Mark dispatched',
  'DISPATCHED': 'Mark in transit',
};

/// Merchant "Orders" tab — incoming gift orders.
class MerchantOrdersScreen extends ConsumerWidget {
  const MerchantOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(merchantOrdersProvider);
    return AsyncView<List<MerchantOrder>>(
      value: orders,
      onRefresh: () => ref.refresh(merchantOrdersProvider.future),
      emptyWhen: (l) => l.isEmpty,
      empty: const EmptyState(
        icon: Icons.receipt_long_rounded,
        title: 'No orders yet',
        body: 'When a genie user gifts one of your products, the order shows up here.',
      ),
      data: (list) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: list.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => _OrderCard(order: list[i]),
      ),
    );
  }
}

class _OrderCard extends ConsumerWidget {
  const _OrderCard({required this.order});
  final MerchantOrder order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final next = _nextStatus[order.deliveryStatus];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(order.orderNumber,
                      style: GenieTheme.display(15), maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                _StatusPill(order.deliveryStatus),
              ],
            ),
            const SizedBox(height: 6),
            ...order.items.map((it) => Text('${it.quantity}× ${it.description}',
                style: const TextStyle(color: GenieColors.inkSecondary, fontSize: 13))),
            const SizedBox(height: 8),
            Row(
              children: [
                Text('You receive ${formatKobo(order.proceedsKobo)}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                if (order.isGift) ...[
                  const SizedBox(width: 8),
                  const Icon(Icons.card_giftcard, size: 14, color: GenieColors.primary),
                ],
              ],
            ),
            if (next == null && order.deliveryStatus != 'DELIVERED') ...[
              const SizedBox(height: 10),
              const Text(
                'On its way. Once the delivery company or the person it is for confirms it arrived, you are paid straight away.',
                key: ValueKey('awaiting-confirmation'),
                style: TextStyle(color: GenieColors.inkMuted, fontSize: 12, height: 1.4),
              ),
            ],
            if (order.deliveryStatus == 'DELIVERED') ...[
              const SizedBox(height: 10),
              const Text(
                'Delivered. Your payment is on its way to your bank account.',
                key: ValueKey('delivered-note'),
                style: TextStyle(color: GenieColors.success, fontSize: 12, height: 1.4),
              ),
            ],
            if (next != null) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton(
                  onPressed: () async {
                    final messenger = ScaffoldMessenger.of(context);
                    try {
                      await ref.read(merchantRepositoryProvider).updateDelivery(order.id, next);
                      ref.invalidate(merchantOrdersProvider);
                    } on ApiException catch (e) {
                      messenger.showSnackBar(SnackBar(content: Text(e.message)));
                    }
                  },
                  child: Text(_statusLabel[order.deliveryStatus] ?? 'Update'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.status);
  final String status;
  @override
  Widget build(BuildContext context) {
    final delivered = status == 'DELIVERED';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: delivered ? const Color(0x1416A46B) : GenieColors.subtle,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.replaceAll('_', ' ').toLowerCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: delivered ? GenieColors.success : GenieColors.inkSecondary,
        ),
      ),
    );
  }
}
