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
    body: { type: String, required: true },
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [readReceiptSchema],
    queuedAt: { type: Date, default: Date.now },
    deliveredAt: Date,
    processedAt: Date,
  },
  { timestamps: true },
);

export const Message = mongoose.model('Message', messageSchema);
