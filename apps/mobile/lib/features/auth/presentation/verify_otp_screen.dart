import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pinput/pinput.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../../../theme/genie_theme.dart';
import '../auth_controller.dart';

class VerifyOtpScreen extends ConsumerStatefulWidget {
  const VerifyOtpScreen({super.key, required this.email, this.prefillCode});
  final String email;

  /// Non-production API deployments echo the code back so we can fill it in.
  final String? prefillCode;

  @override
  ConsumerState<VerifyOtpScreen> createState() => _State();
}

class _State extends ConsumerState<VerifyOtpScreen> {
  final _pin = TextEditingController();
  bool _loading = false;
  String? _error;
  int _cooldown = 0;

  bool get _prefilled => (widget.prefillCode ?? '').length == 6;

  @override
  void initState() {
    super.initState();
    if (_prefilled) _pin.text = widget.prefillCode!;
  }

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _verify(String code) async {
    if (code.length != 6 || _loading) return;
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      await ref.read(authControllerProvider.notifier).verifyEmail(email: widget.email, code: code);
      // Router redirects to home on authenticated state.
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    setState(() => _error = null);
    try {
      final code = await ref.read(authControllerProvider.notifier).resendOtp(widget.email);
      if (mounted && code != null && code.length == 6) {
        setState(() => _pin.text = code);
      }
      setState(() => _cooldown = 30);
      _tick();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _tick() {
    if (_cooldown <= 0) return;
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      setState(() => _cooldown -= 1);
      _tick();
    });
  }

  @override
  Widget build(BuildContext context) {
    final isResuming =
        ref.watch(authControllerProvider).status == AuthStatus.pendingVerification;

    return GenieFormScaffold(
      title: isResuming ? 'Finish signing up' : 'Verify your email',
      subtitle: 'Enter the 6-digit code we sent to ${widget.email}.',
      primaryAction: FilledButton(
        onPressed: _loading ? null : () => _verify(_pin.text.trim()),
        child: _loading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const Text('Verify'),
      ),
      children: [
        GenieErrorText(_error),
        Pinput(
          length: 6,
          controller: _pin,
          autofocus: !_prefilled,
          onCompleted: _verify,
          defaultPinTheme: PinTheme(
            width: 48,
            height: 56,
            textStyle: GenieTheme.display(20),
            decoration: BoxDecoration(
              border: Border.all(color: GenieColors.border),
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        if (_prefilled)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              'Preview build — we filled the code in for you.',
              style: TextStyle(fontSize: 12, color: GenieColors.inkMuted),
            ),
          ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text("Didn't get it? "),
            TextButton(
              onPressed: _cooldown > 0 ? null : _resend,
              child: Text(_cooldown > 0 ? 'Resend in ${_cooldown}s' : 'Resend code'),
            ),
          ],
        ),
        if (isResuming)
          Center(
            child: TextButton(
              onPressed: () async {
                await ref.read(authControllerProvider.notifier).abandonPendingVerification();
                if (context.mounted) context.go('/auth/sign-in');
              },
              child: const Text('Not you? Sign in to a different account'),
            ),
          ),
      ],
    );
  }
}
