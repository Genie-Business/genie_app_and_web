import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pinput/pinput.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../../../theme/genie_theme.dart';
import '../auth_controller.dart';

class VerifyOtpScreen extends ConsumerStatefulWidget {
  const VerifyOtpScreen({super.key, required this.email});
  final String email;

  @override
  ConsumerState<VerifyOtpScreen> createState() => _State();
}

class _State extends ConsumerState<VerifyOtpScreen> {
  final _pin = TextEditingController();
  bool _loading = false;
  String? _error;
  int _cooldown = 0;

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _verify(String code) async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      await ref.read(authControllerProvider.notifier).verifyEmail(email: widget.email, code: code);
      // Router redirects to home on authenticated state.
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    try {
      await ref.read(authControllerProvider.notifier).resendOtp(widget.email);
      setState(() => _cooldown = 30);
      _tick();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
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
    return GenieFormScaffold(
      title: 'Verify your email',
      subtitle: 'We sent a 6-digit code to ${widget.email}.',
      children: [
        GenieErrorText(_error),
        Pinput(
          length: 6,
          controller: _pin,
          autofocus: true,
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
        const SizedBox(height: 20),
        if (_loading) const Center(child: CircularProgressIndicator()),
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
      ],
    );
  }
}
