/**
 * Per-user keybinds. Body shape: `{ [actionId]: string }` where the value
 * is the textual binding spec (e.g. "Ctrl+`" or "g o"). Unset actions fall
 * back to the frontend's compiled-in defaults.
 *
 * KV: keybinds:<userId>
 */

import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireAuth } from "../auth";

const keybinds = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const KEY = (userId: string) => `keybinds:${userId}`;

keybinds.get("/api/user/keybinds", requireAuth, async (c) => {
  const session = c.get("session");
  const raw = (await c.env.KV.get(KEY(session.userId), "json")) as
    | Record<string, string>
    | null;
  return c.json({ bindings: raw ?? {} });
});

// Bounds: a few dozen actionable shortcuts is realistic; nothing the UI
// can produce comes close to 64 entries × 64-char bindings. Cap both so
// a malicious client can't stuff KB-scale junk into KV under one user.
const KEYBINDS_MAX_ENTRIES = 64;
const KEYBIND_KEY_MAX_LEN = 64;
const KEYBIND_VALUE_MAX_LEN = 64;

keybinds.put("/api/user/keybinds", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ bindings?: Record<string, string> }>();
  const bindings: Record<string, string> = {};
  if (body.bindings && typeof body.bindings === "object") {
    let n = 0;
    for (const [k, v] of Object.entries(body.bindings)) {
      if (typeof k !== "string" || typeof v !== "string") continue;
      if (k.length === 0 || k.length > KEYBIND_KEY_MAX_LEN) continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      if (trimmed.length > KEYBIND_VALUE_MAX_LEN) continue;
      bindings[k] = trimmed;
      if (++n >= KEYBINDS_MAX_ENTRIES) break;
    }
  }
  await c.env.KV.put(KEY(session.userId), JSON.stringify(bindings));
  return c.json({ bindings });
});

export default keybinds;
