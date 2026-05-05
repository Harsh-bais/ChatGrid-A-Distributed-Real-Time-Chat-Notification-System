import { Worker } from 'bullmq';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { createRedisConnection } from './config/redis.js';
import { ThreadPool } from './threadPool.js';
import { logger } from './utils/logger.js';

const threadPool = new ThreadPool(env.threadCount);
const serviceLogger = logger.child({
  component: 'notification-worker',
  queue: 'notifications',
});

const start = async () => {
  await connectDb();
  serviceLogger.info('MongoDB connected');

  const worker = new Worker(
    'notifications',
    async (job) => {
      serviceLogger.info('notification job started', {
        jobId: job.id,
        name: job.name,
        traceId: job.data?.traceId,
        messageId: job.data?.messageId,
        chatId: job.data?.chatId,
      });
      return threadPool.run(job.name, job.data);
    },
    {
      connection: createRedisConnection(),
      concurrency: env.threadCount * 2,
    },
  );

  worker.on('completed', (job, result) => {
    serviceLogger.info('notification job completed', {
      jobId: job.id,
      name: job.name,
      traceId: job.data?.traceId,
      messageId: job.data?.messageId,
      chatId: job.data?.chatId,
      result,
    });
  });

  worker.on('failed', (job, err) => {
    serviceLogger.error('notification job failed', {
      jobId: job?.id,
      name: job?.name,
      traceId: job?.data?.traceId,
      messageId: job?.data?.messageId,
      chatId: job?.data?.chatId,
      attemptsMade: job?.attemptsMade,
      attemptsConfigured: job?.opts?.attempts,
      error: err,
    });
  });

  worker.on('stalled', (jobId) => {
    serviceLogger.warn('notification job stalled and will be recovered by BullMQ', { jobId });
  });

  worker.on('error', (err) => {
    serviceLogger.error('notification worker error', { error: err });
  });

  const shutdown = async () => {
    serviceLogger.info('shutting down');
    await worker.close();
    await threadPool.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  serviceLogger.info('notification service started', {
    queue: 'notifications',
    threadCount: env.threadCount,
    concurrency: env.threadCount * 2,
  });
};

start().catch((err) => {
  serviceLogger.error('failed to start notification service', { error: err });
  process.exit(1);
});
