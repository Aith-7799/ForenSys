import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const dashboardRouter = Router();

// "View Analytics Dashboard" belongs to the System Administrator alone.
dashboardRouter.use(requireAuth, requirePermission('VIEW_DASHBOARD'));

/**
 * Raw SQL, deliberately mirroring the DA-2 report's aggregate queries
 * (docs/oracle-11g-reference.sql, section 5.3). Prisma's aggregate helpers cannot
 * express GROUP BY ROLLUP, and keeping the SQL visible makes the mapping to the
 * original coursework obvious.
 *
 * Postgres returns COUNT() as bigint, which JSON.stringify refuses to serialise,
 * so every numeric column is cast to a JS number before it leaves the endpoint.
 */
const toNum = (value: unknown): number => Number(value ?? 0);

/** GET /api/dashboard/summary — every headline metric in one round-trip. */
dashboardRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    // 1. Case counts by status (report query 5.3.1, counts side).
    const caseCountsByStatus = await prisma.$queryRaw<
      Array<{ status: string; total_cases: bigint; total_evidence_items: bigint }>
    >`
      SELECT c.status,
             COUNT(DISTINCT c.case_id) AS total_cases,
             COUNT(e.evidence_id)      AS total_evidence_items
      FROM cases c
      LEFT JOIN evidence e ON c.case_id = e.case_id
      GROUP BY c.status
      ORDER BY c.status
    `;

    // 2. Evidence counts by type.
    const evidenceCountsByType = await prisma.$queryRaw<
      Array<{ evidence_type: string; total_items: bigint; total_cases: bigint }>
    >`
      SELECT e.evidence_type,
             COUNT(e.evidence_id)        AS total_items,
             COUNT(DISTINCT e.case_id)   AS total_cases
      FROM evidence e
      GROUP BY e.evidence_type
      ORDER BY total_items DESC, e.evidence_type
    `;

    // 3. Digital evidence size statistics by media type (report query 5.3.2).
    const digitalSizeByMediaType = await prisma.$queryRaw<
      Array<{
        media_type: string;
        total_files: bigint;
        avg_size_mb: unknown;
        max_size_mb: unknown;
        min_size_mb: unknown;
        total_storage_mb: unknown;
      }>
    >`
      SELECT media_type,
             COUNT(*)                 AS total_files,
             ROUND(AVG(size_mb), 2)   AS avg_size_mb,
             MAX(size_mb)             AS max_size_mb,
             MIN(size_mb)             AS min_size_mb,
             ROUND(SUM(size_mb), 2)   AS total_storage_mb
      FROM digital_evidence
      GROUP BY media_type
      ORDER BY media_type
    `;

    // 4. Officer workload — open/under_investigation cases per officer
    //    (the logic behind Oracle's FN_GET_OFFICER_WORKLOAD function).
    const officerWorkload = await prisma.$queryRaw<
      Array<{
        officer_id: string;
        full_name: string;
        badge_number: string;
        role: string;
        open_case_count: bigint;
        total_case_count: bigint;
      }>
    >`
      SELECT o.officer_id,
             o.full_name,
             o.badge_number,
             o.role,
             COUNT(c.case_id) FILTER (WHERE c.status IN ('open', 'under_investigation')) AS open_case_count,
             COUNT(c.case_id)                                                            AS total_case_count
      FROM officers o
      LEFT JOIN cases c ON c.lead_officer_id = o.officer_id
      GROUP BY o.officer_id, o.full_name, o.badge_number, o.role
      ORDER BY open_case_count DESC, o.full_name
    `;

    // 5. Chain-of-custody activity per evidence item (Oracle FN_COUNT_CUSTODY_TRANSFERS).
    const custodyActivity = await prisma.$queryRaw<
      Array<{ evidence_id: string; evidence_type: string; total_transfers: bigint }>
    >`
      SELECT e.evidence_id,
             e.evidence_type,
             COUNT(cl.log_id) AS total_transfers
      FROM evidence e
      LEFT JOIN custody_log cl ON cl.evidence_id = e.evidence_id
      GROUP BY e.evidence_id, e.evidence_type
      ORDER BY total_transfers DESC, e.evidence_id
    `;

    const [totalCases, totalEvidence, totalOfficers, totalTransfers, totalReports] = await Promise.all([
      prisma.case.count(),
      prisma.evidence.count(),
      prisma.officer.count(),
      prisma.custodyLog.count(),
      prisma.report.count(),
    ]);

    res.json({
      totals: {
        cases: totalCases,
        evidence: totalEvidence,
        officers: totalOfficers,
        custodyTransfers: totalTransfers,
        reports: totalReports,
      },
      caseCountsByStatus: caseCountsByStatus.map((r) => ({
        status: r.status,
        totalCases: toNum(r.total_cases),
        totalEvidenceItems: toNum(r.total_evidence_items),
      })),
      evidenceCountsByType: evidenceCountsByType.map((r) => ({
        evidenceType: r.evidence_type,
        totalItems: toNum(r.total_items),
        totalCases: toNum(r.total_cases),
      })),
      digitalSizeByMediaType: digitalSizeByMediaType.map((r) => ({
        mediaType: r.media_type,
        totalFiles: toNum(r.total_files),
        avgSizeMb: toNum(r.avg_size_mb),
        maxSizeMb: toNum(r.max_size_mb),
        minSizeMb: toNum(r.min_size_mb),
        totalStorageMb: toNum(r.total_storage_mb),
      })),
      officerWorkload: officerWorkload.map((r) => ({
        officerId: r.officer_id,
        fullName: r.full_name,
        badgeNumber: r.badge_number,
        role: r.role,
        openCaseCount: toNum(r.open_case_count),
        totalCaseCount: toNum(r.total_case_count),
      })),
      custodyActivity: custodyActivity.map((r) => ({
        evidenceId: r.evidence_id,
        evidenceType: r.evidence_type,
        totalTransfers: toNum(r.total_transfers),
      })),
    });
  }),
);

/**
 * GET /api/dashboard/rollup — the report's hierarchical GROUP BY ROLLUP query,
 * plus a status x evidence-type cross-tab.
 *
 * Postgres has no NVL(), so COALESCE() substitutes for it; the labels are kept
 * identical to the Oracle originals ('TOTAL ALL STATUSES' / 'SUBTOTAL TYPE').
 */
dashboardRouter.get(
  '/rollup',
  asyncHandler(async (_req, res) => {
    const rollup = await prisma.$queryRaw<
      Array<{ case_status: string; evidence_type: string; item_count: bigint }>
    >`
      SELECT COALESCE(c.status, 'TOTAL ALL STATUSES')          AS case_status,
             COALESCE(e.evidence_type, 'SUBTOTAL TYPE')        AS evidence_type,
             COUNT(e.evidence_id)                              AS item_count
      FROM cases c
      JOIN evidence e ON c.case_id = e.case_id
      GROUP BY ROLLUP(c.status, e.evidence_type)
      ORDER BY c.status NULLS LAST, e.evidence_type NULLS LAST
    `;

    res.json({
      rollup: rollup.map((r) => ({
        caseStatus: r.case_status,
        evidenceType: r.evidence_type,
        itemCount: toNum(r.item_count),
      })),
    });
  }),
);
