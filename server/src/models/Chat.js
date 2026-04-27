import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    name: { type: String, trim: true, maxlength: 120 },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    directKey: { type: String, sparse: true },
    participantCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

chatSchema.pre('save', function setDerivedFields(next) {
  this.participantCount = this.participants.length;

  if (this.type === 'direct' && this.participants.length === 2) {
    this.directKey = this.participants.map((id) => id.toString()).sort().join(':');
  }

  next();
});

chatSchema.index({ participants: 1, updatedAt: -1 });
chatSchema.index({ type: 1, updatedAt: -1 });
chatSchema.index({ directKey: 1 }, { unique: true, sparse: true });
chatSchema.index({ admins: 1 });

export const Chat = mongoose.model('Chat', chatSchema);
