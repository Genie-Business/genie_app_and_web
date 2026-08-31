import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../../auth/presentation/widgets.dart';
import '../../auth/validators.dart';
import '../../catalog/catalog_models.dart';
import '../../catalog/catalog_repository.dart';
import '../merchant_repository.dart';

const _deliveryOptions = {'BOTH': 'Pickup or delivery', 'DELIVERY': 'Delivery only', 'PICKUP': 'Pickup only'};

class EditProductScreen extends ConsumerStatefulWidget {
  const EditProductScreen({super.key, this.existing});
  final Product? existing;

  @override
  ConsumerState<EditProductScreen> createState() => _State();
}

class _State extends ConsumerState<EditProductScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _desc;
  late final TextEditingController _price;
  late final TextEditingController _stock;
  late final TextEditingController _location;
  late final TextEditingController _imageUrl;
  String? _categoryId;
  String _delivery = 'BOTH';
  bool _loading = false;
  String? _error;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final p = widget.existing;
    _name = TextEditingController(text: p?.name ?? '');
    _desc = TextEditingController(text: p?.description ?? '');
    _price = TextEditingController(
        text: p == null ? '' : (BigInt.parse(p.priceKobo) ~/ BigInt.from(100)).toString());
    _stock = TextEditingController(text: '${p?.availableStock ?? 0}');
    _location = TextEditingController(text: p?.location ?? '');
    _imageUrl = TextEditingController(text: p == null || p.imageUrls.isEmpty ? '' : p.imageUrls.first);
    _categoryId = p?.categoryId;
    _delivery = p?.deliveryOption ?? 'BOTH';
  }

  @override
  void dispose() {
    for (final c in [_name, _desc, _price, _stock, _location, _imageUrl]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    if (_categoryId == null) {
      setState(() => _error = 'Pick a category.');
      return;
    }
    setState(() => _loading = true);
    final repo = ref.read(merchantRepositoryProvider);
    final priceKobo = int.parse(toKobo(num.parse(_price.text.trim())));
    final images = _imageUrl.text.trim().isEmpty ? <String>[] : [_imageUrl.text.trim()];
    try {
      if (_isEdit) {
        await repo.updateProduct(widget.existing!.id, {
          'categoryId': _categoryId,
          'name': _name.text.trim(),
          'description': _desc.text.trim(),
          'priceKobo': priceKobo,
          'deliveryOption': _delivery,
          'location': _location.text.trim(),
          'imageUrls': images,
        });
        await repo.setInventory(widget.existing!.id, int.parse(_stock.text.trim()));
      } else {
        await repo.createProduct(
          categoryId: _categoryId!,
          name: _name.text.trim(),
          description: _desc.text.trim(),
          priceKobo: priceKobo,
          quantity: int.tryParse(_stock.text.trim()) ?? 0,
          deliveryOption: _delivery,
          location: _location.text,
          imageUrls: images,
        );
      }
      ref.invalidate(merchantProductsProvider);
      if (mounted) context.pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    return GenieFormScaffold(
      title: _isEdit ? 'Edit product' : 'New product',
      primaryAction: FilledButton(
        onPressed: _loading ? null : _submit,
        child: _loading
            ? const SizedBox(
                height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(_isEdit ? 'Save changes' : 'Add product'),
      ),
      children: [
        Form(
          key: _form,
          child: Column(
            children: [
              GenieErrorText(_error),
              categories.when(
                data: (cats) {
                  String? selectedName;
                  for (final c in cats) {
                    if (c.id == _categoryId) selectedName = c.name;
                  }
                  return GDropdownField(
                    label: 'Category',
                    value: selectedName,
                    items: cats.map((c) => c.name).toList(),
                    onChanged: (name) => setState(() =>
                        _categoryId = cats.firstWhere((c) => c.name == name).id),
                  );
                },
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const Text('Could not load categories'),
              ),
              GField(
                label: 'Name',
                controller: _name,
                textCapitalization: TextCapitalization.words,
                validator: (v) => Validators.required(v, 'Name'),
              ),
              GField(
                label: 'Description',
                controller: _desc,
                validator: (v) => Validators.required(v, 'Description'),
              ),
              GField(
                label: 'Price (₦)',
                controller: _price,
                keyboardType: TextInputType.number,
                validator: (v) {
                  final n = num.tryParse((v ?? '').trim());
                  return (n == null || n <= 0) ? 'Enter a price' : null;
                },
              ),
              GField(label: 'Stock', controller: _stock, keyboardType: TextInputType.number),
              GDropdownField(
                label: 'Fulfilment',
                value: _delivery,
                items: _deliveryOptions.keys.toList(),
                onChanged: (v) => setState(() => _delivery = v ?? 'BOTH'),
              ),
              GField(label: 'Location (optional)', controller: _location),
              GField(label: 'Image URL (optional)', controller: _imageUrl),
            ],
          ),
        ),
      ],
    );
  }
}
