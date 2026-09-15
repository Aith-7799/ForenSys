import type { ZodTypeAny, z } from 'zod';
import { badRequest } from './errors.js';

/**
 * Parses with a zod schema, converting a failure into a 400 with a readable
 * field-by-field breakdown rather than a bare "invalid input".
 */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

  throw badRequest(details[0]?.message ?? 'Invalid request body.', details);
}
