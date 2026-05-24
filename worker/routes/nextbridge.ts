/**
 * NextBridge control-plane routes.
 *
 * Pairing flow (NapCat-style):
 *   1. POST /api/nextbridge/instances   (team owner/co-owner)
 *        → generates a one-time `code` stored under `nb_pair:<code>` with TTL.
 *   2. NextBridge calls POST /api/nextbridge/pair  with {code, instance_name}
 *        (no session — code itself is the auth)
 *        → mints `nb_token`, stores `nb_instance:<teamId>:<id> = {tokenHash, ...}`,
 *          returns {token, instance_id}.
 *   3. NextBridge connects WSS /api/nextbridge/relay with `Authorization: Bearer <token>`.
 *      We look up token → (teamId, instanceId), then stub the request to the
 *      `NbHub` Durable Object for that pair so the socket persists.
 *
 * Frontend talks to the DO via:
 *   GET    /api/nextbridge/instances                    list
 *   POST   /api/nextbridge/instances                    create (owner/co-owner)
 *   DELETE /api/nextbridge/instances/:id                revoke (owner/co-owner)
 *   GET    /api/nextbridge/instances/:id/status         DO status passthrough
 *   GET    /api/nextbridge/instances/:id/events         recent event buffer
 *   POST   /api/nextbridge/instances/:id/rpc            call a method on NextBridge
 */

import { Hono } from "hono";
import type { Bindings, Variables, SessionData } from "../types";
import { requireAuth } from "../auth";

type NbInstance = {
  id: string;
  teamId: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  createdBy: string;
};

type NbPair = {
  teamId: string;
  createdBy: string;
  expiresAt: number;
};

const PAIR_TTL_SECONDS = 10 * 60;
const PAIR_CODE_BYTES = 6;
const TOKEN_BYTES = 32;

const nb = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── helpers ────────────────────────────────────────────────────────────────

function getRole(session: SessionData, teamId: string) {
  return session.teams.find((t) => t.id === teamId)?.role ?? null;
}

/** Bridge configuration / pairing is open to anyone above member rank. */
function canManage(session: SessionData, teamId: string): boolean {
  const role = getRole(session, teamId);
  return role === "owner" || role === "co-owner" || role === "admin";
}

function isMember(session: SessionData, teamId: string): boolean {
  return session.teams.some((t) => t.id === teamId);
}

function genId(): string {
  return crypto.randomUUID();
}

function genCode(): string {
  const bytes = new Uint8Array(PAIR_CODE_BYTES);
  crypto.getRandomValues(bytes);
  // 6 bytes → 12 hex chars, easy to read off a screen.
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function genToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function listKey(teamId: string): string {
  return `nb_instance_list:${teamId}`;
}
function instanceKey(teamId: string, id: string): string {
  return `nb_instance:${teamId}:${id}`;
}
function tokenIndexKey(hash: string): string {
  return `nb_token:${hash}`;
}
function pairKey(code: string): string {
  return `nb_pair:${code}`;
}

async function listInstances(kv: KVNamespace, teamId: string): Promise<NbInstance[]> {
  const ids = (await kv.get<string[]>(listKey(teamId), "json")) ?? [];
  const result: NbInstance[] = [];
  for (const id of ids) {
    const inst = await kv.get<NbInstance>(instanceKey(teamId, id), "json");
    if (inst) result.push(inst);
  }
  return result;
}

async function saveInstance(kv: KVNamespace, inst: NbInstance): Promise<void> {
  const ids = (await kv.get<string[]>(listKey(inst.teamId), "json")) ?? [];
  if (!ids.includes(inst.id)) {
    ids.push(inst.id);
    await kv.put(listKey(inst.teamId), JSON.stringify(ids));
  }
  await kv.put(instanceKey(inst.teamId, inst.id), JSON.stringify(inst));
}

async function deleteInstance(
  kv: KVNamespace,
  teamId: string,
  id: string,
): Promise<NbInstance | null> {
  const inst = await kv.get<NbInstance>(instanceKey(teamId, id), "json");
  if (!inst) return null;
  await kv.delete(instanceKey(teamId, id));
  await kv.delete(tokenIndexKey(inst.tokenHash));
  const ids = (await kv.get<string[]>(listKey(teamId), "json")) ?? [];
  const remaining = ids.filter((x) => x !== id);
  await kv.put(listKey(teamId), JSON.stringify(remaining));
  return inst;
}

function hubStub(env: Bindings, teamId: string, id: string): DurableObjectStub {
  const name = `${teamId}:${id}`;
  return env.NB_HUB.get(env.NB_HUB.idFromName(name));
}

// ── pairing (unauthenticated; code is the auth) ────────────────────────────

nb.post("/api/nextbridge/pair", async (c) => {
  let body: { code?: string; instance_name?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  const code = (body.code ?? "").trim();
  if (!code) return c.json({ error: "code is required" }, 400);

  const pair = await c.env.KV.get<NbPair>(pairKey(code), "json");
  if (!pair) return c.json({ error: "invalid or expired code" }, 404);
  if (pair.expiresAt < Date.now()) {
    await c.env.KV.delete(pairKey(code));
    return c.json({ error: "code expired" }, 410);
  }

  // Consume the code immediately so it can't be reused.
  await c.env.KV.delete(pairKey(code));

  const token = genToken();
  const tokenHash = await hashToken(token);
  const id = genId();
  const inst: NbInstance = {
    id,
    teamId: pair.teamId,
    name: (body.instance_name ?? "").trim() || "NextBridge",
    tokenHash,
    createdAt: new Date().toISOString(),
    createdBy: pair.createdBy,
  };

  await saveInstance(c.env.KV, inst);
  await c.env.KV.put(
    tokenIndexKey(tokenHash),
    JSON.stringify({ teamId: pair.teamId, instanceId: id }),
  );

  return c.json({ token, instance_id: id, team_id: pair.teamId });
});

// ── instance CRUD (requires auth) ──────────────────────────────────────────

nb.get("/api/nextbridge/instances", requireAuth, async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId is required" }, 400);
  const session = c.get("session");
  if (!isMember(session, teamId)) return c.json({ error: "Forbidden" }, 403);

  const list = await listInstances(c.env.KV, teamId);
  // Never leak token hashes to clients.
  return c.json({
    instances: list.map(({ tokenHash: _t, ...rest }) => rest),
    can_manage: canManage(session, teamId),
  });
});

nb.post("/api/nextbridge/instances", requireAuth, async (c) => {
  let body: { teamId?: string; name?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const teamId = body.teamId?.trim();
  if (!teamId) return c.json({ error: "teamId is required" }, 400);

  const session = c.get("session");
  if (!canManage(session, teamId)) {
    return c.json({ error: "Only team owners and co-owners can pair instances" }, 403);
  }

  const code = genCode();
  const pair: NbPair = {
    teamId,
    createdBy: session.userId,
    expiresAt: Date.now() + PAIR_TTL_SECONDS * 1000,
  };
  await c.env.KV.put(pairKey(code), JSON.stringify(pair), {
    expirationTtl: PAIR_TTL_SECONDS,
  });

  return c.json({ code, expires_in: PAIR_TTL_SECONDS });
});

nb.delete("/api/nextbridge/instances/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId is required" }, 400);
  const session = c.get("session");
  if (!canManage(session, teamId)) return c.json({ error: "Forbidden" }, 403);

  const removed = await deleteInstance(c.env.KV, teamId, id);
  if (!removed) return c.json({ error: "not found" }, 404);

  // Best-effort: ask the DO to close any live socket.
  try {
    await hubStub(c.env, teamId, id).fetch(
      new Request("https://do/disconnect", { method: "POST" }),
    );
  } catch {
    // ignore — instance is already deleted from KV
  }
  return c.json({ ok: true });
});

// ── status / events / RPC (requires auth) ──────────────────────────────────

async function requireInstanceAccess(
  c: import("hono").Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<{ teamId: string; id: string } | Response> {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "id is required" }, 400);
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId is required" }, 400);
  const session = c.get("session");
  if (!isMember(session, teamId)) return c.json({ error: "Forbidden" }, 403);
  const inst = await c.env.KV.get(instanceKey(teamId, id), "json");
  if (!inst) return c.json({ error: "not found" }, 404);
  return { teamId, id };
}

nb.get("/api/nextbridge/instances/:id/status", requireAuth, async (c) => {
  const access = await requireInstanceAccess(c);
  if (access instanceof Response) return access;
  const resp = await hubStub(c.env, access.teamId, access.id).fetch(
    new Request("https://do/status"),
  );
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
});

nb.get("/api/nextbridge/instances/:id/events", requireAuth, async (c) => {
  const access = await requireInstanceAccess(c);
  if (access instanceof Response) return access;
  const limit = c.req.query("limit") ?? "100";
  const resp = await hubStub(c.env, access.teamId, access.id).fetch(
    new Request(`https://do/events?limit=${encodeURIComponent(limit)}`),
  );
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
});

nb.post("/api/nextbridge/instances/:id/rpc", requireAuth, async (c) => {
  const access = await requireInstanceAccess(c);
  if (access instanceof Response) return access;
  const body = await c.req.text();
  const resp = await hubStub(c.env, access.teamId, access.id).fetch(
    new Request("https://do/rpc", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    }),
  );
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Chat endpoints ─────────────────────────────────────────────────────────
//
// Thin wrappers over the DO storage (`messages`) and the NextBridge RPC
// surface (`chat.channels`, `chat.send`). They live behind requireAuth +
// team-member check so any member of the team can read history and post —
// configuration (pairing / revoke) is the only operation gated by `canManage`.

function channelKeyFromAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const obj = addr as Record<string, unknown>;
  const sorted = Object.keys(obj).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of sorted) ordered[k] = obj[k];
  return JSON.stringify(ordered);
}

nb.get("/api/nextbridge/instances/:id/messages", requireAuth, async (c) => {
  const access = await requireInstanceAccess(c);
  if (access instanceof Response) return access;
  const limit = c.req.query("limit") ?? "200";
  // Accept either a pre-computed channel key (`channel_key=...`) or a
  // JSON-encoded address (`channel={"channel":"ops"}`). The latter is more
  // convenient from the frontend.
  let channelParam = c.req.query("channel_key") ?? "";
  const channelJson = c.req.query("channel");
  if (!channelParam && channelJson) {
    try {
      channelParam = channelKeyFromAddress(JSON.parse(channelJson));
    } catch {
      return c.json({ error: "invalid `channel` JSON" }, 400);
    }
  }
  const qs = new URLSearchParams({ limit });
  if (channelParam) qs.set("channel", channelParam);
  const resp = await hubStub(c.env, access.teamId, access.id).fetch(
    new Request(`https://do/messages?${qs.toString()}`),
  );
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
});

// Custom group display names — stored in the DO, scoped per instance. Any
// team member may rename: these are pure display labels, the real routing
// identity stays in NextBridge's rules.yaml.
nb.get("/api/nextbridge/instances/:id/group-names", requireAuth, async (c) => {
  const access = await requireInstanceAccess(c);
  if (access instanceof Response) return access;
  const resp = await hubStub(c.env, access.teamId, access.id).fetch(
    new Request("https://do/group-names"),
  );
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
});

nb.put("/api/nextbridge/instances/:id/group-names", requireAuth, async (c) => {
  const access = await requireInstanceAccess(c);
  if (access instanceof Response) return access;
  const body = await c.req.text();
  const resp = await hubStub(c.env, access.teamId, access.id).fetch(
    new Request("https://do/group-names", {
      method: "PUT",
      body,
      headers: { "Content-Type": "application/json" },
    }),
  );
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
});

nb.get("/api/nextbridge/instances/:id/channels", requireAuth, async (c) => {
  const access = await requireInstanceAccess(c);
  if (access instanceof Response) return access;
  const resp = await hubStub(c.env, access.teamId, access.id).fetch(
    new Request("https://do/rpc", {
      method: "POST",
      body: JSON.stringify({ method: "chat.channels", params: {} }),
      headers: { "Content-Type": "application/json" },
    }),
  );
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
});

nb.post("/api/nextbridge/instances/:id/chat/send", requireAuth, async (c) => {
  const access = await requireInstanceAccess(c);
  if (access instanceof Response) return access;
  let body: { channel?: unknown; text?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const text = (body.text ?? "").trim();
  if (!text) return c.json({ error: "text is required" }, 400);
  if (!body.channel || typeof body.channel !== "object") {
    return c.json({ error: "channel must be an object" }, 400);
  }

  // Identify the Workbench user to the NextBridge side. We pass username +
  // display name + avatar so other platforms can render the author and the
  // local /bridge chat log can show the same avatar on self-echoed messages.
  const session = c.get("session");
  const params = {
    channel: body.channel,
    text,
    user: session.displayName || session.username,
    user_id: session.userId,
    user_avatar: session.avatarUrl ?? "",
  };

  const resp = await hubStub(c.env, access.teamId, access.id).fetch(
    new Request("https://do/rpc", {
      method: "POST",
      body: JSON.stringify({ method: "chat.send", params }),
      headers: { "Content-Type": "application/json" },
    }),
  );
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Frontend stream (session-authenticated) ────────────────────────────────
// Tabs open this WS to receive chat.inbound events in real time, replacing
// the previous setInterval poll. Initial backlog still comes from the
// /messages REST endpoint to avoid sending it twice on every reconnect.
nb.get("/api/nextbridge/instances/:id/stream", requireAuth, async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: "websocket upgrade required" }, 426);
  }
  // Defence-in-depth: require Origin to match Host. SameSite=Lax already
  // blocks most CSRF-driven WS connections, but an explicit check stops
  // mixed-origin embedding (e.g. an iframe on a third-party site doing a
  // top-level navigation to our domain via a misconfigured intermediary).
  const origin = c.req.header("Origin") ?? "";
  const host = c.req.header("Host") ?? "";
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = "";
    }
    if (!originHost || originHost !== host) {
      return c.json({ error: "Forbidden origin" }, 403);
    }
  }
  const access = await requireInstanceAccess(c);
  if (access instanceof Response) return access;

  // Stub the upgrade into the DO. We tag the request with X-Nb-Role so the
  // DO knows this is a frontend subscriber, not the NextBridge control link.
  // Build the headers fresh because Request.headers is immutable post-construction.
  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Nb-Role", "frontend");
  const upstream = new Request(c.req.raw, { headers });
  return hubStub(c.env, access.teamId, access.id).fetch(upstream);
});

// ── WS relay entry (token-authenticated) ───────────────────────────────────

nb.get("/api/nextbridge/relay", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: "websocket upgrade required" }, 426);
  }
  const authz = c.req.header("Authorization") ?? "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return c.json({ error: "missing bearer token" }, 401);
  const token = m[1].trim();
  if (!token) return c.json({ error: "missing bearer token" }, 401);

  const tokenHash = await hashToken(token);
  const lookup = await c.env.KV.get<{ teamId: string; instanceId: string }>(
    tokenIndexKey(tokenHash),
    "json",
  );
  if (!lookup) return c.json({ error: "invalid token" }, 401);

  // Hand the DO the expected (teamId, instanceId) so its hello handler
  // can verify NextBridge claims the right identity in the handshake.
  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Nb-Expected-Instance", lookup.instanceId);
  headers.set("X-Nb-Team", lookup.teamId);
  const upstream = new Request(c.req.raw, { headers });
  return hubStub(c.env, lookup.teamId, lookup.instanceId).fetch(upstream);
});

export default nb;
