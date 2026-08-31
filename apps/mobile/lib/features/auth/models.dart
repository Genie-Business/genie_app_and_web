class TokenPair {
  const TokenPair({
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresIn,
  });

  final String accessToken;
  final String refreshToken;
  final int accessTokenExpiresIn;

  factory TokenPair.fromJson(Map<String, dynamic> j) => TokenPair(
        accessToken: j['accessToken'] as String,
        refreshToken: j['refreshToken'] as String,
        accessTokenExpiresIn: (j['accessTokenExpiresIn'] as num).toInt(),
      );
}

enum UserRole { celebrant, merchant }

UserRole _roleFrom(String v) =>
    v.toUpperCase() == 'MERCHANT' ? UserRole.merchant : UserRole.celebrant;

class AuthUser {
  const AuthUser({
    required this.id,
    required this.role,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.username,
    required this.emailVerified,
    this.referralCode,
    this.merchantName,
    this.kycLevel1 = 'NONE',
  });

  final String id;
  final UserRole role;
  final String firstName;
  final String lastName;
  final String email;
  final String username;
  final bool emailVerified;
  final String? referralCode;
  final String? merchantName;

  /// NONE · PENDING · APPROVED · REJECTED
  final String kycLevel1;

  bool get isMerchant => role == UserRole.merchant;

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: j['id'] as String,
        role: _roleFrom(j['role'] as String? ?? 'CELEBRANT'),
        firstName: j['firstName'] as String? ?? '',
        lastName: j['lastName'] as String? ?? '',
        email: j['email'] as String? ?? '',
        username: j['username'] as String? ?? '',
        emailVerified: j['emailVerified'] as bool? ?? false,
        referralCode: j['referralCode'] as String?,
        merchantName:
            (j['merchant'] as Map<String, dynamic>?)?['businessName'] as String?,
        kycLevel1:
            (j['kyc'] as Map<String, dynamic>?)?['level1'] as String? ?? 'NONE',
      );
}

class AuthResult {
  const AuthResult(this.user, this.tokens);
  final AuthUser user;
  final TokenPair tokens;

  factory AuthResult.fromJson(Map<String, dynamic> j) => AuthResult(
        AuthUser.fromJson(j['user'] as Map<String, dynamic>),
        TokenPair.fromJson(j['tokens'] as Map<String, dynamic>),
      );
}
