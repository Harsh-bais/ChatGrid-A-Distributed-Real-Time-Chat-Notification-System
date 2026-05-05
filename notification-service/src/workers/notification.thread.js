import { parentPort } from 'node:worker_threads';
import mongoose from 'mongoose';
import { createRedisConnection } from '../config/redis.js';
import { env } from '../config/env.js';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';

let connected = false;
let redis;

const ensureConnections = async () => {
  if (!connected) {
    await mongoose.connect(env.mongoUri);
    connected = true;
  }

  if (!redis) {
    redis = createRedisConnection();
  }
};

const connectionKey = (userId) => `socket:user:${userId}:connections`;

const isOffline = async (userId) => {
  const connectionCount = await redis.hlen(connectionKey(userId));
  return connectionCount === 0;
};

const preview = (body) => (body.length > 120 ? `${body.slice(0, 117)}...` : body);

const sendOfflineNotification = async ({ recipientId, message, sender, chat }) => {
  const title = chat.type === 'group' ? `${sender.name} in ${chat.name}` : sender.name;
  const body = preview(message.body);

  const notification = await Notification.findOneAndUpdate(
    { user: recipientId, message: message._id },
    {
      user: recipientId,
      message: message._id,
      chat: chat._id,
      type: 'new_message',
      title,
      body,
      channel: 'offline-log',
      status: 'sent',
      isRead: false,
      readAt: null,
      sentAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return {
    recipientId,
    notificationId: notification._id.toString(),
    title,
    body,
  };
};

const processors = {
  'notification.message.created': async ({ messageId, chatId, senderId, recipientIds, traceId }) => {
    await ensureConnections();

    const [message, chat, sender] = await Promise.all([
      Message.findById(messageId),
      Chat.findById(chatId),
      User.findById(senderId),
    ]);

    if (!message || !chat || !sender) {
      throw new Error(`Missing notification data for message ${messageId}`);
    }

    const offlineRecipientIds = [];
    for (const recipientId of recipientIds) {
      if (await isOffline(recipientId)) {
        offlineRecipientIds.push(recipientId);
      }
    }

    const sent = await Promise.all(
      offlineRecipientIds.map((recipientId) =>
        sendOfflineNotification({ recipientId, message, sender, chat }),
      ),
    );

    return {
      traceId,
      messageId,
      recipientCount: recipientIds.length,
      offlineCount: offlineRecipientIds.length,
      sent,
    };
  },
};

parentPort.on('message', async ({ taskId, name, payload }) => {
  try {
    const processor = processors[name];
    if (!processor) {
      throw new Error(`Unknown notification task: ${name}`);
    }

    const result = await processor(payload);
    parentPort.postMessage({ taskId, ok: true, result });
  } catch (err) {
    parentPort.postMessage({ taskId, ok: false, error: err.message });
  }
});
