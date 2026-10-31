import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../payout_repository.dart';

/// What genie owes the merchant, stage by stage, and what has already been paid out.
class EarningsScreen extends ConsumerWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final earnings = ref.watch(earningsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: AsyncView<Earnings>(
        value: earnings,
        onRefresh: () async {
          ref.invalidate(payoutHistoryProvider);
          return ref.refresh(earningsProvider.future);
        },
        data: (e) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            if (!e.hasSettlementAccount) _SetupBanner(onTap: () => context.push('/merchant/payout')),
            _Headline(label: 'Ready for your next payout', kobo: e.readyForPayoutKobo, orders: e.readyForPayoutOrders),
            const SizedBox(height: 16),
            _Row(
              icon: Icons.local_shipping_outlined,
              label: 'Waiting for delivery',
              hint: e.awaitingDeliveryOrders == 0
                  ? 'Paid for by the buyer, released once you deliver'
                  : '${e.awaitingDeliveryOrders} order${e.awaitingDeliveryOrders == 1 ? '' : 's'} paid for, not delivered yet',
              kobo: e.awaitingDeliveryKobo,
            ),
            _Row(
              icon: Icons.schedule_outlined,
              label: 'On its way to your bank',
              hint: 'Sent, waiting for the bank to confirm',
              kobo: e.payingOutKobo,
            ),
            _Row(
              icon: Icons.check_circle_outline,
              label: 'Paid out so far',
              hint: 'Already in your bank account',
              kobo: e.paidOutKobo,
            ),
            const SizedBox(height: 12),
            Text(
              [
                'genie pays delivered orders into your settlement account every morning, minus our commission.',
                if (e.holdHours > 0) 'Payouts go out ${e.holdHours} hours after delivery.',
                'Amounts under ${formatKobo(e.minimumPayoutKobo)} wait and go out with the next order.',
              ].join(' '),
              style: const TextStyle(color: GenieColors.inkMuted, fontSize: 12, height: 1.4),
            ),
            if (e.hasSettlementAccount && !e.settlementVerified) ...[
              const SizedBox(height: 12),
              const Text(
                'Your settlement account hasn’t been confirmed with your bank yet. It is checked before each payout.',
                style: TextStyle(color: GenieColors.inkSecondary, fontSize: 12, height: 1.4),
              ),
            ],
            const SizedBox(height: 24),
            Text('Recent payouts', style: GenieTheme.display(16)),
            const SizedBox(height: 8),
            const _PayoutList(),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () => context.push('/merchant/payout'),
              icon: const Icon(Icons.account_balance_outlined),
              label: const Text('Settlement account'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SetupBanner extends StatelessWidget {
  const _SetupBanner({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        color: GenieColors.primarySoft,
        margin: const EdgeInsets.only(bottom: 16),
        child: ListTile(
          leading: const Icon(Icons.info_outline, color: GenieColors.primary),
          title: const Text('Add your settlement account'),
          subtitle: const Text('genie needs it to pay you for delivered orders.'),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );
}

class _Headline extends StatelessWidget {
  const _Headline({required this.label, required this.kobo, required this.orders});
  final String label;
  final String kobo;
  final int orders;

  @override
  Widget build(BuildContext context) => Card(
        color: GenieColors.primary,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 6),
              Text(formatKobo(kobo), style: GenieTheme.display(30).copyWith(color: Colors.white)),
              const SizedBox(height: 4),
              Text(
                orders == 0 ? 'Nothing delivered and unpaid' : '$orders delivered order${orders == 1 ? '' : 's'}',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        ),
      );
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.hint, required this.kobo});
  final IconData icon;
  final String label;
  final String hint;
  final String kobo;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon, color: GenieColors.inkSecondary),
        title: Text(label),
        subtitle: Text(hint, style: const TextStyle(fontSize: 12)),
        trailing: Text(formatKobo(kobo), style: const TextStyle(fontWeight: FontWeight.w700)),
      );
}

class _PayoutList extends ConsumerWidget {
  const _PayoutList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(payoutHistoryProvider);
    return history.when(
      loading: () => const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())),
      error: (_, __) => const Text('Could not load payouts.', style: TextStyle(color: GenieColors.inkMuted, fontSize: 13)),
      data: (list) => list.isEmpty
          ? const Text('No payouts yet. They appear here once an order has been delivered.',
              style: TextStyle(color: GenieColors.inkMuted, fontSize: 13))
          : Column(
              children: list
                  .map((p) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(formatKobo(p.netAmountKobo)),
                        subtitle: Text('${p.reference} · ${relativeDay(p.createdAt)}'),
                        trailing: Text(
                          p.status[0] + p.status.substring(1).toLowerCase(),
                          style: const TextStyle(fontSize: 12, color: GenieColors.inkSecondary),
                        ),
                      ))
                  .toList(),
            ),
    );
  }
}
