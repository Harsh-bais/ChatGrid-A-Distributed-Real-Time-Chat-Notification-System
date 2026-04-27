import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, readAt: Date }],
    queuedAt: Date,
    deliveredAt: Date,
    processedAt: Date,
  },
  { timestamps: true },
);

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
