import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound } from '../lib/errors.js';
import { serializeCustodyLog } from '../lib/serialize.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const custodyRouter = Router();

custodyRouter.use(requireAuth);

/** The officer currently holding an item: receiver of the most recent transfer. */
export async function currentHolder(evidenceId: string) {
  const latest = await prisma.custodyLog.findFirst({
    where: { evidenceId },
    include: { receivedBy: true },
    orderBy: { transferTimestamp: 'desc' },
  });
  return latest ? latest.receivedBy : null;
}

const createSchema = z.object({
  evidenceId: z.string().trim().min(1, 'Evidence is required.'),
  releasedById: z.string().trim().min(1, 'Releasing officer is required.'),
  receivedById: z.string().trim().min(1, 'Receiving officer is required.'),
  /** Optional; defaults to now() in the database, matching the Oracle DEFAULT. */
  transferTimestamp: z.coerce.date().optional(),
  /** Free-text pointer: an external document-store ObjectId, or a reports.report_id. */
  mongoDocRef: z.string().trim().max(500).optional().nullable(),
});

/** GET /api/custody — the transfer trail, filterable by evidence or case. */
custodyRouter.get(
  '/',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const evidenceId = typeof req.query.evidenceId === 'string' ? req.query.evidenceId : undefined;
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;

    const logs = await prisma.custodyLog.findMany({
      where: {
        ...(evidenceId ? { evidenceId } : {}),
        ...(caseId ? { evidence: { caseId } } : {}),
      },
      include: { releasedBy: true, receivedBy: true, evidence: true },
      orderBy: { transferTimestamp: 'desc' },
    });

    res.json({ custodyLogs: logs.map(serializeCustodyLog) });
  }),
);

/** GET /api/custody/holder/:evidenceId — who holds this item right now. */
custodyRouter.get(
  '/holder/:evidenceId',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const { evidenceId } = req.params;

    const item = await prisma.evidence.findUnique({ where: { evidenceId } });
    if (!item) throw notFound('Evidence not found.');

    const holder = await currentHolder(evidenceId);

    res.json({
      evidenceId,
      currentHolder: holder,
      note: holder
        ? 'Computed as the receiver of the most recent CUSTODY_LOG entry.'
        : 'No transfers recorded; the item has not left its collecting officer.',
    });
  }),
);

/**
 * POST /api/custody — "Log Chain of Custody".
 *
 * Validates the transfer before writing it, so the trail cannot become
 * self-contradictory:
 *   * the evidence item must exist
 *   * both officers must exist
 *   * an officer cannot release evidence to themselves
 *   * the releasing officer must be the officer who currently holds it
 *     (skipped when the item has never been transferred)
 */
custodyRouter.post(
  '/',
  requirePermission('LOG_CUSTODY'),
  asyncHandler(async (req, res) => {
    const body = parse(createSchema, req.body);

    const item = await prisma.evidence.findUnique({ where: { evidenceId: body.evidenceId } });
    if (!item) throw badRequest(`Evidence "${body.evidenceId}" does not exist.`);

    if (body.releasedById === body.receivedById) {
      throw badRequest('The releasing and receiving officers must be different people.');
    }

    const [releasedBy, receivedBy] = await Promise.all([
      prisma.officer.findUnique({ where: { officerId: body.releasedById } }),
      prisma.officer.findUnique({ where: { officerId: body.receivedById } }),
    ]);

    if (!releasedBy) throw badRequest(`Releasing officer "${body.releasedById}" does not exist.`);
    if (!receivedBy) throw badRequest(`Receiving officer "${body.receivedById}" does not exist.`);

    const holder = await currentHolder(body.evidenceId);
    if (holder && holder.officerId !== body.releasedById) {
      throw badRequest(
        `${releasedBy.fullName} cannot release ${body.evidenceId}: it is currently held by ` +
          `${holder.fullName} (${holder.badgeNumber}).`,
      );
    }

    const created = await prisma.custodyLog.create({
      data: {
        evidenceId: body.evidenceId,
        releasedById: body.releasedById,
        receivedById: body.receivedById,
        ...(body.transferTimestamp ? { transferTimestamp: body.transferTimestamp } : {}),
        mongoDocRef: body.mongoDocRef ?? null,
      },
      include: { releasedBy: true, receivedBy: true, evidence: true },
    });

    res.status(201).json({
      custodyLog: serializeCustodyLog(created),
      currentHolder: created.receivedBy,
    });
  }),
);
