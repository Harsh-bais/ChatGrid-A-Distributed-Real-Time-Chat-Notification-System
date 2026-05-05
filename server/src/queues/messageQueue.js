import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { logger } from '../utils/logger.js';

export const messageQueue = new Queue('messages', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const deliveryQueue = new Queue('message-delivery', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1500 },
    removeOnComplete: 5000,
    removeOnFail: 10000,
  },
});

export const notificationQueue = new Queue('notifications', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 5000,
    removeOnFail: 10000,
  },
});

const queueLogger = logger.child({ component: 'queue-producer' });

export const enqueueMessageJob = async (name, data) => {
  const job = await messageQueue.add(name, data);
  queueLogger.info('queue job enqueued', {
    queue: 'messages',
    name,
    jobId: job.id,
    traceId: data.traceId,
    messageId: data.messageId,
    chatId: data.chatId,
  });
  return job;
};

export const enqueueDeliveryJob = async (name, data) => {
  const job = await deliveryQueue.add(name, data, {
    jobId: `${name.replace(/[:\s]+/g, '-')}-${data.messageId}`,
  });
  queueLogger.info('queue job enqueued', {
    queue: 'message-delivery',
    name,
    jobId: job.id,
    traceId: data.traceId,
    messageId: data.messageId,
    chatId: data.chatId,
    recipientCount: data.recipientIds?.length || 0,
  });
  return job;
};

export const enqueueNotificationJob = async (name, data) => {
  const job = await notificationQueue.add(name, data, {
    jobId: `${name.replace(/[:\s]+/g, '-')}-${data.messageId}`,
  });
  queueLogger.info('queue job enqueued', {
    queue: 'notifications',
    name,
    jobId: job.id,
    traceId: data.traceId,
    messageId: data.messageId,
    chatId: data.chatId,
    recipientCount: data.recipientIds?.length || 0,
  });
  return job;
};
