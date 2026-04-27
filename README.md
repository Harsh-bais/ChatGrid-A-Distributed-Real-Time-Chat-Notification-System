# Distributed Real-Time Chat

A full-stack WhatsApp-style chat app with React, Tailwind CSS, Express, Socket.IO, MongoDB, Redis Pub/Sub, and a BullMQ worker.

## Structure

- `client/` - React + Vite + Tailwind frontend
- `server/` - Express API + Socket.IO real-time gateway
- `worker/` - BullMQ background worker for asynchronous message jobs
- `notification-service/` - Independent Redis queue consumer for offline/new-message notifications

## Features

- JWT authentication
- One-to-one chats
- Group chats
- Typing indicators
- Message timestamps
- Read receipts
- Redis-backed Socket.IO adapter for multiple backend instances
- BullMQ message queue for asynchronous post-processing
- Independent notification service for offline users and new messages

## Quick Start

1. Start backing services:

```bash
docker compose up -d
```

2. Copy environment files:

```bash
copy server\.env.example server\.env
copy worker\.env.example worker\.env
copy client\.env.example client\.env
```

3. Install dependencies:

```bash
npm install
```

4. Run everything:

```bash
npm run dev
```

Client: `http://localhost:5173`

API: `http://localhost:4000`

## Scaling Backend Instances

Run multiple `server` processes with unique ports pointing to the same MongoDB and Redis instances. Socket.IO uses Redis Pub/Sub so messages, typing indicators, and read receipts are synchronized across nodes.

Example:

```bash
PORT=4000 INSTANCE_ID=server-4000 npm run dev --workspace server
PORT=4001 INSTANCE_ID=server-4001 npm run dev --workspace server
```

Put a load balancer such as Nginx in front with sticky sessions enabled for WebSocket stability.

Socket connections are tracked in Redis by user and socket ID. On reconnect, the browser sends a `reconnect:sync` event with the chat rooms it had joined, and the new server instance validates membership before rejoining those rooms. Presence uses Socket.IO cluster-wide `fetchSockets()` plus the Redis connection registry so online/offline events stay accurate when users have multiple tabs or reconnect to another node.

## Distributed Message Handling

Message sending is split into durable stages:

1. The Socket.IO server authenticates the sender, stores the message in MongoDB, updates the chat, and enqueues work in Redis-backed BullMQ queues.
2. Each backend instance runs a `message-delivery` queue consumer. A delivery job may be picked up by any instance.
3. The consumer emits `message:new` and `chat:updated` through Socket.IO rooms. Because Socket.IO is configured with the Redis adapter, Redis Pub/Sub forwards the event to every Node.js server, so clients receive the message even when they are connected to a different instance.
4. Delivery uses Socket.IO acknowledgements with a timeout. If delivery fails or times out, BullMQ retries the job with exponential backoff.
5. A separate `worker/` process consumes asynchronous `messages` jobs and dispatches them to a pool of Node.js worker threads for parallel message post-processing.
6. A separate `notification-service/` process consumes `notifications` jobs. It checks Redis connection keys to find offline recipients, then stores a notification record for each offline user. This service also uses worker threads, so notification handling runs in parallel and outside the main chat server.

Fault-tolerance mechanisms:

- MongoDB persistence happens before delivery, so accepted messages survive server crashes.
- BullMQ stores pending jobs in Redis and retries failed jobs.
- Delivery jobs are idempotent on the client by message ID, preventing duplicate message bubbles during retries.
- Redis clients use reconnect backoff, and workers log failed, stalled, completed, and retried jobs.

This demonstrates distributed computing because multiple backend processes coordinate through Redis Pub/Sub and shared queues while serving clients connected to different machines or ports. It demonstrates parallel computing because the background worker processes queued message jobs concurrently and uses a worker-thread pool to run message processing tasks in parallel inside the worker process.

## Notification Service

The notification service is intentionally separate from the chat API:

```bash
npm run dev --workspace notification-service
```

When a new message is created, the main server enqueues `notification.message.created` on the Redis `notifications` queue. The notification service listens to that queue, checks whether each recipient has active socket connections in Redis, and sends notifications only for offline users.

In this local implementation, "sending" means writing a durable notification document to MongoDB with `status=sent` and logging the result. This keeps the service provider-neutral; a production deployment can replace the `offline-log` channel with email, push, SMS, or mobile push without changing the main chat server.
