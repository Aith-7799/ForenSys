import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, conflict, notFound } from '../lib/errors.js';
import { DIGITAL_EVIDENCE_TYPE, EVIDENCE_TYPES } from '../lib/roles.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const evidenceRouter = Router();

evidenceRouter.use(requireAuth);

const physicalSchema = z.object({
  storageLockerNumber: z.string().trim().min(1, 'Storage locker number is required.').max(50),
  sealNumber: z.string().trim().min(1, 'Seal number is required.').max(50),
  containerType: z.string().trim().min(1, 'Container type is required.').max(50),
});

const digitalSchema = z.object({
  fileHashSha256: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/, 'fileHashSha256 must be exactly 64 hexadecimal characters.'),
  mediaType: z.string().trim().min(1, 'Media type is required.').max(50),
  // Must satisfy the chk_digital_size CHECK (size_mb > 0) at the database level too.
  sizeMb: z.coerce.number().positive('Size must be greater than 0 MB.'),
  deviceSerial: z.string().trim().min(1, 'Device serial is required.').max(50),
});

const createSchema = z
  .object({
    caseId: z.string().trim().min(1, 'Case is required.'),
    evidenceType: z.enum(EVIDENCE_TYPES),
    collectionTimestamp: z.coerce.date({
      errorMap: () => ({ message: 'collectionTimestamp must be a valid date.' }),
    }),
    physical: physicalSchema.optional(),
    digital: digitalSchema.optional(),
  })
  .superRefine((value, ctx) => {
    // Mirror the Oracle design: DIGITAL_EVIDENCE exists for 'Digital Device' items,
    // PHYSICAL_EVIDENCE for everything else. Exactly one subtype must be supplied.
    if (value.evidenceType === DIGITAL_EVIDENCE_TYPE) {
      if (!value.digital) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['digital'],
          message: `Digital evidence details are required when evidenceType is "${DIGITAL_EVIDENCE_TYPE}".`,
        });
      }
      if (value.physical) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['physical'],
          message: 'Physical evidence details are not applicable to a digital evidence item.',
        });
      }
    } else {
      if (!value.physical) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['physical'],
          message: `Physical evidence details are required for evidenceType "${value.evidenceType}".`,
        });
      }
      if (value.digital) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['digital'],
          message: `Digital evidence details are only allowed when evidenceType is "${DIGITAL_EVIDENCE_TYPE}".`,
        });
      }
    }
  });

/**
 * GET /api/evidence — list, optionally filtered by case, type or subtype presence.
 */
evidenceRouter.get(
  '/',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;
    const evidenceType = typeof req.query.evidenceType === 'string' ? req.query.evidenceType : undefined;

    const items = await prisma.evidence.findMany({
      where: {
        ...(caseId ? { caseId } : {}),
        ...(evidenceType ? { evidenceType } : {}),
      },
      include: { physical: true, digital: true, case: { select: { caseId: true, title: true, status: true } } },
      orderBy: { collectionTimestamp: 'desc' },
    });

    res.json({ evidence: items });
  }),
);

/**
 * POST /api/evidence — "Register Evidence Item".
 *
 * The item and its subtype row are written in one transaction, so a rejected
 * subtype cannot leave an orphaned EVIDENCE row behind.
 *
 * Note: trg_prevent_closed_case_evid fires here. Registering evidence against a
 * 'closed' or 'archived' case is rejected by the database and surfaces as a 409.
 */
evidenceRouter.post(
  '/',
  requirePermission('REGISTER_EVIDENCE'),
  asyncHandler(async (req, res) => {
    const body = parse(createSchema, req.body);

    const parentCase = await prisma.case.findUnique({ where: { caseId: body.caseId } });
    if (!parentCase) throw badRequest(`Case "${body.caseId}" does not exist.`);

    // Fail fast with the same status code and wording the trigger would produce,
    // so clients cannot tell the two paths apart. The trigger in the migration is
    // still the real guarantee -- this is only a nicer error for the common case.
    if (parentCase.status === 'closed' || parentCase.status === 'archived') {
      throw conflict(
        `CANNOT INSERT EVIDENCE: Case ${parentCase.caseId} is closed or archived.`,
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.evidence.create({
        data: {
          caseId: body.caseId,
          evidenceType: body.evidenceType,
          collectionTimestamp: body.collectionTimestamp,
        },
      });

      if (body.digital) {
        await tx.digitalEvidence.create({
          data: {
            evidenceId: item.evidenceId,
            fileHashSha256: body.digital.fileHashSha256.toLowerCase(),
            mediaType: body.digital.mediaType,
            sizeMb: body.digital.sizeMb,
            deviceSerial: body.digital.deviceSerial,
          },
        });
      } else if (body.physical) {
        await tx.physicalEvidence.create({
          data: {
            evidenceId: item.evidenceId,
            storageLockerNumber: body.physical.storageLockerNumber,
            sealNumber: body.physical.sealNumber,
            containerType: body.physical.containerType,
          },
        });
      }

      return tx.evidence.findUniqueOrThrow({
        where: { evidenceId: item.evidenceId },
        include: { physical: true, digital: true },
      });
    });

    res.status(201).json({ evidence: created });
  }),
);

/**
 * GET /api/evidence/:evidenceId — full detail including the computed current
 * holder and the custody trail.
 */
evidenceRouter.get(
  '/:evidenceId',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const { evidenceId } = req.params;

    const item = await prisma.evidence.findUnique({
      where: { evidenceId },
      include: {
        physical: true,
        digital: true,
        case: { select: { caseId: true, title: true, status: true } },
        custodyLogs: {
          include: { releasedBy: true, receivedBy: true },
          orderBy: { transferTimestamp: 'asc' },
        },
        reports: { include: { uploadedBy: true }, orderBy: { uploadedAt: 'desc' } },
      },
    });

    if (!item) throw notFound('Evidence not found.');

    // Current holder = receiver of the latest transfer; null means it has never
    // been transferred and is still with whoever collected it.
    const latest = item.custodyLogs.at(-1) ?? null;

    res.json({
      evidence: item,
      currentHolder: latest ? latest.receivedBy : null,
      transferCount: item.custodyLogs.length,
      currentHolderSince: latest ? latest.transferTimestamp : null,
    });
  }),
);

/** DELETE /api/evidence/:evidenceId — cascades to subtype and custody rows. */
evidenceRouter.delete(
  '/:evidenceId',
  requirePermission('DELETE_RECORDS'),
  asyncHandler(async (req, res) => {
    const item = await prisma.evidence.findUnique({ where: { evidenceId: req.params.evidenceId } });
    if (!item) throw notFound('Evidence not found.');

    await prisma.evidence.delete({ where: { evidenceId: req.params.evidenceId } });
    res.status(204).end();
  }),
);
