/**
 * Roles and the permission matrix, derived from the ForenSys use-case diagram.
 *
 * The four role strings are exactly the values allowed by the Oracle
 * `chk_officers_role` CHECK constraint, so they can be compared directly against
 * what the database stores.
 */
export const ROLES = {
  INVESTIGATING_OFFICER: 'Investigating Officer',
  LAB_ANALYST: 'Lab Analyst',
  SYSTEM_ADMINISTRATOR: 'System Administrator',
  JUDICIAL_AUTHORITY: 'Judicial Authority',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value);
}

/**
 * Every use-case ellipse in the diagram, mapped to the roles that may perform it.
 *
 * Mapping notes:
 *   * Authenticate User is available to all four roles.
 *   * "View Case Timeline" is joined to Investigating Officer + Lab Analyst in the
 *     diagram. System Administrator and Judicial Authority are deliberate
 *     additions: the admin needs to drill into a case from the dashboard, and a
 *     judicial user is a read-only observer by nature. Both are read-only.
 *   * "Manage Users" comes from the System Administrator's stated duties
 *     (authenticate/manage users) rather than a separate ellipse.
 */
export const PERMISSIONS = {
  /** Create Crime Report */
  CREATE_CASE: [ROLES.INVESTIGATING_OFFICER],
  /** Register Evidence Item */
  REGISTER_EVIDENCE: [ROLES.INVESTIGATING_OFFICER],
  /** Log Chain of Custody */
  LOG_CUSTODY: [ROLES.INVESTIGATING_OFFICER, ROLES.LAB_ANALYST],
  /** Upload Laboratory and Witness Reports */
  UPLOAD_REPORT: [ROLES.LAB_ANALYST, ROLES.INVESTIGATING_OFFICER],
  /** View Case Timeline (read access to cases / evidence / custody) */
  VIEW_CASE_DATA: [
    ROLES.INVESTIGATING_OFFICER,
    ROLES.LAB_ANALYST,
    ROLES.SYSTEM_ADMINISTRATOR,
    ROLES.JUDICIAL_AUTHORITY,
  ],
  /** View Cross-Case Intelligence Graph & Correlation Matrix (Detectives & Admins) */
  VIEW_INTELLIGENCE: [ROLES.INVESTIGATING_OFFICER, ROLES.SYSTEM_ADMINISTRATOR],
  /** View Analytics Dashboard */
  VIEW_DASHBOARD: [ROLES.SYSTEM_ADMINISTRATOR],
  /** Manage users (create/update/delete officers, reset passwords) */
  MANAGE_USERS: [ROLES.SYSTEM_ADMINISTRATOR],
  /** Delete cases / evidence (destructive; admin only) */
  DELETE_RECORDS: [ROLES.SYSTEM_ADMINISTRATOR],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Case lifecycle values, mirroring `chk_cases_status`. */
export const CASE_STATUSES = [
  'open',
  'under_investigation',
  'in_court',
  'closed',
  'archived',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Evidence categories, mirroring `chk_evidence_type`. */
export const EVIDENCE_TYPES = [
  'Weapon',
  'Biological',
  'Digital Device',
  'Document',
  'Clothing',
  'Fingerprint',
  'Other',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/**
 * Evidence type -> subtype table. The report only ever populated DIGITAL_EVIDENCE
 * for 'Digital Device' items, so everything else is stored as physical evidence.
 */
export const DIGITAL_EVIDENCE_TYPE: EvidenceType = 'Digital Device';

export const REPORT_TYPES = ['Laboratory', 'Witness'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
