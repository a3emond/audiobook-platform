# Discussions API Endpoints

Base prefix: /api/v1/discussions

Authentication: required (Bearer access token)

## Channel Model

Channels are language-scoped. The API bootstraps default channels automatically, and admins can also create or remove non-default channels.

Default seeded channels:

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

Notes:

- default channels are created lazily on first access per language
- admin-created channels appear in the same list

### POST /channels

Create a channel for one language.

Authorization:

- admin role required

Body:

- lang: `en` or `fr` (required)
- title: string, length 2-80 (required)
- description: string, length 2-220 (required)
- key: optional URL-safe slug; if omitted, generated from title

Response:

- created channel DTO

Common errors:

- `400` `discussion_lang_invalid`
- `400` `discussion_channel_title_invalid`
- `400` `discussion_channel_description_invalid`
- `400` `discussion_channel_key_invalid`
- `403` `forbidden`
- `409` `discussion_channel_key_conflict`

### DELETE /:lang/:channelKey

Delete one channel.

Authorization:

- admin role required

Behavior:

- default seeded channels cannot be deleted
- non-empty channels cannot be deleted while messages still exist
- successful deletion deactivates the channel instead of physically removing it

Common errors:

- `400` `discussion_lang_invalid`
- `400` `discussion_channel_invalid`
- `400` `discussion_channel_default_protected`
- `403` `forbidden`
- `404` `discussion_channel_not_found`
- `409` `discussion_channel_not_empty`

### GET /:lang/:channelKey/messages?limit=80&before=<iso-date>

Returns messages for one language/channel pair.

Query params:

- limit: optional, max 100
- before: optional ISO timestamp for pagination

Response:

- messages: ordered oldest -> newest
- hasMore: boolean

### POST /:lang/:channelKey/messages

Creates a new message in a channel.

Body:

- body: string (required, max 2000)
- replyToMessageId: optional message id in the same language/channel

Response:

- created message DTO

Common errors:

- `400` `discussion_lang_invalid`
- `400` `discussion_channel_invalid`
- `400` `discussion_message_required`
- `400` `discussion_message_too_long`
- `400` `discussion_reply_invalid_id`
- `400` `discussion_reply_cross_channel_not_allowed`
- `404` `discussion_reply_not_found`

### DELETE /:lang/:channelKey/messages/:messageId

Delete a message from a channel.

Authorization:

- admin role required

Behavior:

- deletes the targeted message in the specified language/channel pair
- emits a realtime deletion event so active clients can remove the message immediately

Common errors:

- `400` `discussion_lang_invalid`
- `400` `discussion_channel_invalid`
- `400` `discussion_message_invalid_id`
- `403` `forbidden`
- `404` `discussion_message_not_found`

## Realtime Integration

When a message is created, a websocket event is emitted:

- type: discussion.message.created
- payload.message: created message DTO

When an admin deletes a message, a websocket event is emitted:

- type: discussion.message.deleted
- payload.messageId: deleted message id
- payload.lang: channel language
- payload.channelKey: channel key
