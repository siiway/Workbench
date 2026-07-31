import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { PrismClient } from "@siiway/prism";
import type { User } from "./types";

type AuthConfig = {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  usePkce: boolean;
  scopes: string[];
};

const FALLBACK_SCOPES = [
  "openid",
  "profile",
  "email",
  "teams:read",
  "offline_access",
];

type AuthContextType = {
  user: User | null;
  loading: boolean;
  sessionExpired: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleCallback: (code: string, codeVerifier?: string, state?: string) => Promise<boolean>;
  dismissExpired: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

let configPromise: Promise<AuthConfig> | null = null;
let prismPromise: Promise<PrismClient> | null = null;

function getConfig(): Promise<AuthConfig> {
  if (!configPromise) {
    configPromise = fetch("/api/auth/config")
      .then((r) => r.json())
      .then((cfg: Partial<AuthConfig>) => ({
        baseUrl: cfg.baseUrl ?? "",
        clientId: cfg.clientId ?? "",
        redirectUri: cfg.redirectUri || `${window.location.origin}/callback`,
        usePkce: cfg.usePkce ?? true,
        scopes:
          Array.isArray(cfg.scopes) && cfg.scopes.length > 0
            ? cfg.scopes
            : FALLBACK_SCOPES,
      }));
  }
  return configPromise;
}

function getPrism(): Promise<PrismClient> {
  if (!prismPromise) {
    prismPromise = getConfig().then(
      (cfg) =>
        new PrismClient({
          baseUrl: cfg.baseUrl,
          clientId: cfg.clientId,
          redirectUri: cfg.redirectUri,
          scopes: cfg.scopes,
        }),
    );
  }
  return prismPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: User | null }) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const res = await orig(...args);
      if (res.status === 401 && user) {
        const url =
          typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof Request
              ? args[0].url
              : "";
        if (url.includes("/api/") && !url.includes("/api/auth/")) {
          setSessionExpired(true);
        }
      }
      return res;
    };
    return () => { window.fetch = orig; };
  }, [user]);

  const login = useCallback(async () => {
    const cfg = await getConfig();
    const prism = await getPrism();
    if (cfg.usePkce) {
      const { url, pkce } = await prism.createAuthorizationUrl({});
      sessionStorage.setItem("pkce_verifier", pkce.codeVerifier);
      sessionStorage.setItem("pkce_state", pkce.state);
      window.location.href = url;
    } else {
      const state = PrismClient.generateState();
      const params = new URLSearchParams({
        response_type: "code",
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        scope: cfg.scopes.join(" "),
        state,
      });
      sessionStorage.setItem("pkce_state", state);
      window.location.href = `${cfg.baseUrl}/api/oauth/authorize?${params}`;
    }
  }, []);

  const handleCallback = useCallback(async (code: string, codeVerifier?: string, state?: string): Promise<boolean> => {
    const body: { code: string; codeVerifier?: string; state?: string } = { code };
    if (codeVerifier) body.codeVerifier = codeVerifier;
    if (state) body.state = state;
    const res = await fetch("/api/auth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const data: { user: User } = await res.json();
    setUser(data.user);
    setSessionExpired(false);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSessionExpired(false);
  }, []);

  const dismissExpired = useCallback(() => setSessionExpired(false), []);

  return (
    <AuthContext
      value={{ user, loading, sessionExpired, login, logout, handleCallback, dismissExpired }}
    >
      {children}
    </AuthContext>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
