import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'models.dart';

class AuthRepository {
  AuthRepository(this._api);
  final ApiClient _api;

  Future<void> registerCelebrant(Map<String, dynamic> body) =>
      _api.post<Map<String, dynamic>>('/v1/auth/register', body: body, auth: false);

  Future<void> registerMerchant(Map<String, dynamic> body) =>
      _api.post<Map<String, dynamic>>('/v1/auth/register/merchant', body: body, auth: false);

  Future<AuthResult> verifyEmail({
    required String email,
    required String code,
    required String deviceId,
    String? deviceName,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/v1/auth/verify-email',
      auth: false,
      body: {'email': email, 'code': code, 'deviceId': deviceId, 'deviceName': deviceName},
    );
    return AuthResult.fromJson(data);
  }

  Future<void> resendOtp(String email, {String purpose = 'EMAIL_VERIFY'}) =>
      _api.post<Map<String, dynamic>>('/v1/auth/resend-otp',
          auth: false, body: {'email': email, 'purpose': purpose});

  Future<AuthResult> login({
    required String identifier,
    required String password,
    required String deviceId,
    String? deviceName,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/v1/auth/login',
      auth: false,
      body: {
        'identifier': identifier,
        'password': password,
        'deviceId': deviceId,
        'deviceName': deviceName,
      },
    );
    return AuthResult.fromJson(data);
  }

  Future<AuthResult> refresh({required String refreshToken, required String deviceId}) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/v1/auth/refresh',
      auth: false,
      body: {'refreshToken': refreshToken, 'deviceId': deviceId},
    );
    return AuthResult.fromJson(data);
  }

  Future<void> logout(String refreshToken) =>
      _api.post<Map<String, dynamic>>('/v1/auth/logout', auth: false, body: {'refreshToken': refreshToken});

  Future<void> forgotPassword(String email) =>
      _api.post<Map<String, dynamic>>('/v1/auth/password/forgot', auth: false, body: {'email': email});

  Future<void> resetPassword({required String email, required String code, required String newPassword}) =>
      _api.post<Map<String, dynamic>>('/v1/auth/password/reset',
          auth: false, body: {'email': email, 'code': code, 'newPassword': newPassword});

  Future<AuthUser> me() async {
    final data = await _api.get<Map<String, dynamic>>('/v1/me');
    return AuthUser.fromJson(data);
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.watch(apiClientProvider));
});
