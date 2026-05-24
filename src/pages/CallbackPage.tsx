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

    // State binding is mandatory. Before, a missing `savedState` skipped
    // the state check entirely — that let an attacker hand a victim a
    // crafted `/callback?code=<attacker_code>&state=...` link and log the
    // victim into the attacker's account (OAuth session fixation).
    const savedState = sessionStorage.getItem("pkce_state");
    if (!savedState || !state || state !== savedState) {
      // Clean up either to avoid leaking the verifier into a retry.
      sessionStorage.removeItem("pkce_verifier");
      sessionStorage.removeItem("pkce_state");
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
