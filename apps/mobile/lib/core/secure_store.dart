import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Token storage backed by the platform keychain / keystore.
class SecureStore {
  SecureStore(this._storage);
  final FlutterSecureStorage _storage;

  static const _kAccess = 'genie.access';
  static const _kRefresh = 'genie.refresh';
  static const _kDeviceId = 'genie.deviceId';
  static const _kBiometricEnabled = 'genie.biometric';

  Future<String?> get accessToken => _storage.read(key: _kAccess);
  Future<String?> get refreshToken => _storage.read(key: _kRefresh);
  Future<String?> get deviceId => _storage.read(key: _kDeviceId);

  Future<void> saveTokens({required String access, required String refresh}) async {
    await _storage.write(key: _kAccess, value: access);
    await _storage.write(key: _kRefresh, value: refresh);
  }

  Future<void> setDeviceId(String id) => _storage.write(key: _kDeviceId, value: id);

  Future<bool> get biometricEnabled async =>
      (await _storage.read(key: _kBiometricEnabled)) == '1';
  Future<void> setBiometricEnabled(bool v) =>
      _storage.write(key: _kBiometricEnabled, value: v ? '1' : '0');

  Future<void> clear() async {
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    // deviceId + biometric preference intentionally survive sign-out.
  }
}

final secureStoreProvider = Provider<SecureStore>((ref) {
  return SecureStore(
    const FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true),
    ),
  );
});
