import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../concierge_repository.dart';

/// "Can't find it? Import it." — the celebrant pastes a link to a gift from
/// outside genie's catalogue. A concierge prices it and it shows up on the
/// wishlist as pending until then.
class ImportGiftScreen extends ConsumerStatefulWidget {
  const ImportGiftScreen({super.key, required this.wishlistId});
  final String wishlistId;

  @override
  ConsumerState<ImportGiftScreen> createState() => _ImportGiftScreenState();
}

class _ImportGiftScreenState extends ConsumerState<ImportGiftScreen> {
  final _formKey = GlobalKey<FormState>();
  final _url = TextEditingController();
  final _name = TextEditingController();
  final _note = TextEditingController();
  final _price = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _url.dispose();
    _name.dispose();
    _note.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    try {
      final priceNaira = double.tryParse(_price.text.trim());
      await ref.read(conciergeRepositoryProvider).create(
            wishlistId: widget.wishlistId,
            sourceUrl: _url.text.trim(),
            name: _name.text.trim(),
            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
            estimatedPriceKobo: priceNaira == null ? null : (priceNaira * 100).round(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Import a gift')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          children: [
            const Icon(Icons.travel_explore_rounded, size: 48),
            const SizedBox(height: 12),
            const Text(
              "Found it somewhere else? Paste the link and we'll get someone to source it for you.",
              style: TextStyle(color: Colors.black54, height: 1.4),
            ),
            const SizedBox(height: 24),
            TextFormField(
              controller: _url,
              decoration: const InputDecoration(
                labelText: 'Link to the item',
                hintText: 'https://amazon.com/…',
                prefixIcon: Icon(Icons.link_rounded),
              ),
              keyboardType: TextInputType.url,
              validator: (v) {
                final value = v?.trim() ?? '';
                if (value.isEmpty) return 'Paste a link to the item';
                final uri = Uri.tryParse(value);
                final isHttp = uri != null && (uri.scheme == 'http' || uri.scheme == 'https');
                if (!isHttp) return 'Enter a valid https:// link';
                return null;
              },
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'What is it?', hintText: 'e.g. Fancy stand mixer'),
              textCapitalization: TextCapitalization.sentences,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Give it a name' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _price,
              decoration: const InputDecoration(labelText: 'About how much? (optional)', prefixText: '₦'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _note,
              decoration: const InputDecoration(
                labelText: 'Anything else? (optional)',
                hintText: 'Colour, size, where to get it from…',
              ),
              maxLines: 3,
              maxLength: 500,
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Request this gift'),
            ),
            const SizedBox(height: 8),
            const Text(
              "We'll review it and add it to your wishlist as pending. You'll be notified once it's ready to share.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black45, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
