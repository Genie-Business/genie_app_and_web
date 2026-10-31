import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format.dart';
import '../../theme/genie_theme.dart';
import '../activity/activity_screen.dart';
import '../gifts/gifts_repository.dart';
import 'payment_repository.dart';

/// Opens a provider's hosted payment page in the browser. Returns false if nothing could open it.
Future<bool> openCheckoutPage(String url) =>
    launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);

/// Shown after the buyer is sent to the payment page. Watches the payment until it is
/// confirmed (or fails), then says so. Reached directly after launching the page, and again
/// by the `/pay/done` link the payment page returns to.
class PaymentStatusScreen extends ConsumerStatefulWidget {
  const PaymentStatusScreen({
    super.key,
    required this.reference,
    this.pollEvery = const Duration(seconds: 3),
    this.maxPolls = 100,
  });
  final String reference;
  final Duration pollEvery;

  /// Stop asking after this many checks (about five minutes by default).
  final int maxPolls;

  @override
  ConsumerState<PaymentStatusScreen> createState() => _PaymentStatusScreenState();
}

class _PaymentStatusScreenState extends ConsumerState<PaymentStatusScreen> with WidgetsBindingObserver {
  PaymentStatus? _status;
  bool _gaveUp = false;
  String? _error;
  int _polls = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _check();
    _timer = Timer.periodic(widget.pollEvery, (_) => _check());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Coming back from the browser: look straight away rather than waiting for the next tick.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _check();
  }

  Future<void> _check() async {
    final done = _status?.isDone == true || _status?.isFailed == true;
    if (!mounted || done || _gaveUp) return;
    if (++_polls > widget.maxPolls) {
      _timer?.cancel();
      setState(() => _gaveUp = true);
      return;
    }
    try {
      final s = await ref.read(paymentRepositoryProvider).status(widget.reference);
      if (!mounted) return;
      setState(() {
        _status = s;
        _error = null;
      });
      if (s.isDone) {
        _timer?.cancel();
        // What this payment bought now exists; refresh the screens that show it.
        ref
          ..invalidate(receivedGiftsProvider)
          ..invalidate(activityProvider);
      } else if (s.isFailed) {
        _timer?.cancel();
      }
    } catch (_) {
      // A blip shouldn't end the wait: the next check tries again.
      if (mounted) setState(() => _error = 'Having trouble reaching genie. Still trying.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    final Widget body;
    if (s?.isDone == true) {
      body = _Message(
        icon: Icons.check_circle,
        color: GenieColors.success,
        title: 'Gift on its way',
        text: 'Your payment of ${formatKobo(s!.amountKobo)} went through and the gift is being arranged.',
        action: FilledButton(onPressed: () => context.go('/'), child: const Text('Done')),
      );
    } else if (s?.isFailed == true) {
      body = _Message(
        icon: Icons.error_outline,
        color: GenieColors.error,
        title: s!.status == 'EXPIRED' ? 'This payment expired' : 'That payment didn’t go through',
        text: 'No gift was sent. You can start again whenever you’re ready.',
        action: FilledButton(onPressed: () => context.go('/'), child: const Text('Back home')),
      );
    } else if (_gaveUp) {
      body = _Message(
        icon: Icons.hourglass_bottom,
        color: GenieColors.inkMuted,
        title: 'Still confirming',
        text:
            'Your bank is taking longer than usual. If you were charged, the gift will appear here once it confirms. You can leave this screen.',
        action: FilledButton(onPressed: () => context.go('/'), child: const Text('Back home')),
      );
    } else {
      body = _Message(
        busy: true,
        title: 'Waiting for your payment',
        text: _error ?? 'Finish paying on the page that opened. We’ll confirm it here automatically.',
        action: s?.checkoutUrl == null
            ? null
            : OutlinedButton(
                onPressed: () => openCheckoutPage(s!.checkoutUrl!),
                child: const Text('Open the payment page again'),
              ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Payment'), automaticallyImplyLeading: false),
      body: Center(child: Padding(padding: const EdgeInsets.all(28), child: body)),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.title, required this.text, this.icon, this.color, this.busy = false, this.action});
  final String title;
  final String text;
  final IconData? icon;
  final Color? color;
  final bool busy;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (busy)
            const SizedBox(height: 32, width: 32, child: CircularProgressIndicator(strokeWidth: 3))
          else
            Icon(icon, size: 56, color: color),
          const SizedBox(height: 20),
          Text(title, textAlign: TextAlign.center, style: GenieTheme.display(22)),
          const SizedBox(height: 10),
          Text(text,
              textAlign: TextAlign.center,
              style: const TextStyle(color: GenieColors.inkSecondary, height: 1.4)),
          if (action != null) ...[const SizedBox(height: 24), action!],
        ],
      );
}
