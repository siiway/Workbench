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

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

const URL_MAX_LEN = 2048;

export type UrlCheckResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(host: string): boolean {
  const value = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!value.includes(":")) return false;
  if (value === "::" || value === "::1") return true;
  const first = value.split(":", 1)[0];
  if (/^f[cd]/.test(first)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(first)) return true; // fe80::/10 link-local
  if (/^ff/.test(first)) return true; // multicast
  // IPv4-mapped / translated addresses can encode private IPv4 without a
  // dotted-decimal suffix after WHATWG URL canonicalisation.
  if (value.startsWith("::ffff:") || value.startsWith("::ffff:0:")) {
    const tail = value.split(":").filter(Boolean).slice(-2);
    if (tail.length === 2) {
      const high = Number.parseInt(tail[0], 16);
      const low = Number.parseInt(tail[1], 16);
      if (Number.isFinite(high) && Number.isFinite(low)) {
        const ipv4 = [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
        return isPrivateIpv4(ipv4);
      }
    }
  }
  return false;
}

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
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URL credentials are not allowed" };
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) {
    return { ok: false, reason: "URL has no host" };
  }
  const bareHost = host.replace(/^\[|\]$/g, "");
  if (
    bareHost === "localhost" ||
    bareHost.endsWith(".localhost") ||
    isPrivateIpv4(bareHost) ||
    isPrivateIpv6(host)
  ) {
    return { ok: false, reason: `Host '${host}' is private / loopback` };
  }
  return { ok: true, url: parsed };
}
