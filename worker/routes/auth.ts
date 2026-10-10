import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Bindings, Variables, SessionData } from "../types";
import { getAppConfig } from "../config";
import {
  getPrism,
  fetchUserTeams,
  requireAuth,
  refreshAccessToken,
  resolveSessionTtl,
  renewSessionIfExpiring,
  buildScopes,
  AUTH_FAILURE_HEADER,
  generateOAuthState,
  oauthStatesMatch,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  SESSION_MIN_TTL_SECONDS,
  SESSION_COOKIE,
} from "../auth";

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

auth.get("/api/auth/config", async (c) => {
  const config = await getAppConfig(c.env.KV, c.env);
  return c.json({
    baseUrl: config.prism_base_url,
    clientId: config.prism_client_id,
    redirectUri: config.prism_redirect_uri,
    usePkce: config.use_pkce,
    scopes: buildScopes(config),
  });
});

auth.post("/api/auth/state", (c) => {
  const state = generateOAuthState();
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  c.header("Cache-Control", "no-store");
  return c.json({ state });
});

auth.get("/api/auth/me", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return c.json({ user: null });

  const cached = await c.env.KV.get(`session:${sessionId}`, "json");
  if (!cached) {
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    return c.json({ user: null });
  }

  const session = cached as SessionData;
  if (Date.now() > session.expiresAt) {
    await c.env.KV.delete(`session:${sessionId}`);
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    return c.json({ user: null });
  }

  const { session: activeSession, renewed } = await renewSessionIfExpiring(
    c.env.KV,
    sessionId,
    session,
  );
  if (renewed) {
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_MIN_TTL_SECONDS,
    });
  }

  // Refresh teams (and therefore roles) from Prism on every /me call so the
  // sidebar reflects the current authoritative state, not whatever was cached
  // when the session was first minted. Falls back to the cached session.teams
  // if Prism is unreachable so transient outages don't log the user out.
  let teams = activeSession.teams;
  try {
    const config = await getAppConfig(c.env.KV, c.env);
    const prism = getPrism(config);
    const fresh = await fetchUserTeams(prism, activeSession.accessToken);
    if (fresh.length > 0) {
      teams = fresh;
      const teamsChanged =
        JSON.stringify(fresh) !== JSON.stringify(activeSession.teams);
      if (teamsChanged) {
        const ttl = Math.max(
          Math.ceil((activeSession.expiresAt - Date.now()) / 1000),
          SESSION_MIN_TTL_SECONDS,
        );
        await c.env.KV.put(
          `session:${sessionId}`,
          JSON.stringify({ ...activeSession, teams: fresh }),
          { expirationTtl: ttl },
        );
      }
    }
  } catch {
    // Prism is down — keep showing cached roles rather than hiding teams.
  }

  return c.json({
    user: {
      id: activeSession.userId,
      username: activeSession.username,
      displayName: activeSession.displayName,
      avatarUrl: activeSession.avatarUrl,
      teams,
    },
  });
});

auth.post("/api/auth/callback", async (c) => {
  const { code, codeVerifier, state } = await c.req.json<{
    code?: string;
    codeVerifier?: string;
    state?: string;
  }>();

  if (!code || !state) {
    return c.json({ error: "Invalid OAuth callback payload" }, 400);
  }

  const expectedState = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/", secure: true });
  if (!expectedState || !(await oauthStatesMatch(state, expectedState))) {
    return c.json({ error: "Invalid or expired OAuth state" }, 400);
  }

  const config = await getAppConfig(c.env.KV, c.env);
  const prism = getPrism(config);

  let tokens;
  try {
    tokens = await prism.exchangeCode(code, codeVerifier ?? "");
  } catch (e) {
    console.error("exchangeCode failed:", e);
    return c.json({ error: "Token exchange failed" }, 401);
  }

  const userInfo = await prism.getUserInfo(tokens.access_token);
  const teams = await fetchUserTeams(prism, tokens.access_token);

  const ttl = resolveSessionTtl(config.session_ttl, tokens.expires_in);
  const sessionId = crypto.randomUUID();
  const now = Date.now();

  const session: SessionData = {
    userId: userInfo.sub,
    username: userInfo.preferred_username || userInfo.name || userInfo.sub,
    displayName: userInfo.name,
    avatarUrl: userInfo.picture,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: tokens.expires_in
      ? now + tokens.expires_in * 1000
      : undefined,
    refreshToken: tokens.refresh_token,
    expiresAt: now + ttl * 1000,
    // Hard ceiling anchor; see ABSOLUTE_SESSION_LIFETIME_MS in worker/auth.ts.
    createdAt: now,
    teams,
  };

  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: ttl,
  });

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: ttl,
  });

  return c.json({
    user: {
      id: session.userId,
      username: session.username,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      teams: session.teams,
    },
  });
});

auth.post("/api/auth/logout", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    await c.env.KV.delete(`session:${sessionId}`);
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  }
  return c.json({ ok: true });
});

auth.post("/api/auth/refresh", requireAuth, async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  const session = c.get("session");
  if (!sessionId || !session.refreshToken) {
    c.header(AUTH_FAILURE_HEADER, "expired");
    return c.json({ error: "Re-authentication required" }, 401);
  }

  try {
    await refreshAccessToken(c.env.KV, sessionId, session, c.env);
    c.header("Cache-Control", "no-store");
    return c.json({ ok: true });
  } catch (error) {
    console.warn(
      JSON.stringify({
        message: "OAuth access-token refresh failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    c.header(AUTH_FAILURE_HEADER, "expired");
    return c.json({ error: "Re-authentication required" }, 401);
  }
});

export default auth;
