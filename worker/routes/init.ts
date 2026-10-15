import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getAppConfig, setAppConfig } from "../config";
import { checkOutboundUrl } from "../urlSafety";
import { SESSION_MAX_TTL_SECONDS, SESSION_MIN_TTL_SECONDS } from "../auth";

const init = new Hono<{ Bindings: Bindings; Variables: Variables }>();

init.get("/api/init/status", async (c) => {
  const config = await getAppConfig(c.env.KV, c.env);
  const configured = !!(
    config.prism_base_url &&
    config.prism_client_id &&
    config.glint_base_url
  );
  return c.json({ configured });
});

init.post("/api/init/setup", async (c) => {
  const config = await getAppConfig(c.env.KV, c.env);
  if (config.prism_base_url && config.prism_client_id && config.glint_base_url) {
    return c.json({ error: "Already configured" }, 409);
  }

  let body: {
    prism_base_url: string;
    prism_client_id: string;
    prism_client_secret?: string;
    prism_redirect_uri: string;
    glint_base_url: string;
    glint_client_id?: string;
    use_pkce?: boolean;
    session_ttl?: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "Invalid setup payload" }, 400);
  }

  for (const [name, value, maxLength] of [
    ["prism_base_url", body.prism_base_url, 2048],
    ["prism_client_id", body.prism_client_id, 256],
    ["prism_client_secret", body.prism_client_secret, 4096],
    ["prism_redirect_uri", body.prism_redirect_uri, 2048],
    ["glint_base_url", body.glint_base_url, 2048],
    ["glint_client_id", body.glint_client_id, 256],
  ] as const) {
    if (value !== undefined && (typeof value !== "string" || value.length > maxLength)) {
      return c.json({ error: `${name} must be a string of at most ${maxLength} characters` }, 400);
    }
  }
  if (body.use_pkce !== undefined && typeof body.use_pkce !== "boolean") {
    return c.json({ error: "use_pkce must be a boolean" }, 400);
  }
  if (
    body.session_ttl !== undefined &&
    (!Number.isInteger(body.session_ttl) ||
      body.session_ttl < 0 ||
      (body.session_ttl > 0 && body.session_ttl < SESSION_MIN_TTL_SECONDS) ||
      body.session_ttl > SESSION_MAX_TTL_SECONDS)
  ) {
    return c.json(
      {
        error:
          `session_ttl must be 0 or an integer between ${SESSION_MIN_TTL_SECONDS} and ${SESSION_MAX_TTL_SECONDS}`,
      },
      400,
    );
  }

  if (
    !body.prism_base_url?.trim() ||
    !body.prism_client_id?.trim() ||
    !body.prism_redirect_uri?.trim() ||
    !body.glint_base_url?.trim()
  ) {
    return c.json(
      {
        error:
          "prism_base_url, prism_client_id, prism_redirect_uri and glint_base_url are required",
      },
      400,
    );
  }

  // Validate every URL field — `prism_base_url` and `glint_base_url` later
  // turn into outbound fetch targets so they need the SSRF guard; the
  // `prism_redirect_uri` is sent to Prism and reflected back to the user's
  // browser, so it has to be a real http(s) URL too.
  for (const [name, val] of [
    ["prism_base_url", body.prism_base_url],
    ["prism_redirect_uri", body.prism_redirect_uri],
    ["glint_base_url", body.glint_base_url],
  ] as const) {
    if (!val) continue;
    const r = checkOutboundUrl(val);
    if (!r.ok) {
      return c.json({ error: `${name}: ${r.reason}` }, 400);
    }
  }

  await setAppConfig(c.env.KV, body);
  return c.json({ ok: true });
});

export default init;
