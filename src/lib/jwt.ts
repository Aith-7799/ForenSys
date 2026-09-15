import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from './env.js';
import { unauthorized } from './errors.js';
import type { Role } from './roles.js';

/** What we put inside a token. `role` is the DB role string, so middleware can
 *  authorize without a second database round-trip. */
export interface TokenPayload {
  sub: string;
  badgeNumber: string;
  fullName: string;
  role: Role;
  kind: 'access' | 'refresh';
}

export function signAccessToken(officer: {
  officerId: string;
  badgeNumber: string;
  fullName: string;
  role: Role;
}): string {
  const payload: TokenPayload = {
    sub: officer.officerId,
    badgeNumber: officer.badgeNumber,
    fullName: officer.fullName,
    role: officer.role,
    kind: 'access',
  };
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as SignOptions);
}

export function signRefreshToken(officer: {
  officerId: string;
  badgeNumber: string;
  fullName: string;
  role: Role;
}): string {
  const payload: TokenPayload = {
    sub: officer.officerId,
    badgeNumber: officer.badgeNumber,
    fullName: officer.fullName,
    role: officer.role,
    kind: 'refresh',
  };
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  } as SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return verify(token, env.jwtSecret, 'access');
}

export function verifyRefreshToken(token: string): TokenPayload {
  return verify(token, env.jwtRefreshSecret, 'refresh');
}

function verify(token: string, secret: string, kind: 'access' | 'refresh'): TokenPayload {
  try {
    const decoded = jwt.verify(token, secret) as TokenPayload;
    // A refresh token must not be usable as an access token, or vice versa.
    if (decoded.kind !== kind) throw unauthorized('Wrong token type.');
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw unauthorized('Token expired.');
    if (err instanceof jwt.JsonWebTokenError) throw unauthorized('Invalid token.');
    throw err;
  }
}
