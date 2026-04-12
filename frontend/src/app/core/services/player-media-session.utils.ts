import type { Book } from '../models/api.models';

interface MediaSessionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onSeekBackward: (offset?: number) => void;
  onSeekForward: (offset?: number) => void;
  onSeekTo: (time: number) => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
}

// Media session utilities keep browser integration details away from playback business logic.
export function getMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return null;
  }

  return navigator.mediaSession;
}

// Browsers vary in which actions they support; unsupported handlers may throw.
export function configureMediaSessionActions(mediaSession: MediaSession | null, handlers: MediaSessionHandlers): void {
  if (!mediaSession) {
    return;
  }

  try {
    mediaSession.setActionHandler('play', handlers.onPlay);
    mediaSession.setActionHandler('pause', handlers.onPause);
    mediaSession.setActionHandler('seekbackward', (details) => handlers.onSeekBackward(details.seekOffset));
    mediaSession.setActionHandler('seekforward', (details) => handlers.onSeekForward(details.seekOffset));
    mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        handlers.onSeekTo(details.seekTime);
      }
    });
    mediaSession.setActionHandler('previoustrack', handlers.onPreviousTrack);
    mediaSession.setActionHandler('nexttrack', handlers.onNextTrack);
  } catch {
    // Browsers may throw for unsupported media session actions.
  }
}

// Metadata updates are separate from position updates because title/artwork changes far less often.
export function updateMediaSessionMetadata(
  mediaSession: MediaSession | null,
  book: Book | null,
  coverUrl: string,
  paused: boolean,
): void {
  if (!mediaSession || !book) {
    return;
  }

  mediaSession.metadata = new MediaMetadata({
    title: book.title,
    artist: book.author,
    album: book.series ?? 'StoryWave',
    artwork: coverUrl
      ? [
          {
            src: coverUrl,
            sizes: '512x512',
            type: 'image/jpeg',
          },
        ]
      : undefined,
  });

  mediaSession.playbackState = paused ? 'paused' : 'playing';
}

// Position state is best-effort only; some browsers reject transient or incomplete values.
export function updateMediaSessionPosition(
  mediaSession: MediaSession | null,
  duration: number,
  position: number,
  playbackRate: number,
): void {
  if (!mediaSession || typeof mediaSession.setPositionState !== 'function') {
    return;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return;
  }

  try {
    mediaSession.setPositionState({
      duration,
      playbackRate: playbackRate || 1,
      position: Math.max(0, Math.min(position, duration)),
    });
  } catch {
    // Some browsers reject transient states.
  }
}