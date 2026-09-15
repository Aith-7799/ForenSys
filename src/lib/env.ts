import 'dotenv/config';

function str(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env.`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be a number, got "${raw}".`);
  return n;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num('PORT', 4000),

  databaseUrl: str('DATABASE_URL'),

  jwtSecret: str('JWT_SECRET'),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '15m'),
  jwtRefreshSecret: str('JWT_REFRESH_SECRET'),
  jwtRefreshExpiresIn: str('JWT_REFRESH_EXPIRES_IN', '7d'),

  corsOrigins: str('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  uploadDir: str('UPLOAD_DIR', 'uploads'),
  maxUploadMb: num('MAX_UPLOAD_MB', 25),
} as const;
