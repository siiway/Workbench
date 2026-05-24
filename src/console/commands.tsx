/**
 * Built-in command registry.
 *
 * Suggesters read from the in-memory cache (synchronous) so suggestions
 * update on every keystroke without a network round-trip. Run handlers do
 * write through to the server and then invalidate the relevant cache entry
 * so the next suggest() call sees the new state.
 *
 * TODO(console-pipes): no command composition / variables / $_ in v1.
 * TODO(console-cross-team): all commands implicitly act on `ctx.teamId`.
 */

import type { ReactNode } from "react";
import {
  AppsRegular,
  BranchForkRegular,
  CheckmarkCircleRegular,
  CircleRegular,
  HomeRegular,
  ShieldRegular,
  WindowConsoleRegular,
} from "@fluentui/react-icons";
import type { Command, SuggestionItem } from "./types";
import type { AppCard } from "../types";
import {
  getCachedApps,
  getCachedSets,
  getCachedTodos,
  refreshApps,
  refreshSets,
  refreshTodos,
  type ApiTodo,
} from "./dataCache";
import { fuzzyScore, fuzzySort } from "./fuzzy";

const ACTIVE_SET_KEY = "workbench:console:activeSet";

function getActiveSetId(): string | null {
  return localStorage.getItem(ACTIVE_SET_KEY);
}

function setActiveSetId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_SET_KEY, id);
  else localStorage.removeItem(ACTIVE_SET_KEY);
}

function resolveActiveSetSync(teamId: string): { id: string; name: string } | null {
  const sets = getCachedSets(teamId);
  if (sets.length === 0) return null;
  const stored = getActiveSetId();
  if (stored) {
    const hit = sets.find((s) => s.id === stored);
    if (hit) return hit;
  }
  setActiveSetId(sets[0].id);
  return sets[0];
}

function shortId(id: string): string {
  return id.slice(0, 6);
}

function findTodoByPrefix(todos: ApiTodo[], prefix: string): ApiTodo | null {
  if (!prefix) return null;
  const matches = todos.filter((t) => t.id.startsWith(prefix));
  return matches.length === 1 ? matches[0] : null;
}

/** Highlight matched indices inside a label. */
function highlight(label: string, indices: number[]): ReactNode {
  if (!indices || indices.length === 0) return label;
  const set = new Set(indices);
  const out: ReactNode[] = [];
  for (let i = 0; i < label.length; i++) {
    if (set.has(i)) {
      out.push(
        <mark
          key={i}
          style={{ background: "transparent", color: "inherit", fontWeight: 600 }}
        >
          {label[i]}
        </mark>,
      );
    } else {
      out.push(label[i]);
    }
  }
  return <>{out}</>;
}

// ── nav ────────────────────────────────────────────────────────────────────

const NAV_TARGETS: { name: string; path: string; icon: ReactNode }[] = [
  { name: "overview", path: "/", icon: <HomeRegular /> },
  { name: "tasks", path: "/tasks", icon: <CheckmarkCircleRegular /> },
  { name: "apps", path: "/apps", icon: <AppsRegular /> },
  { name: "bridge", path: "/bridge", icon: <BranchForkRegular /> },
  { name: "permissions", path: "/permissions", icon: <ShieldRegular /> },
  { name: "console", path: "/console", icon: <WindowConsoleRegular /> },
];

// ── nextbridge helpers ─────────────────────────────────────────────────────

type NbInstanceLite = { id: string; name: string };

async function getFirstNbInstance(teamId: string): Promise<NbInstanceLite | null> {
  const r = await fetch(
    `/api/nextbridge/instances?teamId=${encodeURIComponent(teamId)}`,
  );
  if (!r.ok) return null;
  const body = (await r.json()) as { instances: NbInstanceLite[] };
  return body.instances[0] ?? null;
}

async function nbRpc<T>(
  teamId: string,
  instanceId: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const r = await fetch(
      `/api/nextbridge/instances/${encodeURIComponent(
        instanceId,
      )}/rpc?teamId=${encodeURIComponent(teamId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, params }),
      },
    );
    const body = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: T;
      error?: string;
    };
    if (!r.ok) return { ok: false, error: body.error ?? `HTTP ${r.status}` };
    return { ok: body.ok ?? false, data: body.data, error: body.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── commands ───────────────────────────────────────────────────────────────

export const commands: Command[] = [
  {
    id: "help",
    name: "help",
    aliases: ["?"],
    summary: "Show available commands and prefixes",
    run: (ctx) => {
      ctx.print({ kind: "node", node: <HelpOutput commands={commands} /> });
    },
  },

  {
    id: "nav.go",
    name: "go",
    aliases: ["nav"],
    summary: "Navigate to a Workbench page",
    args: [{ name: "target", hint: "<page>", kind: { kind: "navTarget" } }],
    suggest: (_ctx, _spec, token) => {
      const ranked = fuzzySort(NAV_TARGETS, token, (t) => t.name);
      return ranked.map(
        ({ item, match }): SuggestionItem => ({
          id: `nav-${item.name}`,
          label: highlight(item.name, match.indices),
          icon: item.icon,
          category: "nav",
          insertText: `go ${item.name}`,
        }),
      );
    },
    run: (ctx, args) => {
      const target = NAV_TARGETS.find((t) => t.name === args.target);
      if (!target) {
        ctx.println(`Unknown target: ${args.target}`, "error");
        return;
      }
      ctx.navigate(target.path);
      ctx.println(`→ ${target.name}`, "muted");
    },
  },

  // ── apps ─────────────────────────────────────────────────────────────────
  {
    id: "apps.list",
    name: "apps",
    aliases: ["apps list"],
    summary: "List apps in this team",
    run: async (ctx) => {
      await refreshApps(ctx.teamId);
      const list = getCachedApps(ctx.teamId);
      if (list.length === 0) {
        ctx.println("No apps yet.", "muted");
        return;
      }
      ctx.print({
        kind: "table",
        columns: ["Name", "URL", "Tags"],
        rows: list.map((a) => [
          <AppLink key={`${a.id}-name`} app={a} />,
          <span key={`${a.id}-url`} style={{ color: "var(--colorNeutralForeground3)" }}>{a.url}</span>,
          <span key={`${a.id}-tags`}>{a.tags.join(", ") || "—"}</span>,
        ]),
      });
    },
  },
  {
    id: "apps.open",
    name: "apps open",
    summary: "Open an app by name (fuzzy)",
    args: [
      { name: "name", hint: "<app name>", kind: { kind: "appName" }, rest: true },
    ],
    suggest: (ctx, _spec, token) => {
      const list = getCachedApps(ctx.teamId);
      const ranked = fuzzySort(list, token, (a) => a.name);
      return ranked.slice(0, 12).map(
        ({ item, match }): SuggestionItem => ({
          id: item.id,
          label: highlight(item.name, match.indices),
          hint: item.url,
          category: "app",
          insertText: `apps open ${item.name}`,
        }),
      );
    },
    run: (ctx, args) => {
      const list = getCachedApps(ctx.teamId);
      const exact = list.find(
        (a) => a.name.toLowerCase() === args.name.toLowerCase(),
      );
      const ranked = fuzzySort(list, args.name, (a) => a.name);
      const found = exact ?? ranked[0]?.item;
      if (!found) {
        ctx.println(`No app matches "${args.name}".`, "error");
        return;
      }
      window.open(found.url, "_blank", "noopener,noreferrer");
      ctx.println(`opened ${found.name}`, "success");
    },
  },

  // ── todos ────────────────────────────────────────────────────────────────
  {
    id: "todos.list",
    name: "todos",
    aliases: ["todos list"],
    summary: "List todos in the active set",
    run: async (ctx) => {
      await refreshSets(ctx.teamId);
      const set = resolveActiveSetSync(ctx.teamId);
      if (!set) {
        ctx.println("No sets in this team. Create one in the Tasks page.", "muted");
        return;
      }
      await refreshTodos(ctx.teamId, set.id);
      const todos = getCachedTodos(ctx.teamId, set.id);
      ctx.println(`in: ${set.name}`, "muted");
      if (todos.length === 0) {
        ctx.println(`(empty — use /sets switch to pick another set)`, "muted");
        return;
      }
      ctx.print({
        kind: "table",
        columns: ["", "ID", "Title", "Claimed by"],
        rows: todos.map((t) => [
          t.completed ? <CheckmarkCircleRegular /> : <CircleRegular />,
          <code key={`${t.id}-id`} style={{ fontSize: 12 }}>{shortId(t.id)}</code>,
          <span
            key={`${t.id}-title`}
            style={t.completed ? { textDecoration: "line-through" } : undefined}
          >
            {t.title}
          </span>,
          t.claimedByName ?? "—",
        ]),
      });
    },
  },
  {
    id: "todos.in",
    name: "todos in",
    summary: "List todos in a specific set without changing the active set",
    args: [
      { name: "set", hint: "<set name>", kind: { kind: "setName" }, rest: true },
    ],
    suggest: (ctx, _spec, token) => {
      const sets = getCachedSets(ctx.teamId);
      const ranked = fuzzySort(sets, token, (s) => s.name);
      return ranked.slice(0, 12).map(
        ({ item, match }): SuggestionItem => ({
          id: item.id,
          label: highlight(item.name, match.indices),
          hint: `${item.pending} pending, ${item.completed} done`,
          category: "set",
          insertText: `todos in ${item.name}`,
        }),
      );
    },
    run: async (ctx, args) => {
      await refreshSets(ctx.teamId);
      const sets = getCachedSets(ctx.teamId);
      const exact = sets.find(
        (s) => s.name.toLowerCase() === args.set.toLowerCase(),
      );
      const ranked = fuzzySort(sets, args.set, (s) => s.name);
      const target = exact ?? ranked[0]?.item;
      if (!target) {
        ctx.println(`No set matches "${args.set}".`, "error");
        return;
      }
      await refreshTodos(ctx.teamId, target.id);
      const todos = getCachedTodos(ctx.teamId, target.id);
      ctx.println(`peek: ${target.name}`, "muted");
      if (todos.length === 0) {
        ctx.println("(empty)", "muted");
        return;
      }
      ctx.print({
        kind: "table",
        columns: ["", "ID", "Title", "Claimed by"],
        rows: todos.map((t) => [
          t.completed ? <CheckmarkCircleRegular /> : <CircleRegular />,
          <code key={`${t.id}-id`} style={{ fontSize: 12 }}>{shortId(t.id)}</code>,
          <span
            key={`${t.id}-title`}
            style={t.completed ? { textDecoration: "line-through" } : undefined}
          >
            {t.title}
          </span>,
          t.claimedByName ?? "—",
        ]),
      });
    },
  },
  {
    id: "todos.create",
    name: "todos create",
    aliases: ["todos new"],
    summary: "Create a todo in the active set",
    args: [
      { name: "title", hint: "<title>", kind: { kind: "text" }, rest: true },
    ],
    run: async (ctx, args) => {
      const set = resolveActiveSetSync(ctx.teamId);
      if (!set) {
        ctx.println("No active set.", "error");
        return;
      }
      const r = await fetch(
        `/api/glint/teams/${ctx.teamId}/sets/${set.id}/todos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: args.title }),
        },
      );
      if (!r.ok) {
        ctx.println(`Failed: ${r.status}`, "error");
        return;
      }
      const data = (await r.json()) as { todo: { id: string } };
      ctx.println(`✓ created ${shortId(data.todo.id)}`, "success");
      void refreshTodos(ctx.teamId, set.id);
    },
  },
  {
    id: "todos.claim",
    name: "todos claim",
    summary: "Claim a todo (or release if you already own it)",
    args: [
      { name: "id", hint: "Claim a todo… (id prefix or fuzzy title)", kind: { kind: "todoId" } },
    ],
    suggest: (ctx, _spec, token) => {
      const set = resolveActiveSetSync(ctx.teamId);
      if (!set) return [];
      const todos = getCachedTodos(ctx.teamId, set.id);
      // Match either id-prefix OR fuzzy on title.
      const ranked = todos
        .map((t) => {
          const idMatch = t.id.startsWith(token)
            ? { score: 1000, indices: [] }
            : { score: -1, indices: [] };
          const titleMatch = fuzzyScore(t.title, token);
          const best =
            idMatch.score > titleMatch.score ? idMatch : titleMatch;
          return { item: t, match: best };
        })
        .filter((x) => x.match.score >= 0);
      ranked.sort((a, b) => b.match.score - a.match.score);
      return ranked.slice(0, 12).map(
        ({ item }): SuggestionItem => ({
          id: item.id,
          label: shortId(item.id),
          hint: item.title,
          category: "todo",
          insertText: `todos claim ${shortId(item.id)}`,
        }),
      );
    },
    run: async (ctx, args) => {
      const set = resolveActiveSetSync(ctx.teamId);
      if (!set) return;
      const todos = getCachedTodos(ctx.teamId, set.id);
      const hit = findTodoByPrefix(todos, args.id);
      if (!hit) {
        ctx.println(`No unique match for "${args.id}".`, "error");
        return;
      }
      const r = await fetch(
        `/api/glint/teams/${ctx.teamId}/todos/${hit.id}/claim`,
        { method: "POST" },
      );
      if (!r.ok) {
        ctx.println(`Failed: ${r.status}`, "error");
        return;
      }
      const data = (await r.json()) as { claimedBy: string | null };
      ctx.println(
        data.claimedBy ? `✓ claimed ${hit.title}` : `✓ released ${hit.title}`,
        "success",
      );
      void refreshTodos(ctx.teamId, set.id);
    },
  },
  {
    id: "todos.complete",
    name: "todos complete",
    aliases: ["todos done"],
    summary: "Toggle a todo's completion",
    args: [
      { name: "id", hint: "Complete a todo… (id prefix or fuzzy title)", kind: { kind: "todoId" } },
    ],
    suggest: (ctx, _spec, token) => {
      const set = resolveActiveSetSync(ctx.teamId);
      if (!set) return [];
      const todos = getCachedTodos(ctx.teamId, set.id);
      const ranked = todos
        .map((t) => {
          const idMatch = t.id.startsWith(token)
            ? { score: 1000, indices: [] }
            : { score: -1, indices: [] };
          const titleMatch = fuzzyScore(t.title, token);
          const best =
            idMatch.score > titleMatch.score ? idMatch : titleMatch;
          return { item: t, match: best };
        })
        .filter((x) => x.match.score >= 0);
      ranked.sort((a, b) => b.match.score - a.match.score);
      return ranked.slice(0, 12).map(
        ({ item }): SuggestionItem => ({
          id: item.id,
          label: shortId(item.id),
          hint: item.title,
          category: "todo",
          insertText: `todos complete ${shortId(item.id)}`,
        }),
      );
    },
    run: async (ctx, args) => {
      const set = resolveActiveSetSync(ctx.teamId);
      if (!set) return;
      const todos = getCachedTodos(ctx.teamId, set.id);
      const hit = findTodoByPrefix(todos, args.id);
      if (!hit) {
        ctx.println(`No unique match for "${args.id}".`, "error");
        return;
      }
      const next = !hit.completed;
      const r = await fetch(
        `/api/glint/teams/${ctx.teamId}/todos/${hit.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: next }),
        },
      );
      if (!r.ok) {
        ctx.println(`Failed: ${r.status}`, "error");
        return;
      }
      ctx.println(
        next ? `✓ completed ${hit.title}` : `✓ reopened ${hit.title}`,
        "success",
      );
      void refreshTodos(ctx.teamId, set.id);
    },
  },

  // ── sets ─────────────────────────────────────────────────────────────────
  {
    id: "sets.list",
    name: "sets",
    aliases: ["sets list"],
    summary: "List todo sets (current marked with *)",
    run: async (ctx) => {
      await refreshSets(ctx.teamId);
      const sets = getCachedSets(ctx.teamId);
      if (sets.length === 0) {
        ctx.println("No sets yet.", "muted");
        return;
      }
      const active = getActiveSetId();
      ctx.print({
        kind: "table",
        columns: ["", "Name", "Pending", "Done"],
        rows: sets.map((s) => [
          <span
            key={`${s.id}-marker`}
            style={
              s.id === active
                ? { color: "var(--colorBrandForeground1)", fontWeight: 600 }
                : undefined
            }
          >
            {s.id === active ? "*" : " "}
          </span>,
          <span
            key={`${s.id}-name`}
            style={
              s.id === active
                ? { color: "var(--colorBrandForeground1)", fontWeight: 600 }
                : undefined
            }
          >
            {s.name}
          </span>,
          String(s.pending),
          String(s.completed),
        ]),
      });
    },
  },
  {
    id: "sets.current",
    name: "sets current",
    aliases: ["sets where", "where"],
    summary: "Show which set /todos commands operate on",
    run: async (ctx) => {
      await refreshSets(ctx.teamId);
      const set = resolveActiveSetSync(ctx.teamId);
      if (!set) {
        ctx.println("No sets in this team yet.", "muted");
        return;
      }
      ctx.println(`current set: ${set.name}`, "default");
    },
  },
  {
    id: "sets.switch",
    name: "sets switch",
    aliases: ["sets use"],
    summary: "Set the active set for subsequent todos commands",
    args: [
      { name: "name", hint: "<set name>", kind: { kind: "setName" }, rest: true },
    ],
    suggest: (ctx, _spec, token) => {
      const sets = getCachedSets(ctx.teamId);
      const ranked = fuzzySort(sets, token, (s) => s.name);
      return ranked.slice(0, 12).map(
        ({ item, match }): SuggestionItem => ({
          id: item.id,
          label: highlight(item.name, match.indices),
          hint: `${item.pending} pending, ${item.completed} done`,
          category: "set",
          insertText: `sets switch ${item.name}`,
        }),
      );
    },
    run: (ctx, args) => {
      const sets = getCachedSets(ctx.teamId);
      const exact = sets.find(
        (s) => s.name.toLowerCase() === args.name.toLowerCase(),
      );
      const ranked = fuzzySort(sets, args.name, (s) => s.name);
      const hit = exact ?? ranked[0]?.item;
      if (!hit) {
        ctx.println(`No set matches "${args.name}".`, "error");
        return;
      }
      setActiveSetId(hit.id);
      ctx.println(`active set → ${hit.name}`, "success");
    },
  },

  // ── bridge (NextBridge) ──────────────────────────────────────────────────
  {
    id: "bridge.status",
    name: "bridge",
    aliases: ["bridge status"],
    summary: "Show NextBridge connection status",
    run: async (ctx) => {
      const inst = await getFirstNbInstance(ctx.teamId);
      if (!inst) {
        ctx.println("No NextBridge paired in this team.", "muted");
        return;
      }
      const statusR = await fetch(
        `/api/nextbridge/instances/${encodeURIComponent(
          inst.id,
        )}/status?teamId=${encodeURIComponent(ctx.teamId)}`,
      );
      if (!statusR.ok) {
        ctx.println(`Failed: HTTP ${statusR.status}`, "error");
        return;
      }
      const s = (await statusR.json()) as {
        connected: boolean;
        meta: { version?: string; command_prefix?: string };
        event_buffer: number;
      };
      ctx.println(
        `${inst.name}: ${s.connected ? "connected" : "disconnected"}`,
        s.connected ? "success" : "error",
      );
      ctx.println(
        `  version=${s.meta.version ?? "—"}  prefix=/${s.meta.command_prefix ?? "—"}  events=${s.event_buffer}`,
        "muted",
      );
    },
  },
  {
    id: "bridge.drivers",
    name: "bridge drivers",
    summary: "List platform drivers registered with the bridge",
    run: async (ctx) => {
      const inst = await getFirstNbInstance(ctx.teamId);
      if (!inst) {
        ctx.println("No NextBridge paired in this team.", "muted");
        return;
      }
      const r = await nbRpc<{
        drivers: Array<{ instance_id: string; platform: string | null }>;
      }>(ctx.teamId, inst.id, "drivers.list");
      if (!r.ok) {
        ctx.println(`Failed: ${r.error ?? "unknown"}`, "error");
        return;
      }
      const drivers = r.data?.drivers ?? [];
      if (drivers.length === 0) {
        ctx.println("No drivers connected.", "muted");
        return;
      }
      ctx.print({
        kind: "table",
        columns: ["Instance", "Platform"],
        rows: drivers.map((d) => [
          <code key={`${d.instance_id}-i`} style={{ fontSize: 12 }}>{d.instance_id}</code>,
          <span key={`${d.instance_id}-p`}>{d.platform ?? "—"}</span>,
        ]),
      });
    },
  },
  {
    id: "bridge.rules",
    name: "bridge rules",
    summary: "List bridging rules loaded on NextBridge",
    run: async (ctx) => {
      const inst = await getFirstNbInstance(ctx.teamId);
      if (!inst) {
        ctx.println("No NextBridge paired in this team.", "muted");
        return;
      }
      const r = await nbRpc<{ rules: Array<Record<string, unknown>> }>(
        ctx.teamId,
        inst.id,
        "rules.list",
      );
      if (!r.ok) {
        ctx.println(`Failed: ${r.error ?? "unknown"}`, "error");
        return;
      }
      const rules = r.data?.rules ?? [];
      if (rules.length === 0) {
        ctx.println("No rules loaded.", "muted");
        return;
      }
      ctx.print({
        kind: "table",
        columns: ["ID", "Type", "Summary"],
        rows: rules.map((rl, i) => [
          <code key={`r-${i}-id`} style={{ fontSize: 12 }}>{String(rl.id ?? "")}</code>,
          <span key={`r-${i}-t`}>{String(rl.type ?? "forward")}</span>,
          <span key={`r-${i}-s`} style={{ fontFamily: "monospace", fontSize: 12 }}>
            {summarizeBridgeRule(rl)}
          </span>,
        ]),
      });
    },
  },
  {
    id: "bridge.reload",
    name: "bridge reload",
    summary: "Reload bridging rules from the NextBridge config file",
    run: async (ctx) => {
      const inst = await getFirstNbInstance(ctx.teamId);
      if (!inst) {
        ctx.println("No NextBridge paired in this team.", "muted");
        return;
      }
      const r = await nbRpc<{ before: number; after: number }>(
        ctx.teamId,
        inst.id,
        "rules.reload",
      );
      if (!r.ok) {
        ctx.println(`Failed: ${r.error ?? "unknown"}`, "error");
        return;
      }
      ctx.println(
        `✓ rules reloaded: ${r.data?.before ?? 0} → ${r.data?.after ?? 0}`,
        "success",
      );
    },
  },
];

function summarizeBridgeRule(rule: Record<string, unknown>): string {
  if (rule.type === "connect") {
    const channels = (rule.channels ?? {}) as Record<string, unknown>;
    return `connect: ${Object.keys(channels).join(", ")}`;
  }
  const from = (rule.from ?? {}) as Record<string, unknown>;
  const to = (rule.to ?? {}) as Record<string, unknown>;
  return `${Object.keys(from).join(",") || "?"} → ${Object.keys(to).join(",") || "?"}`;
}

// ── help renderer ──────────────────────────────────────────────────────────

function HelpOutput({ commands }: { commands: Command[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ opacity: 0.7 }}>
        Type to fuzzy-launch an app by name, or use a prefix:
      </div>
      <div style={{ paddingLeft: 12, fontFamily: "monospace", fontSize: 12 }}>
        <div><code>/cmd</code>{"   "}run a command (see list below)</div>
        <div><code>?</code>{"      "}help (this)</div>
        <div><code>#tag</code>{"   "}filter apps by tag</div>
        <div><code>!group</code>{" "}filter apps by personal group</div>
        <div><code>@name</code>{"  "}filter apps by name</div>
        <div><code>:domain</code>{" "}filter apps by URL domain</div>
      </div>
      <div style={{ marginTop: 4, opacity: 0.7 }}>Commands (prefix with /):</div>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {commands.map((c) => (
            <tr key={c.id}>
              <td style={{ fontFamily: "monospace", paddingRight: 16, verticalAlign: "top" }}>
                /{c.name}
                {c.args
                  ?.map((a) => ` ${a.optional ? "[" + a.hint + "]" : a.hint}`)
                  .join("")}
              </td>
              <td style={{ opacity: 0.85 }}>{c.summary}</td>
            </tr>
          ))}
          <tr><td style={{ fontFamily: "monospace", paddingRight: 16 }}>/clear</td><td style={{ opacity: 0.85 }}>Clear the scrollback</td></tr>
          <tr><td style={{ fontFamily: "monospace", paddingRight: 16 }}>/history</td><td style={{ opacity: 0.85 }}>Show recent commands</td></tr>
        </tbody>
      </table>
    </div>
  );
}

// Defence-in-depth on top of the worker-side check in routes/apps.ts:
// any legacy KV row created before that landed could still hold a non-
// http(s) URL (`javascript:`, `data:`, etc.). Refusing to render such
// URLs as a link prevents a stored XSS from one rogue owner taking over
// a team member's session via click.
const SAFE_LINK_RE = /^https?:\/\//i;
function isSafeAppHref(url: string): boolean {
  return typeof url === "string" && SAFE_LINK_RE.test(url);
}

function AppLink({ app }: { app: AppCard }) {
  if (!isSafeAppHref(app.url)) {
    return (
      <span
        style={{ color: "var(--colorNeutralForeground3)" }}
        title={app.url}
      >
        {app.name} (unsafe URL)
      </span>
    );
  }
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noreferrer"
      style={{ color: "var(--colorBrandForeground1)" }}
    >
      {app.name}
    </a>
  );
}
