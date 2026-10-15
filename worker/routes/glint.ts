import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireAuth } from "../auth";
import { resolveGlintUrl } from "../config";
import { checkOutboundUrl } from "../urlSafety";

const glintProxy = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Proxy all /api/glint/* requests to the Glint instance configured for the
 * team referenced in the path, falling back to the global Glint URL.
 *
 * Path rewrite: /api/glint/foo → {glint}/api/cross-app/foo
 *
 * Special handling:
 *  - WebSocket upgrades (Upgrade: websocket) are passed through with the
 *    upstream Response returned as-is so Cloudflare can complete the upgrade.
 *  - SSE responses (Content-Type: text/event-stream) are streamed without
 *    buffering, otherwise events would be held until the upstream closed.
 */
glintProxy.all("/api/glint/*", requireAuth, async (c) => {
  const session = c.get("session");
  const glintPath = c.req.path.replace(/^\/api\/glint/, "/api/cross-app");

  const teamIdMatch = glintPath.match(/\/teams\/([^/]+)/);
  let teamId = teamIdMatch?.[1] ?? "";
  if (teamId) {
    try {
      teamId = decodeURIComponent(teamId);
    } catch {
      return c.json({ error: "Invalid team id" }, 400);
    }
    if (!session.teams.some((team) => team.id === teamId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const glintBaseUrl = await resolveGlintUrl(c.env.KV, teamId, c.env);

  if (!glintBaseUrl) {
    const msg = teamId
      ? `No Glint URL configured for team "${teamId}" and no global default set.`
      : "No Glint URL configured.";
    return c.json({ error: msg }, 503);
  }
  const checkedBase = checkOutboundUrl(glintBaseUrl);
  if (!checkedBase.ok) {
    console.error(`[glint-proxy] rejected unsafe configured base URL: ${checkedBase.reason}`);
    return c.json({ error: "Glint URL is invalid or unsafe" }, 503);
  }

  // Team ID flows through unchanged: Workbench and Glint both speak Prism's
  // team_id natively, so no translation is required.
  const reqUrl = new URL(c.req.url);
  const targetUrl = `${glintBaseUrl.replace(/\/+$/, "")}${glintPath}${reqUrl.search}`;

  const isUpgrade =
    c.req.header("Upgrade")?.toLowerCase() === "websocket";

  // Build upstream headers — preserve end-to-end request metadata but never
  // let callers spoof proxy/network identity or leak Workbench cookies.
  const headers = new Headers();
  const incoming = c.req.raw.headers;
  incoming.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (
      lk === "host" ||
      lk === "authorization" ||
      lk === "cookie" ||
      lk === "content-length" ||
      lk === "connection" ||
      lk === "proxy-authorization" ||
      lk === "proxy-authenticate" ||
      lk === "te" ||
      lk === "trailer" ||
      lk === "transfer-encoding" ||
      lk.startsWith("cf-") ||
      lk === "forwarded" ||
      lk.startsWith("x-forwarded-")
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

  const init: RequestInit = { method, headers, signal: c.req.raw.signal };
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
  if (upstream.status === 101) {
    return upstream;
  }

  if (upstream.status === 401 && upstreamCT.includes("application/json")) {
    const body = await upstream.text();
    try {
      const payload: unknown = JSON.parse(body);
      if (
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        payload.error === "Token inactive or expired"
      ) {
        return c.json(
          {
            error: "Cross-app token rejected during Prism introspection",
            detail: payload.error,
            source: "glint",
            stage: "prism_introspection",
            upstreamStatus: 401,
          },
          401,
        );
      }
    } catch {
      // Fall through and preserve the upstream response unchanged.
    }
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": upstreamCT },
    });
  }

  if (!upstreamCT.includes("application/json") && upstream.status >= 400) {
    console.error(
      `[glint-proxy] ${method} ${glintPath} -> ${upstream.status} ${upstreamCT || "unknown"}`,
    );
    await upstream.body?.cancel();
    return c.json(
      {
        error: `Upstream ${upstream.status}`,
        upstreamStatus: upstream.status,
      },
      upstream.status as never,
    );
  }

  const responseHeaders = new Headers();
  for (const name of [
    "Content-Type",
    "Cache-Control",
    "Content-Disposition",
    "ETag",
    "Last-Modified",
    "Retry-After",
    "X-Request-Id",
  ]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has("Content-Type")) {
    responseHeaders.set("Content-Type", "application/json");
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});

export default glintProxy;
