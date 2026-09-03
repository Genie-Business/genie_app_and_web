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
    final initial = widget.initialLink?.trim();
    if (initial != null && initial.isNotEmpty) _openId = initial;
  }

  @override
  void dispose() {
    _link.dispose();
    super.dispose();
  }

  void _open(String value) {
    final v = value.trim();
    if (v.isEmpty) return;
    FocusScope.of(context).unfocus();
    setState(() => _openId = v);
  }

  Future<void> _pasteAnother() async {
    _link.text = _openId ?? '';
    final id = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Open a wishlist', style: GenieTheme.display(18)),
            const SizedBox(height: 4),
            const Text('Paste the link a friend shared with you.',
                style: TextStyle(color: GenieColors.inkSecondary, fontSize: 13)),
            const SizedBox(height: 16),
            TextField(
              controller: _link,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Wishlist link',
                hintText: 'https://genie…/w/…',
              ),
              onSubmitted: (v) => Navigator.of(ctx).pop(v.trim()),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(_link.text.trim()),
              child: const Text('Open wishlist'),
            ),
          ],
        ),
      ),
    );
    if (id != null && id.isNotEmpty) _open(id);
  }

  @override
  Widget build(BuildContext context) {
    final hasWishlist = _openId != null && _openId!.isNotEmpty;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gift a friend'),
        actions: [
          if (hasWishlist)
            IconButton(
              icon: const Icon(Icons.link_rounded),
              tooltip: 'Open another wishlist',
              onPressed: _pasteAnother,
            ),
        ],
      ),
      body: hasWishlist
          ? _WishlistView(idOrUrl: _openId!)
          : _PastePrompt(
              controller: _link,
              onOpen: _open,
            ),
    );
  }
}

class _PastePrompt extends StatelessWidget {
  const _PastePrompt({required this.controller, required this.onOpen});
  final TextEditingController controller;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 24),
      children: [
        const Icon(Icons.card_giftcard_rounded, size: 56, color: GenieColors.primary),
        const SizedBox(height: 16),
        Center(child: Text('Gift from a wishlist', style: GenieTheme.display(20))),
        const SizedBox(height: 8),
        const Text(
          'Paste the link a friend shared with you to see what they want and send a gift.',
          textAlign: TextAlign.center,
          style: TextStyle(color: GenieColors.inkSecondary, height: 1.4),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Wishlist link',
            hintText: 'https://genie…/w/…',
            prefixIcon: Icon(Icons.link_rounded),
          ),
          textInputAction: TextInputAction.go,
          onSubmitted: onOpen,
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: () => onOpen(controller.text),
          child: const Text('Open wishlist'),
        ),
      ],
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
      data: (w) {
        final open = w.items.where((i) => !i.fulfilled).length;
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text(w.wishlistName, style: GenieTheme.display(22)),
            const SizedBox(height: 4),
            Text(
              [
                if (w.celebrantName.isNotEmpty) w.celebrantName,
                if (w.eventName.isNotEmpty) w.eventName,
                if (w.eventDate.isNotEmpty) formatDate(w.eventDate),
              ].join('  ·  '),
              style: const TextStyle(color: GenieColors.inkSecondary, fontSize: 13),
            ),
            const SizedBox(height: 4),
            Text(
              open == 0
                  ? 'Every item has been gifted 🎉'
                  : '$open of ${w.items.length} still need a gift',
              style: const TextStyle(
                  color: GenieColors.primary, fontSize: 12, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            ...w.items.map((it) => _ItemRow(item: it, onGift: () => _gift(context, ref, it))),
          ],
        );
      },
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

/// One product on a shared wishlist: thumbnail, name, price, and a compact
/// Gift button (or a "gifted" check).
class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item, required this.onGift});
  final PublicWishlistItem item;
  final VoidCallback onGift;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                width: 52,
                height: 52,
                child: item.productImageUrl != null
                    ? Image.network(item.productImageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const _Fallback())
                    : const _Fallback(),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    item.productName.isEmpty ? 'Wishlist item' : item.productName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, height: 1.25),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    item.fulfilled
                        ? 'Gifted 🎉'
                        : '${formatKobo(item.unitPriceKobo)}'
                            '${item.quantityWanted > 1 ? '  ·  wants ${item.quantityWanted}' : ''}',
                    style: TextStyle(
                      color: item.fulfilled ? GenieColors.inkMuted : GenieColors.inkSecondary,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (item.fulfilled)
              const Icon(Icons.check_circle_rounded, color: GenieColors.success, size: 26)
            else
              FilledButton(
                onPressed: onGift,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(64, 38),
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                ),
                child: const Text('Gift'),
              ),
          ],
        ),
      ),
    );
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
