/**
 * deliveryWorker.js — Background delivery tracking
 *
 * CHANGE FROM ORIGINAL:
 * Removed the io.emit('message:new') call. That responsibility now belongs
 * to chatSocket.js which broadcasts synchronously via socket.to() immediately
 * after persisting the message. This worker ONLY:
 *   1. Marks the message as deliveredTo in MongoDB
 *   2. Emits 'message:delivered' to the sender so they see the double-tick
 */

import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { logger } from '../utils/logger.js';

export const startDeliveryWorker = (io) => {
  const worker = new Worker(
    'message-delivery',
    async (job) => {
      if (job.name !== 'message.deliver') {
        throw new Error(`Unknown delivery job: ${job.name}`);
      }

      const { messageId, chatId, senderId, recipientIds } = job.data;

      // Minimal fetch — we only need the message for the sender notification
      const [message, chat] = await Promise.all([
        Message.findById(messageId).select('_id sender').lean(),
        Chat.findById(chatId).select('_id').lean(),
      ]);

      if (!message || !chat) {
        throw new Error(`Missing records for message ${messageId}`);
      }

      const deliveredAt = new Date();

      // Mark delivery in DB
      await Message.findByIdAndUpdate(messageId, {
        $set: {
          deliveredTo: recipientIds,
          deliveredAt,
        },
      });

      // Notify sender: their tick can upgrade from single → double
      io.to(`user:${senderId}`).emit('message:delivered', {
        chatId,
        messageId,
        userIds: recipientIds,
        deliveredAt: deliveredAt.toISOString(),
      });

      logger.info('delivery job completed', { messageId, chatId, recipientCount: recipientIds.length });
      return { delivered: true, messageId, chatId };
    },
    {
      connection: createRedisConnection(),
      concurrency: Number(process.env.DELIVERY_CONCURRENCY || 20),
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('delivery job failed', {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('delivery worker error', err);
  });

  logger.info('message delivery worker started');
  return worker;
};
