import type { ThresholdOption } from './profile-page.types';

export const JUMP_OPTIONS = [5, 10, 15, 20, 25, 30] as const;

export const THRESHOLD_OPTIONS: ThresholdOption[] = [
  { label: '30 minutes', seconds: 30 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '2 hours', seconds: 2 * 60 * 60 },
  { label: '4 hours', seconds: 4 * 60 * 60 },
  { label: '8 hours', seconds: 8 * 60 * 60 },
  { label: '12 hours', seconds: 12 * 60 * 60 },
  { label: '24 hours', seconds: 24 * 60 * 60 },
  { label: '48 hours', seconds: 48 * 60 * 60 },
  { label: '72 hours', seconds: 72 * 60 * 60 },
  { label: '1 week', seconds: 7 * 24 * 60 * 60 },
];
