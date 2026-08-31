import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class KycStatus {
  const KycStatus({
    required this.status,
    this.idDocType,
    this.bvnLast4,
    this.hasSelfie = false,
    this.hasIdDoc = false,
    this.rejectionReason,
    this.submittedAt,
    this.reviewedAt,
  });

  /// NONE · PENDING · APPROVED · REJECTED
  final String status;
  final String? idDocType;
  final String? bvnLast4;
  final bool hasSelfie;
  final bool hasIdDoc;
  final String? rejectionReason;
  final String? submittedAt;
  final String? reviewedAt;

  bool get isVerified => status == 'APPROVED';
  bool get isPending => status == 'PENDING';
  bool get canSubmit => status == 'NONE' || status == 'REJECTED';

  factory KycStatus.fromJson(Map<String, dynamic> j) => KycStatus(
        status: (j['status'] as String?) ?? 'NONE',
        idDocType: j['idDocType'] as String?,
        bvnLast4: j['bvnLast4'] as String?,
        hasSelfie: j['hasSelfie'] as bool? ?? false,
        hasIdDoc: j['hasIdDoc'] as bool? ?? false,
        rejectionReason: j['rejectionReason'] as String?,
        submittedAt: j['submittedAt'] as String?,
        reviewedAt: j['reviewedAt'] as String?,
      );
}

class KycRequirements {
  const KycRequirements({required this.unlocks, required this.acceptedIdDocs, required this.maxFileBytes});
  final List<String> unlocks;
  final List<String> acceptedIdDocs;
  final int maxFileBytes;

  factory KycRequirements.fromJson(Map<String, dynamic> j) => KycRequirements(
        unlocks: ((j['unlocks'] as List?) ?? const []).map((e) => e.toString()).toList(),
        acceptedIdDocs:
            ((j['acceptedIdDocs'] as List?) ?? const []).map((e) => e.toString()).toList(),
        maxFileBytes: (j['maxFileBytes'] as num?)?.toInt() ?? 8 * 1024 * 1024,
      );
}

/// Human labels for the ID-document enum.
const kycIdDocLabels = {
  'NIN': 'National ID (NIN)',
  'DRIVERS_LICENSE': "Driver's licence",
  'PASSPORT': 'International passport',
  'VOTERS_CARD': "Voter's card",
};

class KycRepository {
  KycRepository(this._api);
  final ApiClient _api;

  Future<KycStatus> status() async =>
      KycStatus.fromJson(await _api.get<Map<String, dynamic>>('/v1/kyc'));

  Future<KycRequirements> requirements() async =>
      KycRequirements.fromJson(await _api.get<Map<String, dynamic>>('/v1/kyc/requirements'));

  Future<KycStatus> submitLevel1({
    required String idDocType,
    required String selfiePath,
    required String idDocPath,
    String? idDocNumber,
    String? bvn,
  }) async {
    final data = await _api.postMultipart<Map<String, dynamic>>(
      '/v1/kyc/level-1',
      fields: {
        'idDocType': idDocType,
        if (idDocNumber != null && idDocNumber.trim().isNotEmpty) 'idDocNumber': idDocNumber.trim(),
        if (bvn != null && bvn.trim().isNotEmpty) 'bvn': bvn.trim(),
      },
      files: {'selfie': selfiePath, 'idDoc': idDocPath},
    );
    return KycStatus.fromJson(data);
  }
}

final kycRepositoryProvider =
    Provider<KycRepository>((ref) => KycRepository(ref.watch(apiClientProvider)));

final kycStatusProvider =
    FutureProvider<KycStatus>((ref) => ref.watch(kycRepositoryProvider).status());

final kycRequirementsProvider =
    FutureProvider<KycRequirements>((ref) => ref.watch(kycRepositoryProvider).requirements());
