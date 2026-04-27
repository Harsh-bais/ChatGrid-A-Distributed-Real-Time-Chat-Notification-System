import { z } from 'zod';
import { User } from '../models/User.js';
import { signToken } from '../utils/jwt.js';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const avatarColors = ['#00a884', '#34b7f1', '#ffb020', '#7c3aed', '#ef4444', '#10b981'];

export const register = async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const existing = await User.findOne({ email: input.email });

    if (existing) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const passwordHash = await User.hashPassword(input.password);
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      avatarColor: avatarColors[Math.floor(Math.random() * avatarColors.length)],
    });

    return res.status(201).json({ user, token: signToken(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    return next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email }).select('+passwordHash');

    if (!user || !(await user.comparePassword(input.password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.json({ user, token: signToken(user) });
  } catch (err) {
    return next(err);
  }
};

export const me = (req, res) => {
  res.json({ user: req.user });
};
