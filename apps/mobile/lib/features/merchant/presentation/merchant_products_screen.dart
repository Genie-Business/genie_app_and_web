import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../catalog/catalog_models.dart';
import '../merchant_repository.dart';

/// Merchant "Products" tab.
class MerchantProductsScreen extends ConsumerWidget {
  const MerchantProductsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(merchantProductsProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await context.push('/merchant/products/new');
          ref.invalidate(merchantProductsProvider);
        },
        icon: const Icon(Icons.add),
        label: const Text('Add product'),
      ),
      body: AsyncView<List<Product>>(
        value: products,
        onRefresh: () => ref.refresh(merchantProductsProvider.future),
        emptyWhen: (l) => l.isEmpty,
        empty: EmptyState(
          icon: Icons.storefront_rounded,
          title: 'No products yet',
          body: 'Add the products and services genie users can put on their wishlists.',
          action: FilledButton(
            onPressed: () async {
              await context.push('/merchant/products/new');
              ref.invalidate(merchantProductsProvider);
            },
            child: const Text('Add your first product'),
          ),
        ),
        data: (list) => ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) => _ProductRow(product: list[i]),
        ),
      ),
    );
  }
}

class _ProductRow extends ConsumerWidget {
  const _ProductRow({required this.product});
  final Product product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = product.status == 'DRAFT';
    return Card(
      child: ListTile(
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: product.imageUrl != null
              ? Image.network(product.imageUrl!, width: 48, height: 48, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const _Fallback())
              : const _Fallback(),
        ),
        title: Text(product.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          '${formatKobo(product.priceKobo)} · stock ${product.availableStock ?? 0}'
          '${draft ? ' · DRAFT' : ''}',
          style: TextStyle(color: draft ? GenieColors.error : GenieColors.inkSecondary),
        ),
        trailing: PopupMenuButton<String>(
          onSelected: (v) async {
            final messenger = ScaffoldMessenger.of(context);
            final repo = ref.read(merchantRepositoryProvider);
            try {
              if (v == 'stock') {
                final n = await _askStock(context, product.availableStock ?? 0);
                if (n != null) await repo.setInventory(product.id, n);
              } else if (v == 'edit') {
                await context.push('/merchant/products/${product.id}', extra: product);
              } else if (v == 'delete') {
                await repo.deleteProduct(product.id);
              }
              ref.invalidate(merchantProductsProvider);
            } on ApiException catch (e) {
              messenger.showSnackBar(SnackBar(content: Text(e.message)));
            }
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(value: 'stock', child: Text('Update stock')),
            PopupMenuItem(value: 'delete', child: Text('Delete')),
          ],
        ),
      ),
    );
  }

  Future<int?> _askStock(BuildContext context, int current) {
    final c = TextEditingController(text: '$current');
    return showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Available stock'),
        content: TextField(
          controller: c,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Units in stock'),
        ),
        actions: [
          TextButton(onPressed: () => ctx.pop(), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => ctx.pop(int.tryParse(c.text.trim())),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}

class _Fallback extends StatelessWidget {
  const _Fallback();
  @override
  Widget build(BuildContext context) => Container(
        width: 48, height: 48, color: GenieColors.subtle,
        child: const Icon(Icons.image_outlined, size: 20, color: GenieColors.inkMuted),
      );
}
