import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { createRedisConnection } from '../config/redis.js';
import { User } from '../models/User.js';
import {
  getClusterConnectionCount,
  listOnlineUserIds,
  registerConnection,
  unregisterConnection,
} from '../realtime/connectionRegistry.js';
import { startDeliveryWorker } from '../realtime/deliveryWorker.js';
import { listUserNotifications } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';
import { registerChatSocket } from './chatSocket.js';
import { socketAuth } from './socketAuth.js';

export const createSocketServer = async (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  const pubClient = createRedisConnection();
  const subClient = pubClient.duplicate();
  pubClient.on('error', (err) => logger.error('redis pub client error', err.message));
  subClient.on('error', (err) => logger.error('redis sub client error', err.message));
  pubClient.on('reconnecting', () => logger.warn('redis pub client reconnecting'));
  subClient.on('reconnecting', () => logger.warn('redis sub client reconnecting'));
  io.adapter(createAdapter(pubClient, subClient));

  io.use(socketAuth);

  io.on('connection', async (socket) => {
    logger.info('socket connected', {
      socketId: socket.id,
      userId: socket.user._id.toString(),
      instanceId: env.instanceId,
    });

    await registerConnection({ userId: socket.user._id.toString(), socketId: socket.id });
    const [onlineUserIds, notifications] = await Promise.all([
      listOnlineUserIds(),
      listUserNotifications(socket.user._id, 50),
    ]);

    socket.emit('connection:ready', {
      socketId: socket.id,
      userId: socket.user._id,
      instanceId: env.instanceId,
    });
    socket.emit('presence:snapshot', { userIds: onlineUserIds });
    socket.emit('notifications:sync', { notifications });
    io.emit('presence:online', { userId: socket.user._id });
    registerChatSocket(io, socket);

    socket.on('disconnect', async () => {
      await unregisterConnection({ userId: socket.user._id.toString(), socketId: socket.id });
      const remainingSockets = await io.in(`user:${socket.user._id}`).fetchSockets();
      const registryCount = await getClusterConnectionCount(socket.user._id.toString());

      if (remainingSockets.length === 0 && registryCount === 0) {
        const lastSeenAt = new Date();
        await User.findByIdAndUpdate(socket.user._id, { lastSeenAt });
        io.emit('presence:offline', { userId: socket.user._id, lastSeenAt });
      }

      logger.info('socket disconnected', {
        socketId: socket.id,
        userId: socket.user._id.toString(),
        instanceId: env.instanceId,
        remainingSockets: remainingSockets.length,
        registryCount,
      });
    });
  });

  startDeliveryWorker(io);

  return io;
};
