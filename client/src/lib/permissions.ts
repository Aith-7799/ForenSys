import type { Role } from './types';

/**
 * Mirror of the server's permission matrix (server/src/lib/roles.ts), which is
 * also published at GET /api/meta/permissions.
 *
 * This copy exists purely so navigation can be rendered without a round-trip.
 * It is NOT a security boundary: every one of these operations is independently
 * checked by middleware on the server, so tampering with this file only reveals
 * UI that still fails with a 403.
 */
export const PERMISSIONS = {
  CREATE_CASE: ['Investigating Officer'],
  REGISTER_EVIDENCE: ['Investigating Officer'],
  LOG_CUSTODY: ['Investigating Officer', 'Lab Analyst'],
  UPLOAD_REPORT: ['Lab Analyst', 'Investigating Officer'],
  VIEW_CASE_DATA: [
    'Investigating Officer',
    'Lab Analyst',
    'System Administrator',
    'Judicial Authority',
  ],
  VIEW_INTELLIGENCE: ['Investigating Officer', 'System Administrator'],
  VIEW_DASHBOARD: ['System Administrator'],
  MANAGE_USERS: ['System Administrator'],
  DELETE_RECORDS: ['System Administrator'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function roleHasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const CASE_STATUSES = ['open', 'under_investigation', 'in_court', 'closed', 'archived'] as const;

export const EVIDENCE_TYPES = [
  'Weapon',
  'Biological',
  'Digital Device',
  'Document',
  'Clothing',
  'Fingerprint',
  'Other',
] as const;

export const DIGITAL_EVIDENCE_TYPE = 'Digital Device';

export const REPORT_TYPES = ['Laboratory', 'Witness'] as const;

export const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  under_investigation: 'Under Investigation',
  in_court: 'In Court',
  closed: 'Closed',
  archived: 'Archived',
};
