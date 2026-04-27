import { User } from '../models/User.js';
import { verifyToken } from '../utils/jwt.js';

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
