interface ChapterTimingPoint {
  start: number;
  end: number;
}

const COMMON_TIMING_SCALES = [11.025, 22.05, 44.1, 48, 88.2, 96, 1000];

function getMaxChapterEnd(chapters: ChapterTimingPoint[]): number {
  return chapters.reduce((max, chapter) => {
    return Number.isFinite(chapter.end) ? Math.max(max, chapter.end) : max;
  }, 0);
}

function getObservedScale(
  chapters: ChapterTimingPoint[],
  durationMs: number,
): number | null {
  if (!Array.isArray(chapters) || chapters.length === 0 || durationMs <= 0) {
    return null;
  }

  const maxEnd = getMaxChapterEnd(chapters);
  if (maxEnd <= 0) {
    return null;
  }

  return maxEnd / durationMs;
}

function isNearKnownScale(scale: number): boolean {
  return COMMON_TIMING_SCALES.some((candidate) => {
    const relativeDelta = Math.abs(candidate - scale) / candidate;
    return relativeDelta <= 0.2;
  });
}

function pickRepairScale(scale: number): number {
  let selectedScale = scale;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const candidate of COMMON_TIMING_SCALES) {
    const delta = Math.abs(candidate - scale);
    if (delta < bestDelta) {
      bestDelta = delta;
      selectedScale = candidate;
    }
  }

  const relativeDelta = Math.abs(selectedScale - scale) / scale;
  return relativeDelta <= 0.2 ? selectedScale : scale;
}

export function hasLikelyChapterTimingMismatch(
  chapters: ChapterTimingPoint[],
  durationMs: number,
): boolean {
  const observedScale = getObservedScale(chapters, durationMs);
  if (!observedScale) {
    return false;
  }

  // Healthy chapter endpoints should stay reasonably close to 1x duration.
  if (observedScale < 0.6 || observedScale > 1.8) {
    return true;
  }

  // Keep a targeted check for known historical scale drift patterns.
  return observedScale > 1.2 && isNearKnownScale(observedScale);
}

export function repairChapterTimingScale<T extends ChapterTimingPoint>(
  chapters: T[],
  durationMs: number,
): { chapters: T[]; scale: number } | null {
  const observedScale = getObservedScale(chapters, durationMs);
  if (!observedScale) {
    return null;
  }

  if (!hasLikelyChapterTimingMismatch(chapters, durationMs)) {
    return null;
  }

  const scale = pickRepairScale(observedScale);
  const repaired = chapters.map((chapter) => {
    const start = Math.max(0, Math.round(chapter.start / scale));
    const end = Math.max(start, Math.round(chapter.end / scale));
    return {
      ...chapter,
      start,
      end,
    };
  });

  return {
    chapters: repaired,
    scale,
  };
}
