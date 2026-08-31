import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../auth/auth_controller.dart';
import '../kyc_repository.dart';

class KycScreen extends ConsumerWidget {
  const KycScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(kycStatusProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Identity verification')),
      body: AsyncView<KycStatus>(
        value: status,
        onRefresh: () => ref.refresh(kycStatusProvider.future),
        data: (s) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            _StatusBanner(s),
            const SizedBox(height: 20),
            if (s.canSubmit)
              _SubmitForm(onDone: () {
                ref.invalidate(kycStatusProvider);
                ref.invalidate(authControllerProvider);
              })
            else
              const _Requirements(),
          ],
        ),
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner(this.s);
  final KycStatus s;

  @override
  Widget build(BuildContext context) {
    late final Color c;
    late final IconData icon;
    late final String title;
    late final String body;
    switch (s.status) {
      case 'APPROVED':
        c = GenieColors.success;
        icon = Icons.verified_rounded;
        title = 'Verified';
        body = 'Your identity is confirmed. Higher wallet and gifting limits are unlocked.';
      case 'PENDING':
        c = GenieColors.accent;
        icon = Icons.hourglass_top_rounded;
        title = 'Under review';
        body = 'We\'re checking your documents — this usually takes a few minutes.';
      case 'REJECTED':
        c = GenieColors.error;
        icon = Icons.error_outline_rounded;
        title = 'Verification failed';
        body = s.rejectionReason ?? 'We couldn\'t verify your details. Please try again.';
      default:
        c = GenieColors.primary;
        icon = Icons.badge_outlined;
        title = 'Not verified yet';
        body = 'Verify your identity to raise your limits and speed up settlement.';
    }
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: c),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontWeight: FontWeight.w700, color: c)),
                const SizedBox(height: 4),
                Text(body, style: const TextStyle(fontSize: 13, height: 1.4)),
                if (s.submittedAt != null && s.status != 'NONE') ...[
                  const SizedBox(height: 6),
                  Text('Submitted ${relativeDay(s.submittedAt!)}',
                      style: const TextStyle(fontSize: 11, color: GenieColors.inkMuted)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Requirements extends ConsumerWidget {
  const _Requirements();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reqs = ref.watch(kycRequirementsProvider);
    return reqs.maybeWhen(
      data: (r) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('What it unlocks', style: GenieTheme.display(16)),
          const SizedBox(height: 8),
          ...r.unlocks.map((u) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.check_circle_outline, size: 18, color: GenieColors.success),
                    const SizedBox(width: 8),
                    Expanded(child: Text(u, style: const TextStyle(fontSize: 13))),
                  ],
                ),
              )),
        ],
      ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _SubmitForm extends ConsumerStatefulWidget {
  const _SubmitForm({required this.onDone});
  final VoidCallback onDone;

  @override
  ConsumerState<_SubmitForm> createState() => _SubmitFormState();
}

class _SubmitFormState extends ConsumerState<_SubmitForm> {
  final _picker = ImagePicker();
  final _bvn = TextEditingController();
  final _docNo = TextEditingController();
  String _idDocType = 'NIN';
  XFile? _selfie;
  XFile? _idDoc;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _bvn.dispose();
    _docNo.dispose();
    super.dispose();
  }

  Future<void> _pick(bool selfie) async {
    try {
      final x = await _picker.pickImage(
        source: selfie ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 80,
        maxWidth: 1600,
        preferredCameraDevice: CameraDevice.front,
      );
      if (x != null) setState(() => selfie ? _selfie = x : _idDoc = x);
    } catch (_) {
      setState(() => _error = 'Could not open the camera or gallery.');
    }
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (_selfie == null || _idDoc == null) {
      setState(() => _error = 'Add both a selfie and a photo of your ID.');
      return;
    }
    setState(() => _loading = true);
    try {
      await ref.read(kycRepositoryProvider).submitLevel1(
            idDocType: _idDocType,
            selfiePath: _selfie!.path,
            idDocPath: _idDoc!.path,
            idDocNumber: _docNo.text,
            bvn: _bvn.text,
          );
      widget.onDone();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Submitted for review')));
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!, style: const TextStyle(color: GenieColors.error, fontSize: 13)),
          ),
        Text('Your documents', style: GenieTheme.display(16)),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _PhotoTile(label: 'Selfie', file: _selfie, onTap: () => _pick(true))),
            const SizedBox(width: 12),
            Expanded(child: _PhotoTile(label: 'Government ID', file: _idDoc, onTap: () => _pick(false))),
          ],
        ),
        const SizedBox(height: 20),
        DropdownButtonFormField<String>(
          initialValue: _idDocType,
          decoration: const InputDecoration(labelText: 'Which ID is it?'),
          items: kycIdDocLabels.entries
              .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              .toList(),
          onChanged: (v) => setState(() => _idDocType = v ?? _idDocType),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _docNo,
          decoration: const InputDecoration(labelText: 'ID number (optional)'),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _bvn,
          keyboardType: TextInputType.number,
          maxLength: 11,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            labelText: 'BVN (optional — speeds up the check)',
            counterText: '',
          ),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(
                  height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Submit for verification'),
        ),
        const SizedBox(height: 8),
        const Text(
          'genie stores these securely and only uses them to confirm your identity.',
          style: TextStyle(fontSize: 11, color: GenieColors.inkMuted),
        ),
      ],
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({required this.label, required this.file, required this.onTap});
  final String label;
  final XFile? file;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 130,
        decoration: BoxDecoration(
          color: GenieColors.subtle,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: file != null ? GenieColors.primary : GenieColors.border,
            width: file != null ? 2 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(file != null ? Icons.check_circle : Icons.add_a_photo_outlined,
                color: file != null ? GenieColors.primary : GenieColors.inkMuted),
            const SizedBox(height: 8),
            Text(file != null ? '$label added' : label,
                style: const TextStyle(fontSize: 12), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
