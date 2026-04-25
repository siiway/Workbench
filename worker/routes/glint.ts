import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireAuth } from "../auth";
import { resolveGlintUrl, getTeamConfig } from "../config";

const glintProxy = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Proxy all /api/glint/* requests to the Glint instance configured for the
 * team referenced in the path, falling back to the global Glint URL.
 *
 * Path rewrite: /api/glint/foo/bar → {glint_base_url}/foo/bar
 *
 * Team resolution: extracts teamId from paths like:
 *   /api/glint/workbench/teams/:teamId/...
 *   /api/glint/teams/:teamId/...
 */
glintProxy.all("/api/glint/*", requireAuth, async (c) => {
  const session = c.get("session");
  const glintPath = c.req.path.replace(/^\/api\/glint/, "/api");

  // Extract teamId from the path to resolve the correct Glint instance
  const teamIdMatch = glintPath.match(/\/teams\/([^/]+)/);
  const teamId = teamIdMatch?.[1] ?? "";

  const [glintBaseUrl, teamConfig] = await Promise.all([
    resolveGlintUrl(c.env.KV, teamId, c.env),
    teamId ? getTeamConfig(c.env.KV, teamId) : Promise.resolve(null),
  ]);

  if (!glintBaseUrl) {
    const msg = teamId
      ? `No Glint URL configured for team "${teamId}" and no global default set.`
      : "No Glint URL configured.";
    return c.json({ error: msg }, 503);
  }

  // Replace the Workbench teamId with the Glint-side workbench_id when configured
  const glintTeamId = teamConfig?.glint_team_id?.trim();
  const resolvedPath = glintTeamId && teamId
    ? glintPath.replace(`/teams/${teamId}`, `/teams/${glintTeamId}`)
    : glintPath;

  const reqUrl = new URL(c.req.url);
  const targetUrl = `${glintBaseUrl}${resolvedPath}${reqUrl.search}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };

  const init: RequestInit = { method: c.req.method, headers };
  if (["POST", "PATCH", "PUT"].includes(c.req.method)) {
    init.body = await c.req.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (e) {
    return c.json({ error: `Glint unreachable: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
  const body = await upstream.text();
  const upstreamCT = upstream.headers.get("Content-Type") ?? "";

  console.log(
    `[glint-proxy] ${c.req.method} ${targetUrl} -> ${upstream.status} ${upstreamCT} body=${body.slice(0, 300)}`,
  );

  // If upstream returned a non-JSON error (e.g. plain text "Internal Server Error"),
  // wrap it in a JSON envelope so the frontend can display the body, status, and target.
  if (!upstreamCT.includes("application/json") && upstream.status >= 400) {
    return c.json(
      {
        error: `Upstream ${upstream.status}`,
        upstreamStatus: upstream.status,
        upstreamContentType: upstreamCT || null,
        upstreamBody: body,
        target: targetUrl,
      },
      upstream.status as never,
    );
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstreamCT || "application/json",
    },
  });
});

export default glintProxy;
