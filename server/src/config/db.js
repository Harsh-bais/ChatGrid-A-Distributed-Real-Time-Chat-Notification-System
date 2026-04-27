import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const connectDb = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  logger.info('MongoDB connected');
};
