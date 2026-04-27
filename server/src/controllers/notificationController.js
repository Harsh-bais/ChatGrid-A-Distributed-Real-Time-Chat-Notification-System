import { Notification } from '../models/Notification.js';
import {
  getNotificationByIdForUser,
  listUserNotifications,
} from '../services/notificationService.js';

export const listNotifications = async (req, res, next) => {
  try {
    const notifications = await listUserNotifications(req.user._id);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
};

export const markNotificationRead = async (req, res, next) => {
  try {
    const readAt = new Date();

    await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
      },
      {
        $set: {
          isRead: true,
          readAt,
          deliveredToClientAt: readAt,
        },
      },
    );

    const notification = await getNotificationByIdForUser(req.params.id, req.user._id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.json({ notification });
  } catch (err) {
    return next(err);
  }
};

export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const readAt = new Date();

    const result = await Notification.updateMany(
      {
        user: req.user._id,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt,
          deliveredToClientAt: readAt,
        },
      },
    );

    res.json({ ok: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    next(err);
  }
};
