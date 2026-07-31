import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@fluentui/react-components";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";

export function CallbackPage() {
  const { handleCallback } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
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
    if (!savedState || !state || state !== savedState) {
      sessionStorage.removeItem("pkce_verifier");
      sessionStorage.removeItem("pkce_state");
      navigate("/login", { replace: true });
      return;
    }

    const codeVerifier = sessionStorage.getItem("pkce_verifier") ?? undefined;
    sessionStorage.removeItem("pkce_verifier");
    sessionStorage.removeItem("pkce_state");

    handleCallback(code, codeVerifier, savedState).then((ok) => {
      navigate(ok ? "/" : "/login", { replace: true });
    }).catch(() => {
      navigate("/login", { replace: true });
    });
  }, [handleCallback, navigate]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
      <Spinner size="large" label={t.callbackSigningIn} />
    </div>
  );
}
