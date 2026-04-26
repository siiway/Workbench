import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireAuth } from "../auth";
import { getTeamConfig, setTeamConfig } from "../config";

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
  if (body.glint_base_url !== undefined) patch.glint_base_url = body.glint_base_url.trim();

  const updated = await setTeamConfig(c.env.KV, teamId, patch);
  return c.json(updated);
});

export default teamSettings;
