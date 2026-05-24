import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireAuth } from "../auth";
import { getTeamConfig, setTeamConfig } from "../config";
import { checkOutboundUrl } from "../urlSafety";

const teamSettings = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function getTeamRole(session: import("../types").SessionData, teamId: string) {
  return session.teams.find((t) => t.id === teamId)?.role ?? null;
}

teamSettings.get("/api/teams/:teamId/settings", requireAuth, async (c) => {
  const teamId = c.req.param("teamId");
  const session = c.get("session");
  if (!getTeamRole(session, teamId)) {
    return c.json({ error: "Not a member of this team" }, 403);
  }
  const config = await getTeamConfig(c.env.KV, teamId);
  return c.json(config);
});

teamSettings.put("/api/teams/:teamId/settings", requireAuth, async (c) => {
  const teamId = c.req.param("teamId");
  const session = c.get("session");
  const role = getTeamRole(session, teamId);
  if (!role) return c.json({ error: "Not a member of this team" }, 403);
  if (role !== "owner" && role !== "co-owner") {
    return c.json({ error: "Only team owners and co-owners can change team settings" }, 403);
  }

  const body = await c.req.json<{ glint_base_url?: string }>();
  const patch: { glint_base_url?: string } = {};
  if (body.glint_base_url !== undefined) {
    const trimmed = body.glint_base_url.trim();
    if (trimmed) {
      // SSRF: per-team Glint URL becomes an outbound fetch target in the
      // glint proxy. Block private hostnames so a team owner can't steer
      // the Worker at internal infra.
      const r = checkOutboundUrl(trimmed);
      if (!r.ok) {
        return c.json({ error: `glint_base_url: ${r.reason}` }, 400);
      }
    }
    patch.glint_base_url = trimmed;
  }

  const updated = await setTeamConfig(c.env.KV, teamId, patch);
  return c.json(updated);
});

export default teamSettings;
