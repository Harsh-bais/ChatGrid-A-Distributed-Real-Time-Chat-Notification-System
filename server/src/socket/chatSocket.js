/**
 * chatSocket.js — Fixed real-time socket handlers
 *
 * ROOT CAUSE OF THE BUG:
 * The original code queued a BullMQ delivery job that later called
 * io.to(`chat:${chatId}`).emit('message:new', ...) for EVERYONE including
 * the sender. Meanwhile the ack callback ALSO added the message for the sender.
 * Result: sender sees duplicate AND all recipients wait for the async job (delay).
 *
 * THE FIX:
 * 1. Immediately broadcast 'message:new' to the chat room for OTHER participants.
 *    The sender skips this via socket.to() (excludes current socket).
 * 2. ACK returns the populated message to sender instantly — sender adds it locally.
 * 3. The delivery job ONLY handles offline delivery (user not in the room)
 *    and marks deliveredTo/deliveredAt in DB. It no longer emits message:new.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import {
  enqueueDeliveryJob,
  enqueueMessageJob,
  enqueueNotificationJob,
} from '../queues/messageQueue.js';
import { logger } from '../utils/logger.js';

const sendMessageSchema = z.object({
  chatId: z.string().min(1),
  body: z.string().trim().min(1).max(5000),
});

const chatEventSchema = z.object({
  chatId: z.string().min(1),
});

const reconnectSyncSchema = z.object({
  chatIds: z.array(z.string().min(1)).max(100).default([]),
});

const isParticipant = (chat, userId) =>
  chat.participants.some((p) => p.equals(userId));

/**
 * Returns a fully-populated message document (sender + readBy).
 * Selects only the fields needed by the client to avoid over-fetching.
 */
const serializeMessage = (messageId) =>
  Message.findById(messageId)
    .populate('sender', 'name email avatarColor')
    .populate('readBy.user', '_id name');

export const registerChatSocket = (io, socket) => {
  // Every connected socket gets a personal room so we can reach it directly.
  socket.join(`user:${socket.user._id}`);
  const socketLogger = logger.child({
    component: 'chat-socket',
    socketId: socket.id,
    userId: socket.user._id.toString(),
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const joinChat = async (chatId) => {
    const chat = await Chat.findById(chatId).lean();
    if (!chat || !isParticipant(chat, socket.user._id)) {
      throw new Error('Chat not found or access denied');
    }
    socket.join(`chat:${chatId}`);
    return chat;
  };

  // ─── chat:join ───────────────────────────────────────────────────────────────
  socket.on('chat:join', async (payload, ack) => {
    try {
      const { chatId } = chatEventSchema.parse(payload);
      await joinChat(chatId);
      socketLogger.info('socket joined chat room', {
        chatId,
      });
      ack?.({ ok: true, chatId });
    } catch (err) {
      socketLogger.warn('chat join rejected', { payload, error: err });
      ack?.({ ok: false, message: err.message });
    }
  });

  // ─── reconnect:sync ──────────────────────────────────────────────────────────
  socket.on('reconnect:sync', async (payload, ack) => {
    try {
      const { chatIds } = reconnectSyncSchema.parse(payload || {});
      const joinedChatIds = [];
      for (const chatId of chatIds) {
        try {
          await joinChat(chatId);
          joinedChatIds.push(chatId);
        } catch (err) {
          socketLogger.warn('skipped reconnect room sync', {
            chatId,
            error: err,
          });
        }
      }
      socketLogger.info('reconnect room sync completed', {
        requestedChatIds: chatIds.length,
        joinedChatIds: joinedChatIds.length,
      });
      ack?.({ ok: true, joinedChatIds });
    } catch (err) {
      socketLogger.warn('reconnect room sync failed', { payload, error: err });
      ack?.({ ok: false, message: err.message });
    }
  });

  // ─── message:send — THE CRITICAL FIX ────────────────────────────────────────
  socket.on('message:send', async (payload, ack) => {
    const traceId = randomUUID();
    const deliveryLogger = socketLogger.child({ traceId, event: 'message.send' });

    try {
      const { chatId, body } = sendMessageSchema.parse(payload);
      deliveryLogger.info('message send received', {
        chatId,
        bodyLength: body.length,
      });

      // 1. Auth check — do a lean query (no mongoose overhead for field checks)
      const chat = await Chat.findById(chatId).lean();
      if (!chat || !isParticipant(chat, socket.user._id)) {
        throw new Error('Chat not found or access denied');
      }

      // 2. Persist message to MongoDB
      const message = await Message.create({
        chat: chat._id,
        sender: socket.user._id,
        body,
        deliveredTo: [],
        deliveredAt: null,
        readBy: [{ user: socket.user._id, readAt: new Date() }],
        readCount: 1,
      });
      deliveryLogger.info('message persisted', {
        messageId: message._id.toString(),
        chatId,
      });

      // 3. Update chat.lastMessage (fire and forget — don't block the response)
      Chat.findByIdAndUpdate(chatId, { lastMessage: message._id }).exec();

      // 4. Populate the message for wire transfer
      const populated = await serializeMessage(message._id);

      // 5. ✅ FIX: Broadcast to the chat room EXCLUDING the sender's socket.
      //    socket.to() skips the emitting socket, so sender won't receive a
      //    duplicate from the broadcast. Recipients see it instantly.
      socket.to(`chat:${chatId}`).emit('message:new', { message: populated });

      // 6. ✅ FIX: Also notify the chat:updated room for each recipient's personal
      //    room so their sidebar updates even if they haven't joined this chat room.
      const recipientIds = chat.participants
        .map((id) => id.toString())
        .filter((id) => id !== socket.user._id.toString());
      deliveryLogger.info('message broadcast prepared', {
        messageId: message._id.toString(),
        recipientIds,
        recipientCount: recipientIds.length,
      });

      recipientIds.forEach((recipientId) => {
        io.to(`user:${recipientId}`).emit('chat:updated', {
          chatId,
          message: populated,
        });
      });

      // 7. ✅ FIX: ACK the sender immediately with the populated message.
      //    The client adds it to local state via the ack callback — no page refresh needed.
      ack?.({ ok: true, message: populated, traceId });

      // 8. Queue background jobs AFTER responding (non-blocking).
      //    deliveryWorker now only handles: marking deliveredTo in DB + emitting
      //    message:delivered to sender. It no longer re-emits message:new.
      const messageIdStr = message._id.toString();
      const chatIdStr = chat._id.toString();
      const senderIdStr = socket.user._id.toString();

      await Promise.all([
        enqueueMessageJob('message.created', {
          messageId: messageIdStr,
          chatId: chatIdStr,
          senderId: senderIdStr,
          traceId,
        }),
        enqueueDeliveryJob('message.deliver', {
          messageId: messageIdStr,
          chatId: chatIdStr,
          senderId: senderIdStr,
          recipientIds,
          traceId,
        }),
        enqueueNotificationJob('notification.message.created', {
          messageId: messageIdStr,
          chatId: chatIdStr,
          senderId: senderIdStr,
          recipientIds,
          traceId,
        }),
      ]);

      deliveryLogger.info('message send completed', {
        messageId: messageIdStr,
        chatId: chatIdStr,
        recipientCount: recipientIds.length,
      });
    } catch (err) {
      deliveryLogger.error('message send failed', { payload, error: err });
      ack?.({ ok: false, message: err.message, traceId });
    }
  });

  // ─── typing indicators ───────────────────────────────────────────────────────
  socket.on('typing:start', (payload) => {
    const parsed = chatEventSchema.safeParse(payload);
    if (parsed.success) {
      socketLogger.debug('typing start emitted', { chatId: parsed.data.chatId });
      socket.to(`chat:${parsed.data.chatId}`).emit('typing:start', {
        chatId: parsed.data.chatId,
        user: { _id: socket.user._id, name: socket.user.name },
      });
    }
  });

  socket.on('typing:stop', (payload) => {
    const parsed = chatEventSchema.safeParse(payload);
    if (parsed.success) {
      socketLogger.debug('typing stop emitted', { chatId: parsed.data.chatId });
      socket.to(`chat:${parsed.data.chatId}`).emit('typing:stop', {
        chatId: parsed.data.chatId,
        userId: socket.user._id,
      });
    }
  });

  // ─── message:read ────────────────────────────────────────────────────────────
  socket.on('message:read', async (payload, ack) => {
    const readLogger = socketLogger.child({ event: 'message.read' });
    try {
      const { chatId } = chatEventSchema.parse(payload);
      const chat = await Chat.findById(chatId).lean();
      if (!chat || !isParticipant(chat, socket.user._id)) {
        throw new Error('Chat not found');
      }

      await Message.updateMany(
        {
          chat: chat._id,
          sender: { $ne: socket.user._id },
          'readBy.user': { $ne: socket.user._id },
        },
        {
          $push: { readBy: { user: socket.user._id, readAt: new Date() } },
          $inc: { readCount: 1 },
        },
      );

      // Only select _id to minimize data transfer
      const updatedMessages = await Message.find({
        chat: chat._id,
        sender: { $ne: socket.user._id },
        'readBy.user': socket.user._id,
      }).select('_id');

      io.to(`chat:${chatId}`).emit('message:read', {
        chatId,
        userId: socket.user._id,
        readAt: new Date(),
        messageIds: updatedMessages.map((m) => m._id.toString()),
      });

      readLogger.info('message read broadcast completed', {
        chatId,
        updatedCount: updatedMessages.length,
      });
      ack?.({ ok: true });
    } catch (err) {
      readLogger.error('message read failed', { payload, error: err });
      ack?.({ ok: false, message: err.message });
    }
  });
};
