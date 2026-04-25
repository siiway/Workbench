import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireAuth } from "../auth";
import { getAppConfig, setAppConfig } from "../config";

const settings = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function canManageSettings(session: import("../types").SessionData): boolean {
  return session.teams.some((t) => t.role === "owner" || t.role === "co-owner");
}

settings.get("/api/settings", requireAuth, async (c) => {
  const config = await getAppConfig(c.env.KV, c.env);
  return c.json({
    prism_base_url: config.prism_base_url,
    prism_client_id: config.prism_client_id,
    prism_client_secret: config.prism_client_secret ? "••••••••" : "",
    prism_redirect_uri: config.prism_redirect_uri,
    glint_base_url: config.glint_base_url,
    use_pkce: config.use_pkce,
    session_ttl: config.session_ttl,
  });
});

settings.put("/api/settings", requireAuth, async (c) => {
  const session = c.get("session");
  if (!canManageSettings(session)) {
    return c.json({ error: "Only team owners and co-owners can change settings" }, 403);
  }

  const body = await c.req.json<{
    prism_base_url?: string;
    prism_client_id?: string;
    prism_client_secret?: string;
    prism_redirect_uri?: string;
    glint_base_url?: string;
    session_ttl?: number;
  }>();

  const patch: Parameters<typeof setAppConfig>[1] = {};
  if (body.prism_base_url !== undefined) patch.prism_base_url = body.prism_base_url.trim();
  if (body.prism_client_id !== undefined) patch.prism_client_id = body.prism_client_id.trim();
  if (body.prism_redirect_uri !== undefined) patch.prism_redirect_uri = body.prism_redirect_uri.trim();
  if (body.glint_base_url !== undefined) patch.glint_base_url = body.glint_base_url.trim();
  if (body.session_ttl !== undefined) patch.session_ttl = body.session_ttl;

  // Only overwrite the secret if a non-masked value is provided
  if (body.prism_client_secret !== undefined && body.prism_client_secret !== "••••••••") {
    patch.prism_client_secret = body.prism_client_secret;
    patch.use_pkce = !body.prism_client_secret.trim();
  }

  await setAppConfig(c.env.KV, patch);
  return c.json({ ok: true });
});

export default settings;
