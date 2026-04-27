import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';

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

export const enqueueMessageJob = (name, data) => messageQueue.add(name, data);

export const enqueueDeliveryJob = (name, data) =>
  deliveryQueue.add(name, data, {
    jobId: `${name}:${data.messageId}`,
  });

export const enqueueNotificationJob = (name, data) =>
  notificationQueue.add(name, data, {
    jobId: `${name}:${data.messageId}`,
  });
