/**
 * Tiny in-memory data cache for the console. Keeps the most recently fetched
 * apps / sets / todos around so command suggesters can read them
 * SYNCHRONOUSLY — no fetch on every keystroke, no flicker, no race.
 *
 * Stale-while-revalidate pattern: getters return whatever is cached (possibly
 * empty); refreshers re-fetch in the background and notify subscribers when
 * fresh data lands so the UI re-renders.
 */

import type { AppCard, TodoSet } from "../types";

export type ApiTodo = {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  completed: boolean;
  sortOrder: number;
  commentCount: number;
  claimedBy: string | null;
  claimedByName: string | null;
};

type AppsEntry = { data: AppCard[]; ts: number };
type SetsEntry = { data: TodoSet[]; ts: number };
type TodosEntry = { data: ApiTodo[]; ts: number };

const apps = new Map<string, AppsEntry>();
const sets = new Map<string, SetsEntry>();
const todos = new Map<string, TodosEntry>(); // key: `${teamId}:${setId}`

const subscribers = new Set<() => void>();
function notify() {
  for (const fn of subscribers) fn();
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// ── apps ───────────────────────────────────────────────────────────────────

export function getCachedApps(teamId: string): AppCard[] {
  return apps.get(teamId)?.data ?? [];
}

export async function refreshApps(teamId: string): Promise<void> {
  try {
    const r = await fetch(`/api/teams/${teamId}/apps`);
    if (!r.ok) return;
    const d = (await r.json()) as { apps: AppCard[] };
    apps.set(teamId, { data: d.apps ?? [], ts: Date.now() });
    notify();
  } catch {
    /* swallow */
  }
}

// ── sets ───────────────────────────────────────────────────────────────────

export function getCachedSets(teamId: string): TodoSet[] {
  return sets.get(teamId)?.data ?? [];
}

export async function refreshSets(teamId: string): Promise<void> {
  try {
    const r = await fetch(`/api/glint/teams/${teamId}/sets`);
    if (!r.ok) return;
    const d = (await r.json()) as { sets: TodoSet[] };
    sets.set(teamId, { data: d.sets ?? [], ts: Date.now() });
    notify();
  } catch {
    /* swallow */
  }
}

// ── todos (per set) ────────────────────────────────────────────────────────

const tk = (teamId: string, setId: string) => `${teamId}:${setId}`;

export function getCachedTodos(teamId: string, setId: string): ApiTodo[] {
  return todos.get(tk(teamId, setId))?.data ?? [];
}

export async function refreshTodos(
  teamId: string,
  setId: string,
): Promise<void> {
  try {
    const r = await fetch(`/api/glint/teams/${teamId}/sets/${setId}/todos`);
    if (!r.ok) return;
    const d = (await r.json()) as { todos: ApiTodo[] };
    todos.set(tk(teamId, setId), { data: d.todos ?? [], ts: Date.now() });
    notify();
  } catch {
    /* swallow */
  }
}

/** Refresh everything we know about a team — used on mount and after writes. */
export async function refreshAll(teamId: string): Promise<void> {
  await Promise.all([refreshApps(teamId), refreshSets(teamId)]);
  // Also refresh todos for any cached set so claim/complete suggestions stay live.
  const knownSets = sets.get(teamId)?.data ?? [];
  if (knownSets.length > 0) {
    await Promise.all(knownSets.map((s) => refreshTodos(teamId, s.id)));
  }
}
