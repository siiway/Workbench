import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Bindings, Variables, SessionData } from "../types";
import { getAppConfig } from "../config";
import {
  getPrism,
  fetchUserTeams,
  resolveSessionTtl,
  renewSessionIfExpiring,
  buildScopes,
  SESSION_MIN_TTL_SECONDS,
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

auth.get("/api/auth/me", async (c) => {
  const sessionId = getCookie(c, "session");
  if (!sessionId) return c.json({ user: null });

  const cached = await c.env.KV.get(`session:${sessionId}`, "json");
  if (!cached) {
    deleteCookie(c, "session");
    return c.json({ user: null });
  }

  const session = cached as SessionData;
  if (Date.now() > session.expiresAt) {
    await c.env.KV.delete(`session:${sessionId}`);
    deleteCookie(c, "session");
    return c.json({ user: null });
  }

  const { session: activeSession, renewed } = await renewSessionIfExpiring(
    c.env.KV,
    sessionId,
    session,
  );
  if (renewed) {
    setCookie(c, "session", sessionId, {
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
  const { code, codeVerifier } = await c.req.json<{
    code: string;
    codeVerifier?: string;
  }>();

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

  const session: SessionData = {
    userId: userInfo.sub,
    username: userInfo.preferred_username || userInfo.name || userInfo.sub,
    displayName: userInfo.name,
    avatarUrl: userInfo.picture,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : undefined,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + ttl * 1000,
    teams,
  };

  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: ttl,
  });

  setCookie(c, "session", sessionId, {
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
  const sessionId = getCookie(c, "session");
  if (sessionId) {
    await c.env.KV.delete(`session:${sessionId}`);
    deleteCookie(c, "session");
  }
  return c.json({ ok: true });
});

export default auth;
