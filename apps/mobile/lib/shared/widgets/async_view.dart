import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/genie_theme.dart';

/// Renders an [AsyncValue]: spinner while loading, a friendly error with retry,
/// or [data]. Wrap the whole thing in a [RefreshIndicator] via [onRefresh].
class AsyncView<T> extends StatelessWidget {
  const AsyncView({
    super.key,
    required this.value,
    required this.data,
    this.onRefresh,
    this.emptyWhen,
    this.empty,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final Future<void> Function()? onRefresh;
  final bool Function(T data)? emptyWhen;
  final Widget? empty;

  @override
  Widget build(BuildContext context) {
    final child = value.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _ErrorState(message: _msg(e), onRetry: onRefresh),
      data: (d) {
        if (emptyWhen?.call(d) == true && empty != null) return empty!;
        return data(d);
      },
    );
    if (onRefresh == null) return child;
    return RefreshIndicator(
      onRefresh: onRefresh!,
      child: LayoutBuilder(
        builder: (_, c) => SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: c.maxHeight),
            child: child,
          ),
        ),
      ),
    );
  }

  static String _msg(Object e) {
    final s = e.toString();
    return s.startsWith('ApiException(') && s.contains(', ')
        ? s.substring(s.indexOf(', ') + 2, s.length - 1)
        : 'Something went wrong.';
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, this.onRetry});
  final String message;
  final Future<void> Function()? onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.cloud_off_rounded, size: 48, color: GenieColors.inkMuted),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (onRetry != null) ...[
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ],
      ),
    );
  }
}

/// Centered icon + title + body, for empty states.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.body, this.action});
  final IconData icon;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 60, color: GenieColors.primary),
          const SizedBox(height: 16),
          Text(title, style: GenieTheme.display(20), textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(body,
              textAlign: TextAlign.center,
              style: const TextStyle(color: GenieColors.inkSecondary, height: 1.4)),
          if (action != null) ...[const SizedBox(height: 20), action!],
        ],
      ),
    );
  }
}
