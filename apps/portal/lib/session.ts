import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export type Session = { accessToken: string; expiresAt: number; realm?: "patient" | "workforce" };
function isLocalDemoRuntime() {
  if (process.env.ALLOW_DEMO_AUTH !== "true") return false;
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.MWANAMKE_LOCAL_DEMO !== "true") return false;
  try {
    return ["127.0.0.1", "localhost"].includes(new URL(process.env.PORTAL_ORIGIN ?? "").hostname);
  } catch {
    return false;
  }
}
const hardenedCookies = process.env.NODE_ENV === "production" && !isLocalDemoRuntime();
export const sessionName = hardenedCookies ? "__Host-mwanamke-session" : "mwanamke-session";
export const transactionName = hardenedCookies ? "__Host-mwanamke-login" : "mwanamke-login";
export const cookieOptions = { httpOnly: true, secure: hardenedCookies, sameSite: "lax" as const, path: "/" };
type SessionKey = { id: string; value: Buffer };
function keys(): SessionKey[] {
  const ring = process.env.PORTAL_SESSION_KEYS?.trim();
  if (ring) {
    const entries = ring.split(",").map((entry) => {
      const separator = entry.indexOf(":");
      const id = entry.slice(0, separator);
      const value = entry.slice(separator + 1);
      if (separator < 1 || !/^[a-zA-Z0-9_-]{1,24}$/.test(id) || !/^[a-f0-9]{64}$/i.test(value)) {
        throw new Error("PORTAL_SESSION_KEYS must use id:64-character-hex entries");
      }
      return { id, value: Buffer.from(value, "hex") };
    });
    if (entries.length > 4 || new Set(entries.map(({ id }) => id)).size !== entries.length) {
      throw new Error("PORTAL_SESSION_KEYS must contain one to four unique key identifiers");
    }
    return entries;
  }
  const value = process.env.PORTAL_SESSION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("PORTAL_SESSION_KEY must contain 32 random bytes encoded as hex");
  return [{ id: "legacy", value: Buffer.from(value, "hex") }];
}
export function seal(value: object, purpose: string): string {
  const active = keys()[0]!;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", active.value, nonce, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(purpose));
  const payload = Buffer.concat([nonce, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString("base64url");
  return `${active.id}.${payload}`;
}
export function unseal<T extends { expiresAt: number }>(value: string, purpose: string): T | null {
  if (value.length > 4096) return null;
  const separator = value.indexOf(".");
  const id = separator > 0 ? value.slice(0, separator) : null;
  const payload = separator > 0 ? value.slice(separator + 1) : value;
  const candidates = keys().filter((candidate) => id === null || candidate.id === id);
  for (const candidate of candidates) {
    try {
      const bytes = Buffer.from(payload, "base64url");
      if (bytes.length < 29) continue;
      const decipher = createDecipheriv("aes-256-gcm", candidate.value, bytes.subarray(0, 12), { authTagLength: 16 });
      decipher.setAAD(Buffer.from(purpose));
      decipher.setAuthTag(bytes.subarray(-16));
      const result = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString()) as T;
      return Number.isFinite(result.expiresAt) && result.expiresAt > Date.now() ? result : null;
    } catch { /* Try a retained rotation key or reject the cookie. */ }
  }
  return null;
}
export async function readSession() {
  const value = (await cookies()).get(sessionName)?.value;
  return value ? unseal<Session>(value, sessionName) : null;
}
export function portalOrigin() {
  const url = new URL(process.env.PORTAL_ORIGIN ?? "http://localhost:3300");
  if (process.env.NODE_ENV === "production" && !isLocalDemoRuntime() && url.protocol !== "https:") throw new Error("HTTPS portal origin required");
  return url.origin;
}
export function apiBase() {
  const url = new URL(process.env.API_BASE_URL ?? "http://localhost:4100");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && process.env.API_INTERNAL_TRANSPORT !== "trusted-private-network") throw new Error("HTTPS API or explicit private network required");
  return url.origin;
}

export function localRolePreviewEnabled() {
  return isLocalDemoRuntime();
}

/** Browser form navigations may omit Origin; accept only browser-controlled same-origin metadata. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin === portalOrigin();
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try { return new URL(referer).origin === portalOrigin(); } catch { return false; }
}
