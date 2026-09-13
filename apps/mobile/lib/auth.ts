import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
WebBrowser.maybeCompleteAuthSession();
const key = "mwanamke.session.v1";
export type Session = { accessToken: string; expiresAt: number };
export function apiUrl() {
  const value = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!value || !value.startsWith("https://")) throw new Error("Secure service connection is not configured.");
  return value.replace(/\/$/, "");
}
export async function restoreSession(): Promise<Session | null> {
  if (Platform.OS === "web") return null;
  const value = await SecureStore.getItemAsync(key, { requireAuthentication: true, authenticationPrompt: "Unlock MWANAMKE" });
  if (!value) return null;
  try { const session = JSON.parse(value) as Session; if (session.expiresAt > Date.now() && typeof session.accessToken === "string") return session; } catch { /* Invalid stored credentials are discarded. */ }
  await clearSession(); return null;
}
export async function clearSession() { if (Platform.OS !== "web") await SecureStore.deleteItemAsync(key); }
export async function signIn(): Promise<Session | null> {
  if (Platform.OS === "web") throw new Error("Use the secure MWANAMKE web portal to sign in from a browser.");
  const issuer = process.env.EXPO_PUBLIC_OIDC_ISSUER;
  const clientId = process.env.EXPO_PUBLIC_OIDC_CLIENT_ID;
  const exchange = process.env.EXPO_PUBLIC_PORTAL_ORIGIN;
  const redirectUri = process.env.EXPO_PUBLIC_OIDC_REDIRECT_URI;
  if (!issuer?.startsWith("https://") || !clientId || !exchange?.startsWith("https://") || !redirectUri) throw new Error("Sign-in is not configured for this build.");
  const discovery = await AuthSession.fetchDiscoveryAsync(issuer);
  if (!discovery.authorizationEndpoint?.startsWith("https://")) throw new Error("Secure sign-in is unavailable.");
  const nonce = Crypto.randomUUID() + Crypto.randomUUID();
  const extraParams: Record<string,string> = { nonce, prompt: "login" };
  if (process.env.EXPO_PUBLIC_OIDC_AUDIENCE) extraParams.audience = process.env.EXPO_PUBLIC_OIDC_AUDIENCE;
  const request = new AuthSession.AuthRequest({ clientId, redirectUri, scopes: ["openid", "profile"], responseType: AuthSession.ResponseType.Code, usePKCE: true, codeChallengeMethod: AuthSession.CodeChallengeMethod.S256, extraParams });
  const result = await request.promptAsync(discovery);
  if (result.type === "cancel" || result.type === "dismiss") return null;
  if (result.type !== "success" || !result.params.code || result.params.state !== request.state || !request.codeVerifier) throw new Error("Sign-in could not be verified.");
  const response = await fetch(`${exchange.replace(/\/$/, "")}/auth/native`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: result.params.code, state: request.state, nonce, verifier: request.codeVerifier }) });
  if (!response.ok) throw new Error("Sign-in could not be completed. Your account may need verification.");
  const session = await response.json() as Session;
  if (typeof session.accessToken !== "string" || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) throw new Error("Invalid session response.");
  await SecureStore.setItemAsync(key, JSON.stringify(session), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: true, authenticationPrompt: "Unlock MWANAMKE" });
  return session;
}
