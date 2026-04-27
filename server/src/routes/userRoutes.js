import { Router } from 'express';
import { listUsers, uploadProfilePicture, removeProfilePicture } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadAvatar } from '../middleware/upload.js';

export const userRoutes = Router();

userRoutes.use(requireAuth);
userRoutes.get('/', listUsers);
userRoutes.post('/me/avatar', uploadAvatar, uploadProfilePicture);
userRoutes.delete('/me/avatar', removeProfilePicture);
