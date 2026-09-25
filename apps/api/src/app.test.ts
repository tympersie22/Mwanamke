import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { decryptSensitiveRecord, encryptSensitiveRecord, generateDeviceKey, type EncryptedRecord } from "@mwanamke/security";
import { buildApp } from "./app.js";
import { loadRuntimeConfig } from "./config.js";

describe("MWANAMKE API privacy boundary", () => {
  let app: FastifyInstance;
  const configuration = loadRuntimeConfig({ NODE_ENV: "test", ALLOW_DEMO_AUTH: "true", ALLOW_DEMO_DATA: "true", ENABLE_ENCRYPTED_RECORDS: "true" });
  const patientHeaders = { authorization: "Bearer dev:patient:patient-1" };
  beforeEach(async () => { app = await buildApp({ configuration }); });
  afterEach(async () => { await app.close(); });

  it("rejects plaintext health records", async () => {
    const response = await app.inject({ method: "POST", url: "/v1/encrypted-records", headers: patientHeaders, payload: { symptom: "private symptom", pregnancyWeek: 24 } });
    expect(response.statusCode).toBe(422);
    expect(response.body).not.toContain("private symptom");
  });

  it("stores ciphertext that a server-side unrelated key cannot decrypt", async () => {
    const clientKey = await generateDeviceKey();
    const unrelatedServerKey = await generateDeviceKey();
    const envelope = await encryptSensitiveRecord({ privateNote: "only the client can read this" }, clientKey, "health-record", "test-record-api");
    const stored = await app.inject({ method: "POST", url: "/v1/encrypted-records", headers: patientHeaders, payload: envelope });
    expect(stored.statusCode).toBe(201);
    const id = stored.json<{ id: string }>().id;
    const fetched = await app.inject({ method: "GET", url: `/v1/encrypted-records/${id}`, headers: patientHeaders });
    const returned = fetched.json<{ data: EncryptedRecord }>().data;
    expect(JSON.stringify(returned)).not.toContain("only the client");
    await expect(decryptSensitiveRecord(returned, unrelatedServerKey)).rejects.toThrow();
    await expect(decryptSensitiveRecord(returned, clientKey)).resolves.toEqual({ privateNote: "only the client can read this" });
  });

  it("keeps encrypted records disabled until the release approvals are enabled", async () => {
    const disabled = await buildApp({ configuration: loadRuntimeConfig({ NODE_ENV: "test", ALLOW_DEMO_AUTH: "true" }) });
    try {
      const response = await disabled.inject({ method: "POST", url: "/v1/encrypted-records", headers: patientHeaders, payload: {} });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "FEATURE_NOT_ENABLED" });
    } finally { await disabled.close(); }
  });

  it("keeps push notifications neutral", async () => {
    const response = await app.inject({ method: "POST", url: "/v1/notifications/00000000-0000-4000-8000-000000000099", headers: { authorization: "Bearer dev:system:notification-worker" }, payload: { internalEvent: "result-ready" } });
    expect(response.statusCode).toBe(202);
    expect(response.json().body).toBe("You have an update waiting.");
    expect(response.body).not.toMatch(/result|pregnan|period|prescription/i);
  });

  it("makes payment reservation idempotent and failure-safe", async () => {
    const payload = { appointmentId: "00000000-0000-4000-8000-000000000010", amountTzs: 35000, method: "mpesa", idempotencyKey: "idem_12345678" };
    const first = await app.inject({ method: "POST", url: "/v1/payments/reserve", headers: patientHeaders, payload });
    const second = await app.inject({ method: "POST", url: "/v1/payments/reserve", headers: patientHeaders, payload });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(second.json().idempotent).toBe(true);
  });

  it("denies protected routes when no authenticated principal exists", async () => {
    const unauthenticated = await buildApp({ authenticator: { authenticate: async () => null } });
    const response = await unauthenticated.inject({ method: "GET", url: "/v1/admin/aggregate" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "AUTHENTICATION_REQUIRED" });
    await unauthenticated.close();
  });

  it("returns one authoritative identity role without exposing the OIDC subject", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: patientHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ role: "patient", accountStatus: "active", identitySource: "oidc", provisioning: "self-service" });
    expect(response.body).not.toContain("patient-1");
  });
});

describe("pilot service boundaries", () => {
  it("does not queue a payment when production payment integration is disabled", async () => {
    const app = await buildApp({ configuration: loadRuntimeConfig({ NODE_ENV: "test", ALLOW_DEMO_AUTH: "true", ALLOW_DEMO_DATA: "true", PAYMENT_ADAPTER: "disabled" }) });
    try {
      const response = await app.inject({ method: "POST", url: "/v1/payments/reserve", headers: { authorization: "Bearer dev:patient:patient-1" }, payload: { appointmentId: "00000000-0000-4000-8000-000000000010", amountTzs: 35000, method: "mpesa", idempotencyKey: "disabled-payment-test" } });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "PAYMENTS_NOT_AVAILABLE" });
    } finally { await app.close(); }
  });
});

describe("Authorized list DTOs", () => {
  it("requires authentication, rejects oversized pages and does not return demo providers", async () => {
    const app = await buildApp({ configuration: loadRuntimeConfig({ NODE_ENV: "test", ALLOW_DEMO_AUTH: "true", ALLOW_DEMO_DATA: "true", ENABLE_ENCRYPTED_RECORDS: "true" }) });
    try {
      expect((await app.inject({ url: "/v1/providers" })).statusCode).toBe(401);
      const headers = { authorization: "Bearer dev:patient:list-owner" };
      expect((await app.inject({ url: "/v1/providers?limit=101", headers })).statusCode).toBe(422);
      expect((await app.inject({ url: "/v1/providers", headers })).json()).toEqual({ data: [], nextCursor: null });
      expect((await app.inject({ url: "/v1/providers", headers: { authorization: "Bearer dev:provider:staff" } })).statusCode).toBe(403);
      expect((await app.inject({ url: "/v1/providers", headers: { authorization: "Bearer dev:platform-admin:admin" } })).statusCode).toBe(403);
      expect((await app.inject({ url: "/v1/navigator/assignments", headers })).statusCode).toBe(403);
      expect((await app.inject({ method: "POST", url: "/v1/notifications/anything", headers: { authorization: "Bearer dev:provider:staff" } })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: "/v1/encrypted-records/not-a-uuid", headers })).statusCode).toBe(422);
      expect((await app.inject({ method: "DELETE", url: "/v1/consents/not-a-uuid", headers })).statusCode).toBe(422);
    } finally { await app.close(); }
  });

  it("scopes appointment history to the current patient and forbids administrative browsing", async () => {
    const app = await buildApp({ configuration: loadRuntimeConfig({ NODE_ENV: "test", ALLOW_DEMO_AUTH: "true" }) });
    try {
      const headers = { authorization: "Bearer dev:patient:history-owner" };
      const response = await app.inject({ method: "POST", url: "/v1/appointments", headers, payload: { slotId: "00000000-0000-4000-8000-000000000020", serviceId: "00000000-0000-4000-8000-000000000021", mode: "physical", idempotencyKey: "history-appointment" } });
      expect(response.statusCode).toBe(201);
      expect((await app.inject({ url: "/v1/appointments", headers })).json().data).toHaveLength(1);
      expect((await app.inject({ url: "/v1/appointments", headers: { authorization: "Bearer dev:patient:stranger" } })).json().data).toEqual([]);
      expect((await app.inject({ url: "/v1/appointments", headers: { authorization: "Bearer dev:platform-admin:admin" } })).statusCode).toBe(403);
    } finally { await app.close(); }
  });

  it("keeps workforce account deletion under managed identity controls", async () => {
    const app = await buildApp({ configuration: loadRuntimeConfig({ NODE_ENV: "test", ALLOW_DEMO_AUTH: "true" }) });
    try {
      const response = await app.inject({ method: "POST", url: "/v1/privacy/requests", headers: { authorization: "Bearer dev:provider:staff" }, payload: { kind: "deletion", idempotencyKey: "managed-workforce-account" } });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "WORKFORCE_ACCOUNT_MANAGED" });
    } finally { await app.close(); }
  });

  it("rejects unknown fields on high-impact mutation contracts", async () => {
    const app = await buildApp({ configuration: loadRuntimeConfig({ NODE_ENV: "test", ALLOW_DEMO_AUTH: "true" }) });
    const headers = { authorization: "Bearer dev:patient:strict-contract-owner" };
    try {
      const appointment = await app.inject({ method: "POST", url: "/v1/appointments", headers, payload: { slotId: "00000000-0000-4000-8000-000000000020", serviceId: "00000000-0000-4000-8000-000000000021", mode: "physical", idempotencyKey: "strict-appointment", clinicalNote: "must be rejected" } });
      expect(appointment.statusCode).toBe(422);
      expect(appointment.body).not.toContain("must be rejected");
      const payment = await app.inject({ method: "POST", url: "/v1/payments/reserve", headers, payload: { appointmentId: "00000000-0000-4000-8000-000000000010", amountTzs: 35000, method: "mpesa", idempotencyKey: "strict-payment", callbackUrl: "https://attacker.invalid" } });
      expect(payment.statusCode).toBe(422);
    } finally { await app.close(); }
  });
});

describe("Staff MFA", () => {
  it("requires verified mfa authentication after resolving the stored staff role", async () => {
    const { MemoryApplicationStore } = await import("./store.js");
    const store = new MemoryApplicationStore();
    const configuration = loadRuntimeConfig({ NODE_ENV: "test" });
    for (const [authenticationMethods, expected] of [[[], 403], [["mfa"], 403], [["webauthn"], 200]] as const) {
      const app = await buildApp({ configuration, store, authenticator: { authenticate: async () => ({ issuer: "https://issuer.test", subject: "staff", roles: ["navigator"], realm: "workforce", authenticationMethods: [...authenticationMethods] }) } });
      try { expect((await app.inject({ url: "/v1/me" })).statusCode).toBe(expected); } finally { await app.close(); }
    }
  });
});

describe("Workforce invitation and device lifecycle", () => {
  it("accepts only a verified-email one-time invitation and supports remote device revocation", async () => {
    const { MemoryApplicationStore } = await import("./store.js");
    const store = new MemoryApplicationStore();
    let principal: import("./auth.js").Principal = { issuer: "development", subject: "issuer-admin", roles: ["platform-admin"], realm: "workforce", authenticationMethods: ["webauthn"] };
    const authenticator = { authenticate: async () => principal };
    const app = await buildApp({ configuration: loadRuntimeConfig({ NODE_ENV: "test" }), store, authenticator });
    try {
      const invitation = await app.inject({ method: "POST", url: "/v1/workforce/invitations", payload: { email: "provider@example.test", intendedRole: "provider" } });
      expect(invitation.statusCode).toBe(201);
      const token = invitation.json<{ token: string }>().token;
      principal = { issuer: "workforce", subject: "provider-1", roles: [], realm: "workforce", email: "provider@example.test", emailVerified: true, authenticationMethods: ["webauthn"] };
      const accepted = await app.inject({ method: "POST", url: "/v1/workforce/invitations/accept", payload: { token } });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json().data.role).toBe("provider");
      expect((await app.inject({ method: "POST", url: "/v1/workforce/invitations/accept", payload: { token } })).statusCode).toBe(403);
      const device = await app.inject({ method: "POST", url: "/v1/devices", payload: { label: "Clinic iPhone", algorithm: "Ed25519", publicKey: "A".repeat(48), attestationFormat: "webauthn", attestationEvidence: "E".repeat(32) } });
      expect(device.statusCode).toBe(201);
      const deviceId = device.json<{ data: { id: string } }>().data.id;
      expect((await app.inject({ method: "DELETE", url: `/v1/devices/${deviceId}` })).json().status).toBe("revoked");
      expect((await app.inject({ method: "GET", url: "/v1/devices" })).json().data).toEqual([]);
    } finally { await app.close(); }
  });
});

describe("Profile and privacy request contracts", () => {
  it("accepts only language preferences and scopes idempotent request intake to its owner", async () => {
    const app = await buildApp({ configuration: loadRuntimeConfig({ NODE_ENV: "test", ALLOW_DEMO_AUTH: "true" }) });
    const headers = { authorization: "Bearer dev:patient:privacy-api-owner" };
    try {
      expect((await app.inject({ url: "/v1/profile" })).statusCode).toBe(401);
      expect((await app.inject({ method: "PATCH", url: "/v1/profile", headers, payload: { preferredLanguage: "en", clinicalNote: "must not persist" } })).statusCode).toBe(422);
      expect((await app.inject({ method: "PATCH", url: "/v1/profile", headers, payload: { preferredLanguage: "en" } })).json()).toEqual({ data: { preferredLanguage: "en" } });
      expect((await app.inject({ url: "/v1/profile", headers })).json()).toEqual({ data: { preferredLanguage: "en" } });
      const payload = { kind: "deletion", idempotencyKey: "privacy-api-request-01" };
      const first = await app.inject({ method: "POST", url: "/v1/privacy/requests", headers, payload });
      const retry = await app.inject({ method: "POST", url: "/v1/privacy/requests", headers, payload });
      expect(first.statusCode).toBe(201);
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toEqual(first.json());
      expect(first.json().data.status).toBe("submitted");
      expect((await app.inject({ method: "POST", url: "/v1/privacy/requests", headers, payload: { ...payload, kind: "export" } })).statusCode).toBe(409);
      expect((await app.inject({ url: "/v1/privacy/requests", headers: { authorization: "Bearer dev:patient:privacy-api-stranger" } })).json()).toEqual({ data: [], nextCursor: null });
    } finally { await app.close(); }
  });
});
