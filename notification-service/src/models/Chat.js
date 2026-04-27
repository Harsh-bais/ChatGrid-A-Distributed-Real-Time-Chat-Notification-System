import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    name: String,
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  },
  { timestamps: true },
);

export const Chat = mongoose.models.Chat || mongoose.model('Chat', chatSchema);
