import { parentPort } from 'node:worker_threads';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Message } from '../models/Message.js';

let connected = false;

const extractProcessingMeta = (body) => {
  const words = body
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter(Boolean);

  const keywordHits = Array.from(
    new Set(words.filter((word) => word.length >= 6)),
  ).slice(0, 5);

  return {
    wordCount: words.length,
    keywordHits,
    containsLink: /https?:\/\//i.test(body),
  };
};

const ensureDb = async () => {
  if (connected) return;
  await mongoose.connect(env.mongoUri);
  connected = true;
};

const processors = {
  'message.created': async ({ messageId }) => {
    await ensureDb();
    const existing = await Message.findById(messageId).select('body');
    if (!existing) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const processingMeta = extractProcessingMeta(existing.body);
    const message = await Message.findByIdAndUpdate(
      messageId,
      {
        processedAt: new Date(),
        processingMeta,
      },
      { new: true },
    );

    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    return {
      messageId,
      processedAt: message.processedAt?.toISOString?.() || new Date().toISOString(),
      processingMeta: {
        wordCount: processingMeta.wordCount,
        keywordHits: [...processingMeta.keywordHits],
        containsLink: processingMeta.containsLink,
      },
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
