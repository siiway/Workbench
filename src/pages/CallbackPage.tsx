import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@fluentui/react-components";
import { useAuth } from "../auth";

export function CallbackPage() {
  const { handleCallback } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code) {
      navigate("/login", { replace: true });
      return;
    }

    const savedState = sessionStorage.getItem("pkce_state");
    if (savedState && state !== savedState) {
      navigate("/login", { replace: true });
      return;
    }

    const codeVerifier = sessionStorage.getItem("pkce_verifier") ?? undefined;
    sessionStorage.removeItem("pkce_verifier");
    sessionStorage.removeItem("pkce_state");

    handleCallback(code, codeVerifier).then((ok) => {
      navigate(ok ? "/" : "/login", { replace: true });
    });
  }, [handleCallback, navigate]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
      <Spinner size="large" label="Signing in…" />
    </div>
  );
}
