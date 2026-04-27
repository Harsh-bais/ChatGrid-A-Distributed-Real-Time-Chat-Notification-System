import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    avatarColor: String,
    status: String,
    lastSeenAt: Date,
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
