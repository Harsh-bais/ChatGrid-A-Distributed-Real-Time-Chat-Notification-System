# Debugging Workflows

This project now emits structured JSON logs across the server, worker, and notification-service so message delivery issues can be traced end-to-end.

## Log Format

Every structured log line includes:

- `timestamp`
- `level`
- `service`
- `message`

Depending on the event, logs may also include:

- `instanceId`
- `component`
- `traceId`
- `jobId`
- `messageId`
- `chatId`
- `socketId`
- `userId`
- `recipientCount`
- `error`

## Trace One Message End-To-End

When a client sends a message, the server generates a `traceId`.

That `traceId` is propagated through:

1. socket receive
2. MongoDB persistence
3. queue enqueue
4. message worker processing
5. delivery worker execution
6. notification worker execution

### What to search for

Search logs for:

- `"traceId":"..."`
- `"messageId":"..."`

### Expected sequence

#### Server

- `message send received`
- `message persisted`
- `message broadcast prepared`
- `queue job enqueued`
- `message send completed`

#### Worker

- `message job started`
- `message job completed`

#### Delivery worker

- `delivery job started`
- `delivery job completed`

#### Notification service

- `notification job started`
- `notification job completed`

## Debugging Message Delivery Failures

If the sender reports that a message was accepted but recipients did not receive it:

1. find the server log line `message send completed`
2. note the `traceId`, `messageId`, and `chatId`
3. search for the same `traceId` in:
   - server logs
   - worker logs
   - notification-service logs
4. verify whether:
   - queue jobs were enqueued
   - delivery job completed
   - notification job completed

### Common failure patterns

#### No `message persisted`

- validation or authorization failure
- inspect `message send failed`

#### Persisted but no queue logs

- queue enqueue failure
- inspect server queue producer logs

#### Delivery job failed

- Redis worker issue
- malformed queue payload
- inspect `delivery job failed`

#### Notification job completed with `offlineCount: 0`

- recipient was considered online
- inspect presence and Redis connection state

## Debugging Offline Notification Failures

If offline notifications do not appear:

1. confirm server emitted `queue job enqueued` for the `notifications` queue
2. search notification-service logs for the same `traceId`
3. inspect:
   - `recipientCount`
   - `offlineCount`
   - `sent`

### Interpretation

- `recipientCount > 0` and `offlineCount = 0`
  - the system considered recipients online
- `offlineCount > 0` and `sent` contains records
  - notifications were persisted successfully
- `notification job failed`
  - inspect serialized error details

## Debugging Queue Stalls / Retries

Both worker services log:

- job started
- job completed
- job failed
- job stalled

If a job stalls:

1. search by `jobId`
2. inspect the latest `attemptsMade`
3. inspect serialized `error`

## Debugging HTTP API Failures

The server now emits one structured log per HTTP request:

- `http request completed`

Each request includes:

- `requestId`
- `method`
- `path`
- `statusCode`
- `durationMs`

On failures:

- `http request failed`

The response also returns `requestId` for easier correlation.

## Useful Commands

### Tail server logs

```powershell
Get-Content .\server.live.log -Wait
```

### Tail worker logs

```powershell
Get-Content .\worker.live.log -Wait
```

### Tail notification service logs

```powershell
Get-Content .\notification.live.log -Wait
```

### Filter by traceId

```powershell
Get-Content .\server.live.log | Select-String "traceId"
```

### Filter by messageId

```powershell
Get-Content .\worker.live.log | Select-String "messageId"
```

## Recommended Demo Workflow

For live debugging during demos:

1. open server, worker, and notification-service logs side by side
2. send one test message
3. capture the `traceId`
4. follow the same `traceId` across all services
5. confirm that the asynchronous pipeline completed
