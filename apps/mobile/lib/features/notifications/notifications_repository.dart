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

class NotificationPref {
  const NotificationPref({required this.category, required this.push, required this.email});
  final String category;
  final bool push;
  final bool email;

  static const labels = {
    'GIFT': 'Gifts',
    'EVENT': 'Events',
    'FRIEND': 'Friends',
    'PAYMENT': 'Payments & wallet',
    'MESSAGE': 'Messages',
    'SYSTEM': 'Account & security',
  };

  String get label => labels[category] ?? category;

  NotificationPref copyWith({bool? push, bool? email}) =>
      NotificationPref(category: category, push: push ?? this.push, email: email ?? this.email);

  factory NotificationPref.fromJson(Map<String, dynamic> j) => NotificationPref(
        category: j['category'] as String,
        push: j['push'] as bool? ?? true,
        email: j['email'] as bool? ?? false,
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

  Future<List<NotificationPref>> preferences() async {
    final data = await _api.get<List<dynamic>>('/v1/notifications/preferences');
    return data.map((e) => NotificationPref.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<NotificationPref>> setPreference(String category, {bool? push, bool? email}) async {
    final data = await _api.put<List<dynamic>>('/v1/notifications/preferences', body: {
      'preferences': [
        {'category': category, if (push != null) 'push': push, if (email != null) 'email': email},
      ],
    });
    return data.map((e) => NotificationPref.fromJson(e as Map<String, dynamic>)).toList();
  }
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

final notificationPrefsProvider = FutureProvider<List<NotificationPref>>(
    (ref) => ref.watch(notificationsRepositoryProvider).preferences());
