import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { isRole, ROLES } from '../lib/roles.js';
import { publicOfficer } from '../lib/serialize.js';
import { parse } from '../lib/validate.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { asyncHandler } from '../lib/errors.js';
import { currentOfficer, requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const loginSchema = z.object({
  badgeNumber: z.string().trim().min(1, 'Badge number is required.'),
  password: z.string().min(1, 'Password is required.'),
});

/** POST /api/auth/login — "Authenticate User". */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { badgeNumber, password } = parse(loginSchema, req.body);

    const officer = await prisma.officer.findUnique({ where: { badgeNumber } });

    // Compare against a dummy hash when the officer is missing so that a wrong
    // badge number and a wrong password take the same amount of time.
    const hash = officer?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await bcrypt.compare(password, hash);

    if (!officer || !ok) throw unauthorized('Invalid badge number or password.');

    if (!isRole(officer.role)) {
      throw badRequest(
        `Officer has an unrecognised role "${officer.role}". Expected one of: ${Object.values(ROLES).join(', ')}.`,
      );
    }

    const identity = {
      officerId: officer.officerId,
      badgeNumber: officer.badgeNumber,
      fullName: officer.fullName,
      role: officer.role,
    };

    res.json({
      accessToken: signAccessToken(identity),
      refreshToken: signRefreshToken(identity),
      officer: publicOfficer(officer),
    });
  }),
);

/** POST /api/auth/refresh — exchange a refresh token for a new token pair. */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(1) }), req.body);

    const payload = verifyRefreshToken(refreshToken);

    // Re-read the officer so a deleted or re-roled account cannot keep refreshing.
    const officer = await prisma.officer.findUnique({ where: { officerId: payload.sub } });
    if (!officer) throw unauthorized('Account no longer exists.');
    if (!isRole(officer.role)) throw unauthorized('Account role is no longer valid.');

    const identity = {
      officerId: officer.officerId,
      badgeNumber: officer.badgeNumber,
      fullName: officer.fullName,
      role: officer.role,
    };

    res.json({
      accessToken: signAccessToken(identity),
      refreshToken: signRefreshToken(identity),
      officer: publicOfficer(officer),
    });
  }),
);

/**
 * POST /api/auth/logout.
 *
 * Tokens are stateless and short-lived, so logout is the client discarding them.
 * The endpoint exists so the frontend has one thing to call and so a future
 * refresh-token denylist has a home; it deliberately does not pretend to
 * invalidate an already-issued access token.
 */
authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.status(204).end();
  }),
);

/** GET /api/auth/me — the caller's own profile. */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const caller = currentOfficer(req);
    const officer = await prisma.officer.findUnique({ where: { officerId: caller.sub } });
    if (!officer) throw unauthorized('Account no longer exists.');
    res.json({ officer: publicOfficer(officer) });
  }),
);
