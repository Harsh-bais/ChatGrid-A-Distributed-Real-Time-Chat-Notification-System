import dotenv from 'dotenv';

dotenv.config();

export const env = {
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/pdc_chat',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  threadCount: Number(process.env.NOTIFICATION_THREAD_COUNT || 4),
};
