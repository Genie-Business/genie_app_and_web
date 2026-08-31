import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class SettingsRepository {
  SettingsRepository(this._api);
  final ApiClient _api;

  Future<void> changePassword({required String current, required String next}) =>
      _api.post<Map<String, dynamic>>('/v1/auth/password/change',
          body: {'currentPassword': current, 'newPassword': next});

  Future<void> changeUsername(String username) =>
      _api.patch<Map<String, dynamic>>('/v1/me/username', body: {'username': username});

  /// Emails a 6-digit confirmation code (or echoes it on preview builds).
  Future<String?> requestDeletion() async {
    final data = await _api.post<Map<String, dynamic>>('/v1/me/delete/request');
    return data['verificationCode'] as String?;
  }

  Future<void> confirmDeletion(String code) =>
      _api.post<Map<String, dynamic>>('/v1/me/delete/confirm', body: {'code': code});
}

final settingsRepositoryProvider =
    Provider<SettingsRepository>((ref) => SettingsRepository(ref.watch(apiClientProvider)));
