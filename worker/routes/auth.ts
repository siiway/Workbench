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
  buildScopes,
  AUTH_FAILURE_HEADER,
  generateOAuthState,
  oauthStatesMatch,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  SESSION_COOKIE,
  sessionCookieMaxAge,
  sessionExpired,
  refreshSessionTeams,
  writeSession,
} from "../auth";

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

auth.get("/api/auth/config", async (c) => {
  const config = await getAppConfig(c.env.KV, c.env);
  try {
    getPrism(config);
  } catch {
    return c.json({ error: "OAuth is not configured safely" }, 503);
  }
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
  if (sessionExpired(session)) {
    await c.env.KV.delete(`session:${sessionId}`);
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    return c.json({ user: null });
  }

  if (session.expiresAt === 0) {
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: sessionCookieMaxAge(session),
    });
  }

  const activeSession = await refreshSessionTeams(
    c.env.KV,
    sessionId,
    session,
    c.env,
    true,
  );

  return c.json({
    user: {
      id: activeSession.userId,
      username: activeSession.username,
      displayName: activeSession.displayName,
      avatarUrl: activeSession.avatarUrl,
      teams: activeSession.teams,
    },
  });
});

auth.post("/api/auth/callback", async (c) => {
  let body: {
    code?: string;
    codeVerifier?: string;
    state?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid OAuth callback payload" }, 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body.code !== undefined && typeof body.code !== "string") ||
    (body.codeVerifier !== undefined && typeof body.codeVerifier !== "string") ||
    (body.state !== undefined && typeof body.state !== "string")
  ) {
    return c.json({ error: "Invalid OAuth callback payload" }, 400);
  }
  const { code, codeVerifier, state } = body;

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

  let userInfo;
  let teams;
  try {
    [userInfo, teams] = await Promise.all([
      prism.getUserInfo(tokens.access_token),
      fetchUserTeams(prism, tokens.access_token),
    ]);
  } catch (error) {
    console.warn(
      JSON.stringify({
        message: "OAuth profile bootstrap failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return c.json({ error: "Unable to load OAuth profile" }, 502);
  }

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
    expiresAt: ttl === 0 ? 0 : now + ttl * 1000,
    createdAt: now,
    teams,
    teamsCheckedAt: now,
  };

  await writeSession(c.env.KV, sessionId, session);

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: sessionCookieMaxAge(session),
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
