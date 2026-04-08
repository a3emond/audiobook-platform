# Realtime Websocket Events

Websocket endpoint:

- ws://<host>/ws
- wss://<host>/ws

Proxy note:

- Nginx forwards /ws to the API service with upgrade headers.

Authentication:

- The socket is public in v1.
- HTTP API endpoints remain token-protected.

## Event Envelope

All websocket messages use:

- type: string
- ts: ISO datetime
- payload: object

## Events

### system.connected

Emitted once after connection.

Payload:

- ok: true

### job.state.changed

Emitted when any background job changes status.

Payload:

- job.id
- job.type
- job.status
- job.createdAt
- job.updatedAt
- job.attempt
- job.maxAttempts
- job.error

### catalog.book.added

Emitted when a new book document is created.

Payload:

- book.id
- book.title
- book.author
- book.language
- book.createdAt

### discussion.message.created

Emitted when a discussion message is posted.

Payload:

- message: discussion message DTO

## Frontend Usage

- Admin jobs pages consume job.state.changed and stop polling.
- Global shell displays a subtle toast for catalog.book.added.
- Discussions page listens to discussion.message.created for live chat updates.
