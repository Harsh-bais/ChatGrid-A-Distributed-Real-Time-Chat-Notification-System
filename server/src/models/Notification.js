import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    type: { type: String, enum: ['new_message'], default: 'new_message' },
    title: { type: String, required: true },
    body: { type: String, required: true },
    channel: { type: String, enum: ['offline-log'], default: 'offline-log' },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
    isRead: { type: Boolean, default: false },
    readAt: Date,
    deliveredToClientAt: Date,
    sentAt: Date,
    error: String,
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, message: 1 }, { unique: true });
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
