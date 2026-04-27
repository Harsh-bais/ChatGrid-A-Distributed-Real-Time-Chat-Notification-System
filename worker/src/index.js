import { Worker } from 'bullmq';
import { connectDb } from './config/db.js';
import { createRedisConnection } from './config/redis.js';
import { ThreadPool } from './threadPool.js';

const log = (...args) => console.log('[worker]', ...args);
const threadPool = new ThreadPool(Number(process.env.MESSAGE_THREAD_COUNT || 4));

const processors = {
  'message.created': async (job) => {
    return threadPool.run('message.created', job.data);
  },
};

const start = async () => {
  await connectDb();
  log('MongoDB connected');

  const worker = new Worker(
    'messages',
    async (job) => {
      const processor = processors[job.name];
      if (!processor) {
        throw new Error(`Unknown job: ${job.name}`);
      }

      return processor(job);
    },
    { connection: createRedisConnection(), concurrency: 10 },
  );

  worker.on('completed', (job, result) => log(`completed ${job.name}#${job.id}`, result));
  worker.on('failed', (job, err) =>
    log(`failed ${job?.name}#${job?.id}`, {
      attemptsMade: job?.attemptsMade,
      attemptsConfigured: job?.opts?.attempts,
      error: err.message,
    }),
  );
  worker.on('stalled', (jobId) => log('job stalled and will be recovered by BullMQ', { jobId }));
  worker.on('error', (err) => log('worker error', err.message));

  const shutdown = async () => {
    log('shutting down');
    await worker.close();
    await threadPool.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('Message worker started with worker-thread pool');
};

start().catch((err) => {
  console.error('[worker] failed to start', err);
  process.exit(1);
});
