import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors.js';
import { env } from '../lib/env.js';

interface Body {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * The Postgres triggers raise with SQLSTATE P0001 (the equivalent of Oracle's
 * RAISE_APPLICATION_ERROR). Those messages are written for humans, so they are
 * surfaced verbatim instead of being swallowed into a generic 500.
 */
const TRIGGER_MESSAGES = [
  'CANNOT INSERT EVIDENCE',
  'CASE NOT FOUND',
];

function fromPrisma(err: Prisma.PrismaClientKnownRequestError): Body & { status: number } | null {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[] | string | undefined) ?? 'field';
      const fields = Array.isArray(target) ? target.join(', ') : target;
      return { status: 409, error: 'conflict', message: `A record with that ${fields} already exists.` };
    }
    case 'P2003':
      return {
        status: 409,
        error: 'foreign_key_violation',
        message: 'Referenced record does not exist, or is still referenced by other rows.',
      };
    case 'P2025':
      return { status: 404, error: 'not_found', message: 'Record not found.' };
    case 'P2014':
      return {
        status: 409,
        error: 'relation_violation',
        message: 'This change would break a required relation between records.',
      };
    default:
      return null;
  }
}

/** Recognises a Postgres error code buried in a Prisma "unknown request" error. */
function fromPostgres(err: unknown): Body & { status: number } | null {
  const message = err instanceof Error ? err.message : '';

  for (const triggerMessage of TRIGGER_MESSAGES) {
    if (message.includes(triggerMessage)) {
      // Extract the human-readable part the trigger put after "Message: `...`".
      const match = /Message: `([^`]+)`/.exec(message);
      return {
        status: 409,
        error: 'business_rule_violation',
        message: match?.[1] ?? triggerMessage,
      };
    }
  }

  if (message.includes('23514') || message.includes('violates check constraint')) {
    const match = /constraint "([^"]+)"/.exec(message);
    return {
      status: 400,
      error: 'check_constraint_violation',
      message: match
        ? `Value rejected by constraint "${match[1]}".`
        : 'Value rejected by a check constraint.',
    };
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details === undefined ? {} : { details: err.details }),
    } satisfies Body);
    return;
  }

  // MongoDB / Mongoose duplicate key error (code 11000)
  if ((err as any)?.code === 11000) {
    const key = Object.keys((err as any).keyPattern || {})[0] || 'field';
    res.status(409).json({
      error: 'conflict',
      message: `A record with that ${key} already exists.`,
    });
    return;
  }

  // Safe Prisma check
  if (Prisma?.PrismaClientKnownRequestError && err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrisma(err);
    if (mapped) {
      const { status, ...body } = mapped;
      res.status(status).json(body);
      return;
    }
  }

  const pg = fromPostgres(err);
  if (pg) {
    const { status, ...body } = pg;
    res.status(status).json(body);
    return;
  }

  // Unexpected: log server-side, keep the client response opaque.
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected error occurred.',
    ...(env.nodeEnv === 'development' && err instanceof Error ? { details: err.message } : {}),
  });
}

/** 404 for unmatched API routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'not_found',
    message: `No route matches ${req.method} ${req.originalUrl}.`,
  });
}
