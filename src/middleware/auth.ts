import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verifyAccessToken, type TokenPayload } from '../lib/jwt.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { isRole, roleHasPermission, type Permission } from '../lib/roles.js';

/**
 * Validates the bearer token and attaches the caller to the request.
 *
 * This is the server-side gate for "Authenticate User" -- the frontend hiding a
 * button is not a security control.
 */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (!token || scheme?.toLowerCase() !== 'bearer') {
    throw unauthorized('Provide an "Authorization: Bearer <token>" header.');
  }

  const payload = verifyAccessToken(token);
  req.officer = payload;
  next();
};

/** The authenticated caller, or a 401. Narrows the optional field for handlers. */
export function currentOfficer(req: Request): TokenPayload {
  if (!req.officer) throw unauthorized();
  return req.officer;
}

/**
 * Requires the caller's role to hold a permission from the matrix in lib/roles.ts.
 * Must be mounted after requireAuth.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const officer = currentOfficer(req);

    // The role travelled in the token; re-validate it rather than trusting a
    // hand-crafted token that survived signature checks with a bogus role.
    if (!isRole(officer.role)) {
      throw forbidden(`Unknown role "${officer.role}".`);
    }

    if (!roleHasPermission(officer.role, permission)) {
      throw forbidden(`Role "${officer.role}" is not permitted to perform "${permission}".`);
    }

    next();
  };
}
