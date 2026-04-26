export type Bindings = {
  KV: KVNamespace;
  PRISM_BASE_URL?: string;
  PRISM_CLIENT_ID?: string;
  PRISM_CLIENT_SECRET?: string;
  PRISM_REDIRECT_URI?: string;
  GLINT_BASE_URL?: string;
  GLINT_CLIENT_ID?: string;
};

export type AppConfig = {
  prism_base_url: string;
  prism_client_id: string;
  prism_client_secret: string;
  prism_redirect_uri: string;
  use_pkce: boolean;
  session_ttl: number;
  /** Fallback Glint URL used when a team has no team-specific Glint configured. */
  glint_base_url: string;
  /**
   * Glint's Prism client_id. Used to request `app:<glintClientId>:<scope>`
   * cross-app OAuth scopes so Workbench can call /api/cross-app/* on Glint.
   * When empty, Workbench falls back to no cross-app scopes (calls will 401).
   */
  glint_client_id: string;
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  prism_base_url: "",
  prism_client_id: "",
  prism_client_secret: "",
  prism_redirect_uri: "",
  use_pkce: true,
  session_ttl: 0,
  glint_base_url: "",
  glint_client_id: "",
};

export type TeamConfig = {
  /** Team-specific Glint instance URL. Overrides the global glint_base_url. */
  glint_base_url: string;
};

export const DEFAULT_TEAM_CONFIG: TeamConfig = {
  glint_base_url: "",
};

export type TeamRole = "owner" | "co-owner" | "admin" | "member";

export type TeamInfo = {
  id: string;
  name: string;
  role: TeamRole;
  avatarUrl?: string;
};

export type SessionData = {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  accessToken: string;
  accessTokenExpiresAt?: number;
  refreshToken?: string;
  expiresAt: number;
  teams: TeamInfo[];
};

export type Variables = {
  session: SessionData;
};
