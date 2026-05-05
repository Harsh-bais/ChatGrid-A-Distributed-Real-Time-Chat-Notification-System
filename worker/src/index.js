import { Worker } from 'bullmq';
import { connectDb } from './config/db.js';
import { createRedisConnection } from './config/redis.js';
import { ThreadPool } from './threadPool.js';
import { logger } from './utils/logger.js';

const threadPool = new ThreadPool(Number(process.env.MESSAGE_THREAD_COUNT || 4));
const workerLogger = logger.child({
  component: 'message-worker',
  queue: 'messages',
});

const processors = {
  'message.created': async (job) => {
    return threadPool.run('message.created', job.data);
  },
};

const start = async () => {
  await connectDb();
  workerLogger.info('MongoDB connected');

  const worker = new Worker(
    'messages',
    async (job) => {
      const processor = processors[job.name];
      if (!processor) {
        throw new Error(`Unknown job: ${job.name}`);
      }

      workerLogger.info('message job started', {
        jobId: job.id,
        name: job.name,
        traceId: job.data?.traceId,
        messageId: job.data?.messageId,
        chatId: job.data?.chatId,
      });
      return processor(job);
    },
    { connection: createRedisConnection(), concurrency: 10 },
  );

  worker.on('completed', (job, result) =>
    workerLogger.info('message job completed', {
      jobId: job.id,
      name: job.name,
      traceId: job.data?.traceId,
      messageId: job.data?.messageId,
      chatId: job.data?.chatId,
      result,
    }),
  );
  worker.on('failed', (job, err) =>
    workerLogger.error('message job failed', {
      jobId: job?.id,
      name: job?.name,
      traceId: job?.data?.traceId,
      messageId: job?.data?.messageId,
      chatId: job?.data?.chatId,
      attemptsMade: job?.attemptsMade,
      attemptsConfigured: job?.opts?.attempts,
      error: err,
    }),
  );
  worker.on('stalled', (jobId) =>
    workerLogger.warn('message job stalled and will be recovered by BullMQ', { jobId }),
  );
  worker.on('error', (err) => workerLogger.error('worker error', { error: err }));

  const shutdown = async () => {
    workerLogger.info('shutting down');
    await worker.close();
    await threadPool.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  workerLogger.info('Message worker started with worker-thread pool', {
    threadCount: Number(process.env.MESSAGE_THREAD_COUNT || 4),
    concurrency: 10,
  });
};

start().catch((err) => {
  workerLogger.error('failed to start worker service', { error: err });
  process.exit(1);
});
