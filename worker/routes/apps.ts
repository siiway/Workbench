/**
 * Team-shared Apps Launcher: card CRUD + per-user prefs (favorites/groups).
 *
 * KV schema:
 *   apps:<teamId>                       → { apps: AppCard[] }   (team-shared)
 *   app-prefs:<userId>:<teamId>         → UserAppPrefs           (per-user)
 *
 * TODO(short-link): add `GET /a/:slug` redirector — read reverse-index KV key
 *   `app-link:<slug>` → { teamId, appId }, look up the card, 302 to its url.
 *   Slug uniqueness is enforced per-team at create/update time. Empty slug on
 *   create → auto-generate a short random ID.
 *
 * TODO(prism-picker): add `GET /api/teams/:teamId/prism-apps` — proxy to
 *   Prism's (planned) `GET /api/oauth/me/teams/:teamId/apps` using the
 *   session's bearer token. Needs the `team_apps:read` scope to be added
 *   both in Prism's VALID_SCOPES and in Workbench's buildScopes().
 *   Response should reshape Prism's redirect_uris[] into a deduped
 *   redirectOrigins[] for the frontend's auto-fill.
 */

import { Hono } from "hono";
import type { Bindings, Variables, SessionData } from "../types";
import { requireAuth } from "../auth";

type AppCard = {
  id: string;
  name: string;
  url: string;
  iconUrl?: string;
  description?: string;
  tags: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type AppGroup = {
  id: string;
  name: string;
  appIds: string[];
  sortOrder: number;
};

type UserAppPrefs = {
  favorites: string[];
  groups: AppGroup[];
};

const apps = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── helpers ────────────────────────────────────────────────────────────────

function getRole(session: SessionData, teamId: string) {
  return session.teams.find((t) => t.id === teamId)?.role ?? null;
}

function canManage(session: SessionData, teamId: string): boolean {
  const role = getRole(session, teamId);
  return role === "owner" || role === "co-owner";
}

const APPS_KEY = (teamId: string) => `apps:${teamId}`;
const PREFS_KEY = (userId: string, teamId: string) =>
  `app-prefs:${userId}:${teamId}`;

async function loadApps(kv: KVNamespace, teamId: string): Promise<AppCard[]> {
  const raw = await kv.get(APPS_KEY(teamId), "json");
  return ((raw as { apps?: AppCard[] } | null) ?? {}).apps ?? [];
}

async function saveApps(
  kv: KVNamespace,
  teamId: string,
  list: AppCard[],
): Promise<void> {
  await kv.put(APPS_KEY(teamId), JSON.stringify({ apps: list }));
}

async function loadPrefs(
  kv: KVNamespace,
  userId: string,
  teamId: string,
): Promise<UserAppPrefs> {
  const raw = (await kv.get(PREFS_KEY(userId, teamId), "json")) as
    | Partial<UserAppPrefs>
    | null;
  return {
    favorites: Array.isArray(raw?.favorites) ? raw.favorites : [],
    groups: Array.isArray(raw?.groups) ? raw.groups : [],
  };
}

async function savePrefs(
  kv: KVNamespace,
  userId: string,
  teamId: string,
  prefs: UserAppPrefs,
): Promise<void> {
  await kv.put(PREFS_KEY(userId, teamId), JSON.stringify(prefs));
}

function normaliseTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

// ── team-shared apps CRUD ──────────────────────────────────────────────────

apps.get("/api/teams/:teamId/apps", requireAuth, async (c) => {
  const teamId = c.req.param("teamId");
  const session = c.get("session");
  if (!getRole(session, teamId)) {
    return c.json({ error: "Not a member of this team" }, 403);
  }
  const list = await loadApps(c.env.KV, teamId);
  return c.json({
    apps: list.sort((a, b) => a.sortOrder - b.sortOrder),
    canManage: canManage(session, teamId),
  });
});

apps.post("/api/teams/:teamId/apps", requireAuth, async (c) => {
  const teamId = c.req.param("teamId");
  const session = c.get("session");
  if (!canManage(session, teamId)) {
    return c.json({ error: "Only owners and co-owners can add apps" }, 403);
  }
  const body = await c.req.json<{
    name?: string;
    url?: string;
    iconUrl?: string;
    description?: string;
    tags?: string[];
  }>();
  const name = body.name?.trim();
  const url = body.url?.trim();
  if (!name) return c.json({ error: "Name is required" }, 400);
  if (!url) return c.json({ error: "URL is required" }, 400);

  const list = await loadApps(c.env.KV, teamId);
  const now = new Date().toISOString();
  const card: AppCard = {
    id: crypto.randomUUID(),
    name,
    url,
    iconUrl: body.iconUrl?.trim() || undefined,
    description: body.description?.trim() || undefined,
    tags: normaliseTags(body.tags),
    sortOrder: list.length
      ? Math.max(...list.map((a) => a.sortOrder)) + 1
      : 1,
    createdAt: now,
    updatedAt: now,
  };
  list.push(card);
  await saveApps(c.env.KV, teamId, list);
  return c.json({ app: card }, 201);
});

apps.patch("/api/teams/:teamId/apps/:appId", requireAuth, async (c) => {
  const teamId = c.req.param("teamId");
  const appId = c.req.param("appId");
  const session = c.get("session");
  if (!canManage(session, teamId)) {
    return c.json({ error: "Only owners and co-owners can edit apps" }, 403);
  }
  const body = await c.req.json<{
    name?: string;
    url?: string;
    iconUrl?: string | null;
    description?: string | null;
    tags?: string[];
  }>();
  const list = await loadApps(c.env.KV, teamId);
  const idx = list.findIndex((a) => a.id === appId);
  if (idx < 0) return c.json({ error: "App not found" }, 404);

  const cur = list[idx];
  const next: AppCard = {
    ...cur,
    name: body.name !== undefined ? body.name.trim() || cur.name : cur.name,
    url: body.url !== undefined ? body.url.trim() || cur.url : cur.url,
    iconUrl:
      body.iconUrl !== undefined
        ? body.iconUrl?.trim() || undefined
        : cur.iconUrl,
    description:
      body.description !== undefined
        ? body.description?.trim() || undefined
        : cur.description,
    tags: body.tags !== undefined ? normaliseTags(body.tags) : cur.tags,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = next;
  await saveApps(c.env.KV, teamId, list);
  return c.json({ app: next });
});

apps.delete("/api/teams/:teamId/apps/:appId", requireAuth, async (c) => {
  const teamId = c.req.param("teamId");
  const appId = c.req.param("appId");
  const session = c.get("session");
  if (!canManage(session, teamId)) {
    return c.json({ error: "Only owners and co-owners can delete apps" }, 403);
  }
  const list = await loadApps(c.env.KV, teamId);
  const next = list.filter((a) => a.id !== appId);
  if (next.length === list.length) {
    return c.json({ error: "App not found" }, 404);
  }
  await saveApps(c.env.KV, teamId, next);
  return c.json({ ok: true });
});

apps.post("/api/teams/:teamId/apps/reorder", requireAuth, async (c) => {
  const teamId = c.req.param("teamId");
  const session = c.get("session");
  if (!canManage(session, teamId)) {
    return c.json({ error: "Only owners and co-owners can reorder apps" }, 403);
  }
  const body = await c.req.json<{ items?: { id: string; sortOrder: number }[] }>();
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "items required" }, 400);
  }
  const order = new Map(body.items.map((i) => [i.id, i.sortOrder]));
  const list = await loadApps(c.env.KV, teamId);
  for (const a of list) {
    const next = order.get(a.id);
    if (typeof next === "number") a.sortOrder = next;
  }
  await saveApps(c.env.KV, teamId, list);
  return c.json({ ok: true });
});

// ── per-user prefs (favorites + groups) ────────────────────────────────────

apps.get("/api/teams/:teamId/app-prefs", requireAuth, async (c) => {
  const teamId = c.req.param("teamId");
  const session = c.get("session");
  if (!getRole(session, teamId)) {
    return c.json({ error: "Not a member of this team" }, 403);
  }
  const prefs = await loadPrefs(c.env.KV, session.userId, teamId);
  return c.json(prefs);
});

apps.put("/api/teams/:teamId/app-prefs", requireAuth, async (c) => {
  const teamId = c.req.param("teamId");
  const session = c.get("session");
  if (!getRole(session, teamId)) {
    return c.json({ error: "Not a member of this team" }, 403);
  }
  const body = await c.req.json<UserAppPrefs>();

  // Validate against the team's actual cards: filter dangling appIds.
  const cards = await loadApps(c.env.KV, teamId);
  const valid = new Set(cards.map((a) => a.id));

  const favorites = Array.isArray(body.favorites)
    ? body.favorites.filter((id) => valid.has(id))
    : [];

  const seenInGroup = new Set<string>();
  const groups: AppGroup[] = Array.isArray(body.groups)
    ? body.groups
        .map((g): AppGroup | null => {
          if (!g || typeof g.id !== "string" || typeof g.name !== "string") {
            return null;
          }
          const appIds = Array.isArray(g.appIds)
            ? g.appIds.filter((id): id is string => {
                if (typeof id !== "string") return false;
                if (!valid.has(id)) return false;
                if (seenInGroup.has(id)) return false; // each card in at most one group
                seenInGroup.add(id);
                return true;
              })
            : [];
          return {
            id: g.id,
            name: g.name.trim() || "Untitled",
            appIds,
            sortOrder: typeof g.sortOrder === "number" ? g.sortOrder : 0,
          };
        })
        .filter((g): g is AppGroup => g !== null)
    : [];

  const prefs: UserAppPrefs = { favorites, groups };
  await savePrefs(c.env.KV, session.userId, teamId, prefs);
  return c.json(prefs);
});

export default apps;
