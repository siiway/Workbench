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

keybinds.put("/api/user/keybinds", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ bindings?: Record<string, string> }>();
  const bindings: Record<string, string> = {};
  if (body.bindings && typeof body.bindings === "object") {
    for (const [k, v] of Object.entries(body.bindings)) {
      if (typeof k !== "string" || typeof v !== "string") continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      bindings[k] = trimmed;
    }
  }
  await c.env.KV.put(KEY(session.userId), JSON.stringify(bindings));
  return c.json({ bindings });
});

export default keybinds;
