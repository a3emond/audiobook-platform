export interface SettingsDTO {
  locale: "fr" | "en";

  player: {
    forwardJumpSeconds: 5 | 10 | 15 | 20 | 25 | 30;
    backwardJumpSeconds: 5 | 10 | 15 | 20 | 25 | 30;

    resumeRewind: {
      enabled: boolean;
      thresholdSinceLastListenSeconds: number;
      rewindSeconds: 5 | 10 | 15 | 20 | 25 | 30;
    };

    playbackRate: number;
    autoMarkCompletedThresholdSeconds: number;
    sleepTimerMode: "off" | "15m" | "30m" | "45m" | "60m" | "chapter";
  };

  library: {
    showCompleted: boolean;
  };
}

export type UpdateSettingsDTO = Partial<SettingsDTO>;
