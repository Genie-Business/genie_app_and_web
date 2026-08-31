import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../events/events_repository.dart';
import '../wishlist_models.dart';
import '../wishlists_repository.dart';

class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key, required this.wishlistId});
  final String wishlistId;

  void _refreshRelated(WidgetRef ref, Wishlist w) {
    ref.invalidate(wishlistProvider(wishlistId));
    if (w.eventId.isNotEmpty) ref.invalidate(eventProvider(w.eventId));
    ref.invalidate(eventsListProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wl = ref.watch(wishlistProvider(wishlistId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Wishlist'),
        actions: [
          wl.maybeWhen(
            data: (w) => IconButton(
              icon: const Icon(Icons.ios_share),
              tooltip: 'Share',
              onPressed: () => _share(context, ref, w),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      floatingActionButton: wl.maybeWhen(
        data: (_) => FloatingActionButton.extended(
          onPressed: () async {
            await context.push('/wishlists/$wishlistId/add');
            ref.invalidate(wishlistProvider(wishlistId));
          },
          icon: const Icon(Icons.add_shopping_cart),
          label: const Text('Add items'),
        ),
        orElse: () => null,
      ),
      body: AsyncView<Wishlist>(
        value: wl,
        onRefresh: () => ref.refresh(wishlistProvider(wishlistId).future),
        emptyWhen: (w) => w.items.isEmpty,
        empty: EmptyState(
          icon: Icons.card_giftcard_rounded,
          title: 'Nothing on the list yet',
          body: 'Add products from genie merchants. You need at least 2 before you can share.',
          action: FilledButton(
            onPressed: () async {
              await context.push('/wishlists/$wishlistId/add');
              ref.invalidate(wishlistProvider(wishlistId));
            },
            child: const Text('Browse the catalogue'),
          ),
        ),
        data: (w) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          children: [
            Text(w.name, style: GenieTheme.display(22)),
            Text('${w.eventName} · ${formatKobo(w.totalValueKobo)} total',
                style: const TextStyle(color: GenieColors.inkSecondary)),
            const SizedBox(height: 8),
            if (!w.isShareable)
              Text('Add ${(2 - w.itemCount).clamp(0, 2)} more item(s) to unlock sharing.',
                  style: const TextStyle(color: GenieColors.inkMuted, fontSize: 12)),
            const SizedBox(height: 12),
            ...w.items.map((it) => _ItemTile(
                  item: it,
                  onRemove: () async {
                    try {
                      final updated = await ref
                          .read(wishlistsRepositoryProvider)
                          .removeItem(wishlistId, it.id);
                      _refreshRelated(ref, updated);
                    } on ApiException catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context)
                            .showSnackBar(SnackBar(content: Text(e.message)));
                      }
                    }
                  },
                )),
          ],
        ),
      ),
    );
  }

  Future<void> _share(BuildContext context, WidgetRef ref, Wishlist w) async {
    try {
      final s = await ref.read(wishlistsRepositoryProvider).share(wishlistId);
      if (!context.mounted) return;
      showModalBottomSheet<void>(
        context: context,
        builder: (_) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Share "${w.name}"', style: GenieTheme.display(18)),
              const SizedBox(height: 8),
              if (!s.isShareable)
                const Text('This wishlist needs at least 2 items before it can be shared.',
                    style: TextStyle(color: GenieColors.error))
              else ...[
                SelectableText(s.shareUrl,
                    style: const TextStyle(color: GenieColors.primaryDark)),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: s.shareUrl));
                    Navigator.of(context).pop();
                    ScaffoldMessenger.of(context)
                        .showSnackBar(const SnackBar(content: Text('Link copied')));
                  },
                  icon: const Icon(Icons.copy),
                  label: const Text('Copy link'),
                ),
              ],
            ],
          ),
        ),
      );
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item, required this.onRemove});
  final WishlistItem item;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: item.productImageUrl != null
              ? Image.network(item.productImageUrl!,
                  width: 48, height: 48, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const _ImgFallback())
              : const _ImgFallback(),
        ),
        title: Text(item.productName, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          '${formatKobo(item.unitPriceKobo)}'
          '${item.quantityWanted > 1 ? ' · x${item.quantityWanted}' : ''}'
          '${item.quantityFulfilled > 0 ? ' · ${item.quantityFulfilled}/${item.quantityWanted} gifted' : ''}',
        ),
        trailing: IconButton(
          icon: const Icon(Icons.close, size: 18),
          onPressed: item.quantityFulfilled > 0 ? null : onRemove,
        ),
      ),
    );
  }
}

class _ImgFallback extends StatelessWidget {
  const _ImgFallback();
  @override
  Widget build(BuildContext context) => Container(
        width: 48,
        height: 48,
        color: GenieColors.subtle,
        child: const Icon(Icons.image_outlined, size: 20, color: GenieColors.inkMuted),
      );
}
