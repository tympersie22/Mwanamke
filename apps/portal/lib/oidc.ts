import * as oidc from "openid-client";
import { portalOrigin } from "./session";
export type OidcRealm = "patient" | "workforce";
const configurations = new Map<OidcRealm, Promise<oidc.Configuration>>();
function realmValue(realm: OidcRealm, suffix: string, legacySuffix: string): string | undefined {
  return process.env[`OIDC_${realm.toUpperCase()}_${suffix}`] ?? (realm === "patient" ? process.env[`OIDC_${legacySuffix}`] : undefined);
}
export function redirectUri(realm: OidcRealm = "patient") {
  const uri = realmValue(realm, "REDIRECT_URI", "REDIRECT_URI") ?? `${portalOrigin()}/auth/callback`;
  if (new URL(uri).origin !== portalOrigin() || new URL(uri).pathname !== "/auth/callback") throw new Error("Invalid OIDC redirect URI");
  return uri;
}
export function getOidc(realm: OidcRealm = "patient") {
  let configuration = configurations.get(realm);
  if (!configuration) {
    configuration = (async () => {
    const issuer = realmValue(realm, "ISSUER_URL", "ISSUER");
    const clientId = realmValue(realm, "CLIENT_ID", "CLIENT_ID");
    const clientSecret = realmValue(realm, "CLIENT_SECRET", "CLIENT_SECRET");
    if (!issuer || !clientId) throw new Error(`${realm} OIDC configuration missing`);
    const execute = [oidc.enableNonRepudiationChecks];
    if (process.env.NODE_ENV !== "production" && process.env.OIDC_ALLOW_INSECURE_LOCAL === "true" && ["127.0.0.1", "localhost"].includes(new URL(issuer).hostname)) execute.push(oidc.allowInsecureRequests);
    return oidc.discovery(new URL(issuer), clientId, clientSecret, undefined, { execute, timeout: 10 });
    })().catch((error) => { configurations.delete(realm); throw error; });
    configurations.set(realm, configuration);
  }
  return configuration;
}
export { oidc };
