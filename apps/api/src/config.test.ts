import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "./config.js";

const productionEnvironment = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  APP_ORIGIN: "https://app.mwanamke.africa",
  DATABASE_URL: "postgresql://service:secret@database.internal:5432/mwanamke",
  STATE_STORE: "postgres",
  AUTH_MODE: "oidc",
  OIDC_PATIENT_ISSUER_URL: "https://patient.identity.example.test",
  OIDC_PATIENT_JWKS_URL: "https://patient.identity.example.test/.well-known/jwks.json",
  OIDC_PATIENT_AUDIENCE: "mwanamke-patient-api",
  OIDC_WORKFORCE_ISSUER_URL: "https://workforce.identity.example.test",
  OIDC_WORKFORCE_JWKS_URL: "https://workforce.identity.example.test/.well-known/jwks.json",
  OIDC_WORKFORCE_AUDIENCE: "mwanamke-workforce-api",
  IDENTITY_SUBJECT_HMAC_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  AUDIT_HMAC_KEY: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
  AUDIT_SINK_URL: "https://audit.example.test/events",
  AUDIT_SINK_TOKEN: "audit-token-012345678901234567890123456789",
  REDIS_URL: "rediss://redis.example.test:6380",
  PAYMENT_ADAPTER: "configured",
  NOTIFICATION_ADAPTER: "configured",
  ...overrides
});

describe("production runtime configuration", () => {
  it("fails closed when production attempts to use development defaults", () => {
    expect(() => loadRuntimeConfig({ NODE_ENV: "production" })).toThrow(/Production|production/);
  });

  it("rejects demo access and mock adapters in production", () => {
    expect(() => loadRuntimeConfig(productionEnvironment({
      ALLOW_DEMO_AUTH: "true",
      ALLOW_DEMO_DATA: "true",
      PAYMENT_ADAPTER: "mock",
      NOTIFICATION_ADAPTER: "mock"
    }))).toThrow(/forbidden|Mock/);
  });

  it("rejects encrypted records without all three approval references", () => {
    expect(() => loadRuntimeConfig(productionEnvironment({ ENABLE_ENCRYPTED_RECORDS: "true" }))).toThrow(/approval reference/);
  });

  it("accepts encrypted records only when infrastructure, security and privacy approvals are referenced", () => {
    const configuration = loadRuntimeConfig(productionEnvironment({
      ENABLE_ENCRYPTED_RECORDS: "true",
      INFRASTRUCTURE_APPROVAL_REF: "infra-approval-2026-001",
      SECURITY_ASSESSMENT_APPROVAL_REF: "security-approval-2026-001",
      PRIVACY_LEGAL_APPROVAL_REF: "privacy-approval-2026-001"
    }));
    expect(configuration.features.encryptedRecords).toBe(true);
  });

  it("accepts an explicit production configuration with encrypted records disabled", () => {
    const configuration = loadRuntimeConfig(productionEnvironment());
    expect(configuration.nodeEnv).toBe("production");
    expect(configuration.allowDemoAuth).toBe(false);
    expect(configuration.features.encryptedRecords).toBe(false);
  });

  it("allows partner services to stay explicitly disabled during the controlled pilot", () => {
    const configuration = loadRuntimeConfig(productionEnvironment({ PAYMENT_ADAPTER: "disabled", NOTIFICATION_ADAPTER: "disabled" }));
    expect(configuration.adapters).toMatchObject({ payment: "disabled", notification: "disabled" });
  });
});
