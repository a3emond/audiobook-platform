# Discussions API Endpoints

Base prefix: /api/v1/discussions

Authentication: required (Bearer access token)

## Channel Model

Channels are predefined and language-scoped:

- general
- book-requests
- series-talk
- recommendations

Languages:

- en
- fr

## Endpoints

### GET /channels?lang=en|fr

Returns available channels for the selected language.

Response:

- channels: array of channel entries

### GET /:lang/:channelKey/messages?limit=80&before=<iso-date>

Returns messages for one language/channel pair.

Query params:

- limit: optional, max 100
- before: optional ISO timestamp for pagination

Response:

- messages: ordered oldest -> newest
- hasMore: boolean

### POST /:lang/:channelKey/messages

Creates a new message in a predefined channel.

Body:

- body: string (required, max 2000)

Response:

- created message DTO

## Realtime Integration

When a message is created, a websocket event is emitted:

- type: discussion.message.created
- payload.message: created message DTO
