import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import { encodeFrame, extractFrames, type StompFrame } from "./frame.js";

/** What the app sees for each authenticated STOMP connection. */
export interface StompSession {
  readonly id: string;
  /** App-attached context (room code, player id, …). */
  data: Record<string, unknown>;
  /** Live subscriptions: subscriptionId -> destination. */
  readonly subscriptions: Map<string, string>;
  readonly isOpen: () => boolean;
}

export interface StompHandlers {
  /** Validate a CONNECT frame's headers; return session data or throw to reject. */
  authenticate(headers: Record<string, string>): Record<string, unknown>;
  /** Called after a client subscribes (good place to push initial state). */
  onSubscribe?(session: StompSession, destination: string, subscriptionId: string): void;
  /** Called for each SEND to an /app destination. */
  onSend?(session: StompSession, destination: string, body: string, headers: Record<string, string>): void;
  /** Called once when an authenticated connection drops. */
  onDisconnect?(session: StompSession): void;
}

interface InternalSession extends StompSession {
  socket: WebSocket;
  connected: boolean;
  buffer: string;
}

/**
 * A compact STOMP 1.2 broker over a `ws` WebSocketServer — enough of the
 * protocol for this game: CONNECT auth, SUBSCRIBE/UNSUBSCRIBE, SEND routing to
 * the app, and server-published MESSAGE frames to topic subscribers or a single
 * connection. Heart-beats are negotiated off (0,0); transactions/ACK are no-ops.
 * Compatible with @stomp/stompjs on the browser side.
 */
export class StompServer {
  private sessions = new Set<InternalSession>();
  private messageSeq = 0;

  constructor(
    private readonly wss: WebSocketServer,
    private readonly handlers: StompHandlers,
  ) {
    this.wss.on("connection", (socket: WebSocket) => this.onConnection(socket));
  }

  private onConnection(socket: WebSocket): void {
    const session: InternalSession = {
      id: randomUUID(),
      data: {},
      subscriptions: new Map(),
      socket,
      connected: false,
      buffer: "",
      isOpen: () => socket.readyState === socket.OPEN,
    };
    this.sessions.add(session);

    socket.on("message", (raw: unknown) => {
      session.buffer += String(raw);
      const { frames, remainder } = extractFrames(session.buffer);
      session.buffer = remainder;
      for (const frame of frames) this.handleFrame(session, frame);
    });
    socket.on("close", () => {
      if (session.connected) this.handlers.onDisconnect?.(session);
      this.sessions.delete(session);
    });
    socket.on("error", () => {
      /* 'close' will follow */
    });
  }

  private handleFrame(session: InternalSession, frame: StompFrame): void {
    switch (frame.command) {
      case "CONNECT":
      case "STOMP":
        this.handleConnect(session, frame);
        break;
      case "SUBSCRIBE": {
        if (!session.connected) return this.fail(session, "Not connected");
        const id = frame.headers.id ?? "sub-0";
        const destination = frame.headers.destination ?? "";
        session.subscriptions.set(id, destination);
        this.receiptIfRequested(session, frame);
        this.handlers.onSubscribe?.(session, destination, id);
        break;
      }
      case "UNSUBSCRIBE":
        session.subscriptions.delete(frame.headers.id ?? "");
        this.receiptIfRequested(session, frame);
        break;
      case "SEND": {
        if (!session.connected) return this.fail(session, "Not connected");
        this.handlers.onSend?.(session, frame.headers.destination ?? "", frame.body, frame.headers);
        this.receiptIfRequested(session, frame);
        break;
      }
      case "DISCONNECT":
        this.receiptIfRequested(session, frame);
        session.socket.close();
        break;
      default:
        // ACK/NACK/BEGIN/COMMIT/ABORT and unknowns: ignore.
        break;
    }
  }

  private handleConnect(session: InternalSession, frame: StompFrame): void {
    try {
      session.data = this.handlers.authenticate(frame.headers);
      session.connected = true;
      this.writeFrame(session, {
        command: "CONNECTED",
        headers: { version: "1.2", "heart-beat": "0,0", session: session.id, server: "aon-set/1.0" },
        body: "",
      });
    } catch (err) {
      this.fail(session, err instanceof Error ? err.message : "Authentication failed");
      session.socket.close();
    }
  }

  private fail(session: InternalSession, message: string): void {
    this.writeFrame(session, { command: "ERROR", headers: { message }, body: message });
  }

  private receiptIfRequested(session: InternalSession, frame: StompFrame): void {
    const receipt = frame.headers.receipt;
    if (receipt) this.writeFrame(session, { command: "RECEIPT", headers: { "receipt-id": receipt }, body: "" });
  }

  private writeFrame(session: InternalSession, frame: StompFrame): void {
    if (session.socket.readyState === session.socket.OPEN) {
      session.socket.send(encodeFrame(frame));
    }
  }

  private messageHeaders(subscriptionId: string, destination: string): Record<string, string> {
    return {
      subscription: subscriptionId,
      "message-id": `${++this.messageSeq}-${randomUUID()}`,
      destination,
      "content-type": "application/json",
    };
  }

  /** Publish a body to every subscriber of `destination`. Returns recipients reached. */
  publish(destination: string, body: string): number {
    let count = 0;
    for (const session of this.sessions) {
      for (const [subId, dest] of session.subscriptions) {
        if (dest === destination) {
          this.writeFrame(session, { command: "MESSAGE", headers: this.messageHeaders(subId, destination), body });
          count++;
        }
      }
    }
    return count;
  }

  publishJson(destination: string, value: unknown): number {
    return this.publish(destination, JSON.stringify(value));
  }

  /** Deliver a body to one connection's subscription of `destination` (private reply). */
  sendTo(session: StompSession, destination: string, body: string): boolean {
    const internal = session as InternalSession;
    for (const [subId, dest] of internal.subscriptions) {
      if (dest === destination) {
        this.writeFrame(internal, { command: "MESSAGE", headers: this.messageHeaders(subId, destination), body });
        return true;
      }
    }
    return false;
  }

  sendJson(session: StompSession, destination: string, value: unknown): boolean {
    return this.sendTo(session, destination, JSON.stringify(value));
  }

  /** Number of live connections (test/introspection aid). */
  get connectionCount(): number {
    return this.sessions.size;
  }
}
