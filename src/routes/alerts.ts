import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const alertsRouter = Router();

alertsRouter.use(requireAuth);

/** GET /api/alerts/duplicate-evidence — list all duplicate evidence alerts. */
alertsRouter.get(
  '/duplicate-evidence',
  requirePermission('VIEW_INTELLIGENCE'),
  asyncHandler(async (req, res) => {
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;

    const alerts = await prisma.duplicateEvidenceAlert.findMany({
      where: caseId
        ? {
            OR: [{ caseIdNew: caseId }, { caseIdExisting: caseId }],
          }
        : undefined,
      include: {
        newEvidence: {
          include: {
            digital: true,
          },
        },
        matchedEvidence: {
          include: {
            digital: true,
          },
        },
        caseNew: {
          select: {
            caseId: true,
            title: true,
            status: true,
          },
        },
        caseExisting: {
          select: {
            caseId: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ alerts });
  }),
);
