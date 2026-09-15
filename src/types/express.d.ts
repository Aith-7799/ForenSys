import type { TokenPayload } from '../lib/jwt.js';

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAuth. */
      officer?: TokenPayload;
    }
  }
}

export {};
