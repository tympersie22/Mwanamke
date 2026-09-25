import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { OidcAuthenticator } from "./auth.js";

const configuration = { issuer: "https://issuer.test", audience: "mwanamke-api", jwksUrl: "https://issuer.test/jwks", rolesClaim: "roles", authMethodsClaim: "amr" };
describe("OIDC access token boundary", () => {
  it("reads literal namespaced claims without splitting dots in the namespace", async () => {
    const keys = await generateKeyPair("ES256");
    const authenticator = new OidcAuthenticator({ ...configuration, authMethodsClaim: "https://mwanamke.africa/amr" }, createLocalJWKSet({ keys: [await exportJWK(keys.publicKey)] }));
    const token = await new SignJWT({
      "https://mwanamke.africa/amr": ["webauthn-roaming"],
      "https://mwanamke.africa/email": "invited@example.test",
      "https://mwanamke.africa/email_verified": true
    }).setProtectedHeader({ alg: "ES256" }).setSubject("opaque").setIssuer(configuration.issuer).setAudience(configuration.audience).setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
    expect(await authenticator.authenticate({ headers: { authorization: `Bearer ${token}` } } as FastifyRequest)).toMatchObject({
      authenticationMethods: ["webauthn-roaming"], email: "invited@example.test", emailVerified: true
    });
  });
  it("requires expiry and rejects wrong issuer, audience, expired token and untrusted signature", async () => {
    const keys = await generateKeyPair("ES256");
    const other = await generateKeyPair("ES256");
    const authenticator = new OidcAuthenticator(configuration, createLocalJWKSet({ keys: [await exportJWK(keys.publicKey)] }));
    const verify = async (token: string) => authenticator.authenticate({ headers: { authorization: `Bearer ${token}` } } as FastifyRequest);
    const sign = (overrides: Record<string, unknown>, key = keys.privateKey) => new SignJWT({ sub: "opaque", iss: configuration.issuer, aud: configuration.audience, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60, roles: ["patient"], ...overrides }).setProtectedHeader({ alg: "ES256" }).sign(key);
    expect(await verify(await sign({}))).toMatchObject({ subject: "opaque", roles: ["patient"] });
    for (const overrides of [{ exp: undefined }, { iat: undefined }, { iss: "https://other.test" }, { aud: "other-api" }, { exp: 1 }, { sub: undefined }]) {
      expect(await verify(await sign(overrides))).toBeNull();
    }
    expect(await verify(await sign({}, other.privateKey))).toBeNull();
  });
});
