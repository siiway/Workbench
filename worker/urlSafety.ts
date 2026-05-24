/**
 * URL safety guard for user-supplied configuration values that the Worker
 * later turns into outbound `fetch` calls (Glint proxy, Prism client, etc).
 *
 * Without these checks an authenticated team owner can set the Glint URL
 * to `http://127.0.0.1/...` or `http://169.254.169.254/...` and have the
 * Worker make those requests on their behalf — Cloudflare Workers fetch
 * from data-centre egress IPs which can reach more than the requesting
 * user can, including in some edge cases the Cloudflare API itself or
 * cloud-metadata endpoints other infra exposes. SSRF mitigation.
 */

const PRIVATE_HOST_RE = /^(?:127\.|10\.|0\.0\.0\.0$|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fe80:|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|localhost$)/i;

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

const URL_MAX_LEN = 2048;

export type UrlCheckResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/**
 * Validates a URL string for use as an outbound target. Rules:
 *   - scheme must be http: or https:
 *   - hostname must not be loopback, link-local, RFC1918 private, or
 *     bare `localhost`
 *   - total length capped to defang absurdly long inputs that could DoS
 *     downstream URL parsers
 *   - no control characters or backslashes
 */
export function checkOutboundUrl(value: string): UrlCheckResult {
  if (typeof value !== "string") {
    return { ok: false, reason: "URL must be a string" };
  }
  if (value.length === 0) {
    return { ok: false, reason: "URL is empty" };
  }
  if (value.length > URL_MAX_LEN) {
    return { ok: false, reason: "URL is too long" };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f\\]/.test(value)) {
    return { ok: false, reason: "URL contains forbidden characters" };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "URL is malformed" };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      ok: false,
      reason: `URL scheme '${parsed.protocol}' not allowed`,
    };
  }
  // hostname() strips brackets from IPv6, so the regex works for both.
  const host = parsed.hostname.toLowerCase();
  if (!host) {
    return { ok: false, reason: "URL has no host" };
  }
  if (PRIVATE_HOST_RE.test(host)) {
    return { ok: false, reason: `Host '${host}' is private / loopback` };
  }
  return { ok: true, url: parsed };
}
