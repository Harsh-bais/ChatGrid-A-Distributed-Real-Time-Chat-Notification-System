# ChatGrid: A Distributed Real-Time Chat & Notification System

ChatGrid is a WhatsApp-style multi-user chat platform built as a Parallel and Distributed Computing project. It combines a React client, an Express + Socket.IO realtime gateway, Redis-backed coordination, MongoDB persistence, a message-processing worker, and a dedicated notification service.

The project is designed to demonstrate:

- distributed coordination across multiple backend services
- real-time messaging across connected users
- offline notification persistence and later synchronization
- parallel background processing through workers and worker threads
- scalable architecture using Redis, BullMQ, and Socket.IO rooms

## Demo Highlights

- JWT-based authentication
- direct one-to-one chats
- group chat support
- real-time message delivery
- typing indicators
- presence snapshot and online/offline updates
- delivery and read receipts
- profile photo upload/removal
- notification center with unread/read state
- live in-app notifications for background chats
- offline notification persistence for disconnected users
- Redis-backed distributed Socket.IO communication
- BullMQ queues for message delivery and notification workflows
- worker-thread message post-processing

## Tech Stack

### Frontend

- React
- Vite
- Tailwind CSS
- Axios
- Socket.IO client
- Emoji Picker React
- Lucide React

### Backend

- Node.js
- Express
- Socket.IO
- MongoDB + Mongoose
- Redis
- BullMQ
- Worker Threads

## Repository Structure

```text
client/                 React + Vite frontend
server/                 Express API + Socket.IO gateway
worker/                 Background message-processing worker
notification-service/   Dedicated notification worker service
docker-compose.yml      MongoDB + Redis runtime
```

## System Architecture

```text
Client (React UI)
   |
   v
Server (Express + Socket.IO)
   |---- MongoDB (users, chats, messages, notifications)
   |---- Redis (pub/sub, queues, connection registry)
   |
   |---- BullMQ: messages ----------> worker/
   |---- BullMQ: message-delivery --> server delivery worker
   |---- BullMQ: notifications -----> notification-service/
```

## How The System Works

### 1. Authentication Flow

- users register or log in through the API
- server returns a JWT token
- client stores the token locally
- token is attached to API requests and Socket.IO authentication

### 2. Chat Flow

When a user sends a message:

1. the client emits `message:send`
2. the server validates chat membership
3. the message is stored in MongoDB
4. the chat preview is updated
5. the server emits realtime events to recipients
6. background jobs are pushed into Redis queues
7. delivery and notification services continue processing asynchronously

### 3. Presence Flow

- every connected socket is registered in Redis
- server emits a `presence:snapshot` on connect
- server emits `presence:online` and `presence:offline`
- client updates UI presence state in real time

### 4. Notification Flow

There are two notification modes:

#### Live Background Notifications

If a user is online but viewing a different conversation:

- incoming background messages trigger a notification entry in the client
- sound is played in the browser
- notification can be opened and marked as read

#### Offline Notifications

If a user is offline:

- notification-service consumes queued notification jobs
- it checks Redis connection state
- unread notifications are stored in MongoDB
- when the user reconnects or logs in later, notifications are fetched and shown in the notification center

### 5. Parallel Processing Flow

The system uses BullMQ and worker threads for background processing:

- `messages` queue is consumed by `worker/`
- worker dispatches jobs into a worker-thread pool
- thread workers compute post-processing metadata
- delivery and notification queues run independently

This demonstrates parallel computation while keeping the main chat server responsive.

## Why This Is A Distributed System

This project is distributed because multiple independent services cooperate through shared infrastructure:

- `server` handles API and realtime socket traffic
- `worker` handles message post-processing
- `notification-service` handles offline notification creation
- Redis coordinates queues, pub/sub, and connection state
- MongoDB stores persistent shared data

These are separate processes that can run independently and scale separately.

## Why This Is Also A Parallel System

This project is parallel because:

- message-processing jobs run concurrently in BullMQ workers
- worker threads process message tasks in parallel
- notification work is separated from main request/response flow
- delivery processing is handled asynchronously from chat UI updates

## Features Mapped To PDC Concepts

| Feature | PDC Concept |
|---|---|
| Multiple services (`server`, `worker`, `notification-service`) | Distributed computing |
| Redis-backed Socket.IO adapter | Inter-node coordination |
| BullMQ queues | Asynchronous distributed workload management |
| Worker-thread pool | Parallel computing |
| Presence tracking via Redis registry | Shared distributed state |
| Durable notifications in MongoDB | Fault tolerance / persistence |

## Setup

### Prerequisites

- Node.js 20+
- npm
- Docker Desktop

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts:

- MongoDB on `27017`
- Redis on `6379`

### 2. Create Environment Files

```bash
copy server\.env.example server\.env
copy worker\.env.example worker\.env
copy notification-service\.env.example notification-service\.env
copy client\.env.example client\.env
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run All Services

```bash
npm run dev
```

Services:

- client: `http://localhost:5173`
- server: `http://localhost:4000`
- worker: background process
- notification-service: background process

## Environment Notes

Typical values:

### server/.env

```env
PORT=4000
INSTANCE_ID=server-4000
MONGO_URI=mongodb://localhost:27017/chatgrid
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=your_secret
CLIENT_URL=http://localhost:5173
```

### worker/.env

```env
MONGO_URI=mongodb://localhost:27017/chatgrid
REDIS_URL=redis://127.0.0.1:6379
MESSAGE_THREAD_COUNT=4
```

### notification-service/.env

```env
MONGO_URI=mongodb://localhost:27017/chatgrid
REDIS_URL=redis://127.0.0.1:6379
```

### client/.env

```env
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

## Horizontal Scaling

To simulate a distributed deployment, run multiple server instances against the same Redis and MongoDB:

```bash
PORT=4000 INSTANCE_ID=server-4000 npm run dev --workspace server
PORT=4001 INSTANCE_ID=server-4001 npm run dev --workspace server
PORT=4002 INSTANCE_ID=server-4002 npm run dev --workspace server
```

Use a load balancer or reverse proxy in front of them for production-style routing.

Because Socket.IO uses Redis and presence is tracked through the Redis connection registry:

- connected users can move between server instances
- events stay synchronized across nodes
- rooms can be rejoined after reconnect

## API Summary

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Chats

- `GET /api/chats`
- `POST /api/chats/direct`
- `POST /api/chats/group`
- `GET /api/chats/:chatId/messages`

### Users

- `GET /api/users`
- `POST /api/users/me/avatar`
- `DELETE /api/users/me/avatar`

### Notifications

- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`

## Socket Events

### Client -> Server

- `chat:join`
- `reconnect:sync`
- `message:send`
- `typing:start`
- `typing:stop`
- `message:read`

### Server -> Client

- `connection:ready`
- `presence:snapshot`
- `presence:online`
- `presence:offline`
- `message:new`
- `chat:updated`
- `message:delivered`
- `message:read`
- `typing:start`
- `typing:stop`
- `notifications:sync`

## Validation / Checks

Useful commands:

```bash
npm run lint
```

```bash
npm run lint --workspace client
```

```bash
docker ps
```

## Structured Logging And Debugging

The system now emits structured JSON logs across:

- `server`
- `worker`
- `notification-service`

For message delivery tracing, the server generates a `traceId` during `message:send` and propagates it through:

- message persistence
- queue enqueue
- message post-processing
- delivery worker execution
- notification worker execution

This makes it possible to trace one message end-to-end across services.

Detailed debugging workflows are documented here:

- [docs/debugging-workflows.md](docs/debugging-workflows.md)

## Fault Tolerance Notes

- messages are persisted before distributed follow-up work
- BullMQ retries failed jobs
- notification records survive reconnects and reloads
- delivery and notification logic are separated from the UI thread
- Redis reconnect behavior supports temporary infrastructure instability

## Current Project Positioning

Recommended project statement:

> Distributed real-time multi-user chat and notification system with messages handled by distributed servers, realtime socket communication, offline notification persistence, and parallel background worker processing.

## Suitable Report Sections

This repository is ready to support report sections such as:

- introduction
- problem statement
- objectives
- system architecture
- modules
- distributed computing concepts used
- parallel processing concepts used
- implementation details
- testing and validation
- limitations and future improvements

## Future Improvements

- push notifications beyond browser session scope
- media/file messaging
- stronger analytics in background worker
- production reverse proxy + sticky session config
- deployment scripts for multi-node setups
- end-to-end automated tests

## License

Academic project / educational use.
