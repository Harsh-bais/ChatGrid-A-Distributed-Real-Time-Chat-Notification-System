import { Notification } from '../models/Notification.js';

const notificationPopulates = [
  {
    path: 'message',
    select: 'body sender createdAt',
    populate: { path: 'sender', select: 'name avatarColor avatarUrl' },
  },
  {
    path: 'chat',
    select: 'name type participants',
  },
];

const hydrateNotificationQuery = (query) => {
  let nextQuery = query;

  for (const populate of notificationPopulates) {
    nextQuery = nextQuery.populate(populate);
  }

  return nextQuery;
};

export const listUserNotifications = async (userId, limit = 100) => {
  const notifications = await hydrateNotificationQuery(
    Notification.find({
      user: userId,
      status: 'sent',
    })
      .sort({ createdAt: -1 })
      .limit(limit),
  ).lean();

  const undeliveredIds = notifications
    .filter((notification) => !notification.deliveredToClientAt)
    .map((notification) => notification._id);

  if (undeliveredIds.length > 0) {
    await Notification.updateMany(
      { _id: { $in: undeliveredIds } },
      { $set: { deliveredToClientAt: new Date() } },
    );

    notifications.forEach((notification) => {
      if (undeliveredIds.some((id) => id.equals(notification._id))) {
        notification.deliveredToClientAt = new Date().toISOString();
      }
    });
  }

  return notifications;
};

export const getNotificationByIdForUser = (notificationId, userId) =>
  hydrateNotificationQuery(
    Notification.findOne({
      _id: notificationId,
      user: userId,
    }),
  );
