import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound } from '../lib/errors.js';
import { REPORT_TYPES } from '../lib/roles.js';
import { serializeReport } from '../lib/serialize.js';
import { parse } from '../lib/validate.js';
import { uploadReport, uploadRoot } from '../middleware/upload.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

const metaSchema = z
  .object({
    caseId: z.string().trim().min(1).optional(),
    evidenceId: z.string().trim().min(1).optional(),
    reportType: z.enum(REPORT_TYPES),
    /** Optional pointer replicated into CUSTODY_LOG.mongo_doc_ref. */
    mongoDocRef: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    // Mirrors the chk_reports_parent CHECK constraint.
    if (!value.caseId && !value.evidenceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caseId'],
        message: 'Attach the report to a case, an evidence item, or both.',
      });
    }
  });

/** Best-effort cleanup so a rejected upload does not leak a file onto disk. */
async function discardUpload(file?: Express.Multer.File): Promise<void> {
  if (!file) return;
  await fs.rm(file.path, { force: true }).catch(() => undefined);
}

/**
 * POST /api/reports — "Upload Laboratory and Witness Reports".
 * Multipart form-data: `file` plus caseId / evidenceId / reportType.
 * Restricted to the Forensic Laboratory Analyst role.
 */
reportsRouter.post(
  '/',
  requirePermission('UPLOAD_REPORT'),
  uploadReport.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('No file was uploaded. Send it as multipart field "file".');

    let body: z.infer<typeof metaSchema>;
    try {
      body = parse(metaSchema, req.body);
    } catch (err) {
      await discardUpload(file);
      throw err;
    }

    try {
      if (body.caseId) {
        const parent = await prisma.case.findUnique({ where: { caseId: body.caseId } });
        if (!parent) throw badRequest(`Case "${body.caseId}" does not exist.`);
      }
      if (body.evidenceId) {
        const parent = await prisma.evidence.findUnique({ where: { evidenceId: body.evidenceId } });
        if (!parent) throw badRequest(`Evidence "${body.evidenceId}" does not exist.`);
      }

      const created = await prisma.report.create({
        data: {
          caseId: body.caseId ?? null,
          evidenceId: body.evidenceId ?? null,
          reportType: body.reportType,
          fileName: file.originalname,
          // Stored relative to uploadRoot so the folder can be relocated.
          filePath: path.relative(uploadRoot, file.path),
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedById: req.officer!.sub,
        },
        include: { uploadedBy: true },
      });

      // If the caller asked for a custody pointer, record it against the evidence
      // item's latest custody entry so the two stay linked.
      if (body.mongoDocRef && body.evidenceId) {
        const latest = await prisma.custodyLog.findFirst({
          where: { evidenceId: body.evidenceId },
          orderBy: { transferTimestamp: 'desc' },
        });
        if (latest) {
          await prisma.custodyLog.update({
            where: { logId: latest.logId },
            data: { mongoDocRef: body.mongoDocRef },
          });
        }
      }

      res.status(201).json({ report: serializeReport(created) });
    } catch (err) {
      await discardUpload(file);
      throw err;
    }
  }),
);

/** GET /api/reports — list reports for a case and/or evidence item. */
reportsRouter.get(
  '/',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;
    const evidenceId = typeof req.query.evidenceId === 'string' ? req.query.evidenceId : undefined;

    const reports = await prisma.report.findMany({
      where: {
        ...(caseId ? { caseId } : {}),
        ...(evidenceId ? { evidenceId } : {}),
      },
      include: { uploadedBy: true },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({ reports: reports.map(serializeReport) });
  }),
);

/** GET /api/reports/:reportId/download — stream the stored file back. */
reportsRouter.get(
  '/:reportId/download',
  requirePermission('VIEW_CASE_DATA'),
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { reportId: req.params.reportId } });
    if (!report) throw notFound('Report not found.');

    // Resolve inside uploadRoot only, so a tampered file_path cannot escape it.
    const absolute = path.resolve(uploadRoot, report.filePath);
    if (!absolute.startsWith(uploadRoot)) throw badRequest('Invalid report path.');

    try {
      await fs.access(absolute);
    } catch {
      throw notFound('The stored file is missing from the upload directory.');
    }

    res.download(absolute, report.fileName);
  }),
);

/** DELETE /api/reports/:reportId — removes the row and the stored file. */
reportsRouter.delete(
  '/:reportId',
  requirePermission('UPLOAD_REPORT'),
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { reportId: req.params.reportId } });
    if (!report) throw notFound('Report not found.');

    await prisma.report.delete({ where: { reportId: report.reportId } });

    const absolute = path.resolve(uploadRoot, report.filePath);
    if (absolute.startsWith(uploadRoot)) {
      await fs.rm(absolute, { force: true }).catch(() => undefined);
    }

    res.status(204).end();
  }),
);
