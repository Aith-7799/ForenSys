export type Role =
  | 'Investigating Officer'
  | 'Lab Analyst'
  | 'System Administrator'
  | 'Judicial Authority';

export type CaseStatus = 'open' | 'under_investigation' | 'in_court' | 'closed' | 'archived';

export type EvidenceType =
  | 'Weapon'
  | 'Biological'
  | 'Digital Device'
  | 'Document'
  | 'Clothing'
  | 'Fingerprint'
  | 'Other';

export type ReportType = 'Laboratory' | 'Witness';

export interface Officer {
  officerId: string;
  badgeNumber: string;
  fullName: string;
  role: Role;
}

export interface CaseSummary {
  caseId: string;
  title: string;
  incidentTimestamp: string;
  locationPoint: string;
  status: CaseStatus;
  leadOfficerId: string;
  leadOfficer?: Officer;
  evidenceCount?: number;
}

export interface PhysicalEvidence {
  evidenceId: string;
  storageLockerNumber: string;
  sealNumber: string;
  containerType: string;
}

export interface DigitalEvidence {
  evidenceId: string;
  fileHashSha256: string;
  mediaType: string;
  sizeMb: string;
  deviceSerial: string;
}

export interface EvidenceItem {
  evidenceId: string;
  caseId: string;
  evidenceType: EvidenceType;
  collectionTimestamp: string;
  physical: PhysicalEvidence | null;
  digital: DigitalEvidence | null;
  case?: { caseId: string; title: string; status: CaseStatus };
}

export interface EvidenceDetail {
  evidence: EvidenceItem & { custodyLogs: CustodyLog[]; reports: ReportItem[] };
  currentHolder: Officer | null;
  transferCount: number;
  currentHolderSince: string | null;
}

export interface CustodyLog {
  logId: string;
  evidenceId: string;
  releasedById: string;
  receivedById: string;
  transferTimestamp: string;
  mongoDocRef: string | null;
  releasedBy?: Officer;
  receivedBy?: Officer;
  evidenceType?: EvidenceType;
}

export interface ReportItem {
  reportId: string;
  caseId: string | null;
  evidenceId: string | null;
  reportType: ReportType;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedById: string;
  uploadedAt: string;
  uploadedBy?: Officer;
}

export interface TimelineEvent {
  at: string;
  kind: 'case_registered' | 'evidence_collected' | 'custody_transfer' | 'status_change';
  title: string;
  detail?: string;
  refId?: string;
}

export interface CaseAuditRow {
  auditId: number;
  caseId: string;
  oldStatus: string | null;
  newStatus: string | null;
  changedBy: string | null;
  changeTimestamp: string | null;
}

export interface TimelineResponse {
  case: CaseSummary;
  auditLog: CaseAuditRow[];
  timeline: TimelineEvent[];
}

export interface DashboardSummary {
  totals: {
    cases: number;
    evidence: number;
    officers: number;
    custodyTransfers: number;
    reports: number;
  };
  caseCountsByStatus: { status: CaseStatus; totalCases: number; totalEvidenceItems: number }[];
  evidenceCountsByType: { evidenceType: EvidenceType; totalItems: number; totalCases: number }[];
  digitalSizeByMediaType: {
    mediaType: string;
    totalFiles: number;
    avgSizeMb: number;
    maxSizeMb: number;
    minSizeMb: number;
    totalStorageMb: number;
  }[];
  officerWorkload: {
    officerId: string;
    fullName: string;
    badgeNumber: string;
    role: Role;
    openCaseCount: number;
    totalCaseCount: number;
  }[];
  custodyActivity: { evidenceId: string; evidenceType: EvidenceType; totalTransfers: number }[];
}

export interface RollupRow {
  caseStatus: string;
  evidenceType: string;
  itemCount: number;
}

export interface VectorBreakdown {
  vector: 'Digital Fingerprints' | 'Geospatial Proximity' | 'Evidence Profile / M.O.' | 'Temporal Clustering';
  score: number;
  weight: number;
  weightedScore: number;
  evidence: string;
  details?: Record<string, unknown>;
}

export interface SimilarCaseItem {
  caseId: string;
  title: string;
  status: CaseStatus;
  incidentTimestamp: string;
  locationPoint: string;
  leadOfficer: Officer;
  matchPercentage: number;
  breakdown: VectorBreakdown[];
  hasDuplicateEvidenceAlert: boolean;
}

export interface DuplicateEvidenceAlertItem {
  alertId: string;
  newEvidenceId: string;
  matchedEvidenceId: string;
  matchType: string;
  caseIdNew: string;
  caseIdExisting: string;
  createdAt: string;
  newEvidence?: EvidenceItem;
  matchedEvidence?: EvidenceItem;
  caseNew?: { caseId: string; title: string; status: CaseStatus };
  caseExisting?: { caseId: string; title: string; status: CaseStatus };
}

export interface GraphNode {
  id: string;
  label: string;
  status: CaseStatus;
  locationPoint: string;
  incidentTimestamp: string;
  leadOfficerName: string;
  evidenceCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  similarity: number;
  tags: string[];
}

export interface CorrelationGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

