import { Worker } from 'bullmq';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { createRedisConnection } from './config/redis.js';
import { ThreadPool } from './threadPool.js';
import { logger } from './utils/logger.js';

const threadPool = new ThreadPool(env.threadCount);

const start = async () => {
  await connectDb();
  logger.info('MongoDB connected');

  const worker = new Worker(
    'notifications',
    async (job) => threadPool.run(job.name, job.data),
    {
      connection: createRedisConnection(),
      concurrency: env.threadCount * 2,
    },
  );

  worker.on('completed', (job, result) => {
    logger.info('notification job completed', {
      jobId: job.id,
      name: job.name,
      result,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error('notification job failed', {
      jobId: job?.id,
      name: job?.name,
      attemptsMade: job?.attemptsMade,
      attemptsConfigured: job?.opts?.attempts,
      error: err.message,
    });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('notification job stalled and will be recovered by BullMQ', { jobId });
  });

  worker.on('error', (err) => {
    logger.error('notification worker error', err.message);
  });

  const shutdown = async () => {
    logger.info('shutting down');
    await worker.close();
    await threadPool.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('notification service started', {
    queue: 'notifications',
    threadCount: env.threadCount,
    concurrency: env.threadCount * 2,
  });
};

start().catch((err) => {
  logger.error('failed to start notification service', err);
  process.exit(1);
});
