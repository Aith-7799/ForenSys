import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { uploadRoot } from '../middleware/upload.js';
import { asyncHandler, badRequest, notFound } from '../lib/errors.js';
import { CASE_STATUSES } from '../lib/roles.js';
import { publicOfficer, serializeCase } from '../lib/serialize.js';
import { parse } from '../lib/validate.js';
import { currentOfficer, requireAuth, requirePermission } from '../middleware/auth.js';
import { getSimilarCases, getCorrelationGraph } from '../lib/similarity.js';

export const casesRouter = Router();

/**
 * How a status change reaches the database.
 *
 * Every status change goes through the sp_change_case_status() SQL function rather
 * than a plain UPDATE, because the AFTER UPDATE trigger that writes CASE_AUDIT_LOG
 * reads the acting officer out of the app.current_user session setting that the
 * function publishes. Application code never inserts an audit row itself.
 */
async function changeCaseStatus(caseId: string, status: string, actor: string): Promise<void> {
  // The function returns VOID, and Prisma cannot deserialise a 'void' column, so
  // the result is cast to text before it crosses the driver boundary. The cast is
  // purely for transport -- the function still returns void in the database.
  await prisma.$queryRaw`
    SELECT sp_change_case_status(${caseId}, ${status}, ${actor})::text AS outcome
  `;
}

/** "Det. Robert Vance [BADGE-9081]" — what CASE_AUDIT_LOG.changed_by records. */
function actorLabel(officer: { fullName: string; badgeNumber: string }): string {
  return `${officer.fullName} [${officer.badgeNumber}]`.slice(0, 100);
}

casesRouter.use(requireAuth);

const createSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(255),
  incidentTimestamp: z.coerce.date({ errorMap: () => ({ message: 'incidentTimestamp must be a valid date.' }) }),
  locationPoint: z.string().trim().min(1, 'Location is required.').max(100),
  /** Optional. Defaults to the logged-in officer, per the Create Crime Report use case. */
  leadOfficerId: z.string().trim().min(1).optional(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  incidentTimestamp: z.coerce.date().optional(),
  locationPoint: z.string().trim().min(1).max(100).optional(),
  leadOfficerId: z.string().trim().min(1).optional(),
  status: z.enum(CASE_STATUSES).optional(),
});

const listQuery = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  leadOfficerId: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
});

/** GET /api/cases — list, with optional status / officer / text filters. */
casesRouter.get(
  '/',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const { status, leadOfficerId, q } = parse(listQuery, req.query);

    const cases = await prisma.case.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(leadOfficerId ? { leadOfficerId } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' as const } },
                { caseId: { contains: q, mode: 'insensitive' as const } },
                { locationPoint: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: { leadOfficer: true, _count: { select: { evidence: true } } },
      orderBy: { incidentTimestamp: 'desc' },
    });

    res.json({ cases: cases.map(serializeCase) });
  }),
);

/**
 * POST /api/cases — "Create Crime Report".
 * Lead officer is auto-assigned to the caller unless one is supplied.
 */
casesRouter.post(
  '/',
  requirePermission('CREATE_CASE'),
  asyncHandler(async (req, res) => {
    const body = parse(createSchema, req.body);
    const caller = currentOfficer(req);

    const leadOfficerId = body.leadOfficerId ?? caller.sub;

    const lead = await prisma.officer.findUnique({ where: { officerId: leadOfficerId } });
    if (!lead) throw badRequest(`Lead officer "${leadOfficerId}" does not exist.`);

    const created = await prisma.case.create({
      data: {
        title: body.title,
        incidentTimestamp: body.incidentTimestamp,
        locationPoint: body.locationPoint,
        status: 'open',
        leadOfficerId,
      },
      include: { leadOfficer: true, _count: { select: { evidence: true } } },
    });

    res.status(201).json({ case: serializeCase(created) });
  }),
);

/** GET /api/cases/correlation-graph — network of correlated cases above similarity threshold. */
casesRouter.get(
  '/correlation-graph',
  requirePermission('VIEW_INTELLIGENCE'),
  asyncHandler(async (req, res) => {
    const minScore = req.query.minScore ? Number(req.query.minScore) : 15;
    const excludeClosed = req.query.excludeClosed === 'true';

    const graph = await getCorrelationGraph({ minScore, excludeClosed });
    res.json(graph);
  }),
);

/** GET /api/cases/:caseId/similar — ranked list of similar cases with multi-vector breakdown. */
casesRouter.get(
  '/:caseId/similar',
  requirePermission('VIEW_INTELLIGENCE'),
  asyncHandler(async (req, res) => {
    const { caseId } = req.params;
    const excludeClosed = req.query.excludeClosed !== 'false'; // default true
    const minScore = req.query.minScore ? Number(req.query.minScore) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const similar = await getSimilarCases(caseId, { excludeClosed, minScore, limit });
    res.json({ similar });
  }),
);

/** GET /api/cases/:caseId */
casesRouter.get(
  '/:caseId',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const found = await prisma.case.findUnique({
      where: { caseId: req.params.caseId },
      include: { leadOfficer: true, _count: { select: { evidence: true } } },
    });
    if (!found) throw notFound('Case not found.');
    res.json({ case: serializeCase(found) });
  }),
);

/** PATCH /api/cases/:caseId — update attributes and/or the status. */
casesRouter.patch(
  '/:caseId',
  requirePermission('CREATE_CASE'),
  asyncHandler(async (req, res) => {
    const { caseId } = req.params;
    const body = parse(updateSchema, req.body);
    const caller = currentOfficer(req);

    const existing = await prisma.case.findUnique({ where: { caseId } });
    if (!existing) throw notFound('Case not found.');

    if (body.leadOfficerId) {
      const lead = await prisma.officer.findUnique({ where: { officerId: body.leadOfficerId } });
      if (!lead) throw badRequest(`Lead officer "${body.leadOfficerId}" does not exist.`);
    }

    const { status, ...attributes } = body;

    // Attributes first (does not touch status, so the audit trigger stays quiet),
    // then the status transition through the auditing SQL function.
    if (Object.keys(attributes).length > 0) {
      await prisma.case.update({ where: { caseId }, data: attributes });
    }

    if (status && status !== existing.status) {
      await changeCaseStatus(caseId, status, actorLabel(caller));
    }

    const updated = await prisma.case.findUnique({
      where: { caseId },
      include: { leadOfficer: true, _count: { select: { evidence: true } } },
    });

    res.json({ case: serializeCase(updated!) });
  }),
);

/** DELETE /api/cases/:caseId — cascades to evidence, subtype rows and custody logs. */
casesRouter.delete(
  '/:caseId',
  requirePermission('DELETE_RECORDS'),
  asyncHandler(async (req, res) => {
    const { caseId } = req.params;

    const existing = await prisma.case.findUnique({ where: { caseId } });
    if (!existing) throw notFound('Case not found.');

    // ON DELETE CASCADE removes the REPORTS rows, but the uploaded files live on
    // disk and would be orphaned. Collect their paths first, then clean up after
    // the delete succeeds.
    const reports = await prisma.report.findMany({
      where: { caseId },
      select: { filePath: true },
    });

    await prisma.case.delete({ where: { caseId } });

    await Promise.all(
      reports.map((r) => {
        const absolute = path.resolve(uploadRoot, r.filePath);
        // Never unlink outside the upload directory.
        return absolute.startsWith(uploadRoot) ? fs.rm(absolute, { force: true }).catch(() => undefined) : undefined;
      }),
    );

    res.status(204).end();
  }),
);

/**
 * GET /api/cases/:caseId/timeline — "View Case Timeline".
 *
 * Merges four sources into one chronological feed:
 *   1. the case being registered (its incident timestamp)
 *   2. evidence collected
 *   3. custody transfers
 *   4. status changes, read straight out of CASE_AUDIT_LOG (written by the trigger)
 */
casesRouter.get(
  '/:caseId/timeline',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const { caseId } = req.params;

    const found = await prisma.case.findUnique({
      where: { caseId },
      include: { leadOfficer: true },
    });
    if (!found) throw notFound('Case not found.');

    const [evidence, auditRows] = await Promise.all([
      prisma.evidence.findMany({
        where: { caseId },
        include: { physical: true, digital: true, custodyLogs: { include: { releasedBy: true, receivedBy: true } } },
        orderBy: { collectionTimestamp: 'asc' },
      }),
      prisma.caseAuditLog.findMany({ where: { caseId }, orderBy: { changeTimestamp: 'asc' } }),
    ]);

    const events: Array<{
      at: Date;
      kind: 'case_registered' | 'evidence_collected' | 'custody_transfer' | 'status_change';
      title: string;
      detail?: string;
      refId?: string;
    }> = [];

    events.push({
      at: found.incidentTimestamp,
      kind: 'case_registered',
      title: 'Case registered',
      detail: `${found.title} — logged by ${found.leadOfficer.fullName} at ${found.locationPoint}`,
      refId: found.caseId,
    });

    for (const item of evidence) {
      events.push({
        at: item.collectionTimestamp,
        kind: 'evidence_collected',
        title: `${item.evidenceType} evidence collected`,
        detail: item.digital
          ? `Media: ${item.digital.mediaType} — ${item.digital.sizeMb} MB, device ${item.digital.deviceSerial}`
          : item.physical
            ? `Locker ${item.physical.storageLockerNumber}, seal ${item.physical.sealNumber}, ${item.physical.containerType}`
            : undefined,
        refId: item.evidenceId,
      });

      for (const log of item.custodyLogs) {
        events.push({
          at: log.transferTimestamp,
          kind: 'custody_transfer',
          title: `Custody: ${log.releasedBy.fullName} → ${log.receivedBy.fullName}`,
          detail: `Evidence ${item.evidenceId}${log.mongoDocRef ? ` — ref ${log.mongoDocRef}` : ''}`,
          refId: log.logId,
        });
      }
    }

    for (const row of auditRows) {
      events.push({
        at: row.changeTimestamp ?? new Date(0),
        kind: 'status_change',
        title: `Status: ${row.oldStatus} → ${row.newStatus}`,
        detail: `Changed by ${row.changedBy} (audit #${row.auditId}, CASE_AUDIT_LOG)`,
        refId: String(row.auditId),
      });
    }

    events.sort((a, b) => a.at.getTime() - b.at.getTime());

    res.json({
      case: serializeCase(found),
      auditLog: auditRows,
      timeline: events,
    });
  }),
);

/** GET /api/cases/:caseId/evidence — convenience listing scoped to a case. */
casesRouter.get(
  '/:caseId/evidence',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const { caseId } = req.params;

    const found = await prisma.case.findUnique({ where: { caseId } });
    if (!found) throw notFound('Case not found.');

    const items = await prisma.evidence.findMany({
      where: { caseId },
      include: { physical: true, digital: true },
      orderBy: { collectionTimestamp: 'asc' },
    });

    res.json({ evidence: items });
  }),
);

/** GET /api/cases/:caseId/officers — officers linked to a case, for pickers. */
casesRouter.get(
  '/:caseId/officers',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const { caseId } = req.params;

    const found = await prisma.case.findUnique({
      where: { caseId },
      include: { leadOfficer: true },
    });
    if (!found) throw notFound('Case not found.');

    const logs = await prisma.custodyLog.findMany({
      where: { evidence: { caseId } },
      include: { releasedBy: true, receivedBy: true },
    });

    const seen = new Map<string, ReturnType<typeof publicOfficer>>();
    seen.set(found.leadOfficer.officerId, publicOfficer(found.leadOfficer));
    for (const log of logs) {
      seen.set(log.releasedBy.officerId, publicOfficer(log.releasedBy));
      seen.set(log.receivedBy.officerId, publicOfficer(log.receivedBy));
    }

    res.json({ officers: [...seen.values()] });
  }),
);
