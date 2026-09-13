import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";
import type { RuntimeConfig } from "./config.js";

export const apiRoles = ["patient", "provider", "navigator", "facility-admin", "platform-admin", "programme-admin", "system"] as const;
export type ApiRole = typeof apiRoles[number];

export type Principal = {
  issuer: string;
  subject: string;
  roles: ApiRole[];
  realm?: "patient" | "workforce";
  email?: string;
  emailVerified?: boolean;
  authenticationMethods?: string[];
};

export interface Authenticator {
  authenticate(request: FastifyRequest): Promise<Principal | null>;
}

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function claimAtPath(payload: JWTPayload, path: string): unknown {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (typeof value !== "object" || value === null) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, payload);
}

function allowedRoles(value: unknown): ApiRole[] {
  if (!Array.isArray(value)) return [];
  return value.filter((role): role is ApiRole => typeof role === "string" && apiRoles.includes(role as ApiRole));
}

export class OidcAuthenticator implements Authenticator {
  private keySets: Array<{ realm: "patient" | "workforce"; configuration: NonNullable<RuntimeConfig["oidc"]>; keySet: JWTVerifyGetKey }>;

  constructor(private readonly configuration: NonNullable<RuntimeConfig["oidc"]>, keySet?: JWTVerifyGetKey) {
    this.keySets = [{ realm: "patient", configuration, keySet: keySet ?? createRemoteJWKSet(new URL(configuration.jwksUrl), {
      cooldownDuration: 30_000,
      timeoutDuration: 5_000
    }) }];
  }

  static fromRealms(realms: NonNullable<RuntimeConfig["oidcRealms"]>): OidcAuthenticator {
    const authenticator = Object.create(OidcAuthenticator.prototype) as OidcAuthenticator;
    authenticator.keySets = (["patient", "workforce"] as const).map((realm) => ({ realm, configuration: realms[realm], keySet: createRemoteJWKSet(new URL(realms[realm].jwksUrl), { cooldownDuration: 30_000, timeoutDuration: 5_000 }) }));
    return authenticator;
  }

  async authenticate(request: FastifyRequest): Promise<Principal | null> {
    const token = bearerToken(request);
    if (!token) return null;
    for (const candidate of this.keySets) {
      try {
        const { payload } = await jwtVerify(token, candidate.keySet, {
          issuer: candidate.configuration.issuer,
          audience: candidate.configuration.audience,
          algorithms: ["RS256", "PS256", "ES256"],
          clockTolerance: 5,
          requiredClaims: ["sub", "iss", "aud", "exp", "iat"]
        });
        if (!payload.sub) return null;
        const methods = claimAtPath(payload, candidate.configuration.authMethodsClaim);
        const authenticationMethods = Array.isArray(methods) ? methods.filter((value): value is string => typeof value === "string") : Array.isArray(payload.amr) ? payload.amr.filter((value): value is string => typeof value === "string") : [];
        const roles = allowedRoles(claimAtPath(payload, candidate.configuration.rolesClaim));
        if (candidate.realm === "patient" && roles.some((role) => role !== "patient")) return null;
        if (candidate.realm === "workforce" && roles.includes("patient")) return null;
        return { issuer: payload.iss ?? candidate.configuration.issuer, subject: payload.sub, roles, realm: candidate.realm, authenticationMethods, ...(typeof payload.email === "string" ? { email: payload.email } : {}), ...(payload.email_verified === true ? { emailVerified: true } : {}) };
      } catch {
        // Try the second explicitly configured realm; the token must match issuer and audience.
      }
    }
    return null;
  }
}

export class DevelopmentAuthenticator implements Authenticator {
  constructor(private readonly enabled: boolean) {}

  async authenticate(request: FastifyRequest): Promise<Principal | null> {
    if (!this.enabled) return null;
    const token = bearerToken(request);
    if (!token?.startsWith("dev:")) return null;
    const [, role, subject = "local-user"] = token.split(":");
    if (!apiRoles.includes(role as ApiRole)) return null;
    return { issuer: "development", subject, roles: [role as ApiRole], realm: role === "patient" ? "patient" : "workforce", authenticationMethods: role === "patient" ? [] : ["mfa", "webauthn"] };
  }
}

export function createAuthenticator(configuration: RuntimeConfig): Authenticator {
  if (configuration.authMode === "oidc" && configuration.oidcRealms) return OidcAuthenticator.fromRealms(configuration.oidcRealms);
  if (configuration.authMode === "oidc" && configuration.oidc) return new OidcAuthenticator(configuration.oidc);
  return new DevelopmentAuthenticator(configuration.allowDemoAuth);
}
