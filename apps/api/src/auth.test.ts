import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { OidcAuthenticator } from "./auth.js";

const configuration = { issuer: "https://issuer.test", audience: "mwanamke-api", jwksUrl: "https://issuer.test/jwks", rolesClaim: "roles", authMethodsClaim: "amr" };
describe("OIDC access token boundary", () => {
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
