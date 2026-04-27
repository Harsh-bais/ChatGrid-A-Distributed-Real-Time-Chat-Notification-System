import { User } from '../models/User.js';
import { verifyToken } from '../utils/jwt.js';

export const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      return next(new Error('Invalid token'));
    }

    socket.user = user;
    return next();
  } catch {
    return next(new Error('Invalid or expired token'));
  }
};
