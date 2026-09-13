import { oidc } from "@/lib/oidc";
import { readLimitedJson } from "@/lib/request-body";
import { apiBase } from "@/lib/session";
let windowStart = 0;
let attempts = 0;
let active = 0;
export async function POST(request: Request) {
  // Coarse per-instance abuse guard; the deployment must also enforce distributed ingress limits.
  if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); attempts = 0; }
  if (++attempts > 30 || active >= 4) return Response.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } });
  active++;
  // Public native client: PKCE binds each exchanged code to the requesting device.
  // No browser cookie is read or set, and no identity is accepted from client claims.
  try {
    const body = await readLimitedJson(request, 8192);
    const { code, state, nonce, verifier } = body;
    if (typeof code !== "string" || typeof state !== "string" || typeof nonce !== "string" || typeof verifier !== "string") return new Response(null, { status: 422 });
    if (![code, state, nonce, verifier].every(v => typeof v === "string" && v.length >= 16 && v.length <= 2048)) return new Response(null, { status: 422 });
    const issuer = process.env.OIDC_PATIENT_ISSUER_URL ?? process.env.OIDC_ISSUER;
    const clientId = process.env.OIDC_MOBILE_CLIENT_ID;
    const redirect = process.env.OIDC_MOBILE_REDIRECT_URI;
    if (!issuer || !clientId || !redirect) throw new Error("Native OIDC unavailable");
    const execute = [oidc.enableNonRepudiationChecks];
    if (process.env.NODE_ENV !== "production" && process.env.OIDC_ALLOW_INSECURE_LOCAL === "true" && ["127.0.0.1", "localhost"].includes(new URL(issuer).hostname)) execute.push(oidc.allowInsecureRequests);
    const config = await oidc.discovery(new URL(issuer), clientId, {}, oidc.None(), { execute, timeout: 10 });
    const url = new URL(redirect); url.searchParams.set("code", code); url.searchParams.set("state", state);
    const tokens = await oidc.authorizationCodeGrant(config, url, { pkceCodeVerifier: verifier, expectedState: state, expectedNonce: nonce, idTokenExpected: true });
    if (!tokens.access_token || !tokens.expires_in || tokens.token_type.toLowerCase() !== "bearer") throw new Error("Invalid token response");
    const me = await fetch(`${apiBase()}/v1/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!me.ok) return Response.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 403 });
    return Response.json({ accessToken: tokens.access_token, expiresAt: Date.now() + Math.min(900, tokens.expires_in) * 1000 }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "SIGN_IN_FAILED" }, { status: 401, headers: { "Cache-Control": "no-store" } }); } finally { active--; }
}
