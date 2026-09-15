import type { Case, CustodyLog, DigitalEvidence, Evidence, Officer, PhysicalEvidence, Report } from '@prisma/client';

/** Officer without password_hash. Every officer that leaves the API goes through here. */
export function publicOfficer(o: Officer) {
  return {
    officerId: o.officerId,
    badgeNumber: o.badgeNumber,
    fullName: o.fullName,
    role: o.role,
  };
}

export type PublicOfficer = ReturnType<typeof publicOfficer>;

export function serializeEvidence(
  e: Evidence & { physical: PhysicalEvidence | null; digital: DigitalEvidence | null },
) {
  return {
    evidenceId: e.evidenceId,
    caseId: e.caseId,
    evidenceType: e.evidenceType,
    collectionTimestamp: e.collectionTimestamp,
    // Exactly one of these is non-null, decided by evidence_type at insert time.
    physical: e.physical,
    digital: e.digital,
  };
}

export function serializeCase(
  c: Case & {
    leadOfficer?: Officer | null;
    _count?: { evidence: number };
  },
) {
  return {
    caseId: c.caseId,
    title: c.title,
    incidentTimestamp: c.incidentTimestamp,
    locationPoint: c.locationPoint,
    status: c.status,
    leadOfficerId: c.leadOfficerId,
    leadOfficer: c.leadOfficer ? publicOfficer(c.leadOfficer) : undefined,
    evidenceCount: c._count?.evidence,
  };
}

export function serializeCustodyLog(
  l: CustodyLog & { releasedBy?: Officer | null; receivedBy?: Officer | null; evidence?: Evidence | null },
) {
  return {
    logId: l.logId,
    evidenceId: l.evidenceId,
    releasedById: l.releasedById,
    receivedById: l.receivedById,
    transferTimestamp: l.transferTimestamp,
    mongoDocRef: l.mongoDocRef,
    releasedBy: l.releasedBy ? publicOfficer(l.releasedBy) : undefined,
    receivedBy: l.receivedBy ? publicOfficer(l.receivedBy) : undefined,
    evidenceType: l.evidence?.evidenceType,
  };
}

export function serializeReport(r: Report & { uploadedBy?: Officer | null }) {
  return {
    reportId: r.reportId,
    caseId: r.caseId,
    evidenceId: r.evidenceId,
    reportType: r.reportType,
    fileName: r.fileName,
    filePath: r.filePath,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    uploadedById: r.uploadedById,
    uploadedAt: r.uploadedAt,
    uploadedBy: r.uploadedBy ? publicOfficer(r.uploadedBy) : undefined,
  };
}
