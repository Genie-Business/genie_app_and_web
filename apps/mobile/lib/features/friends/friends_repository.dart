import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class Friend {
  const Friend({required this.userId, required this.name, required this.username});
  final String userId;
  final String name;
  final String username;

  factory Friend.fromJson(Map<String, dynamic> j) => Friend(
        userId: j['userId'] as String,
        name: '${j['firstName'] ?? ''} ${j['lastName'] ?? ''}'.trim(),
        username: j['username'] as String,
      );
}

class FriendRequest {
  const FriendRequest({
    required this.id,
    required this.direction,
    required this.name,
    required this.username,
  });

  final String id;
  final String direction; // incoming | outgoing
  final String name;
  final String username;

  bool get incoming => direction == 'incoming';

  factory FriendRequest.fromJson(Map<String, dynamic> j) {
    final u = (j['user'] as Map<String, dynamic>?) ?? {};
    return FriendRequest(
      id: j['id'] as String,
      direction: (j['direction'] as String?) ?? 'incoming',
      name: '${u['firstName'] ?? ''} ${u['lastName'] ?? ''}'.trim(),
      username: (u['username'] as String?) ?? '',
    );
  }
}

class FriendsRepository {
  FriendsRepository(this._api);
  final ApiClient _api;

  Future<List<Friend>> friends() async {
    final data = await _api.get<List<dynamic>>('/v1/friends');
    return data.map((e) => Friend.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<FriendRequest>> requests() async {
    final data = await _api.get<List<dynamic>>('/v1/friends/requests');
    return data.map((e) => FriendRequest.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> sendRequest(String username) =>
      _api.post<Map<String, dynamic>>('/v1/friends/requests', body: {'username': username});

  Future<void> accept(String id) =>
      _api.post<Map<String, dynamic>>('/v1/friends/requests/$id/accept');

  Future<void> decline(String id) =>
      _api.post<Map<String, dynamic>>('/v1/friends/requests/$id/decline');

  Future<void> removeFriend(String userId) =>
      _api.delete<Map<String, dynamic>>('/v1/friends/$userId');
}

final friendsRepositoryProvider =
    Provider<FriendsRepository>((ref) => FriendsRepository(ref.watch(apiClientProvider)));

final friendsProvider =
    FutureProvider<List<Friend>>((ref) => ref.watch(friendsRepositoryProvider).friends());

final friendRequestsProvider =
    FutureProvider<List<FriendRequest>>((ref) => ref.watch(friendsRepositoryProvider).requests());
