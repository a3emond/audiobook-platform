import { Injectable, signal } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';

import type { RealtimeEventEnvelope } from '../models/api.models';

@Injectable({ providedIn: 'root' })
// realtime: keeps UI and state logic readable for this frontend unit.
export class RealtimeService {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly eventsSubject = new Subject<RealtimeEventEnvelope>();
  private readonly queuedMessages = new Map<string, unknown>();

  readonly events$ = this.eventsSubject.asObservable();
  readonly connected = signal(false);

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
      this.flushQueuedMessages();
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

  on<T>(type: string): Observable<T> {
    return this.events$.pipe(
      filter((event) => event.type === type),
      map((event) => event.payload as T),
    );
  }

  send<T>(type: string, payload: T): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.queuedMessages.set(type, payload);
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

  private flushQueuedMessages(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.queuedMessages.size === 0) {
      return;
    }

    for (const [type, payload] of this.queuedMessages.entries()) {
      this.socket.send(
        JSON.stringify({
          type,
          payload,
        }),
      );
    }

    this.queuedMessages.clear();
  }

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
