/**
 * Singleton WebSocket client to the Channels consumer at ``/ws/notes/``.
 *
 * Design:
 *   • One socket per browser tab per user (idempotent ``subscribe`` calls
 *     share the underlying connection).
 *   • Auth via ``?token=<access>`` query param — SimpleJWT is what the REST
 *     API already uses, and the browser WS API doesn't let us set custom
 *     headers on the handshake.
 *   • Reconnect with exponential backoff, capped at 15s. A successful
 *     connection resets the backoff so a flaky network doesn't starve
 *     reconnects permanently.
 *   • The socket auto-closes and goes idle once the last listener
 *     unsubscribes, so background tabs don't keep a connection open forever.
 */

import { tokens } from "./api";

export interface WsEvent {
  event: string;
  data: Record<string, unknown>;
}

type Listener = (event: WsEvent) => void;

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/notes/";

const MAX_BACKOFF_MS = 15_000;
const MIN_BACKOFF_MS = 500;

class WsClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private backoff = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wantClosed = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.wantClosed = false;
    this.ensureOpen();
    return () => {
      this.listeners.delete(listener);
      // Close the socket once the last consumer goes away — saves resources
      // on a tab that navigates to login/signup.
      if (this.listeners.size === 0) {
        this.wantClosed = true;
        this.close();
      }
    };
  }

  /** Reset the connection — call after a login/logout so the new token
   * replaces the old one on the handshake. */
  reauth() {
    this.close();
    if (this.listeners.size > 0) {
      this.wantClosed = false;
      this.ensureOpen();
    }
  }

  private ensureOpen() {
    if (typeof window === "undefined") return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const access = tokens.getAccess();
    if (!access) {
      // No token yet — bail and let the next subscribe() after login retry.
      return;
    }
    const url = `${WS_URL}?token=${encodeURIComponent(access)}`;
    try {
      this.socket = new WebSocket(url);
    } catch (err) {
      console.warn("ws: failed to construct WebSocket", err);
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => {
      this.backoff = MIN_BACKOFF_MS;
    });

    this.socket.addEventListener("message", ev => {
      let parsed: WsEvent;
      try {
        parsed = JSON.parse(ev.data) as WsEvent;
      } catch {
        return;
      }
      if (!parsed || typeof parsed.event !== "string") return;
      this.listeners.forEach(l => {
        try {
          l(parsed);
        } catch (err) {
          console.error("ws listener threw:", err);
        }
      });
    });

    this.socket.addEventListener("close", ev => {
      this.socket = null;
      // 4401 = server rejected the token. Don't spin — the user needs to
      // re-log. We'll reconnect next time ``subscribe`` fires.
      if (ev.code === 4401) {
        this.wantClosed = true;
        return;
      }
      if (this.wantClosed) return;
      this.scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      // ``close`` always follows an error, so the reconnect path is enough.
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.wantClosed && this.listeners.size > 0) {
        this.ensureOpen();
      }
    }, delay);
  }

  private close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore double-close
      }
      this.socket = null;
    }
  }
}

export const ws = new WsClient();
