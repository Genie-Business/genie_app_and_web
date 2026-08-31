import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../catalog/catalog_models.dart';
import '../../catalog/catalog_repository.dart';
import '../wishlists_repository.dart';

/// Browse the catalogue and add products to a wishlist.
class AddWishlistItemScreen extends ConsumerStatefulWidget {
  const AddWishlistItemScreen({super.key, required this.wishlistId});
  final String wishlistId;

  @override
  ConsumerState<AddWishlistItemScreen> createState() => _State();
}

class _State extends ConsumerState<AddWishlistItemScreen> {
  final _search = TextEditingController();
  String? _categoryId;
  String _query = '';
  final _added = <String>{};
  late Future<List<Product>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<List<Product>> _load() =>
      ref.read(catalogRepositoryProvider).products(category: _categoryId, query: _query);

  void _reload() => setState(() => _future = _load());

  Future<void> _add(Product p) async {
    try {
      await ref
          .read(wishlistsRepositoryProvider)
          .addItem(widget.wishlistId, productId: p.id);
      setState(() => _added.add(p.id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Added ${p.name}'), duration: const Duration(seconds: 1)),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Add items')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              controller: _search,
              decoration: InputDecoration(
                hintText: 'Search products',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _search.clear();
                          setState(() => _query = '');
                          _reload();
                        },
                      ),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: (v) {
                setState(() => _query = v);
                _reload();
              },
            ),
          ),
          SizedBox(
            height: 44,
            child: categories.maybeWhen(
              data: (cats) => ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  _Chip(
                    label: 'All',
                    selected: _categoryId == null,
                    onTap: () {
                      setState(() => _categoryId = null);
                      _reload();
                    },
                  ),
                  ...cats.map((c) => _Chip(
                        label: c.name,
                        selected: _categoryId == c.id,
                        onTap: () {
                          setState(() => _categoryId = c.id);
                          _reload();
                        },
                      )),
                ],
              ),
              orElse: () => const SizedBox.shrink(),
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Product>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  return const EmptyState(
                    icon: Icons.cloud_off_rounded,
                    title: 'Could not load products',
                    body: 'Pull to try again.',
                  );
                }
                final items = snap.data ?? [];
                if (items.isEmpty) {
                  return const EmptyState(
                    icon: Icons.inventory_2_outlined,
                    title: 'No products found',
                    body: 'Try another category or search term.',
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async => _reload(),
                  child: GridView.builder(
                    padding: const EdgeInsets.all(12),
                    gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 220,
                      childAspectRatio: 0.72,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                    ),
                    itemCount: items.length,
                    itemBuilder: (_, i) => _ProductCard(
                      product: items[i],
                      added: _added.contains(items[i].id),
                      onAdd: () => _add(items[i]),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        child: ChoiceChip(label: Text(label), selected: selected, onSelected: (_) => onTap()),
      );
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product, required this.added, required this.onAdd});
  final Product product;
  final bool added;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: product.imageUrl != null
                ? Image.network(product.imageUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const _Fallback())
                : const _Fallback(),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                const SizedBox(height: 2),
                Text(formatKobo(product.priceKobo),
                    style: const TextStyle(color: GenieColors.inkSecondary, fontSize: 12)),
                const SizedBox(height: 6),
                SizedBox(
                  height: 32,
                  width: double.infinity,
                  child: added
                      ? OutlinedButton.icon(
                          onPressed: null,
                          icon: const Icon(Icons.check, size: 16),
                          label: const Text('Added'),
                        )
                      : FilledButton(
                          onPressed: product.inStock ? onAdd : null,
                          child: Text(product.inStock ? 'Add' : 'Out of stock'),
                        ),
                ),
              ],
            ),
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
        color: GenieColors.subtle,
        child: const Center(
            child: Icon(Icons.image_outlined, color: GenieColors.inkMuted)),
      );
}
