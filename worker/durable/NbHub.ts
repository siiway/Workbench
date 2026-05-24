/**
 * NbHub — Durable Object that holds a NextBridge instance's reverse-WSS link.
 *
 * One DO instance per `(teamId, nbInstanceId)` pair. Lifecycle:
 *   1. NextBridge dials `/api/nextbridge/relay` with a bearer token.
 *   2. The route validates the token, looks up `nb_instance:<teamId>:<id>`,
 *      and stubs the request to this DO via `idFromName(<teamId>:<id>)`.
 *   3. The DO accepts the WS upgrade and stores the socket using Hibernation
 *      so it survives short Worker recycles without losing the connection.
 *   4. The frontend hits `/api/nextbridge/instances/:id/rpc/:method`, which
 *      stubs to the same DO; the DO sends a JSON `req` frame and awaits the
 *      matching `res`.
 *
 * Events from NextBridge are stored in a small ring buffer so the UI can
 * fetch the recent tail without subscribing to a stream.
 */
import type { Bindings } from "../types";

type Frame =
  | { kind: "hello"; instance_id?: string; instance_name?: string; version?: string; command_prefix?: string }
  | { kind: "req"; id: string; method: string; params?: unknown }
  | { kind: "res"; id: string; ok: boolean; data?: unknown; error?: string }
  | { kind: "event"; topic: string; data: unknown; t?: number }
  | { kind: "ping"; t?: number }
  | { kind: "pong"; t?: number };

type EventEntry = { topic: string; data: unknown; t: number };

/** A chat-class event extracted from the live event stream for persistence. */
type ChatMessage = {
  /** Stable channel key derived from the canonicalised address dict. */
  channel_key: string;
  /** Original channel address (whatever the NextBridge driver sent up). */
  channel: Record<string, unknown>;
  text: string;
  user: string;
  user_id: string;
  platform: string;
  instance_id: string;
  message_id: string;
  time: string | number | null;
  /** True when this message was authored from Workbench itself. */
  self: boolean;
  /** Wall-clock at the DO when we recorded it. Used for tie-break/ordering. */
  recorded_at: number;
};

const EVENT_BUFFER_SIZE = 200;
const CHAT_BUFFER_SIZE = 1000;
const RPC_TIMEOUT_MS = 15_000;

function channelKey(channel: unknown): string {
  if (!channel || typeof channel !== "object") return "";
  const obj = channel as Record<string, unknown>;
  const sorted = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of sorted) out[k] = obj[k];
  return JSON.stringify(out);
}

// Memory-only across DO invocations. Hibernation may drop these — that's OK,
// the next RPC will time out and the caller can retry. The WS socket itself
// is restored automatically by `getWebSockets()`.
type PendingRpc = {
  resolve: (frame: { ok: boolean; data?: unknown; error?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class NbHub {
  private state: DurableObjectState;
  private env: Bindings;
  private pending: Map<string, PendingRpc> = new Map();
  private events: EventEntry[] = [];
  private chatMessages: ChatMessage[] = [];
  /**
   * Per-rule custom display names assigned by team members. Keyed by
   * rule_id → display string. Used to override the default `rule_id`
   * label in the chat UI. Default empty; survives DO eviction via storage.
   */
  private groupNames: Record<string, string> = {};
  private meta: {
    instance_id?: string;
    instance_name?: string;
    version?: string;
    command_prefix?: string;
    connected_at?: number;
  } = {};

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state;
    this.env = env;
    void this.env; // currently unused but kept for future per-DO config lookups
    // Restore events + chat buffers + group names from storage on cold start.
    this.state.blockConcurrencyWhile(async () => {
      const stored = (await this.state.storage.get<EventEntry[]>("events")) ?? [];
      this.events = stored;
      const chat =
        (await this.state.storage.get<ChatMessage[]>("chat_messages")) ?? [];
      this.chatMessages = chat;
      this.groupNames =
        (await this.state.storage.get<Record<string, string>>("group_names")) ??
        {};
      this.meta = (await this.state.storage.get<typeof this.meta>("meta")) ?? {};
    });
  }

  /** Returns true iff at least one hibernated WS is currently attached. */
  private hasSocket(): boolean {
    return this.state.getWebSockets().length > 0;
  }

  // ---------------------------------------------------------------------
  // HTTP entry — relay upgrade OR control endpoints from sibling routes
  // ---------------------------------------------------------------------

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const action = url.pathname.split("/").filter(Boolean).pop() ?? "";

    if (req.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.acceptWebSocket(req);
    }

    switch (action) {
      case "status":
        return Response.json(this.status());
      case "events":
        return Response.json({
          events: this.events.slice(-Number(url.searchParams.get("limit") ?? 100)),
        });
      case "messages":
        return Response.json(this.listMessages(url));
      case "group-names":
        if (req.method === "PUT") return this.putGroupNames(req);
        return Response.json({ names: this.groupNames });
      case "rpc":
        return this.handleRpc(req);
      case "disconnect":
        return this.disconnectSockets();
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  private async putGroupNames(req: Request): Promise<Response> {
    let body: { names?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
    }
    if (!body.names || typeof body.names !== "object") {
      return Response.json(
        { ok: false, error: "`names` must be an object" },
        { status: 400 },
      );
    }
    // Coerce to a clean Record<string, string>, dropping empties.
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.names as Record<string, unknown>)) {
      const key = String(k).trim();
      if (!key) continue;
      const val = typeof v === "string" ? v.trim() : "";
      if (val) next[key] = val;
    }
    this.groupNames = next;
    await this.state.storage.put("group_names", next);
    return Response.json({ ok: true, names: next });
  }

  private status() {
    return {
      connected: this.hasSocket(),
      meta: this.meta,
      pending_rpcs: this.pending.size,
      event_buffer: this.events.length,
      chat_buffer: this.chatMessages.length,
    };
  }

  private listMessages(url: URL): { messages: ChatMessage[] } {
    const limit = Math.max(
      1,
      Math.min(Number(url.searchParams.get("limit") ?? CHAT_BUFFER_SIZE), CHAT_BUFFER_SIZE),
    );
    const channel = url.searchParams.get("channel"); // canonical key string
    let pool = this.chatMessages;
    if (channel) pool = pool.filter((m) => m.channel_key === channel);
    return { messages: pool.slice(-limit) };
  }

  private async disconnectSockets(): Promise<Response> {
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(1000, "control plane requested disconnect");
      } catch {
        // ignore
      }
    }
    return Response.json({ ok: true });
  }

  private acceptWebSocket(_req: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Hibernation-friendly: the runtime restores the socket and our handlers
    // (webSocketMessage / webSocketClose) automatically on cold starts.
    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------------------------------------------------------------------
  // Frontend → NextBridge RPC bridge
  // ---------------------------------------------------------------------

  private async handleRpc(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return new Response("POST required", { status: 405 });
    }
    if (!this.hasSocket()) {
      return Response.json(
        { ok: false, error: "NextBridge is not connected" },
        { status: 503 },
      );
    }
    let body: { method?: string; params?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
    }
    const method = body.method;
    if (!method || typeof method !== "string") {
      return Response.json(
        { ok: false, error: "method is required" },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();
    const frame: Frame = { kind: "req", id, method, params: body.params };
    const sockets = this.state.getWebSockets();
    if (sockets.length === 0) {
      return Response.json(
        { ok: false, error: "NextBridge socket missing" },
        { status: 503 },
      );
    }

    const result = await new Promise<{ ok: boolean; data?: unknown; error?: string }>(
      (resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          resolve({ ok: false, error: "RPC timeout" });
        }, RPC_TIMEOUT_MS);
        this.pending.set(id, { resolve, timer });
        try {
          sockets[0].send(JSON.stringify(frame));
        } catch (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          resolve({
            ok: false,
            error: `send failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      },
    );

    if (!result.ok) {
      return Response.json(result, { status: 502 });
    }
    return Response.json(result);
  }

  // ---------------------------------------------------------------------
  // WS event handlers (Hibernation API)
  // ---------------------------------------------------------------------

  async webSocketMessage(_ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let text: string;
    if (typeof raw === "string") {
      text = raw;
    } else {
      text = new TextDecoder().decode(raw);
    }
    let frame: Frame;
    try {
      frame = JSON.parse(text) as Frame;
    } catch {
      return; // ignore malformed frames
    }

    switch (frame.kind) {
      case "hello": {
        this.meta = {
          instance_id: frame.instance_id,
          instance_name: frame.instance_name,
          version: frame.version,
          command_prefix: frame.command_prefix,
          connected_at: Date.now(),
        };
        await this.state.storage.put("meta", this.meta);
        return;
      }
      case "res": {
        const p = this.pending.get(frame.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(frame.id);
        p.resolve({ ok: frame.ok, data: frame.data, error: frame.error });
        return;
      }
      case "event": {
        const entry: EventEntry = {
          topic: frame.topic,
          data: frame.data,
          t: frame.t ?? Math.floor(Date.now() / 1000),
        };
        this.events.push(entry);
        if (this.events.length > EVENT_BUFFER_SIZE) {
          this.events.splice(0, this.events.length - EVENT_BUFFER_SIZE);
        }
        await this.state.storage.put("events", this.events);

        // Persist chat messages separately so the /bridge page can render a
        // longer scrollback than the all-events ring buffer would hold.
        if (frame.topic === "chat.inbound" && this.isChatPayload(frame.data)) {
          const msg = this.toChatMessage(frame.data, entry.t);
          this.chatMessages.push(msg);
          if (this.chatMessages.length > CHAT_BUFFER_SIZE) {
            this.chatMessages.splice(
              0,
              this.chatMessages.length - CHAT_BUFFER_SIZE,
            );
          }
          await this.state.storage.put("chat_messages", this.chatMessages);
        }
        return;
      }
      case "ping": {
        try {
          _ws.send(JSON.stringify({ kind: "pong", t: frame.t }));
        } catch {
          // ignore
        }
        return;
      }
      case "pong":
        return;
      default:
        return;
    }
  }

  private isChatPayload(data: unknown): data is Record<string, unknown> {
    if (!data || typeof data !== "object") return false;
    const d = data as Record<string, unknown>;
    return typeof d.text === "string" && d.channel !== undefined;
  }

  private toChatMessage(data: Record<string, unknown>, t: number): ChatMessage {
    const ch = (data.channel ?? {}) as Record<string, unknown>;
    return {
      channel_key: channelKey(ch),
      channel: ch,
      text: String(data.text ?? ""),
      user: String(data.user ?? ""),
      user_id: String(data.user_id ?? ""),
      platform: String(data.platform ?? ""),
      instance_id: String(data.instance_id ?? ""),
      message_id: String(data.message_id ?? ""),
      time: (data.time as string | number | null | undefined) ?? null,
      self: Boolean(data.self),
      recorded_at: t,
    };
  }

  async webSocketClose(
    _ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    // Reject any pending RPCs so callers don't hang until timeout.
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, error: `socket closed (${code}) ${reason}` });
      this.pending.delete(id);
    }
  }

  async webSocketError(_ws: WebSocket, _err: unknown): Promise<void> {
    // Same as close — drop pending RPCs.
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, error: "socket error" });
      this.pending.delete(id);
    }
  }
}
