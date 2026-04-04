export interface UserStatsDTO {
  lifetime: {
    totalListeningSeconds: number;
    completedBooksCount: number;
    distinctBooksStarted: number;
    distinctBooksCompleted: number;
    totalSessions: number;
    totalSeekCount: number;
    totalForwardJumps: number;
    totalBackwardJumps: number;
    lastListeningAt?: string | null;
  };

  rolling: {
    last7DaysListeningSeconds: number;
    last30DaysListeningSeconds: number;
  };
}
