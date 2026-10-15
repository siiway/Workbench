import { describe, expect, test } from "bun:test";
import {
  resolveSessionTtl,
  SESSION_MAX_TTL_SECONDS,
  SESSION_MIN_TTL_SECONDS,
  sessionExpired,
  writeSession,
} from "../worker/auth";
import { checkOutboundUrl } from "../worker/urlSafety";
import glintRoutes from "../worker/routes/glint";
import nextBridgeRoutes from "../worker/routes/nextbridge";
import type { SessionData } from "../worker/types";

type PutCall = { key: string; value: string; options?: KVNamespacePutOptions };

function session(overrides: Partial<SessionData> = {}): SessionData {
  return {
    userId: "user-1",
    username: "tester",
    accessToken: "access-token",
    accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
    refreshToken: "refresh-token",
    expiresAt: 0,
    createdAt: Date.now(),
    teamsCheckedAt: Date.now(),
    teams: [{ id: "team-a", name: "A", role: "member" }],
    ...overrides,
  };
}

function fakeEnv(activeSession = session()) {
  const puts: PutCall[] = [];
  const kv = {
    async get(key: string) {
      if (key === "session:test-session") return activeSession;
      if (key.startsWith("nb_instance:team-a:")) return { id: "instance-1" };
      return null;
    },
    async put(key: string, value: string, options?: KVNamespacePutOptions) {
      puts.push({ key, value, options });
    },
    async delete() {},
  } as unknown as KVNamespace;
  return {
    env: {
      KV: kv,
      NB_HUB: {} as DurableObjectNamespace,
    },
    kv,
    puts,
  };
}

describe("outbound URL guard", () => {
  for (const value of [
    "http://127.0.0.1",
    "http://2130706433",
    "http://[::1]",
    "http://[fc12::1]",
    "http://[fe80::1]",
    "http://[::ffff:127.0.0.1]",
    "https://user:pass@example.com",
    "http://service.localhost",
  ]) {
    test(`rejects ${value}`, () => {
      expect(checkOutboundUrl(value).ok).toBe(false);
    });
  }

  test("accepts a public HTTPS origin", () => {
    expect(checkOutboundUrl("https://glint.example.com").ok).toBe(true);
  });
});

describe("session lifetime", () => {
  test("keeps TTL 0 as non-expiring", () => {
    expect(resolveSessionTtl(0, 120)).toBe(0);
    expect(sessionExpired({ expiresAt: 0 }, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  test("bounds finite positive TTL values", () => {
    expect(resolveSessionTtl(60, 60)).toBe(SESSION_MIN_TTL_SECONDS);
    expect(resolveSessionTtl(Number.MAX_SAFE_INTEGER, 60)).toBe(
      SESSION_MAX_TTL_SECONDS,
    );
  });

  test("stores a non-expiring session without a KV expiration", async () => {
    const { kv, puts } = fakeEnv();
    await writeSession(kv, "session-id", session());
    expect(puts).toHaveLength(1);
    expect(puts[0].options).toBeUndefined();
  });
});

describe("route authorization and bounds", () => {
  test("blocks cross-team Glint proxy access", async () => {
    const { env } = fakeEnv();
    const response = await glintRoutes.request(
      "https://dash.example/api/glint/teams/team-b/overview",
      { headers: { Cookie: "__Host-session=test-session" } },
      env,
    );
    expect(response.status).toBe(403);
  });

  test("blocks unrestricted NextBridge RPC for ordinary members", async () => {
    const { env } = fakeEnv();
    const response = await nextBridgeRoutes.request(
      "https://dash.example/api/nextbridge/instances/instance-1/rpc?teamId=team-a",
      {
        method: "POST",
        headers: {
          Cookie: "__Host-session=test-session",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ method: "rules.reload", params: {} }),
      },
      env,
    );
    expect(response.status).toBe(403);
  });

  test("rejects oversized member chat messages before RPC forwarding", async () => {
    const { env } = fakeEnv();
    const response = await nextBridgeRoutes.request(
      "https://dash.example/api/nextbridge/instances/instance-1/chat/send?teamId=team-a",
      {
        method: "POST",
        headers: {
          Cookie: "__Host-session=test-session",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel: { channel: "ops" }, text: "x".repeat(4097) }),
      },
      env,
    );
    expect(response.status).toBe(400);
  });
});
