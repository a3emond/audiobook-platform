import type { SleepTimerMode } from './player-page.types';

const SLEEP_TIMER_MINUTES: Record<Exclude<SleepTimerMode, 'off' | 'chapter'>, number> = {
  '15m': 15,
  '30m': 30,
  '45m': 45,
  '60m': 60,
};

const SLEEP_TIMER_PAUSE_RESET_MS = 30_000;

// Sleep timer controller: contains timer state transitions so PlayerPage can stay focused on UI flow.
export class PlayerSleepTimer {
  private timeout?: ReturnType<typeof setTimeout>;
  private remainingMs: number | null = null;
  private startedAtMs: number | null = null;
  private pausedAtMs: number | null = null;
  private chapterTargetSeconds: number | null = null;

  dispose(): void {
    this.clearTimeout();
  }

  countdownText(mode: SleepTimerMode, nowMs: number): string | null {
    if (mode === 'off') {
      return null;
    }

    if (mode === 'chapter') {
      return 'Chapter end';
    }

    if (this.remainingMs === null) {
      return null;
    }

    let remainingMs = this.remainingMs;
    if (this.startedAtMs !== null) {
      remainingMs = Math.max(0, remainingMs - (nowMs - this.startedAtMs));
    }

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  handleTick(mode: SleepTimerMode, currentTime: number, paused: boolean, onPause: () => void): void {
    if (mode !== 'chapter' || paused || this.chapterTargetSeconds === null) {
      return;
    }

    if (currentTime >= this.chapterTargetSeconds) {
      this.chapterTargetSeconds = null;
      onPause();
    }
  }

  resetForMode(
    mode: SleepTimerMode,
    paused: boolean,
    chapterEndSeconds: number | null,
    onPause: () => void,
  ): void {
    this.clearTimeout();
    this.startedAtMs = null;
    this.pausedAtMs = null;
    this.chapterTargetSeconds = null;

    if (mode === 'off' || mode === 'chapter') {
      this.remainingMs = null;
    } else {
      this.remainingMs = SLEEP_TIMER_MINUTES[mode] * 60_000;
    }

    if (!paused) {
      this.armForPlayback(mode, paused, chapterEndSeconds, onPause);
    }
  }

  armForPlayback(
    mode: SleepTimerMode,
    paused: boolean,
    chapterEndSeconds: number | null,
    onPause: () => void,
  ): void {
    if (paused) {
      return;
    }

    if (mode === 'off') {
      this.pausedAtMs = null;
      return;
    }

    if (mode === 'chapter') {
      this.pausedAtMs = null;
      this.chapterTargetSeconds = chapterEndSeconds;
      return;
    }

    if (this.pausedAtMs !== null && Date.now() - this.pausedAtMs > SLEEP_TIMER_PAUSE_RESET_MS) {
      this.remainingMs = SLEEP_TIMER_MINUTES[mode] * 60_000;
    }

    this.pausedAtMs = null;

    if (this.remainingMs === null || this.remainingMs <= 0) {
      this.remainingMs = SLEEP_TIMER_MINUTES[mode] * 60_000;
    }

    this.clearTimeout();
    this.startedAtMs = Date.now();
    this.timeout = setTimeout(() => this.triggerPause(onPause), this.remainingMs);
  }

  pauseCountdown(mode: SleepTimerMode): void {
    if (mode === 'chapter') {
      this.pausedAtMs = Date.now();
      return;
    }

    if (this.startedAtMs !== null && this.remainingMs !== null) {
      const elapsed = Date.now() - this.startedAtMs;
      this.remainingMs = Math.max(0, this.remainingMs - elapsed);
    }

    this.clearTimeout();
    this.startedAtMs = null;
    this.pausedAtMs = Date.now();
  }

  refreshChapterTarget(mode: SleepTimerMode, paused: boolean, chapterEndSeconds: number | null): void {
    if (mode !== 'chapter' || paused) {
      return;
    }

    this.chapterTargetSeconds = chapterEndSeconds;
  }

  private triggerPause(onPause: () => void): void {
    this.clearTimeout();
    this.startedAtMs = null;
    this.pausedAtMs = Date.now();
    this.remainingMs = 0;
    onPause();
  }

  private clearTimeout(): void {
    if (!this.timeout) {
      return;
    }

    clearTimeout(this.timeout);
    this.timeout = undefined;
  }
}