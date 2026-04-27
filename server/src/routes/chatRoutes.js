import { Router } from 'express';
import {
  createDirectChat,
  createGroupChat,
  listChats,
  listMessages,
} from '../controllers/chatController.js';
import { requireAuth } from '../middleware/auth.js';

export const chatRoutes = Router();

chatRoutes.use(requireAuth);
chatRoutes.get('/', listChats);
chatRoutes.post('/direct', createDirectChat);
chatRoutes.post('/group', createGroupChat);
chatRoutes.get('/:chatId/messages', listMessages);
