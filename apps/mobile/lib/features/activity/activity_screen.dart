import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../shared/widgets/async_view.dart';
import '../../theme/genie_theme.dart';

class Activity {
  const Activity({required this.title, required this.category, required this.createdAt});
  final String title;
  final String category;
  final String createdAt;

  factory Activity.fromJson(Map<String, dynamic> j) => Activity(
        title: (j['title'] as String?) ?? (j['action'] as String? ?? 'Activity'),
        category: (j['category'] as String?) ?? 'APP',
        createdAt: j['createdAt'] as String,
      );
}

final activityProvider = FutureProvider<List<Activity>>((ref) async {
  final res = await ref
      .watch(apiClientProvider)
      .getPaged<List<dynamic>>('/v1/activities', query: {'pageSize': 50});
  return res.data.map((e) => Activity.fromJson(e as Map<String, dynamic>)).toList();
});

class ActivityScreen extends ConsumerWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(activityProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: AsyncView<List<Activity>>(
        value: feed,
        onRefresh: () => ref.refresh(activityProvider.future),
        emptyWhen: (l) => l.isEmpty,
        empty: const EmptyState(
          icon: Icons.history_rounded,
          title: 'No activity yet',
          body: 'Your account, event and transaction history will show here.',
        ),
        data: (list) => ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: list.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) => ListTile(
            dense: true,
            leading: const Icon(Icons.circle, size: 8, color: GenieColors.primary),
            title: Text(list[i].title),
            trailing: Text(relativeDay(list[i].createdAt),
                style: const TextStyle(fontSize: 11, color: GenieColors.inkMuted)),
          ),
        ),
      ),
    );
  }
}
