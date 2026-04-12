import { Injectable, signal } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';

import type { RealtimeEventEnvelope } from '../models/api.models';

@Injectable({ providedIn: 'root' })
// RealtimeService exposes a typed event bus on top of a single websocket connection.
export class RealtimeService {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly eventsSubject = new Subject<RealtimeEventEnvelope>();

  // Consumers subscribe by event type rather than dealing with raw websocket messages.
  readonly events$ = this.eventsSubject.asObservable();
  readonly connected = signal(false);

  // Duplicate connect calls are expected during bootstrap and route changes, so
  // both OPEN and CONNECTING states are treated as already connected.
  connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.socket = socket;

    socket.onopen = () => {
      this.connected.set(true);
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as RealtimeEventEnvelope;
        if (!parsed.type) {
          return;
        }
        this.eventsSubject.next(parsed);
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    socket.onclose = () => {
      this.connected.set(false);
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      this.connected.set(false);
      socket.close();
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  // Typed event selection keeps call sites focused on payload shape instead of transport details.
  on<T>(type: string): Observable<T> {
    return this.events$.pipe(
      filter((event) => event.type === type),
      map((event) => event.payload as T),
    );
  }

  // Fire-and-forget semantics are enough here; callers only need to know whether the socket was writable.
  send<T>(type: string, payload: T): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(
      JSON.stringify({
        type,
        payload,
      }),
    );
    return true;
  }

  // Reconnect is serialized so a burst of close/error events does not create parallel sockets.
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }
}
