import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, conflict, notFound } from '../lib/errors.js';
import { ALL_ROLES, ROLES } from '../lib/roles.js';
import { publicOfficer } from '../lib/serialize.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const officersRouter = Router();

const BCRYPT_ROUNDS = 10;

// Every officer route requires a logged-in user; writes additionally require the
// System Administrator's MANAGE_USERS permission.
officersRouter.use(requireAuth);

const createSchema = z.object({
  badgeNumber: z.string().trim().min(1).max(50),
  fullName: z.string().trim().min(1).max(150),
  role: z.enum(ALL_ROLES as unknown as [string, ...string[]]),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const updateSchema = z.object({
  badgeNumber: z.string().trim().min(1).max(50).optional(),
  fullName: z.string().trim().min(1).max(150).optional(),
  role: z.enum(ALL_ROLES as unknown as [string, ...string[]]).optional(),
});

/** GET /api/officers — directory used to populate officer pickers. */
officersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const officers = await prisma.officer.findMany({
      where: role ? { role } : undefined,
      orderBy: { badgeNumber: 'asc' },
    });
    res.json({ officers: officers.map(publicOfficer) });
  }),
);

/** GET /api/officers/roles — the role vocabulary, for building role pickers. */
officersRouter.get('/roles', (_req, res) => {
  res.json({ roles: ALL_ROLES });
});

officersRouter.get(
  '/:officerId',
  asyncHandler(async (req, res) => {
    const officer = await prisma.officer.findUnique({ where: { officerId: req.params.officerId } });
    if (!officer) throw notFound('Officer not found.');
    res.json({ officer: publicOfficer(officer) });
  }),
);

/** POST /api/officers — System Administrator only. */
officersRouter.post(
  '/',
  requirePermission('MANAGE_USERS'),
  asyncHandler(async (req, res) => {
    const body = parse(createSchema, req.body);

    const existing = await prisma.officer.findUnique({ where: { badgeNumber: body.badgeNumber } });
    if (existing) throw conflict(`Badge number "${body.badgeNumber}" is already in use.`);

    const officer = await prisma.officer.create({
      data: {
        badgeNumber: body.badgeNumber,
        fullName: body.fullName,
        role: body.role,
        passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
      },
    });

    res.status(201).json({ officer: publicOfficer(officer) });
  }),
);

/** PATCH /api/officers/:officerId — System Administrator only. */
officersRouter.patch(
  '/:officerId',
  requirePermission('MANAGE_USERS'),
  asyncHandler(async (req, res) => {
    const body = parse(updateSchema, req.body);

    const target = await prisma.officer.findUnique({ where: { officerId: req.params.officerId } });
    if (!target) throw notFound('Officer not found.');

    if (
      body.role &&
      target.role === ROLES.SYSTEM_ADMINISTRATOR &&
      body.role !== ROLES.SYSTEM_ADMINISTRATOR
    ) {
      const admins = await prisma.officer.count({ where: { role: ROLES.SYSTEM_ADMINISTRATOR } });
      if (admins <= 1) throw conflict('Cannot demote the last remaining System Administrator.');
    }

    const officer = await prisma.officer.update({
      where: { officerId: target.officerId },
      data: body,
    });

    res.json({ officer: publicOfficer(officer) });
  }),
);

/** POST /api/officers/:officerId/password — System Administrator only. */
officersRouter.post(
  '/:officerId/password',
  requirePermission('MANAGE_USERS'),
  asyncHandler(async (req, res) => {
    const { password } = parse(
      z.object({ password: z.string().min(8, 'Password must be at least 8 characters.') }),
      req.body,
    );

    const target = await prisma.officer.findUnique({ where: { officerId: req.params.officerId } });
    if (!target) throw notFound('Officer not found.');

    await prisma.officer.update({
      where: { officerId: target.officerId },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
    });

    res.status(204).end();
  }),
);

/** DELETE /api/officers/:officerId — System Administrator only. */
officersRouter.delete(
  '/:officerId',
  requirePermission('MANAGE_USERS'),
  asyncHandler(async (req, res) => {
    const target = await prisma.officer.findUnique({ where: { officerId: req.params.officerId } });
    if (!target) throw notFound('Officer not found.');

    // Cases, custody transfers and reports all hold RESTRICT foreign keys to
    // officers, so the database refuses to orphan them. Surface that clearly.
    const [cases, transfers, reports] = await Promise.all([
      prisma.case.count({ where: { leadOfficerId: target.officerId } }),
      prisma.custodyLog.count({
        where: { OR: [{ releasedById: target.officerId }, { receivedById: target.officerId }] },
      }),
      prisma.report.count({ where: { uploadedById: target.officerId } }),
    ]);

    if (cases + transfers + reports > 0) {
      throw conflict(
        `Cannot delete ${target.fullName}: still referenced by ${cases} case(s), ` +
          `${transfers} custody transfer(s) and ${reports} report(s). Reassign them first.`,
      );
    }

    await prisma.officer.delete({ where: { officerId: target.officerId } });
    res.status(204).end();
  }),
);
