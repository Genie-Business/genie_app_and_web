import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

import '../../core/api_client.dart';
import '../../core/secure_store.dart';
import 'auth_repository.dart';
import 'models.dart';

enum AuthStatus { unknown, unauthenticated, authenticated }

@immutable
class AuthState {
  const AuthState({required this.status, this.user, this.biometricAvailable = false});
  final AuthStatus status;
  final AuthUser? user;
  final bool biometricAvailable;

  AuthState copyWith({AuthStatus? status, AuthUser? user, bool? biometricAvailable}) => AuthState(
        status: status ?? this.status,
        user: user ?? this.user,
        biometricAvailable: biometricAvailable ?? this.biometricAvailable,
      );
}

class AuthController extends Notifier<AuthState> {
  late final SecureStore _store;
  late final AuthRepository _repo;
  late final ApiClient _api;
  final _localAuth = LocalAuthentication();

  @override
  AuthState build() {
    _store = ref.watch(secureStoreProvider);
    _repo = ref.watch(authRepositoryProvider);
    _api = ref.watch(apiClientProvider);
    _api.onRefreshNeeded = _refreshTokens;
    return const AuthState(status: AuthStatus.unknown);
  }

  Future<String> _deviceId() async {
    var id = await _store.deviceId;
    if (id == null) {
      final r = Random.secure();
      id = List.generate(24, (_) => r.nextInt(16).toRadixString(16)).join();
      await _store.setDeviceId(id);
    }
    return id;
  }

  /// Called on app start. Tries a silent (or biometric-gated) session restore.
  Future<void> bootstrap() async {
    final refresh = await _store.refreshToken;
    final canBiometric = await _canUseBiometrics();
    if (refresh == null) {
      state = AuthState(status: AuthStatus.unauthenticated, biometricAvailable: canBiometric);
      return;
    }

    if (await _store.biometricEnabled && canBiometric) {
      final ok = await _promptBiometric('Unlock genie');
      if (!ok) {
        state = AuthState(status: AuthStatus.unauthenticated, biometricAvailable: canBiometric);
        return;
      }
    }

    final restored = await _refreshTokens();
    if (restored) {
      try {
        final user = await _repo.me();
        state = AuthState(status: AuthStatus.authenticated, user: user, biometricAvailable: canBiometric);
        return;
      } catch (_) {/* fall through */}
    }
    await _store.clear();
    state = AuthState(status: AuthStatus.unauthenticated, biometricAvailable: canBiometric);
  }

  Future<bool> _refreshTokens() async {
    final refresh = await _store.refreshToken;
    if (refresh == null) return false;
    try {
      final result = await _repo.refresh(refreshToken: refresh, deviceId: await _deviceId());
      await _store.saveTokens(access: result.tokens.accessToken, refresh: result.tokens.refreshToken);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _applyResult(AuthResult result) async {
    await _store.saveTokens(access: result.tokens.accessToken, refresh: result.tokens.refreshToken);
    state = state.copyWith(status: AuthStatus.authenticated, user: result.user);
  }

  // ── Public actions ────────────────────────────────────────────────────

  Future<void> registerCelebrant(Map<String, dynamic> body) => _repo.registerCelebrant(body);
  Future<void> registerMerchant(Map<String, dynamic> body) => _repo.registerMerchant(body);
  Future<void> resendOtp(String email, {String purpose = 'EMAIL_VERIFY'}) =>
      _repo.resendOtp(email, purpose: purpose);
  Future<void> forgotPassword(String email) => _repo.forgotPassword(email);
  Future<void> resetPassword({required String email, required String code, required String newPassword}) =>
      _repo.resetPassword(email: email, code: code, newPassword: newPassword);

  Future<void> verifyEmail({required String email, required String code}) async {
    final result = await _repo.verifyEmail(email: email, code: code, deviceId: await _deviceId());
    await _applyResult(result);
  }

  Future<void> login({required String identifier, required String password}) async {
    final result = await _repo.login(
      identifier: identifier,
      password: password,
      deviceId: await _deviceId(),
    );
    await _applyResult(result);
  }

  Future<void> logout() async {
    final refresh = await _store.refreshToken;
    if (refresh != null) {
      try {
        await _repo.logout(refresh);
      } catch (_) {}
    }
    await _store.clear();
    state = state.copyWith(status: AuthStatus.unauthenticated, user: null);
  }

  Future<bool> enableBiometricUnlock() async {
    if (!await _canUseBiometrics()) return false;
    final ok = await _promptBiometric('Enable biometric unlock');
    if (ok) await _store.setBiometricEnabled(true);
    return ok;
  }

  Future<void> disableBiometricUnlock() => _store.setBiometricEnabled(false);

  Future<bool> _canUseBiometrics() async {
    try {
      return await _localAuth.canCheckBiometrics && await _localAuth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  Future<bool> _promptBiometric(String reason) async {
    try {
      return await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(biometricOnly: false, stickyAuth: true),
      );
    } catch (_) {
      return false;
    }
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
