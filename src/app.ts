import express from 'express';
import cors from 'cors';
import { env } from './lib/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { officersRouter } from './routes/officers.js';
import { casesRouter } from './routes/cases.js';
import { evidenceRouter } from './routes/evidence.js';
import { custodyRouter } from './routes/custody.js';
import { reportsRouter } from './routes/reports.js';
import { dashboardRouter } from './routes/dashboard.js';
import { alertsRouter } from './routes/alerts.js';
import { PERMISSIONS, ROLES } from './lib/roles.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  /** Unauthenticated liveness probe. */
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'forensys-api', time: new Date().toISOString() });
  });

  /**
   * Publishes the role/permission matrix so the UI can gate its navigation from
   * the same source of truth the server enforces. Hiding a control is a UX
   * affordance; the server checks remain the actual authority.
   */
  app.get('/api/meta/permissions', (_req, res) => {
    res.json({ roles: Object.values(ROLES), permissions: PERMISSIONS });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/officers', officersRouter);
  app.use('/api/cases', casesRouter);
  app.use('/api/evidence', evidenceRouter);
  app.use('/api/custody', custodyRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/alerts', alertsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
