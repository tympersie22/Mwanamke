import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieJar) }));

import { GET } from "../app/auth/login/route";
import { localRolePreviewEnabled, sessionName, unseal, type Session } from "../lib/session";

describe("local role preview authentication", () => {
  beforeEach(() => {
    cookieJar.set.mockReset();
    cookieJar.delete.mockReset();
    vi.stubEnv("ALLOW_DEMO_AUTH", "true");
    vi.stubEnv("PORTAL_ORIGIN", "http://localhost:3000");
    vi.stubEnv("PORTAL_SESSION_KEYS", "");
    vi.stubEnv("PORTAL_SESSION_KEY", "1".repeat(64));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("creates a short encrypted workforce preview session", async () => {
    const response = await GET(new Request("http://localhost:3000/auth/login?role=provider"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    const cookie = cookieJar.set.mock.calls.find(([name]) => name === sessionName);
    expect(cookie).toBeDefined();
    expect(unseal<Session>(cookie![1], sessionName)).toMatchObject({
      accessToken: "dev:provider:synthetic-provider-validation",
      realm: "workforce"
    });
    expect(cookie![2]).toMatchObject({ httpOnly: true, maxAge: 900, sameSite: "lax" });
  });

  it("does not bypass OIDC when demo authentication is disabled", async () => {
    vi.stubEnv("ALLOW_DEMO_AUTH", "false");
    const response = await GET(new Request("http://localhost:3000/auth/login"));
    expect(response.status).toBe(503);
  });

  it("permits a production-built demo container only on an explicit loopback origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MWANAMKE_LOCAL_DEMO", "true");
    expect(localRolePreviewEnabled()).toBe(true);
    vi.stubEnv("PORTAL_ORIGIN", "https://care.example.test");
    expect(localRolePreviewEnabled()).toBe(false);
  });
});
