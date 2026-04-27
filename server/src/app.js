import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiRoutes } from './routes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createApp = () => {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  // Serve uploaded avatar images as static files
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

  app.use('/api', apiRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
};
