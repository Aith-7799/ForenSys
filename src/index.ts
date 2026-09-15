import { createApp } from './app.js';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';

async function main() {
  // Fail loudly at boot rather than on the first request if the database is down.
  await prisma.$connect();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`ForenSys API listening on http://localhost:${env.port}`);
    console.log(`  env         : ${env.nodeEnv}`);
    console.log(`  cors origin : ${env.corsOrigins.join(', ')}`);
    console.log(`  uploads     : ${env.uploadDir}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start ForenSys API:', err);
  process.exit(1);
});
