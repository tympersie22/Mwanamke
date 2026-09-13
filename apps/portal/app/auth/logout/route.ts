import { cookies } from "next/headers";
import { getOidc, oidc } from "@/lib/oidc";
import { portalOrigin, readSession, sessionName, transactionName } from "@/lib/session";

export function GET(request: Request) {
  return Response.redirect(new URL("/logout", request.url), 303);
}

export async function POST() {
  // Logout only clears this browser session; it does not mutate account data. Keep it
  // idempotent so browser form submissions from loopback/error recovery pages succeed.
  const session = await readSession();
  const jar = await cookies();
  jar.delete(sessionName); jar.delete(transactionName);
  if (session) {
    try { await oidc.tokenRevocation(await getOidc(session.realm ?? "patient"), session.accessToken, { token_type_hint: "access_token" }); } catch { /* Local logout is unconditional; issuer revocation must be verified in staging. */ }
  }
  return Response.redirect(portalOrigin(), 303);
}
