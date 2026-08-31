import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.category,
    required this.title,
    required this.body,
    required this.read,
    required this.createdAt,
  });

  final String id;
  final String category;
  final String title;
  final String body;
  final bool read;
  final String createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'] as String,
        category: (j['category'] as String?) ?? 'SYSTEM',
        title: j['title'] as String,
        body: (j['body'] as String?) ?? '',
        read: (j['read'] as bool?) ?? false,
        createdAt: j['createdAt'] as String,
      );
}

class NotificationsRepository {
  NotificationsRepository(this._api);
  final ApiClient _api;

  Future<List<AppNotification>> list() async {
    final res = await _api.getPaged<List<dynamic>>('/v1/notifications', query: {'pageSize': 40});
    return res.data.map((e) => AppNotification.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<int> unreadCount() async {
    final data = await _api.get<Map<String, dynamic>>('/v1/notifications/unread-count');
    return (data['count'] as num?)?.toInt() ?? (data['unread'] as num?)?.toInt() ?? 0;
  }

  Future<void> markAllRead() =>
      _api.post<Map<String, dynamic>>('/v1/notifications/read', body: {'all': true});
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
    (ref) => NotificationsRepository(ref.watch(apiClientProvider)));

final notificationsProvider = FutureProvider<List<AppNotification>>(
    (ref) => ref.watch(notificationsRepositoryProvider).list());

final unreadCountProvider = FutureProvider<int>((ref) async {
  try {
    return await ref.watch(notificationsRepositoryProvider).unreadCount();
  } catch (_) {
    return 0;
  }
});
