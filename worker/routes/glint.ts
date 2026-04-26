import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireAuth } from "../auth";
import { resolveGlintUrl, getTeamConfig } from "../config";

const glintProxy = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Proxy all /api/glint/* requests to the Glint instance configured for the
 * team referenced in the path, falling back to the global Glint URL.
 *
 * Path rewrite: /api/glint/foo/bar → {glint_base_url}/api/foo/bar
 *
 * Special handling:
 *  - WebSocket upgrades (Upgrade: websocket) are passed through with the
 *    upstream Response returned as-is so Cloudflare can complete the upgrade.
 *  - SSE responses (Content-Type: text/event-stream) are streamed without
 *    buffering, otherwise events would be held until the upstream closed.
 */
glintProxy.all("/api/glint/*", requireAuth, async (c) => {
  const session = c.get("session");
  const glintPath = c.req.path.replace(/^\/api\/glint/, "/api");

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

  const glintTeamId = teamConfig?.glint_team_id?.trim();
  const resolvedPath =
    glintTeamId && teamId
      ? glintPath.replace(`/teams/${teamId}`, `/teams/${glintTeamId}`)
      : glintPath;

  const reqUrl = new URL(c.req.url);
  const targetUrl = `${glintBaseUrl}${resolvedPath}${reqUrl.search}`;

  const isUpgrade =
    c.req.header("Upgrade")?.toLowerCase() === "websocket";

  // Build upstream headers — preserve client headers but inject our Bearer token.
  const headers = new Headers();
  const incoming = c.req.raw.headers;
  incoming.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (
      lk === "host" ||
      lk === "authorization" ||
      lk === "cookie" ||
      lk === "content-length"
    ) {
      return;
    }
    headers.set(key, value);
  });
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  const method = c.req.method;
  if (
    !isUpgrade &&
    ["POST", "PATCH", "PUT"].includes(method) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const init: RequestInit = { method, headers };
  if (isUpgrade) {
    // For WS upgrades, forward the raw request body / signal so the upgrade
    // headers are preserved end-to-end.
    init.body = c.req.raw.body;
  } else if (["POST", "PATCH", "PUT"].includes(method)) {
    init.body = await c.req.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (e) {
    return c.json(
      {
        error: `Glint unreachable: ${e instanceof Error ? e.message : String(e)}`,
      },
      502,
    );
  }

  const upstreamCT = upstream.headers.get("Content-Type") ?? "";

  // 101 (WS upgrade) and SSE streams must be returned without buffering.
  if (
    upstream.status === 101 ||
    upstreamCT.includes("text/event-stream")
  ) {
    return upstream;
  }

  const body = await upstream.text();

  console.log(
    `[glint-proxy] ${method} ${targetUrl} -> ${upstream.status} ${upstreamCT} body=${body.slice(0, 300)}`,
  );

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
