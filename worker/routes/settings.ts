import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireAuth } from "../auth";
import { getAppConfig, setAppConfig } from "../config";
import { checkOutboundUrl } from "../urlSafety";

const settings = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Who is allowed to read / write global Workbench settings.
 *
 * If `WORKBENCH_ADMIN_TEAM_ID` env var is set, the user must be an
 * owner or co-owner of THAT specific team. This is the recommended
 * production configuration — it prevents one team's owners from
 * tampering with global settings that affect every other team.
 *
 * If the env var is empty / unset, falls back to the looser "any
 * team owner/co-owner" rule. This keeps initial bootstrap painless
 * (admins can finish setting Glint URL etc before they have to
 * configure the admin-team binding) but logs a warning so the
 * operator notices.
 */
function canManageSettings(
  session: import("../types").SessionData,
  env: Bindings,
): boolean {
  const adminTeamId = env.WORKBENCH_ADMIN_TEAM_ID?.trim();
  if (adminTeamId) {
    const role = session.teams.find((t) => t.id === adminTeamId)?.role;
    return role === "owner" || role === "co-owner";
  }
  // Fallback path — warn loudly so operators don't miss it.
  console.warn(
    "WORKBENCH_ADMIN_TEAM_ID is not set; falling back to 'any team " +
      "owner/co-owner' for /api/settings. Set the env var to lock " +
      "global config to a single admin team.",
  );
  return session.teams.some((t) => t.role === "owner" || t.role === "co-owner");
}

settings.get("/api/settings", requireAuth, async (c) => {
  // Reading is gated to the same role that can write — these values
  // include the Prism redirect URI and Glint URL which, while not
  // catastrophic to leak, are deployment-fingerprint material that
  // shouldn't be visible to every team member. The frontend Settings
  // page hides itself behind the same gate.
  const session = c.get("session");
  if (!canManageSettings(session, c.env)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const config = await getAppConfig(c.env.KV, c.env);
  return c.json({
    prism_base_url: config.prism_base_url,
    prism_client_id: config.prism_client_id,
    prism_client_secret: config.prism_client_secret ? "••••••••" : "",
    prism_redirect_uri: config.prism_redirect_uri,
    glint_base_url: config.glint_base_url,
    glint_client_id: config.glint_client_id,
    use_pkce: config.use_pkce,
    session_ttl: config.session_ttl,
  });
});

settings.put("/api/settings", requireAuth, async (c) => {
  const session = c.get("session");
  if (!canManageSettings(session, c.env)) {
    return c.json({ error: "Only team owners and co-owners can change settings" }, 403);
  }

  const body = await c.req.json<{
    prism_base_url?: string;
    prism_client_id?: string;
    prism_client_secret?: string;
    prism_redirect_uri?: string;
    glint_base_url?: string;
    glint_client_id?: string;
    session_ttl?: number;
  }>();

  // SSRF / scheme validation for every URL field the caller touches.
  for (const [name, val] of [
    ["prism_base_url", body.prism_base_url],
    ["prism_redirect_uri", body.prism_redirect_uri],
    ["glint_base_url", body.glint_base_url],
  ] as const) {
    if (val === undefined || val.trim() === "") continue;
    const r = checkOutboundUrl(val.trim());
    if (!r.ok) {
      return c.json({ error: `${name}: ${r.reason}` }, 400);
    }
  }

  const patch: Parameters<typeof setAppConfig>[1] = {};
  if (body.prism_base_url !== undefined) patch.prism_base_url = body.prism_base_url.trim();
  if (body.prism_client_id !== undefined) patch.prism_client_id = body.prism_client_id.trim();
  if (body.prism_redirect_uri !== undefined) patch.prism_redirect_uri = body.prism_redirect_uri.trim();
  if (body.glint_base_url !== undefined) patch.glint_base_url = body.glint_base_url.trim();
  if (body.glint_client_id !== undefined) patch.glint_client_id = body.glint_client_id.trim();
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
