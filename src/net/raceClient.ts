import { Client, type IMessage } from "@stomp/stompjs";
import {
  CONNECT_HEADERS,
  STOMP_ENDPOINT,
  USER_REPLY_QUEUE,
  appDest,
  roomTopic,
  type ClaimPayload,
  type RaceEvent,
  type ReplyMessage,
  type RoomMessage,
  type RoomView,
} from "../../shared/protocol.js";

export type ConnStatus = "connecting" | "connected" | "reconnecting" | "closed" | "error";

export interface RaceHandlers {
  onState(room: RoomView): void;
  onEvent(event: RaceEvent, room: RoomView): void;
  onReply(reply: ReplyMessage): void;
  onStatus(status: ConnStatus, detail?: string): void;
}

interface Creds {
  code: string;
  playerId: string;
  token: string;
}

function brokerUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${STOMP_ENDPOINT}`;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Client-side multiplayer: REST to create/join, then STOMP for realtime play. */
export class RaceClient {
  private client: Client | null = null;
  private creds: Creds | null = null;

  constructor(private handlers: RaceHandlers) {}

  get playerId(): string {
    return this.creds?.playerId ?? "";
  }
  get code(): string {
    return this.creds?.code ?? "";
  }

  async create(name: string): Promise<void> {
    this.creds = await postJson<Creds>("/api/rooms", { name });
    this.connect();
  }

  async join(name: string, code: string): Promise<void> {
    this.creds = await postJson<Creds>(`/api/rooms/${code.toUpperCase()}/join`, { name });
    this.connect();
  }

  private connect(): void {
    const creds = this.creds!;
    this.handlers.onStatus("connecting");
    const client = new Client({
      brokerURL: brokerUrl(),
      connectHeaders: {
        [CONNECT_HEADERS.login]: creds.playerId,
        [CONNECT_HEADERS.passcode]: creds.token,
        [CONNECT_HEADERS.room]: creds.code,
      },
      reconnectDelay: 2500, // token-based auto-reconnect
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
    });

    client.onConnect = () => {
      this.handlers.onStatus("connected");
      client.subscribe(roomTopic(creds.code), (m: IMessage) => this.handleRoom(m));
      client.subscribe(USER_REPLY_QUEUE, (m: IMessage) => this.handleReply(m));
    };
    client.onStompError = (frame) =>
      this.handlers.onStatus("error", frame.headers.message ?? "Server error");
    client.onWebSocketClose = () => this.handlers.onStatus("reconnecting");

    client.activate();
    this.client = client;
  }

  private handleRoom(message: IMessage): void {
    const parsed = JSON.parse(message.body) as RoomMessage;
    if (parsed.type === "event") this.handlers.onEvent(parsed.event, parsed.room);
    else this.handlers.onState(parsed.room);
  }

  private handleReply(message: IMessage): void {
    this.handlers.onReply(JSON.parse(message.body) as ReplyMessage);
  }

  private publish(action: "start" | "claim" | "dealMore", body: unknown = {}): void {
    if (!this.client?.connected || !this.creds) return;
    this.client.publish({ destination: appDest(this.creds.code, action), body: JSON.stringify(body) });
  }

  start(): void {
    this.publish("start");
  }
  claim(cards: [number, number, number]): void {
    this.publish("claim", { cards } satisfies ClaimPayload);
  }
  dealMore(): void {
    this.publish("dealMore");
  }

  async disconnect(): Promise<void> {
    await this.client?.deactivate();
    this.client = null;
  }
}
