import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { PrismClient } from "@siiway/prism";
import type { Bindings, Variables, AppConfig, SessionData, TeamInfo, TeamRole } from "./types";
import { getAppConfig } from "./config";
import { checkOutboundUrl } from "./urlSafety";

export const SESSION_MIN_TTL_SECONDS = 24 * 60 * 60;
export const SESSION_MAX_TTL_SECONDS = 400 * 24 * 60 * 60;
export const SESSION_COOKIE = "__Host-session";
export const OAUTH_STATE_COOKIE = "__Host-oauth-state";
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const AUTH_FAILURE_HEADER = "X-Workbench-Auth";
export const TEAM_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export function generateOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function oauthStatesMatch(
  provided: string,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
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
  const baseCheck = checkOutboundUrl(config.prism_base_url);
  if (!baseCheck.ok) {
    throw new Error(`Invalid Prism base URL: ${baseCheck.reason}`);
  }
  const redirectCheck = checkOutboundUrl(config.prism_redirect_uri);
  if (!redirectCheck.ok) {
    throw new Error(`Invalid Prism redirect URI: ${redirectCheck.reason}`);
  }
  if (!config.prism_client_id.trim()) {
    throw new Error("Prism client id is not configured");
  }
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
  const teams = await prism.teams.oauthList(accessToken);
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    role: (t.role as TeamRole) ?? "member",
    avatarUrl: t.avatar_url ?? undefined,
  }));
}

export function resolveSessionTtl(configTtl?: number, tokenExpiresIn?: number) {
  // `0` is the explicit operator choice for a non-expiring Workbench
  // session. The Prism access token still expires normally and is refreshed
  // through /api/auth/refresh; only the server-side Workbench session remains.
  if (configTtl === 0) return 0;
  const requested = configTtl ?? tokenExpiresIn ?? SESSION_MIN_TTL_SECONDS;
  if (!Number.isFinite(requested) || requested < 0) {
    return SESSION_MIN_TTL_SECONDS;
  }
  return Math.min(
    Math.max(Math.trunc(requested), SESSION_MIN_TTL_SECONDS),
    SESSION_MAX_TTL_SECONDS,
  );
}

export function sessionExpired(
  session: Pick<SessionData, "expiresAt">,
  now = Date.now(),
): boolean {
  return session.expiresAt > 0 && now >= session.expiresAt;
}

export function sessionCookieMaxAge(session: Pick<SessionData, "expiresAt">): number {
  if (session.expiresAt === 0) return SESSION_MAX_TTL_SECONDS;
  return Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
}

export async function writeSession(
  kv: KVNamespace,
  sessionId: string,
  session: SessionData,
): Promise<void> {
  const value = JSON.stringify(session);
  if (session.expiresAt === 0) {
    await kv.put(`session:${sessionId}`, value);
    return;
  }
  await kv.put(`session:${sessionId}`, value, {
    expirationTtl: Math.max(
      60,
      Math.ceil((session.expiresAt - Date.now()) / 1000),
    ),
  });
}

export async function refreshSessionTeams(
  kv: KVNamespace,
  sessionId: string,
  session: SessionData,
  env: Bindings,
  force = false,
): Promise<SessionData> {
  const now = Date.now();
  if (
    !force &&
    session.teamsCheckedAt !== undefined &&
    now - session.teamsCheckedAt < TEAM_REFRESH_INTERVAL_MS
  ) {
    return session;
  }

  let next = { ...session, teamsCheckedAt: now };
  try {
    const prism = getPrism(await getAppConfig(kv, env));
    next = {
      ...next,
      teams: await fetchUserTeams(prism, session.accessToken),
    };
  } catch (error) {
    console.warn(
      JSON.stringify({
        message: "Prism team refresh failed; retaining cached membership",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  await writeSession(kv, sessionId, next);
  return next;
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
    teamsCheckedAt: 0,
  };
  await writeSession(kv, sessionId, refreshed);
  return refreshed;
}

export const requireAuth = createMiddleware<{
  Bindings: Bindings;
  Variables: Variables;
}>(async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) {
    c.header(AUTH_FAILURE_HEADER, "expired");
    return c.json({ error: "Unauthorized" }, 401);
  }

  const cached = await c.env.KV.get(`session:${sessionId}`, "json");
  if (!cached) {
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    c.header(AUTH_FAILURE_HEADER, "expired");
    return c.json({ error: "Session expired" }, 401);
  }

  const session = cached as SessionData;
  if (sessionExpired(session)) {
    await c.env.KV.delete(`session:${sessionId}`);
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    c.header(AUTH_FAILURE_HEADER, "expired");
    return c.json({ error: "Session expired" }, 401);
  }
  // Browsers cap persistent cookies, so renew the cookie horizon for the
  // explicit non-expiring mode while keeping the KV record unexpired.
  if (session.expiresAt === 0) {
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_MAX_TTL_SECONDS,
    });
  }

  let tokenSession = session;
  const tokenExpiresAt = session.accessTokenExpiresAt;
  if (
    c.req.path !== "/api/auth/refresh" &&
    tokenExpiresAt !== undefined &&
    Date.now() >= tokenExpiresAt - TOKEN_REFRESH_WINDOW_MS
  ) {
    if (session.refreshToken) {
      try {
        tokenSession = await refreshAccessToken(
          c.env.KV,
          sessionId,
          session,
          c.env,
        );
      } catch (error) {
        if (Date.now() >= tokenExpiresAt) {
          await c.env.KV.delete(`session:${sessionId}`);
          deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
          c.header(AUTH_FAILURE_HEADER, "expired");
          return c.json({ error: "Re-authentication required" }, 401);
        }
        console.warn(
          JSON.stringify({
            message: "OAuth access-token refresh deferred",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    } else if (Date.now() >= tokenExpiresAt) {
      await c.env.KV.delete(`session:${sessionId}`);
      deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
      c.header(AUTH_FAILURE_HEADER, "expired");
      return c.json({ error: "Re-authentication required" }, 401);
    }
  }

  const activeSession = await refreshSessionTeams(
    c.env.KV,
    sessionId,
    tokenSession,
    c.env,
  );
  c.set("session", activeSession);
  await next();
});
