import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import Redis from "ioredis";
import { createHash } from "node:crypto";
import { pageQuery, profileDto, privacyRequestDto, serviceDto, providerDto, slotDto, appointmentDto, paymentDto, assignmentDto, validatedPage } from "./dto.js";
import { isCiphertextEnvelope, neutralNotificationPayload } from "@mwanamke/security";
import { z } from "zod";
import type { Authenticator, ApiRole, Principal } from "./auth.js";
import { createAuthenticator } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import { loadRuntimeConfig } from "./config.js";
import type { ApplicationStore, Actor } from "./store.js";
import { createApplicationStore, AppointmentConflictError, PaymentConflictError, ResourceNotFoundError, SlotUnavailableError } from "./store.js";

const forbiddenPlaintextKeys = new Set(["symptom", "diagnosis", "pregnancyWeek", "cycleDate", "clinicalNote", "safetyNote", "messageText", "documentText"]);
const mutationRateLimit = { max: 20, timeWindow: "1 minute", ban: 3, exponentialBackoff: true } as const;
const highRiskMutationRateLimit = { max: 5, timeWindow: "1 minute", ban: 2, exponentialBackoff: true } as const;
const phishingResistantMethods = new Set(["webauthn", "fido2", "passkey", "hwk", "webauthn-platform", "webauthn-roaming"]);

function hasForbiddenPlaintext(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenPlaintext);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => forbiddenPlaintextKeys.has(key) || hasForbiddenPlaintext(nested));
}

export type BuildAppOptions = {
  configuration?: RuntimeConfig;
  authenticator?: Authenticator;
  store?: ApplicationStore;
};

async function requireActor(request: Parameters<Authenticator["authenticate"]>[0], reply: { code(status: number): { send(body: unknown): unknown } }, authenticator: Authenticator, store: ApplicationStore, allowed: ApiRole[]): Promise<{ principal: Principal; actor: Actor } | null> {
  const principal = await authenticator.authenticate(request);
  if (!principal) {
    reply.code(401).send({ error: "AUTHENTICATION_REQUIRED" });
    return null;
  }
  const actor = await store.resolveActor(principal);
  if (!actor || !allowed.includes(actor.role)) {
    reply.code(403).send({ error: "IDENTITY_NOT_PROVISIONED" });
    return null;
  }
  if (actor.role !== "patient" && principal.issuer !== "development" && principal.realm !== "workforce") {
    reply.code(403).send({ error: "WORKFORCE_IDENTITY_REQUIRED" });
    return null;
  }
  if (actor.role !== "patient" && principal.issuer !== "development" && !principal.authenticationMethods?.some((method) => phishingResistantMethods.has(method.toLowerCase()))) {
    reply.code(403).send({ error: "STAFF_MFA_REQUIRED" });
    return null;
  }
  return { principal, actor };
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const configuration = options.configuration ?? loadRuntimeConfig();
  const authenticator = options.authenticator ?? createAuthenticator(configuration);
  const ownsStore = !options.store;
  const store = options.store ?? createApplicationStore(configuration);
  const app = Fastify({
    logger: {
      level: configuration.nodeEnv === "test" ? "silent" : configuration.logLevel,
      redact: ["req.headers.authorization", "req.body.ciphertext", "req.body.envelope", "*.recoveryKey", "*.pin", "*.encryptedSharingPackage"]
    },
    bodyLimit: 1_000_000,
    requestIdHeader: "x-request-id",
    trustProxy: configuration.trustProxy
  });
  const redis = configuration.redisUrl ? new Redis(configuration.redisUrl, { connectTimeout: 5_000, maxRetriesPerRequest: 1, enableOfflineQueue: false, tls: {} }) : undefined;

  if (ownsStore) app.addHook("onClose", async () => { await store.close(); await redis?.quit(); });
  await app.register(cors, { origin: configuration.appOrigin, methods: ["GET", "POST", "PATCH", "DELETE"] });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    redis,
    skipOnError: false,
    nameSpace: "mwanamke:edge-rate-limit:",
    keyGenerator: (request) => {
      const token = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : "anonymous";
      const credential = createHash("sha256").update(token).digest("hex").slice(0, 24);
      return `${request.ip}:${credential}:${request.url.split("?")[0]}`;
    }
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return payload;
  });
  if (configuration.nodeEnv !== "production") {
    await app.register(swagger, {
      openapi: {
        info: { title: "MWANAMKE operational and ciphertext API", version: "0.2.0", description: "Sensitive payloads must be encrypted by the client. The server has no decryption keys." },
        tags: [{ name: "operational" }, { name: "zero-knowledge" }, { name: "assurance" }]
      }
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  app.get("/health", { schema: { tags: ["assurance"] } }, async () => ({ status: "healthy", sensitiveDataReadable: false }));
  app.get("/ready", { schema: { tags: ["assurance"] } }, async (_request, reply) => (await store.isReady()) ? { status: "ready" } : reply.code(503).send({ status: "not-ready" }));

  const humanRoles: ApiRole[] = ["patient", "provider", "navigator", "facility-admin", "platform-admin", "programme-admin"];
  app.get("/v1/me", { schema: { tags: ["operational"], summary: "Return the authoritative role bound to the current OIDC subject" } }, async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, ["patient", "provider", "navigator", "facility-admin", "platform-admin", "programme-admin"]);
    if (!authorization) return;
    const role = authorization.actor.role;
    return {
      data: {
        id: authorization.actor.userId,
        role,
        accountStatus: "active",
        identitySource: "oidc",
        provisioning: role === "patient" ? "self-service" : "verified-or-invited"
      }
    };
  });

  app.post("/v1/workforce/invitations", { config: { rateLimit: highRiskMutationRateLimit }, schema: { tags: ["operational"], summary: "Create a one-time, verified-email workforce invitation" } }, async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, ["platform-admin", "programme-admin"]);
    if (!authorization) return;
    const parsed = z.object({ email: z.string().email().max(254), intendedRole: z.enum(["provider", "navigator", "facility-admin", "platform-admin", "programme-admin"]), ttlSec: z.number().int().min(900).max(2_592_000).default(604_800) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(422).send({ error: "INVALID_INVITATION" });
    const invitation = await store.createRoleInvitation(authorization.actor.userId, parsed.data.email, parsed.data.intendedRole, parsed.data.ttlSec);
    return reply.code(201).send({ id: invitation.id, token: invitation.token, expiresAt: invitation.expiresAt, deliverBy: "approved-email-channel" });
  });

  app.post("/v1/workforce/invitations/accept", { config: { rateLimit: highRiskMutationRateLimit }, schema: { tags: ["operational"], summary: "Accept an invitation after Auth0 verified the workforce email" } }, async (request, reply) => {
    const principal = await authenticator.authenticate(request);
    if (!principal) return reply.code(401).send({ error: "AUTHENTICATION_REQUIRED" });
    const parsed = z.object({ token: z.string().min(40).max(128) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(422).send({ error: "INVALID_INVITATION" });
    const actor = await store.acceptRoleInvitation(principal, parsed.data.token);
    if (!actor) return reply.code(403).send({ error: "INVITATION_INVALID_OR_EXPIRED" });
    return { data: { id: actor.userId, role: actor.role, status: "active" } };
  });

  const deviceBody = z.object({ label: z.string().trim().min(2).max(80), algorithm: z.enum(["ECDSA-P256-SHA256", "Ed25519"]), publicKey: z.string().regex(/^[A-Za-z0-9+/=_-]{40,4096}$/), attestationFormat: z.enum(["apple-app-attest", "android-key-attestation", "webauthn"]).optional(), attestationEvidence: z.string().min(32).max(16_384).optional() }).strict().superRefine((value, context) => { if (Boolean(value.attestationFormat) !== Boolean(value.attestationEvidence)) context.addIssue({ code: "custom", path: ["attestationEvidence"], message: "Attestation format and evidence must be supplied together" }); });
  app.get("/v1/devices", async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, humanRoles);
    if (!authorization) return;
    return { data: await store.listDevices(authorization.actor.userId) };
  });
  app.post("/v1/devices", { config: { rateLimit: highRiskMutationRateLimit }, schema: { tags: ["operational"], summary: "Register a device public key" } }, async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, humanRoles);
    if (!authorization) return;
    const parsed = deviceBody.safeParse(request.body);
    if (!parsed.success) return reply.code(422).send({ error: "INVALID_DEVICE" });
    if (configuration.nodeEnv === "production" && (!parsed.data.attestationFormat || !parsed.data.attestationEvidence)) return reply.code(422).send({ error: "DEVICE_ATTESTATION_REQUIRED" });
    return reply.code(201).send({ data: await store.registerDevice(authorization.actor.userId, parsed.data.label, parsed.data.algorithm, parsed.data.publicKey, parsed.data.attestationFormat ?? "development", parsed.data.attestationEvidence ?? "development-attestation") });
  });
  app.delete("/v1/devices/:id", { config: { rateLimit: highRiskMutationRateLimit }, schema: { tags: ["operational"] } }, async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, humanRoles);
    if (!authorization) return;
    const id = z.string().uuid().safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.code(422).send({ error: "INVALID_ID" });
    if (!await store.revokeDevice(authorization.actor.userId, id.data)) return reply.code(404).send({ error: "NOT_FOUND" });
    return { id: id.data, status: "revoked" };
  });

  app.get("/v1/profile", async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, humanRoles);
    if (!authorization) return;
    return { data: profileDto.parse(await store.getProfile(authorization.actor.userId)) };
  });
  app.patch("/v1/profile", { config: { rateLimit: mutationRateLimit } }, async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, humanRoles);
    if (!authorization) return;
    const body = profileDto.safeParse(request.body);
    if (!body.success) return reply.code(422).send({ error: "INVALID_PROFILE" });
    return { data: profileDto.parse(await store.updateProfile(authorization.actor.userId, body.data)) };
  });
  app.get("/v1/privacy/requests", async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, humanRoles);
    if (!authorization) return;
    const query = pageQuery.safeParse(request.query);
    if (!query.success) return reply.code(422).send({ error: "INVALID_PAGINATION" });
    return validatedPage(privacyRequestDto, await store.listPrivacyRequests(authorization.actor.userId, query.data));
  });
  app.post("/v1/privacy/requests", { config: { rateLimit: highRiskMutationRateLimit } }, async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, humanRoles);
    if (!authorization) return;
    const body = z.object({ kind: z.enum(["export", "deletion"]), idempotencyKey: z.string().min(8).max(80) }).strict().safeParse(request.body);
    if (!body.success) return reply.code(422).send({ error: "INVALID_PRIVACY_REQUEST" });
    try {
      const result = await store.createPrivacyRequest(authorization.actor.userId, body.data.kind, body.data.idempotencyKey);
      return reply.code(result.created ? 201 : 200).send({ data: privacyRequestDto.parse(result.data) });
    } catch (error) {
      if (error instanceof AppointmentConflictError) return reply.code(409).send({ error: "IDEMPOTENCY_CONFLICT" });
      throw error;
    }
  });
  app.get("/v1/providers", async (request, reply) => {
    if (!await requireActor(request, reply, authenticator, store, humanRoles)) return;
    const query = pageQuery.safeParse(request.query);
    if (!query.success) return reply.code(422).send({ error: "INVALID_PAGINATION" });
    return validatedPage(providerDto, await store.listProviders(query.data));
  });
  app.get("/v1/providers/:id", async (request, reply) => {
    if (!await requireActor(request, reply, authenticator, store, humanRoles)) return;
    const id = z.string().uuid().safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.code(422).send({ error: "INVALID_ID" });
    const provider = await store.getProvider(id.data);
    if (!provider) return reply.code(404).send({ error: "NOT_FOUND" });
    return { data: providerDto.parse(provider) };
  });
  app.get("/v1/providers/:id/services", async (request, reply) => {
    if (!await requireActor(request, reply, authenticator, store, humanRoles)) return;
    const id = z.string().uuid().safeParse((request.params as { id: string }).id);
    const query = pageQuery.safeParse(request.query);
    if (!id.success || !query.success) return reply.code(422).send({ error: "INVALID_QUERY" });
    if (!await store.getProvider(id.data)) return reply.code(404).send({ error: "NOT_FOUND" });
    return validatedPage(serviceDto, await store.listServices(id.data, query.data));
  });
  app.get("/v1/providers/:id/availability", async (request, reply) => {
    if (!await requireActor(request, reply, authenticator, store, humanRoles)) return;
    const id = z.string().uuid().safeParse((request.params as { id: string }).id);
    const query = pageQuery.safeParse(request.query);
    if (!id.success || !query.success) return reply.code(422).send({ error: "INVALID_QUERY" });
    if (!await store.getProvider(id.data)) return reply.code(404).send({ error: "NOT_FOUND" });
    return validatedPage(slotDto, await store.listAvailability(id.data, query.data));
  });
  app.get("/v1/appointments", async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, ["patient", "provider"]);
    if (!authorization) return;
    const query = pageQuery.safeParse(request.query);
    if (!query.success) return reply.code(422).send({ error: "INVALID_PAGINATION" });
    return validatedPage(appointmentDto, await store.listAppointments(authorization.actor, query.data));
  });
  app.get("/v1/payments", async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, ["patient"]);
    if (!authorization) return;
    const query = pageQuery.safeParse(request.query);
    if (!query.success) return reply.code(422).send({ error: "INVALID_PAGINATION" });
    return validatedPage(paymentDto, await store.listPayments(authorization.actor.userId, query.data));
  });
  app.get("/v1/navigator/assignments", async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, ["navigator"]);
    if (!authorization) return;
    const query = pageQuery.safeParse(request.query);
    if (!query.success) return reply.code(422).send({ error: "INVALID_PAGINATION" });
    return validatedPage(assignmentDto, await store.listAssignments(authorization.actor.userId, query.data));
  });

  app.post("/v1/encrypted-records", { config: { rateLimit: mutationRateLimit }, schema: { tags: ["zero-knowledge"], summary: "Store a client-encrypted sensitive record" } }, async (request, reply) => {
    if (!configuration.features.encryptedRecords) return reply.code(404).send({ error: "FEATURE_NOT_ENABLED" });
    const authorization = await requireActor(request, reply, authenticator, store, ["patient"]);
    if (!authorization) return;
    const deviceId = request.headers["x-mwanamke-device-id"];
    if (configuration.nodeEnv === "production" && (typeof deviceId !== "string" || !await store.isDeviceActive(authorization.actor.userId, deviceId))) return reply.code(403).send({ error: "DEVICE_REVOKED_OR_REQUIRED" });
    const body: unknown = request.body;
    if (hasForbiddenPlaintext(body) || !isCiphertextEnvelope(body)) return reply.code(422).send({ error: "CIPHERTEXT_ENVELOPE_REQUIRED" });
    const result = await store.createEncryptedRecord(authorization.actor.userId, body);
    return reply.code(result.created ? 201 : 200).send({ id: result.id, status: result.created ? "stored" : "already-stored", serverCanDecrypt: false });
  });

  app.get("/v1/encrypted-records/:id", { schema: { tags: ["zero-knowledge"] } }, async (request, reply) => {
    if (!configuration.features.encryptedRecords) return reply.code(404).send({ error: "FEATURE_NOT_ENABLED" });
    const authorization = await requireActor(request, reply, authenticator, store, ["patient"]);
    if (!authorization) return;
    const deviceId = request.headers["x-mwanamke-device-id"];
    if (configuration.nodeEnv === "production" && (typeof deviceId !== "string" || !await store.isDeviceActive(authorization.actor.userId, deviceId))) return reply.code(403).send({ error: "DEVICE_REVOKED_OR_REQUIRED" });
    const id = z.string().uuid().safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.code(422).send({ error: "INVALID_ID" });
    const envelope = await store.getEncryptedRecord(authorization.actor.userId, id.data);
    if (!envelope) return reply.code(404).send({ error: "NOT_FOUND" });
    return { data: envelope };
  });

  const appointmentSchema = z.object({ slotId: z.string().uuid(), serviceId: z.string().uuid(), mode: z.enum(["physical", "virtual"]), idempotencyKey: z.string().min(8).max(80) }).strict();
  app.post("/v1/appointments", { config: { rateLimit: mutationRateLimit }, schema: { tags: ["operational"] } }, async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, ["patient"]);
    if (!authorization) return;
    const parsed = appointmentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(422).send({ error: "INVALID_APPOINTMENT", fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
    try {
      return reply.code(201).send(await store.reserveAppointment(authorization.actor.userId, parsed.data));
    } catch (error) {
      if (error instanceof AppointmentConflictError) return reply.code(409).send({ error: "APPOINTMENT_CONFLICT" });
      if (error instanceof SlotUnavailableError) return reply.code(409).send({ error: "SLOT_UNAVAILABLE" });
      if (error instanceof ResourceNotFoundError) return reply.code(404).send({ error: "BOOKING_RESOURCE_NOT_FOUND" });
      throw error;
    }
  });

  for (const action of ["confirm", "cancel"] as const) {
    app.post(`/v1/appointments/:id/${action}`, { config: { rateLimit: mutationRateLimit } }, async (request, reply) => {
      const authorization = await requireActor(request, reply, authenticator, store, ["patient"]);
      if (!authorization) return;
      const id = z.string().uuid().safeParse((request.params as { id: string }).id);
      if (!id.success) return reply.code(422).send({ error: "INVALID_ID" });
      try { return await store.transitionAppointment(authorization.actor.userId, id.data, action); }
      catch (error) {
        if (error instanceof ResourceNotFoundError) return reply.code(404).send({ error: "NOT_FOUND" });
        if (error instanceof AppointmentConflictError) return reply.code(409).send({ error: "APPOINTMENT_CONFLICT" });
        if (error instanceof PaymentConflictError) return reply.code(409).send({ error: "PAYMENT_NOT_SETTLED" });
        throw error;
      }
    });
  }

  const paymentSchema = z.object({ appointmentId: z.string().uuid(), amountTzs: z.number().int().positive(), method: z.enum(["mpesa", "mixx", "airtel", "halopesa", "card", "sponsor"]), idempotencyKey: z.string().min(8).max(80) }).strict();
  app.post("/v1/payments/reserve", { config: { rateLimit: highRiskMutationRateLimit }, schema: { tags: ["operational"] } }, async (request, reply) => {
    const authorization = await requireActor(request, reply, authenticator, store, ["patient"]);
    if (!authorization) return;
    const parsed = paymentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(422).send({ error: "INVALID_PAYMENT" });
    try {
      const result = await store.queuePayment(authorization.actor.userId, parsed.data);
      return reply.code(result.idempotent ? 200 : 202).send(result);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) return reply.code(404).send({ error: "APPOINTMENT_NOT_FOUND" });
      if (error instanceof PaymentConflictError) return reply.code(409).send({ error: "PAYMENT_CONFLICT" });
      throw error;
    }
  });

  const consentSchema = z.object({
    recipientKeyId: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
    recordIds: z.array(z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/)).min(1).max(100),
    purposeCode: z.string().min(2).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]+$/),
    expiresAt: z.string().datetime(),
    encryptedSharingPackage: z.string().min(24).max(750_000)
  }).strict().superRefine(({ expiresAt }, context) => {
    const expiry = Date.parse(expiresAt);
    if (expiry <= Date.now() || expiry > Date.now() + 365 * 24 * 60 * 60 * 1000) context.addIssue({ code: "custom", path: ["expiresAt"], message: "Consent expiry must be within one year" });
  });
  app.post("/v1/consents", { config: { rateLimit: highRiskMutationRateLimit }, schema: { tags: ["zero-knowledge"] } }, async (request, reply) => {
    if (!configuration.features.encryptedRecords) return reply.code(404).send({ error: "FEATURE_NOT_ENABLED" });
    const authorization = await requireActor(request, reply, authenticator, store, ["patient"]);
    if (!authorization) return;
    const parsed = consentSchema.safeParse(request.body);
    if (!parsed.success || hasForbiddenPlaintext(request.body)) return reply.code(422).send({ error: "INVALID_CONSENT_PACKAGE" });
    const consent = await store.createConsent(authorization.actor.userId, parsed.data);
    return reply.code(201).send({ ...consent, status: "active" });
  });

  app.delete("/v1/consents/:id", { config: { rateLimit: highRiskMutationRateLimit }, schema: { tags: ["zero-knowledge"] } }, async (request, reply) => {
    if (!configuration.features.encryptedRecords) return reply.code(404).send({ error: "FEATURE_NOT_ENABLED" });
    const authorization = await requireActor(request, reply, authenticator, store, ["patient"]);
    if (!authorization) return;
    const id = z.string().uuid().safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.code(422).send({ error: "INVALID_ID" });
    if (!await store.revokeConsent(authorization.actor.userId, id.data)) return reply.code(404).send({ error: "NOT_FOUND" });
    return { id: id.data, status: "revoked", note: "Previously viewed or exported copies cannot be remotely erased." };
  });

  app.post("/v1/notifications/:deviceId", { config: { rateLimit: mutationRateLimit }, schema: { tags: ["operational"] } }, async (request, reply) => {
    if (!await requireActor(request, reply, authenticator, store, ["system"])) return;
    const deviceId = z.string().uuid().safeParse((request.params as { deviceId: string }).deviceId);
    if (!deviceId.success) return reply.code(422).send({ error: "INVALID_ID" });
    const eventId = crypto.randomUUID();
    try {
      await store.queueNotification(deviceId.data, eventId);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) return reply.code(404).send({ error: "DEVICE_NOT_FOUND" });
      throw error;
    }
    return reply.code(202).send(neutralNotificationPayload(eventId));
  });

  app.get("/v1/admin/aggregate", { schema: { tags: ["operational"] } }, async (request, reply) => {
    if (!await requireActor(request, reply, authenticator, store, ["platform-admin", "programme-admin"])) return;
    return store.aggregate();
  });

  app.setErrorHandler((error, _request, reply) => {
    const safeError = error as { code?: string; statusCode?: number };
    app.log.error({ code: safeError.code, statusCode: safeError.statusCode }, "request failed");
    reply.code(safeError.statusCode ?? 500).send({ error: "REQUEST_FAILED", requestSafe: true });
  });

  return app;
}
