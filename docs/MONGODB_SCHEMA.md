# MongoDB Schema Design

This chat app uses three core collections: `users`, `chats`, and `messages`.

The design keeps user and chat metadata small, stores messages in their own high-volume collection, and indexes the access paths used by the realtime UI.

## Users

```js
{
  _id: ObjectId,
  name: String,
  email: String,
  passwordHash: String,
  avatarColor: String,
  status: String,
  lastSeenAt: Date,
  isDeleted: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:

```js
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ name: "text", email: "text" })
db.users.createIndex({ lastSeenAt: -1 })
```

Why:

- `email` unique index makes login and registration fast.
- Text index supports user search without scanning all users.
- `lastSeenAt` helps presence-related queries and admin/debug views.
- User documents stay small, which scales better than embedding chat or message arrays.

## Chats

```js
{
  _id: ObjectId,
  type: "direct" | "group",
  name: String,
  participants: [ObjectId],
  admins: [ObjectId],
  lastMessage: ObjectId,
  directKey: String,
  participantCount: Number,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:

```js
db.chats.createIndex({ participants: 1, updatedAt: -1 })
db.chats.createIndex({ type: 1, updatedAt: -1 })
db.chats.createIndex({ directKey: 1 }, { unique: true, sparse: true })
db.chats.createIndex({ admins: 1 })
```

Why:

- `participants + updatedAt` supports the main sidebar query: "show my chats ordered by latest activity".
- `directKey` is a sorted pair of user IDs for 1-1 chats, preventing duplicate direct chats.
- `participantCount` avoids counting large participant arrays on every response.
- `lastMessage` denormalizes the latest message pointer so the chat list does not query the message collection repeatedly.

For very large groups, move membership to a separate `chat_members` collection:

```js
{
  _id: ObjectId,
  chat: ObjectId,
  user: ObjectId,
  role: "member" | "admin",
  joinedAt: Date,
  lastReadMessage: ObjectId,
  mutedUntil: Date
}
```

Recommended indexes:

```js
db.chat_members.createIndex({ user: 1, chat: 1 }, { unique: true })
db.chat_members.createIndex({ chat: 1, user: 1 })
db.chat_members.createIndex({ user: 1, joinedAt: -1 })
```

This avoids extremely large arrays inside `chats` when a group has thousands or millions of users.

## Messages

```js
{
  _id: ObjectId,
  chat: ObjectId,
  sender: ObjectId,
  body: String,
  deliveredTo: [ObjectId],
  readBy: [{ user: ObjectId, readAt: Date }],
  readCount: Number,
  queuedAt: Date,
  deliveredAt: Date,
  processedAt: Date,
  deletedForEveryoneAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:

```js
db.messages.createIndex({ chat: 1, createdAt: -1, _id: -1 })
db.messages.createIndex({ chat: 1, _id: -1 })
db.messages.createIndex({ sender: 1, createdAt: -1 })
db.messages.createIndex({ "readBy.user": 1 })
db.messages.createIndex(
  { deletedForEveryoneAt: 1 },
  {
    expireAfterSeconds: 31536000,
    partialFilterExpression: { deletedForEveryoneAt: { $exists: true } }
  }
)
```

Why:

- `chat + createdAt + _id` supports efficient paginated retrieval of the latest messages.
- `chat + _id` supports cursor pagination using ObjectId order.
- `sender + createdAt` supports user activity and moderation queries.
- Messages are never embedded in chats; this prevents chat documents from growing without bound.

Efficient message retrieval:

```js
db.messages
  .find({ chat: chatId, createdAt: { $lt: cursorDate } })
  .sort({ createdAt: -1, _id: -1 })
  .limit(50)
```

For high-volume production workloads, prefer cursor pagination over skip/limit. `skip` becomes slower as the offset grows because MongoDB must walk past skipped records.

## Scaling Notes

- Keep `users`, `chats`, and `messages` separate.
- Store only metadata and pointers in `chats`.
- Store all high-volume content in `messages`.
- Use `lastMessage` denormalization for fast chat lists.
- Use cursor pagination for message history.
- For large groups, store read state in `chat_members.lastReadMessage` instead of embedding every read receipt in each message.
- For massive deployments, shard `messages` by `chat` or a hashed `chat` key, depending on traffic distribution.
