import { Router } from 'express';
import { authRoutes } from './authRoutes.js';
import { chatRoutes } from './chatRoutes.js';
import { notificationRoutes } from './notificationRoutes.js';
import { userRoutes } from './userRoutes.js';

export const apiRoutes = Router();

apiRoutes.get('/health', (_req, res) => res.json({ ok: true }));
apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/users', userRoutes);
apiRoutes.use('/chats', chatRoutes);
apiRoutes.use('/notifications', notificationRoutes);
