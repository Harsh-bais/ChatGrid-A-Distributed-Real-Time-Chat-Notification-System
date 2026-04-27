import mongoose from 'mongoose';

const readReceiptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [readReceiptSchema],
    readCount: { type: Number, default: 0 },
    queuedAt: { type: Date, default: Date.now },
    deliveredAt: Date,
    processedAt: Date,
    deletedForEveryoneAt: Date,
  },
  { timestamps: true },
);

messageSchema.index({ chat: 1, createdAt: -1, _id: -1 });
messageSchema.index({ chat: 1, _id: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ 'readBy.user': 1 });
messageSchema.index(
  { deletedForEveryoneAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 365, partialFilterExpression: { deletedForEveryoneAt: { $exists: true } } },
);

export const Message = mongoose.model('Message', messageSchema);
