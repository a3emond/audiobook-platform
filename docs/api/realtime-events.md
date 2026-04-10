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

### progress.synced

Emitted when a user's progress is saved from any device/tab.

Payload:

- userId: user ID
- bookId: book ID
- positionSeconds: current position in seconds
- durationAtSave: total duration when saved
- completed: whether book is marked completed
- timestamp: ISO datetime of sync

### playback.session.presence

Emitted when a browser client announces it is online for listening.

Payload:

- userId: user ID
- deviceId: browser session/device ID
- label: device label (example: Chrome on Linux x86_64)
- platform: platform (web)
- currentBookId: current book ID or null
- paused: whether this device is paused
- timestamp: ISO datetime of presence ping

### playback.claimed

Emitted when a client starts playback and becomes the active listening device.

Payload:

- userId: user ID
- deviceId: claiming browser session/device ID
- bookId: book ID that triggered the claim
- timestamp: ISO datetime of claim

## Frontend Usage

- Admin jobs pages consume job.state.changed and stop polling.
- Global shell displays a subtle toast for catalog.book.added.
- Discussions page listens to discussion.message.created for live chat updates.
- Player service listens to progress.synced for multi-tab/device progress parity.
- Player service listens to playback.session.presence and playback.claimed for browser-only Listening on.
