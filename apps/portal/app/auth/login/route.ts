import { cookies } from "next/headers";
import { getOidc, oidc, redirectUri, type OidcRealm } from "@/lib/oidc";
import { cookieOptions, localRolePreviewEnabled, portalOrigin, seal, sessionName, transactionName } from "@/lib/session";
const previewRoles = new Set(["patient", "provider", "navigator", "platform-admin"]);
const previewSubjects: Record<string, string> = {
  patient: "synthetic-patient-validation",
  provider: "synthetic-provider-validation",
  navigator: "synthetic-navigator-validation",
  "platform-admin": "synthetic-platform-admin-validation"
};
export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const requestedRole = requestUrl.searchParams.get("role");
    if (localRolePreviewEnabled()) {
      const role = requestedRole && previewRoles.has(requestedRole) ? requestedRole : "patient";
      const realm: OidcRealm = role === "patient" ? "patient" : "workforce";
      const maxAge = 900;
      const session = seal({ accessToken: `dev:${role}:${previewSubjects[role]}`, realm, expiresAt: Date.now() + maxAge * 1000 }, sessionName);
      const jar = await cookies();
      jar.delete(transactionName);
      jar.set(sessionName, session, { ...cookieOptions, maxAge });
      return Response.redirect(portalOrigin(), 303);
    }
    const realm: OidcRealm = requestUrl.searchParams.get("realm") === "workforce" ? "workforce" : "patient";
    const configuration = await getOidc(realm);
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const value = seal({ verifier, state, nonce, realm, expiresAt: Date.now() + 600_000 }, transactionName);
    (await cookies()).set(transactionName, value, { ...cookieOptions, maxAge: 600 });
    const parameters: Record<string, string> = { redirect_uri: redirectUri(realm), scope: "openid profile", code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256", state, nonce, prompt: "login" };
    const resource = realm === "workforce" ? process.env.OIDC_WORKFORCE_RESOURCE : process.env.OIDC_PATIENT_RESOURCE ?? process.env.OIDC_RESOURCE;
    const audience = realm === "workforce" ? process.env.OIDC_WORKFORCE_AUDIENCE : process.env.OIDC_PATIENT_AUDIENCE ?? process.env.OIDC_AUDIENCE;
    if (resource) parameters.resource = resource;
    if (audience) parameters.audience = audience;
    for (const name of ["invitation", "organization", "organization_name"] as const) {
      const value = requestUrl.searchParams.get(name);
      if (value && value.length <= 255) parameters[name === "organization" ? "organization" : name] = value;
    }
    return Response.redirect(oidc.buildAuthorizationUrl(configuration, parameters), 303);
  } catch { return Response.json({ error: "SIGN_IN_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
