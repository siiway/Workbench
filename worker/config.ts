import type { AppConfig, TeamConfig, Bindings } from "./types";
import { DEFAULT_APP_CONFIG, DEFAULT_TEAM_CONFIG } from "./types";

export async function getAppConfig(
  kv: KVNamespace,
  env?: Partial<Bindings>,
): Promise<AppConfig> {
  const raw = await kv.get("config:app", "json");
  const base: AppConfig = {
    ...DEFAULT_APP_CONFIG,
    ...((raw as Partial<AppConfig> | null) ?? {}),
  };
  if (env?.PRISM_BASE_URL?.trim()) base.prism_base_url = env.PRISM_BASE_URL.trim();
  if (env?.PRISM_CLIENT_ID?.trim()) base.prism_client_id = env.PRISM_CLIENT_ID.trim();
  if (env?.PRISM_CLIENT_SECRET?.trim()) base.prism_client_secret = env.PRISM_CLIENT_SECRET.trim();
  if (env?.PRISM_REDIRECT_URI?.trim()) base.prism_redirect_uri = env.PRISM_REDIRECT_URI.trim();
  if (env?.GLINT_BASE_URL?.trim()) base.glint_base_url = env.GLINT_BASE_URL.trim();
  if (env?.GLINT_CLIENT_ID?.trim()) base.glint_client_id = env.GLINT_CLIENT_ID.trim();
  return base;
}

export async function setAppConfig(
  kv: KVNamespace,
  patch: Partial<AppConfig>,
): Promise<AppConfig> {
  const current = await getAppConfig(kv);
  const updated = { ...current, ...patch };
  await kv.put("config:app", JSON.stringify(updated));
  return updated;
}

export async function getTeamConfig(
  kv: KVNamespace,
  teamId: string,
): Promise<TeamConfig> {
  const raw = await kv.get(`config:team:${teamId}`, "json");
  return { ...DEFAULT_TEAM_CONFIG, ...((raw as Partial<TeamConfig> | null) ?? {}) };
}

export async function setTeamConfig(
  kv: KVNamespace,
  teamId: string,
  patch: Partial<TeamConfig>,
): Promise<TeamConfig> {
  const current = await getTeamConfig(kv, teamId);
  const updated = { ...current, ...patch };
  await kv.put(`config:team:${teamId}`, JSON.stringify(updated));
  return updated;
}

/** Resolves the Glint URL for a team: team config → global fallback → env var. */
export async function resolveGlintUrl(
  kv: KVNamespace,
  teamId: string,
  env?: Partial<Bindings>,
): Promise<string> {
  const teamConfig = await getTeamConfig(kv, teamId);
  if (teamConfig.glint_base_url) return teamConfig.glint_base_url;
  const appConfig = await getAppConfig(kv, env);
  return appConfig.glint_base_url;
}
