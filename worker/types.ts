export type Bindings = {
  KV: KVNamespace;
  PRISM_BASE_URL?: string;
  PRISM_CLIENT_ID?: string;
  PRISM_CLIENT_SECRET?: string;
  PRISM_REDIRECT_URI?: string;
  GLINT_BASE_URL?: string;
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
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  prism_base_url: "",
  prism_client_id: "",
  prism_client_secret: "",
  prism_redirect_uri: "",
  use_pkce: true,
  session_ttl: 0,
  glint_base_url: "",
};

export type TeamConfig = {
  /** Team-specific Glint instance URL. Overrides the global glint_base_url. */
  glint_base_url: string;
  /** The workbench_id configured in Glint for this team. Used to route API calls to the correct Glint team. */
  glint_team_id: string;
};

export const DEFAULT_TEAM_CONFIG: TeamConfig = {
  glint_base_url: "",
  glint_team_id: "",
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
