import Redis from 'ioredis';
import { env } from './env.js';

export const createRedisConnection = () =>
  new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
