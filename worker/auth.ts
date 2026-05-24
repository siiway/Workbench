import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { PrismClient } from "@siiway/prism";
import type { Bindings, Variables, AppConfig, SessionData, TeamInfo, TeamRole } from "./types";
import { getAppConfig } from "./config";

export const SESSION_MIN_TTL_SECONDS = 24 * 60 * 60;
export const SESSION_RENEW_WINDOW_SECONDS = 30 * 60;
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

/**
 * Absolute session lifetime ceiling. A session is hard-killed exactly this
 * many ms after `createdAt`, regardless of activity-driven renewals. Forces
 * a fresh Prism login every week so revoked Prism permissions (team
 * removal, account disable) propagate within a bounded window even if the
 * user keeps the tab open.
 */
export const ABSOLUTE_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Treat legacy sessions (no createdAt) as having started 1 day before
 *  their soft expiry — close enough; they'll roll over to the new model
 *  on next renewal or login. */
function sessionCreatedAt(session: { createdAt?: number; expiresAt: number }): number {
  return session.createdAt ?? session.expiresAt - 24 * 60 * 60 * 1000;
}

export function sessionAbsolutelyExpired(session: { createdAt?: number; expiresAt: number }): boolean {
  return Date.now() - sessionCreatedAt(session) >= ABSOLUTE_SESSION_LIFETIME_MS;
}

/**
 * Workbench requests Glint's `workbench` bundle scope, which authorises every
 * cross-app endpoint Glint exposes. Equivalent to granting the full granular
 * scope set; the bundle exists specifically to keep Workbench's OAuth consent
 * screen short.
 *
 * TODO(prism-picker): add `team_apps:read` to the base list once Prism
 * exposes `GET /api/oauth/me/teams/:teamId/apps`. The picker tab in
 * AppCardDialog needs that scope to call the new endpoint via the BFF.
 */
export function buildScopes(config: AppConfig): string[] {
  const base = ["openid", "profile", "email", "teams:read", "offline_access"];
  const glintClientId = config.glint_client_id?.trim();
  if (!glintClientId) return base;
  return [...base, `app:${glintClientId}:workbench`];
}

export function getPrism(config: AppConfig) {
  return new PrismClient({
    baseUrl: config.prism_base_url,
    clientId: config.prism_client_id,
    clientSecret: config.prism_client_secret || undefined,
    redirectUri: config.prism_redirect_uri,
    scopes: buildScopes(config),
  });
}

export async function fetchUserTeams(
  prism: PrismClient,
  accessToken: string,
): Promise<TeamInfo[]> {
  try {
    const teams = await prism.teams.oauthList(accessToken);
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      role: (t.role as TeamRole) ?? "member",
      avatarUrl: t.avatar_url ?? undefined,
    }));
  } catch {
    return [];
  }
}

export function resolveSessionTtl(configTtl?: number, tokenExpiresIn?: number) {
  return Math.max(
    configTtl != null ? configTtl : (tokenExpiresIn ?? SESSION_MIN_TTL_SECONDS),
    SESSION_MIN_TTL_SECONDS,
  );
}

export async function renewSessionIfExpiring(
  kv: KVNamespace,
  sessionId: string,
  session: SessionData,
): Promise<{ session: SessionData; renewed: boolean }> {
  if (session.expiresAt - Date.now() > SESSION_RENEW_WINDOW_SECONDS * 1000) {
    return { session, renewed: false };
  }
  // Refuse to renew past the absolute lifetime ceiling — the requireAuth
  // path will see the unrenewed session, find it absolutely expired, and
  // bounce the caller to /login.
  if (sessionAbsolutelyExpired(session)) {
    return { session, renewed: false };
  }
  // Don't push expiresAt past the absolute ceiling either.
  const cap =
    sessionCreatedAt(session) + ABSOLUTE_SESSION_LIFETIME_MS;
  const candidate = Date.now() + SESSION_MIN_TTL_SECONDS * 1000;
  const renewedSession: SessionData = {
    ...session,
    expiresAt: Math.min(candidate, cap),
  };
  const kvTtlSeconds = Math.max(
    1,
    Math.ceil((renewedSession.expiresAt - Date.now()) / 1000),
  );
  await kv.put(`session:${sessionId}`, JSON.stringify(renewedSession), {
    expirationTtl: kvTtlSeconds,
  });
  return { session: renewedSession, renewed: true };
}

export async function refreshAccessToken(
  kv: KVNamespace,
  sessionId: string,
  session: SessionData,
  env: Bindings,
): Promise<SessionData> {
  const config = await getAppConfig(kv, env);
  const prism = getPrism(config);
  const newTokens = await prism.refreshToken(session.refreshToken!);
  const refreshed: SessionData = {
    ...session,
    accessToken: newTokens.access_token,
    refreshToken: newTokens.refresh_token ?? session.refreshToken,
    accessTokenExpiresAt: newTokens.expires_in
      ? Date.now() + newTokens.expires_in * 1000
      : session.accessTokenExpiresAt,
  };
  const ttl = Math.max(
    Math.ceil((refreshed.expiresAt - Date.now()) / 1000),
    SESSION_MIN_TTL_SECONDS,
  );
  await kv.put(`session:${sessionId}`, JSON.stringify(refreshed), {
    expirationTtl: ttl,
  });
  return refreshed;
}

export const requireAuth = createMiddleware<{
  Bindings: Bindings;
  Variables: Variables;
}>(async (c, next) => {
  const sessionId = getCookie(c, "session");
  if (!sessionId) return c.json({ error: "Unauthorized" }, 401);

  const cached = await c.env.KV.get(`session:${sessionId}`, "json");
  if (!cached) {
    deleteCookie(c, "session");
    return c.json({ error: "Session expired" }, 401);
  }

  const session = cached as SessionData;
  if (Date.now() > session.expiresAt) {
    await c.env.KV.delete(`session:${sessionId}`);
    deleteCookie(c, "session");
    return c.json({ error: "Session expired" }, 401);
  }
  // Absolute ceiling — even if soft expiry would be extended by activity,
  // the session is hard-killed once created+1week.
  if (sessionAbsolutelyExpired(session)) {
    await c.env.KV.delete(`session:${sessionId}`);
    deleteCookie(c, "session");
    return c.json({ error: "Session expired" }, 401);
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

  let finalSession = activeSession;
  if (
    finalSession.refreshToken &&
    finalSession.accessTokenExpiresAt &&
    Date.now() > finalSession.accessTokenExpiresAt - TOKEN_REFRESH_WINDOW_MS
  ) {
    try {
      finalSession = await refreshAccessToken(c.env.KV, sessionId, finalSession, c.env);
    } catch {
      // Continue with existing token
    }
  }

  c.set("session", finalSession);
  await next();
});
