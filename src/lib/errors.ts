import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** An error carrying an HTTP status, safe to return to the client verbatim. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'error',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, 'bad_request', details);

export const unauthorized = (message = 'Authentication required.') =>
  new ApiError(401, message, 'unauthorized');

export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new ApiError(403, message, 'forbidden');

export const notFound = (message = 'Resource not found.') => new ApiError(404, message, 'not_found');

export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, message, 'conflict', details);

/**
 * Wraps an async route handler so a rejected promise reaches the error
 * middleware instead of becoming an unhandled rejection (Express 4 does not
 * await handlers).
 */
export const asyncHandler =
  <T extends RequestHandler>(fn: T): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
