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
import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../types";

type Frame =
  | { kind: "hello"; instance_id?: string; instance_name?: string; version?: string; command_prefix?: string }
  | { kind: "req"; id: string; method: string; params?: unknown }
  | { kind: "res"; id: string; ok: boolean; data?: unknown; error?: string }
  | { kind: "event"; topic: string; data: unknown; t?: number }
  | { kind: "ping"; t?: number }
  | { kind: "pong"; t?: number };

type EventEntry = { topic: string; data: unknown; t: number };

/** A media attachment carried alongside a ChatMessage. */
type ChatAttachment = {
  /** "image" | "video" | "voice" | "file" — origin-platform classification. */
  type: string;
  /** Direct download URL. Empty when the source platform only had bytes. */
  url: string;
  /** Filename hint. Empty when unknown. */
  name: string;
  /** Size in bytes. -1 when unknown. */
  size: number;
};

/** A chat-class event extracted from the live event stream for persistence. */
type ChatMessage = {
  /** Stable channel key derived from the canonicalised address dict. */
  channel_key: string;
  /** Original channel address (whatever the NextBridge driver sent up). */
  channel: Record<string, unknown>;
  text: string;
  user: string;
  user_id: string;
  /** Avatar URL when the source driver populated it (or, for QQ, derived
   *  from the qlogo.cn endpoint by NextBridge). Empty string when unknown. */
  user_avatar: string;
  platform: string;
  instance_id: string;
  message_id: string;
  time: string | number | null;
  /** True when this message was authored from Workbench itself. */
  self: boolean;
  /** Attachments sent alongside the text. Empty when text-only. */
  attachments: ChatAttachment[];
  /** Wall-clock at the DO when we recorded it. Used for tie-break/ordering. */
  recorded_at: number;
};

const EVENT_BUFFER_SIZE = 200;
const CHAT_BUFFER_SIZE = 1000;
const RPC_TIMEOUT_MS = 15_000;
const MAX_PENDING_RPCS = 100;
const MAX_WS_FRAME_BYTES = 256 * 1024;
const MAX_STORED_BUFFER_BYTES = 1_500_000;
const MAX_GROUP_NAMES = 100;
const MAX_GROUP_KEY_LENGTH = 128;
const MAX_GROUP_NAME_LENGTH = 128;
const MAX_CHAT_TEXT_LENGTH = 4096;
const MAX_CHANNEL_BYTES = 4096;
const MAX_ATTACHMENTS = 8;

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function truncate(value: unknown, maxLength: number): string {
  return String(value ?? "").slice(0, maxLength);
}

function trimSerializedEntries<T>(items: T[], maxItems: number): T[] {
  let total = 2; // JSON array brackets
  let start = items.length;
  let count = 0;
  for (let i = items.length - 1; i >= 0 && count < maxItems; i -= 1) {
    const size = byteLength(JSON.stringify(items[i])) + (count > 0 ? 1 : 0);
    if (size + total > MAX_STORED_BUFFER_BYTES) break;
    total += size;
    start = i;
    count += 1;
  }
  return items.slice(start);
}

function channelKey(channel: unknown): string {
  if (!channel || typeof channel !== "object") return "";
  const obj = channel as Record<string, unknown>;
  const sorted = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of sorted) out[k] = obj[k];
  const key = JSON.stringify(out);
  return byteLength(key) <= MAX_CHANNEL_BYTES ? key : "";
}

function normalizeChannel(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  try {
    return byteLength(JSON.stringify(raw)) <= MAX_CHANNEL_BYTES
      ? (raw as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function safeMediaUrl(raw: unknown): string {
  const value = truncate(raw, 2048);
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password
    ) {
      return parsed.href;
    }
  } catch {
    // Drop malformed / non-network attachment URLs.
  }
  return "";
}

function normalizeAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatAttachment[] = [];
  for (const item of raw.slice(0, MAX_ATTACHMENTS)) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    out.push({
      type: truncate(a.type, 32),
      url: safeMediaUrl(a.url),
      name: truncate(a.name, 256),
      size: typeof a.size === "number" ? a.size : Number(a.size ?? -1) || -1,
    });
  }
  return out;
}

// Memory-only across DO invocations. Hibernation may drop these — that's OK,
// the next RPC will time out and the caller can retry. The WS socket itself
// is restored automatically by `getWebSockets()`.
type PendingRpc = {
  resolve: (frame: { ok: boolean; data?: unknown; error?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class NbHub extends DurableObject<Bindings> {
  private state: DurableObjectState;
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
    super(state, env);
    this.state = state;
    // Restore events + chat buffers + group names from storage on cold start.
    this.state.blockConcurrencyWhile(async () => {
      const stored = (await this.state.storage.get<EventEntry[]>("events")) ?? [];
      this.events = trimSerializedEntries(stored, EVENT_BUFFER_SIZE);
      const chat =
        (await this.state.storage.get<ChatMessage[]>("chat_messages")) ?? [];
      this.chatMessages = trimSerializedEntries(chat, CHAT_BUFFER_SIZE);
      this.groupNames =
        (await this.state.storage.get<Record<string, string>>("group_names")) ??
        {};
      this.meta = (await this.state.storage.get<typeof this.meta>("meta")) ?? {};
    });
  }

  /** Returns true iff at least one hibernated WS is currently attached. */
  /** True iff the NextBridge control connection is attached. Frontend
   *  subscribers don't count — they can't service RPCs. */
  private hasSocket(): boolean {
    return this.state.getWebSockets("nextbridge").length > 0;
  }

  // ---------------------------------------------------------------------
  // HTTP entry — relay upgrade OR control endpoints from sibling routes
  // ---------------------------------------------------------------------

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const action = url.pathname.split("/").filter(Boolean).pop() ?? "";

    if (req.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      // Two flavours of WS terminate here:
      //   - NextBridge dialing in via /relay (tag: "nextbridge", RPC + events)
      //   - Workbench frontend subscribing via /stream (tag: "frontend",
      //     read-only push of chat.inbound events)
      // The sibling route sets X-Nb-Role to disambiguate.
      const role = req.headers.get("X-Nb-Role") === "frontend"
        ? "frontend"
        : "nextbridge";
      return this.acceptWebSocket(req, role);
    }

    switch (action) {
      case "status":
        return Response.json(this.status());
      case "events":
        {
          const requested = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
          const limit = Number.isFinite(requested)
            ? Math.max(1, Math.min(requested, EVENT_BUFFER_SIZE))
            : 100;
        return Response.json({
          events: this.events.slice(-limit),
        });
        }
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
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !body.names ||
      typeof body.names !== "object" ||
      Array.isArray(body.names)
    ) {
      return Response.json(
        { ok: false, error: "`names` must be an object" },
        { status: 400 },
      );
    }
    // Coerce to a clean Record<string, string>, dropping empties.
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.names as Record<string, unknown>)) {
      const key = String(k).trim();
      if (!key || key.length > MAX_GROUP_KEY_LENGTH) continue;
      const val = typeof v === "string" ? v.trim() : "";
      if (val) next[key] = val.slice(0, MAX_GROUP_NAME_LENGTH);
      if (Object.keys(next).length >= MAX_GROUP_NAMES) break;
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
    const requested = Number.parseInt(
      url.searchParams.get("limit") ?? String(CHAT_BUFFER_SIZE),
      10,
    );
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(requested, CHAT_BUFFER_SIZE))
      : CHAT_BUFFER_SIZE;
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

  private acceptWebSocket(req: Request, role: "nextbridge" | "frontend"): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Hibernation-friendly: the runtime restores the socket and our handlers
    // (webSocketMessage / webSocketClose) automatically on cold starts.
    // The tag lets us route fan-out (frontend subscribers) without confusing
    // them with the NextBridge control connection.
    this.state.acceptWebSocket(server, [role]);
    // Carry the (teamId, instanceId) bound to this token forward in the
    // socket attachment so the hello handler can verify the NextBridge
    // process claims the right identity. Survives hibernation.
    server.serializeAttachment({
      role,
      expected_instance: req.headers.get("X-Nb-Expected-Instance") ?? "",
      team_id: req.headers.get("X-Nb-Team") ?? "",
    });

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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json(
        { ok: false, error: "RPC payload must be an object" },
        { status: 400 },
      );
    }
    const method = body.method;
    if (!method || typeof method !== "string" || method.length > 128) {
      return Response.json(
        { ok: false, error: "method is required" },
        { status: 400 },
      );
    }
    if (this.pending.size >= MAX_PENDING_RPCS) {
      return Response.json(
        { ok: false, error: "Too many pending RPCs" },
        { status: 429 },
      );
    }

    const id = crypto.randomUUID();
    const frame: Frame = { kind: "req", id, method, params: body.params };
    // CRITICAL: filter to the NextBridge control connection. Without the
    // tag the array also includes frontend subscribers — sending an RPC
    // frame to a browser tab makes it disappear and we time out at 15s.
    const sockets = this.state.getWebSockets("nextbridge");
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
    // Frontend subscribers are read-only. They might send keepalive pings or
    // garbage; just drop anything they say.
    const meta = _ws.deserializeAttachment() as { role?: string } | null;
    if (meta?.role === "frontend") return;

    const rawSize = typeof raw === "string" ? byteLength(raw) : raw.byteLength;
    if (rawSize > MAX_WS_FRAME_BYTES) {
      try {
        _ws.close(1009, "message too large");
      } catch {
        // ignore
      }
      return;
    }

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

    const sockMeta = _ws.deserializeAttachment() as {
      role: string;
      expected_instance?: string;
      team_id?: string;
    } | null;

    switch (frame.kind) {
      case "hello": {
        const claimed = (frame.instance_id ?? "").trim();
        const expected = sockMeta?.expected_instance ?? "";
        // Token already bound to (teamId, instanceId) when the route looked
        // it up — verify NextBridge claims the same id. A mismatch means
        // either the config on the NextBridge host points at a different
        // instance, or someone is replaying a token issued for another
        // pairing. Reject both.
        if (!expected || claimed !== expected) {
          try {
            _ws.send(
              JSON.stringify({
                kind: "hello.ack",
                ok: false,
                error: "instance_id mismatch",
              }),
            );
          } catch {
            // best-effort; close anyway
          }
          try {
            _ws.close(1008, "instance_id mismatch");
          } catch {
            // ignore
          }
          return;
        }

        this.meta = {
          instance_id: claimed,
          instance_name: truncate(frame.instance_name, 128),
          version: truncate(frame.version, 64),
          command_prefix: truncate(frame.command_prefix, 64),
          connected_at: Date.now(),
        };
        await this.state.storage.put("meta", this.meta);
        try {
          _ws.send(
            JSON.stringify({
              kind: "hello.ack",
              ok: true,
              instance_id: claimed,
              team_id: sockMeta?.team_id ?? "",
            }),
          );
        } catch {
          // ignore — NB will time out waiting for ack and reconnect
        }
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
        if (typeof frame.topic !== "string" || frame.topic.length > 128) return;
        const entry: EventEntry = {
          topic: frame.topic,
          data: frame.data,
          t:
            typeof frame.t === "number" && Number.isFinite(frame.t)
              ? frame.t
              : Math.floor(Date.now() / 1000),
        };
        this.events.push(entry);
        this.events = trimSerializedEntries(this.events, EVENT_BUFFER_SIZE);
        await this.state.storage.put("events", this.events);

        // Persist chat messages separately so the /bridge page can render a
        // longer scrollback than the all-events ring buffer would hold.
        if (frame.topic === "chat.inbound" && this.isChatPayload(frame.data)) {
          const msg = this.toChatMessage(frame.data, entry.t);
          this.chatMessages.push(msg);
          this.chatMessages = trimSerializedEntries(
            this.chatMessages,
            CHAT_BUFFER_SIZE,
          );
          await this.state.storage.put("chat_messages", this.chatMessages);

          // Fan out to every currently-attached frontend subscriber. Replaces
          // the old setInterval poll in NextBridgePage.
          this.broadcastChat(msg);
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

  private broadcastChat(msg: ChatMessage): void {
    const payload = JSON.stringify({ kind: "chat.inbound", message: msg });
    for (const ws of this.state.getWebSockets("frontend")) {
      try {
        ws.send(payload);
      } catch {
        // Subscriber died mid-send; the close handler will collect it later.
      }
    }
  }

  private isChatPayload(data: unknown): data is Record<string, unknown> {
    if (!data || typeof data !== "object") return false;
    const d = data as Record<string, unknown>;
    return typeof d.text === "string" && d.channel !== undefined;
  }

  private toChatMessage(data: Record<string, unknown>, t: number): ChatMessage {
    const ch = normalizeChannel(data.channel);
    return {
      channel_key: channelKey(ch),
      channel: ch,
      text: truncate(data.text, MAX_CHAT_TEXT_LENGTH),
      user: truncate(data.user, 256),
      user_id: truncate(data.user_id, 256),
      user_avatar: safeMediaUrl(data.user_avatar),
      platform: truncate(data.platform, 64),
      instance_id: truncate(data.instance_id, 128),
      message_id: truncate(data.message_id, 256),
      time: (data.time as string | number | null | undefined) ?? null,
      self: Boolean(data.self),
      attachments: normalizeAttachments(data.attachments),
      recorded_at: t,
    };
  }

  async webSocketClose(
    _ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    // Only the NextBridge control connection owns pending RPCs. A frontend
    // subscriber closing (tab navigated away, network blip) shouldn't fail
    // RPCs that may still resolve via the other socket.
    const meta = _ws.deserializeAttachment() as { role?: string } | null;
    if (meta?.role === "frontend") return;

    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, error: `socket closed (${code}) ${reason}` });
      this.pending.delete(id);
    }
  }

  async webSocketError(_ws: WebSocket, _err: unknown): Promise<void> {
    const meta = _ws.deserializeAttachment() as { role?: string } | null;
    if (meta?.role === "frontend") return;

    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, error: "socket error" });
      this.pending.delete(id);
    }
  }
}
