import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getAppConfig, setAppConfig } from "../config";
import { checkOutboundUrl } from "../urlSafety";

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

  const body = await c.req.json<{
    prism_base_url: string;
    prism_client_id: string;
    prism_client_secret?: string;
    prism_redirect_uri: string;
    glint_base_url: string;
    glint_client_id?: string;
    use_pkce?: boolean;
    session_ttl?: number;
  }>();

  if (!body.prism_base_url?.trim() || !body.prism_client_id?.trim()) {
    return c.json({ error: "prism_base_url and prism_client_id are required" }, 400);
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
