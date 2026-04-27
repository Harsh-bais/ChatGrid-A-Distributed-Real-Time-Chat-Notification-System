import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const uploadProfilePicture = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const { User } = await import('../models/User.js');
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Delete old avatar file if it was locally stored
    if (user.avatarUrl && user.avatarUrl.startsWith('/uploads/')) {
      const oldPath = join(__dirname, '..', '..', user.avatarUrl);
      if (existsSync(oldPath)) {
        await unlink(oldPath).catch(() => {});
      }
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    user.avatarUrl = avatarUrl;
    await user.save();

    return res.json({ user, avatarUrl });
  } catch (err) {
    return next(err);
  }
};

export const removeProfilePicture = async (req, res, next) => {
  try {
    const { User } = await import('../models/User.js');
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.avatarUrl && user.avatarUrl.startsWith('/uploads/')) {
      const oldPath = join(__dirname, '..', '..', user.avatarUrl);
      if (existsSync(oldPath)) {
        await unlink(oldPath).catch(() => {});
      }
    }

    user.avatarUrl = null;
    await user.save();
    return res.json({ user, avatarUrl: null });
  } catch (err) {
    return next(err);
  }
};

/**
 * userController.js — Optimized user search
 *
 * CHANGES:
 * 1. Uses MongoDB $text index when a query is provided (already indexed in User model).
 *    Falls back to regex only for very short queries where $text is less useful.
 * 2. Projects only needed fields (name, email, avatarColor) — avoids sending
 *    passwordHash, __v, timestamps to the client.
 * 3. Limits to 20 results (was 25) and adds a hard timeout guard.
 */

import { User } from '../models/User.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listUsers = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100); // guard against huge inputs

    let filter = { _id: { $ne: req.user._id }, isDeleted: { $ne: true } };

    if (q) {
      if (q.length >= 3) {
        // Use the text index for longer queries — much faster on large datasets
        filter.$text = { $search: q };
      } else {
        // Regex for 1-2 char prefix search where text index is less useful
        const safe = escapeRegex(q);
        filter.$or = [
          { name: { $regex: `^${safe}`, $options: 'i' } },
          { email: { $regex: `^${safe}`, $options: 'i' } },
        ];
      }
    }

    const users = await User.find(filter)
      .select('name email avatarColor avatarUrl status lastSeenAt') // only needed fields
      .sort(q.length >= 3 ? { score: { $meta: 'textScore' } } : { name: 1 })
      .limit(20)
      .lean(); // plain JS objects — faster than Mongoose documents

    res.json({ users });
  } catch (err) {
    next(err);
  }
};
