/**
 * ============================================================
 * player.service.types.ts
 * ============================================================
 *
 * Shared type definitions for PlayerService and its cross-device
 * session-tracking logic. Kept in a separate file so the types can
 * be imported without pulling in the full service class.
 *
 * Interfaces:
 *   PlaybackSessionPresencePayload — WebSocket presence-event payload;
 *     broadcast by a device to announce it is alive and what it is playing.
 *   PlaybackClaimPayload           — WebSocket claim-event payload;
 *     broadcast by a device to declare it is taking over active playback.
 *   PlaybackDeviceSession          — Client-side view of one active listening
 *     session (a single browser / device entry in the presence list).
 * ============================================================
 */

/** Raw WebSocket payload for the `playback.session.presence` event. */
export interface PlaybackSessionPresencePayload {
	userId: string;
	deviceId: string;
	label: string;
	platform: string;
	currentBookId: string | null;
	paused: boolean;
	timestamp: string;
}

/** Raw WebSocket payload for the `playback.claimed` event. */
export interface PlaybackClaimPayload {
	userId: string;
	deviceId: string;
	bookId: string;
	timestamp: string;
}

/** Client-side representation of one active listening session in the presence list. */
export interface PlaybackDeviceSession {
	deviceId: string;
	label: string;
	platform: string;
	currentBookId: string | null;
	paused: boolean;
	lastSeenAt: string;
}
