import { createRedisConnection } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const redis = createRedisConnection();

const connectionKey = (userId) => `socket:user:${userId}:connections`;

export const registerConnection = async ({ userId, socketId }) => {
  try {
    await redis.hset(connectionKey(userId), socketId, JSON.stringify({
      instanceId: env.instanceId,
      connectedAt: new Date().toISOString(),
    }));
    await redis.expire(connectionKey(userId), 60 * 60 * 24);
    logger.info('registered socket connection', { userId, socketId, instanceId: env.instanceId });
  } catch (err) {
    logger.warn('failed to register socket connection', { userId, socketId, error: err.message });
  }
};

export const unregisterConnection = async ({ userId, socketId }) => {
  try {
    await redis.hdel(connectionKey(userId), socketId);
    const remaining = await redis.hlen(connectionKey(userId));
    logger.info('unregistered socket connection', {
      userId,
      socketId,
      instanceId: env.instanceId,
      remaining,
    });
    return remaining;
  } catch (err) {
    logger.warn('failed to unregister socket connection', { userId, socketId, error: err.message });
    return undefined;
  }
};

export const getClusterConnectionCount = async (userId) => {
  try {
    return redis.hlen(connectionKey(userId));
  } catch (err) {
    logger.warn('failed to read socket connection count', { userId, error: err.message });
    return 0;
  }
};

export const listOnlineUserIds = async () => {
  try {
    const userIds = new Set();
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        'socket:user:*:connections',
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length === 0) {
        continue;
      }

      const pipeline = redis.pipeline();
      keys.forEach((key) => pipeline.hlen(key));
      const counts = await pipeline.exec();

      keys.forEach((key, index) => {
        const count = Number(counts?.[index]?.[1] || 0);
        if (count > 0) {
          const match = key.match(/^socket:user:(.+):connections$/);
          if (match?.[1]) {
            userIds.add(match[1]);
          }
        }
      });
    } while (cursor !== '0');

    return Array.from(userIds);
  } catch (err) {
    logger.warn('failed to list online user ids', { error: err.message });
    return [];
  }
};
