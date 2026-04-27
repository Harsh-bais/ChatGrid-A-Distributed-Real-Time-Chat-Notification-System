import { parentPort } from 'node:worker_threads';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Message } from '../models/Message.js';

let connected = false;

const ensureDb = async () => {
  if (connected) return;
  await mongoose.connect(env.mongoUri);
  connected = true;
};

const processors = {
  'message.created': async ({ messageId }) => {
    await ensureDb();
    const message = await Message.findByIdAndUpdate(
      messageId,
      { processedAt: new Date() },
      { new: true },
    );

    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    return {
      messageId,
      processedAt: message.processedAt,
      bodyLength: message.body.length,
    };
  },
};

parentPort.on('message', async ({ taskId, name, payload }) => {
  try {
    const processor = processors[name];
    if (!processor) {
      throw new Error(`Unknown thread task: ${name}`);
    }

    const result = await processor(payload);
    parentPort.postMessage({ taskId, ok: true, result });
  } catch (err) {
    parentPort.postMessage({ taskId, ok: false, error: err.message });
  }
});
