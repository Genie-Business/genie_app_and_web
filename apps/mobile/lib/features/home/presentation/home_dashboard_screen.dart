import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format.dart';
import '../../../theme/genie_theme.dart';
import '../../activity/activity_screen.dart';
import '../../auth/auth_controller.dart';
import '../../events/events_repository.dart';
import '../../gifts/gift_models.dart';
import '../../gifts/gifts_repository.dart';
import '../../wallet/wallet_repository.dart';

/// The celebrant home — wallet, invites to gift, upcoming event, recent
/// gifts and activity, all in one place.
class HomeDashboardScreen extends ConsumerWidget {
  const HomeDashboardScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref
      ..invalidate(walletBalanceProvider)
      ..invalidate(giftInvitationsProvider)
      ..invalidate(eventsListProvider)
      ..invalidate(receivedGiftsProvider)
      ..invalidate(activityProvider);
    await ref.read(giftInvitationsProvider.future).catchError((_) => <GiftInvitation>[]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final firstName = (user?.firstName ?? '').trim();

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text(
            firstName.isEmpty ? 'Welcome back' : 'Hi, $firstName 👋',
            style: GenieTheme.display(22),
          ),
          const SizedBox(height: 16),
          const _WalletCard(),
          const SizedBox(height: 24),
          const _InvitationsSection(),
          const SizedBox(height: 24),
          const _NextEventSection(),
          const SizedBox(height: 24),
          const _ReceivedSection(),
          const SizedBox(height: 24),
          const _ActivitySection(),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title, {this.onSeeAll});
  final String title;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(title, style: GenieTheme.display(18)),
            if (onSeeAll != null)
              TextButton(onPressed: onSeeAll, child: const Text('See all')),
          ],
        ),
      );
}

class _Muted extends StatelessWidget {
  const _Muted(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(text, style: const TextStyle(color: GenieColors.inkMuted)),
      );
}

// ── Wallet ────────────────────────────────────────────────────────────
class _WalletCard extends ConsumerWidget {
  const _WalletCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balance = ref.watch(walletBalanceProvider);
    return Card(
      color: GenieColors.primary,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/wallet'),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Wallet balance', style: TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 6),
              balance.when(
                data: (w) => Text(formatKobo(w.balanceKobo),
                    style: GenieTheme.display(28).copyWith(color: Colors.white)),
                loading: () => const SizedBox(
                    height: 28,
                    width: 28,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)),
                error: (_, __) =>
                    const Text('—', style: TextStyle(color: Colors.white, fontSize: 24)),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  _WalletAction(
                    icon: Icons.add,
                    label: 'Add funds',
                    onTap: () => context.push('/wallet'),
                  ),
                  const SizedBox(width: 10),
                  _WalletAction(
                    icon: Icons.card_giftcard,
                    label: 'Gift a friend',
                    onTap: () => context.push('/gift'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WalletAction extends StatelessWidget {
  const _WalletAction({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Expanded(
        child: OutlinedButton.icon(
          onPressed: onTap,
          icon: Icon(icon, size: 16, color: Colors.white),
          label: Text(label, style: const TextStyle(color: Colors.white)),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: Colors.white38),
            padding: const EdgeInsets.symmetric(vertical: 10),
          ),
        ),
      );
}

// ── Invitations to gift ───────────────────────────────────────────────
class _InvitationsSection extends ConsumerWidget {
  const _InvitationsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invites = ref.watch(giftInvitationsProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Invites to gift', style: GenieTheme.display(18)),
            TextButton.icon(
              onPressed: () => context.push('/gift'),
              icon: const Icon(Icons.link, size: 16),
              label: const Text('Have a link?'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        invites.when(
          loading: () => const _Muted('Loading…'),
          error: (_, __) => const _Muted('Could not load invites.'),
          data: (list) => list.isEmpty
              ? const _Muted(
                  'When a friend shares a wishlist with you, it shows up here to gift from.')
              : Column(
                  children: list
                      .take(4)
                      .map((inv) => _InvitationCard(inv))
                      .toList(),
                ),
        ),
      ],
    );
  }
}

class _InvitationCard extends StatelessWidget {
  const _InvitationCard(this.inv);
  final GiftInvitation inv;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/gift?link=${inv.wishlistId}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: GenieColors.primarySoft,
                child: Text(
                  inv.celebrantName.characters.first.toUpperCase(),
                  style: const TextStyle(color: GenieColors.primaryDark, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${inv.celebrantName} · ${inv.eventType}',
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(
                      '${inv.eventName}'
                      '${inv.eventDate.isEmpty ? '' : ' · ${relativeDay(inv.eventDate)}'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: GenieColors.inkSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${inv.outstandingCount} of ${inv.itemCount} still needed · '
                      '${formatKobo(inv.outstandingValueKobo)} to complete',
                      style: const TextStyle(color: GenieColors.primary, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: GenieColors.inkMuted),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Next event ────────────────────────────────────────────────────────
class _NextEventSection extends ConsumerWidget {
  const _NextEventSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(eventsListProvider);
    return events.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (list) {
        final upcoming = [...list.where((e) => e.isActive)]
          ..sort((a, b) => a.eventDate.compareTo(b.eventDate));
        if (upcoming.isEmpty) {
          return Card(
            child: ListTile(
              leading: const Icon(Icons.celebration_outlined, color: GenieColors.primary),
              title: const Text('Create your first event'),
              subtitle: const Text('A birthday, wedding, or any celebration'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/events/new'),
            ),
          );
        }
        final e = upcoming.first;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader('Your next event', onSeeAll: null),
            Card(
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => context.push('/events/${e.id}'),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(e.name, style: GenieTheme.display(17)),
                      const SizedBox(height: 4),
                      Text(
                        '${e.type} · ${formatDate(e.eventDate)} (${relativeDay(e.eventDate)})'
                        '${e.isRecurring ? ' · yearly' : ''}',
                        style: const TextStyle(color: GenieColors.inkSecondary, fontSize: 13),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Text('${e.wishlistCount} wishlist${e.wishlistCount == 1 ? '' : 's'}',
                              style: const TextStyle(fontSize: 12, color: GenieColors.inkMuted)),
                          const SizedBox(width: 16),
                          Text('${e.itemCount} item${e.itemCount == 1 ? '' : 's'}',
                              style: const TextStyle(fontSize: 12, color: GenieColors.inkMuted)),
                          const Spacer(),
                          if (e.itemCount > 0)
                            Text('${e.fulfilmentPct}% gifted',
                                style: const TextStyle(
                                    fontSize: 12, color: GenieColors.primary, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

// ── Gifts received ────────────────────────────────────────────────────
class _ReceivedSection extends ConsumerWidget {
  const _ReceivedSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final received = ref.watch(receivedGiftsProvider);
    return received.maybeWhen(
      data: (list) {
        if (list.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader('Gifts received', onSeeAll: () => context.push('/gifts/received')),
            ...list.take(3).map((g) => Card(
                  child: ListTile(
                    dense: true,
                    leading: const Icon(Icons.redeem, color: GenieColors.primary),
                    title: Text(g.productName, maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text(
                        '${g.eventName} · ${g.isAnonymous && !g.revealed ? 'Anonymous' : (g.from ?? 'A friend')}'),
                    trailing: Text(formatKobo(g.amountKobo), style: const TextStyle(fontSize: 12)),
                  ),
                )),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

// ── Recent activity ───────────────────────────────────────────────────
class _ActivitySection extends ConsumerWidget {
  const _ActivitySection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(activityProvider);
    return feed.maybeWhen(
      data: (list) {
        if (list.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader('Recent activity', onSeeAll: () => context.push('/activity')),
            ...list.take(4).map((a) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.circle, size: 8, color: GenieColors.primary),
                  title: Text(a.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                  trailing: Text(relativeDay(a.createdAt),
                      style: const TextStyle(fontSize: 11, color: GenieColors.inkMuted)),
                )),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}
