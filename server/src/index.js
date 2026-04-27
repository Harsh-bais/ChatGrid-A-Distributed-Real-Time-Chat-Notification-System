import http from 'node:http';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { createSocketServer } from './socket/index.js';
import { logger } from './utils/logger.js';

const bootstrap = async () => {
  await connectDb();

  const app = createApp();
  const httpServer = http.createServer(app);
  await createSocketServer(httpServer);

  httpServer.listen(env.port, () => {
    logger.info(`API and realtime server listening on :${env.port}`);
  });
};

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
