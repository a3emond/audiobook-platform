export interface RealtimeEventEnvelope<T = unknown> {
  type: string;
  ts: string;
  payload: T;
}

type RealtimeListener = (event: RealtimeEventEnvelope) => void;

const listeners = new Set<RealtimeListener>();

export function subscribeRealtimeEvents(listener: RealtimeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitRealtimeEvent<T>(type: string, payload: T): void {
  const envelope: RealtimeEventEnvelope<T> = {
    type,
    ts: new Date().toISOString(),
    payload,
  };

  for (const listener of listeners) {
    listener(envelope);
  }
}
