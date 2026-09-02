import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../auth/auth_controller.dart';
import '../../wallet/wallet_repository.dart';
import '../gift_models.dart';
import '../gifts_repository.dart';

/// Paste a shared-wishlist link, browse it, and gift an item.
class GiftAFriendScreen extends ConsumerStatefulWidget {
  const GiftAFriendScreen({super.key, this.initialLink});
  final String? initialLink;

  @override
  ConsumerState<GiftAFriendScreen> createState() => _State();
}

class _State extends ConsumerState<GiftAFriendScreen> {
  final _link = TextEditingController();
  String? _openId;

  @override
  void initState() {
    super.initState();
    if (widget.initialLink != null && widget.initialLink!.trim().isNotEmpty) {
      _link.text = widget.initialLink!.trim();
      _openId = _link.text;
    }
  }

  @override
  void dispose() {
    _link.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gift a friend')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _link,
                    decoration: const InputDecoration(
                      labelText: 'Wishlist link',
                      hintText: 'Paste the link your friend shared',
                    ),
                    onSubmitted: (v) => setState(() => _openId = v.trim()),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () => setState(() => _openId = _link.text.trim()),
                  child: const Text('Open'),
                ),
              ],
            ),
          ),
          if (_openId != null && _openId!.isNotEmpty)
            Expanded(child: _WishlistView(idOrUrl: _openId!))
          else
            const Expanded(
              child: EmptyState(
                icon: Icons.link_rounded,
                title: 'Open a wishlist',
                body: 'Paste a link a friend shared with you to see what they want.',
              ),
            ),
        ],
      ),
    );
  }
}

class _WishlistView extends ConsumerWidget {
  const _WishlistView({required this.idOrUrl});
  final String idOrUrl;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wl = ref.watch(publicWishlistProvider(idOrUrl));
    return AsyncView<PublicWishlist>(
      value: wl,
      onRefresh: () => ref.refresh(publicWishlistProvider(idOrUrl).future),
      data: (w) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          Text(w.wishlistName, style: GenieTheme.display(20)),
          Text(
            '${w.celebrantName.isEmpty ? '' : '${w.celebrantName} · '}${w.eventName}'
            '${w.eventDate.isEmpty ? '' : ' · ${formatDate(w.eventDate)}'}',
            style: const TextStyle(color: GenieColors.inkSecondary),
          ),
          const SizedBox(height: 12),
          ...w.items.map((it) => Card(
                child: ListTile(
                  leading: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: it.productImageUrl != null
                        ? Image.network(it.productImageUrl!,
                            width: 48, height: 48, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const _Fallback())
                        : const _Fallback(),
                  ),
                  title: Text(it.productName, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(it.fulfilled
                      ? 'Already gifted 🎉'
                      : '${formatKobo(it.unitPriceKobo)}${it.quantityWanted > 1 ? ' · wants ${it.quantityWanted}' : ''}'),
                  trailing: it.fulfilled
                      ? const Icon(Icons.check_circle, color: GenieColors.success)
                      : FilledButton(
                          onPressed: () => _gift(context, ref, it),
                          child: const Text('Gift'),
                        ),
                ),
              )),
        ],
      ),
    );
  }

  Future<void> _gift(BuildContext context, WidgetRef ref, PublicWishlistItem item) async {
    // Gifting needs a genie account (wallet or bank transfer + a receipt).
    if (ref.read(authControllerProvider).status != AuthStatus.authenticated) {
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Sign in to send this gift'),
          content: const Text(
              'Create a free genie account to gift from a friend’s wishlist — or open the link in a browser to pay as a guest.'),
          actions: [
            TextButton(onPressed: () => ctx.pop(false), child: const Text('Not now')),
            FilledButton(onPressed: () => ctx.pop(true), child: const Text('Get started')),
          ],
        ),
      );
      if (go == true && context.mounted) context.go('/auth/role');
      return;
    }
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _GiftSheet(item: item),
    );
    if (result == true) {
      ref.invalidate(publicWishlistProvider(idOrUrl));
      ref.invalidate(walletBalanceProvider);
    }
  }
}

class _GiftSheet extends ConsumerStatefulWidget {
  const _GiftSheet({required this.item});
  final PublicWishlistItem item;
  @override
  ConsumerState<_GiftSheet> createState() => _GiftSheetState();
}

class _GiftSheetState extends ConsumerState<_GiftSheet> {
  final _message = TextEditingController();
  bool _anon = false;
  bool _loading = false;
  String? _error;
  GiftQuote? _quote;

  @override
  void initState() {
    super.initState();
    _loadQuote();
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _loadQuote() async {
    try {
      final q = await ref.read(giftsRepositoryProvider).quote(widget.item.id);
      if (mounted) setState(() => _quote = q);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _pay() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ref.read(giftsRepositoryProvider).pay(
            wishlistItemId: widget.item.id,
            isAnonymous: _anon,
            message: _message.text,
          );
      final status = (res['status'] ?? res['gift']?['status'] ?? 'PAID').toString();
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(status == 'PENDING' ? 'Gift created — awaiting payment' : 'Gift sent 🎁')),
      );
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = _quote;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Gift: ${widget.item.productName}', style: GenieTheme.display(18)),
          const SizedBox(height: 12),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_error!, style: const TextStyle(color: GenieColors.error)),
            ),
          if (q == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            _row('Item', formatKobo(q.subtotalKobo)),
            if (q.transactionFeeKobo != '0') _row('Transaction fee', formatKobo(q.transactionFeeKobo)),
            if (q.logisticsFeeKobo != '0') _row('Delivery', formatKobo(q.logisticsFeeKobo)),
            const Divider(),
            _row('You pay', formatKobo(q.gifterPaysKobo), bold: true),
          ],
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Send anonymously'),
            subtitle: const Text('Revealed only when the gift arrives'),
            value: _anon,
            onChanged: (v) => setState(() => _anon = v),
          ),
          TextField(
            controller: _message,
            decoration: const InputDecoration(labelText: 'Message (optional)'),
            maxLength: 280,
          ),
          const SizedBox(height: 4),
          FilledButton(
            onPressed: (_loading || q == null) ? null : _pay,
            child: _loading
                ? const SizedBox(
                    height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(q == null ? 'Gift' : 'Pay ${formatKobo(q.gifterPaysKobo)} from wallet'),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w400)),
            Text(value,
                style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w400)),
          ],
        ),
      );
}

class _Fallback extends StatelessWidget {
  const _Fallback();
  @override
  Widget build(BuildContext context) => Container(
        width: 48, height: 48, color: GenieColors.subtle,
        child: const Icon(Icons.image_outlined, size: 20, color: GenieColors.inkMuted),
      );
}
