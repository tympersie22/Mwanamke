import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { seal, unseal } from "../lib/session";
import { readLimitedJson } from "../lib/request-body";
describe("encrypted browser session", () => {
  beforeEach(() => { vi.stubEnv("PORTAL_SESSION_KEYS", ""); vi.stubEnv("PORTAL_SESSION_KEY", randomBytes(32).toString("hex")); });
  afterEach(() => vi.unstubAllEnvs());
  it("round trips while hiding the token and binding the purpose", () => {
    const value = { accessToken: "sensitive-test-token", expiresAt: Date.now()+60_000 };
    const sealed = seal(value, "session");
    expect(sealed).not.toContain(value.accessToken);
    expect(unseal(sealed, "session")).toEqual(value);
    expect(unseal(sealed, "login-transaction")).toBeNull();
  });
  it("rejects altered ciphertext, truncated tags and expired sessions", () => {
    const sealed = seal({ accessToken: "test", expiresAt: Date.now()+60_000 }, "session");
    const [id, payload] = sealed.split(".") as [string, string];
    const bytes = Buffer.from(payload,"base64url"); bytes[15] = bytes[15]! ^ 1;
    expect(unseal(`${id}.${bytes.toString("base64url")}`,"session")).toBeNull();
    for(const count of [1,4,8,12,16]) expect(unseal(`${id}.${Buffer.from(payload,"base64url").subarray(0,-count).toString("base64url")}`,"session")).toBeNull();
    expect(unseal(seal({ expiresAt: Date.now()-1 },"session"),"session")).toBeNull();
  });
  it("invalidates old sessions after key replacement",()=>{
    const sealed=seal({ expiresAt:Date.now()+60_000 },"session");
    vi.stubEnv("PORTAL_SESSION_KEY",randomBytes(32).toString("hex"));
    expect(unseal(sealed,"session")).toBeNull();
  });
  it("rotates keys without immediately invalidating active sessions",()=>{
    const oldKey=randomBytes(32).toString("hex");
    const newKey=randomBytes(32).toString("hex");
    vi.stubEnv("PORTAL_SESSION_KEYS",`old:${oldKey}`);
    const sealed=seal({expiresAt:Date.now()+60_000},"session");
    vi.stubEnv("PORTAL_SESSION_KEYS",`current:${newKey},old:${oldKey}`);
    expect(unseal(sealed,"session")).not.toBeNull();
    vi.stubEnv("PORTAL_SESSION_KEYS",`current:${newKey}`);
    expect(unseal(sealed,"session")).toBeNull();
  });
  it("enforces the actual request size without trusting Content-Length",async()=>{
    const request=new Request("https://example.test",{method:"POST",body:JSON.stringify({value:"x".repeat(300)})});
    await expect(readLimitedJson(request,100)).rejects.toThrow("Body limit exceeded");
    expect(await readLimitedJson(new Request("https://example.test",{method:"POST",body:'{"kind":"export"}'}),100)).toEqual({kind:"export"});
  });
});
