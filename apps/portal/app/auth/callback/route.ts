import { cookies } from "next/headers";
import { getOidc, oidc, redirectUri, type OidcRealm } from "@/lib/oidc";
import { apiBase, cookieOptions, portalOrigin, seal, sessionName, transactionName, unseal } from "@/lib/session";
export async function GET(request: Request) {
  const jar = await cookies();
  const value = jar.get(transactionName)?.value;
  jar.delete(transactionName);
  jar.delete(sessionName);
  try {
    const transaction = value && unseal<{ verifier: string; state: string; nonce: string; realm?: OidcRealm; expiresAt: number }>(value, transactionName);
    if (!transaction) throw new Error("Missing transaction");
    const realm = transaction.realm ?? "patient";
    const callback = new URL(redirectUri(realm));
    callback.search = new URL(request.url).search;
    const tokens = await oidc.authorizationCodeGrant(await getOidc(realm), callback, { pkceCodeVerifier: transaction.verifier, expectedState: transaction.state, expectedNonce: transaction.nonce, idTokenExpected: true });
    if (!tokens.access_token || !tokens.expires_in || tokens.token_type.toLowerCase() !== "bearer") throw new Error("Invalid tokens");
    const response = await fetch(`${apiBase()}/v1/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Account unavailable");
    const maxAge = Math.min(tokens.expires_in, 900);
    const session = seal({ accessToken: tokens.access_token, expiresAt: Date.now() + maxAge * 1000, realm }, sessionName);
    if (session.length > 3800) throw new Error("Session token exceeds secure cookie limit");
    jar.set(sessionName, session, { ...cookieOptions, maxAge });
    return Response.redirect(portalOrigin(), 303);
  } catch { return Response.redirect(`${portalOrigin()}/?auth=failed`, 303); }
}
