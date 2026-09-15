import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * A single PrismaClient for the process. Node's dev-mode module reloading would
 * otherwise leak a new connection pool on every change.
 */
export const prisma = new PrismaClient({
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});
