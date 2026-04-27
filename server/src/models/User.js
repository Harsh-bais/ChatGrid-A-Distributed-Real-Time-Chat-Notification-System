import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatarColor: { type: String, default: '#00a884' },
    avatarUrl: { type: String, default: null },
    status: { type: String, default: 'Hey there! I am using PDC Chat.' },
    lastSeenAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ name: 'text', email: 'text' });
userSchema.index({ lastSeenAt: -1 });

userSchema.methods.comparePassword = function comparePassword(password) {
  if (!this.passwordHash || !password) {
    return false;
  }

  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = (password) => bcrypt.hash(password, 12);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
