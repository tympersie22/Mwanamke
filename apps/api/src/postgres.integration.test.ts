import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptSensitiveRecord, generateDeviceKey } from "@mwanamke/security";
import { MockNotificationAdapter, MockPaymentAdapter } from "./adapters.js";
import { loadRuntimeConfig } from "./config.js";
import { runOutboxBatch } from "./outbox-worker.js";
import { PostgresApplicationStore, AppointmentConflictError, ResourceNotFoundError, PaymentConflictError, SlotUnavailableError } from "./store.js";

const runPostgres = process.env.RUN_POSTGRES_TESTS === "true";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://mwanamke:mwanamke@127.0.0.1:5432/mwanamke";
const identityKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

describe.runIf(runPostgres)("PostgreSQL production persistence", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const store = new PostgresApplicationStore(prisma, identityKey);
  const ids = {
    facility: "10000000-0000-4000-8000-000000000001",
    provider: "10000000-0000-4000-8000-000000000002",
    service: "10000000-0000-4000-8000-000000000003",
    slotA: "10000000-0000-4000-8000-000000000004",
    slotB: "10000000-0000-4000-8000-000000000005"
  };

  beforeAll(async () => {
    if (process.env.ALLOW_DESTRUCTIVE_TEST_DATABASE !== "true") {
      throw new Error("PostgreSQL integration tests require an explicitly disposable database.");
    }
    await prisma.outboxEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.availabilitySlot.deleteMany();
    await prisma.providerVerification.deleteMany();
    await prisma.providerService.deleteMany();
    await prisma.service.deleteMany();
    await prisma.provider.deleteMany();
    await prisma.facility.deleteMany();
    await prisma.encryptedHealthRecord.deleteMany();
    await prisma.encryptedKeyEnvelope.deleteMany();
    await prisma.externalIdentity.deleteMany();
    await prisma.device.deleteMany();
    await prisma.privacyRequest.deleteMany();
    await prisma.user.deleteMany();

    await prisma.facility.create({ data: { id: ids.facility, countryCode: "TZ", regionCode: "ZANZIBAR", nameEn: "Integration Facility", nameSw: "Kituo cha Majaribio", locality: "Zanzibar City", verified: true } });
    await prisma.provider.create({ data: { id: ids.provider, displayName: "Integration Provider", titleEn: "Doctor", titleSw: "Daktari", specializations: ["women-health"], languages: ["sw"], gender: "female", active: true } });
    await prisma.providerVerification.create({ data: { providerId: ids.provider, status: "VERIFIED", authorityCode: "INTEGRATION", credentialDigest: Buffer.from("integration") } });
    await prisma.service.create({ data: { id: ids.service, facilityId: ids.facility, code: "CONSULT", nameEn: "Consultation", nameSw: "Ushauri", mode: "physical", priceTzs: 35000 } });
    await prisma.providerService.create({ data: { providerId: ids.provider, serviceId: ids.service } });
    const startsAt = new Date(Date.now() + 86_400_000);
    await prisma.availabilitySlot.createMany({ data: [
      { id: ids.slotA, providerId: ids.provider, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), mode: "physical" },
      { id: ids.slotB, providerId: ids.provider, startsAt: new Date(startsAt.getTime() + 3_600_000), endsAt: new Date(startsAt.getTime() + 5_400_000), mode: "physical" }
    ] });
  });

  afterAll(async () => { await store.close(); });

  it("maps an OIDC subject through a stable digest and never stores the raw subject", async () => {
    const principal = { issuer: "https://identity.integration", subject: "raw-subject-must-not-be-stored", roles: ["patient" as const] };
    const first = await store.resolveActor(principal);
    const second = await store.resolveActor(principal);
    expect(second?.userId).toBe(first?.userId);
    const identity = await prisma.externalIdentity.findFirstOrThrow();
    expect(identity.issuerSubjectDigest).toHaveLength(32);
    expect(identity.issuerSubjectDigest.toString()).not.toContain(principal.subject);
  });

  it("scopes ciphertext retrieval to its resolved owner", async () => {
    const owner = await store.resolveActor({ issuer: "integration", subject: "owner", roles: ["patient"] });
    const stranger = await store.resolveActor({ issuer: "integration", subject: "stranger", roles: ["patient"] });
    const key = await generateDeviceKey();
    const envelope = await encryptSensitiveRecord({ privateNote: "owner only" }, key, "health-record", "client-record-1");
    const created = await store.createEncryptedRecord(owner!.userId, envelope);
    expect(await store.getEncryptedRecord(owner!.userId, created.id)).not.toBeNull();
    expect(await store.getEncryptedRecord(stranger!.userId, created.id)).toBeNull();
    expect((await store.createEncryptedRecord(owner!.userId, envelope)).created).toBe(false);
  });

  it("allows only one transaction to claim a slot", async () => {
    const one = await store.resolveActor({ issuer: "integration", subject: "booker-one", roles: ["patient"] });
    const two = await store.resolveActor({ issuer: "integration", subject: "booker-two", roles: ["patient"] });
    const request = { slotId: ids.slotA, serviceId: ids.service, mode: "physical" as const };
    const results = await Promise.allSettled([
      store.reserveAppointment(one!.userId, { ...request, idempotencyKey: "booking-one-0001" }),
      store.reserveAppointment(two!.userId, { ...request, idempotencyKey: "booking-two-0001" })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(SlotUnavailableError);
  });

  it("commits appointment, payment and outbox state atomically and delivers idempotently", async () => {
    const actor = await store.resolveActor({ issuer: "integration", subject: "payment-owner", roles: ["patient"] });
    const appointment = await store.reserveAppointment(actor!.userId, { slotId: ids.slotB, serviceId: ids.service, mode: "physical", idempotencyKey: "payment-booking-1" });
    const request = { appointmentId: appointment.id, amountTzs: 35000, method: "mpesa" as const, idempotencyKey: "payment-idem-0001" };
    await expect(store.queuePayment(actor!.userId, { ...request, amountTzs: 1 })).rejects.toBeInstanceOf(PaymentConflictError);
    const first = await store.queuePayment(actor!.userId, request);
    const second = await store.queuePayment(actor!.userId, request);
    expect(second.id).toBe(first.id);
    expect(second.idempotent).toBe(true);
    await expect(store.queuePayment(actor!.userId, { ...request, method: "card" })).rejects.toBeInstanceOf(PaymentConflictError);
    await expect(store.queuePayment(actor!.userId, { ...request, idempotencyKey: "different-payment-key" })).rejects.toBeInstanceOf(PaymentConflictError);
    expect((await store.listPayments(actor!.userId, { limit: 20 })).data).toHaveLength(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: first.id, topic: "payment.reserve" } })).toBe(1);

    const configuration = loadRuntimeConfig({ NODE_ENV: "test", STATE_STORE: "memory", WORKER_ID: "integration-worker" });
    let processed = 0;
    do { processed = await runOutboxBatch(store, configuration, new MockPaymentAdapter(), new MockNotificationAdapter()); } while (processed > 0);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: first.id } });
    expect(payment.status).toBe("RESERVED");
    expect(await prisma.outboxEvent.count({ where: { status: "PROCESSING" } })).toBe(0);
  });
  it("expires holds, releases slots, preserves retry identity, and checks service association", async () => {
    const actor = await store.resolveActor({ issuer: "integration", subject: "hold-owner", roles: [] });
    expect(actor?.role).toBe("patient");
    expect((await store.resolveActor({ issuer: "integration", subject: "hold-owner", roles: ["platform-admin"] }))?.role).toBe("patient");
    const slot = await prisma.availabilitySlot.create({ data: { providerId: ids.provider, startsAt: new Date("2099-01-01T00:00:00Z"), endsAt: new Date("2099-01-01T00:30:00Z"), mode: "physical" } });
    const request = { slotId: slot.id, serviceId: ids.service, mode: "physical" as const, idempotencyKey: "hold-retry-00001" };
    const [first, retry] = await Promise.all([store.reserveAppointment(actor!.userId, request), store.reserveAppointment(actor!.userId, request)]);
    expect(first.id).toBe(retry.id);
    expect(first.status).toBe("requested");
    expect(first.holdExpiresAt).not.toBeNull();
    expect(first.amountTzs).toBe(35000);
    await expect(store.transitionAppointment(actor!.userId, first.id, "confirm")).rejects.toBeInstanceOf(PaymentConflictError);
    await expect(store.transitionAppointment(crypto.randomUUID(), first.id, "cancel")).rejects.toBeInstanceOf(ResourceNotFoundError);
    await prisma.$executeRaw`UPDATE "Appointment" SET "holdExpiresAt" = NOW() - INTERVAL '1 second' WHERE "id" = ${first.id}::uuid`;
    await store.expireHolds();
    expect((await store.reserveAppointment(actor!.userId, request)).status).toBe("expired");
    await expect(store.transitionAppointment(actor!.userId, first.id, "confirm")).rejects.toBeInstanceOf(AppointmentConflictError);
    const second = await store.reserveAppointment(actor!.userId, { ...request, idempotencyKey: "hold-after-expiry" });
    expect(second.id).not.toBe(first.id);
    expect((await store.transitionAppointment(actor!.userId, second.id, "cancel")).status).toBe("cancelled");
    expect((await store.transitionAppointment(actor!.userId, second.id, "cancel")).status).toBe("cancelled");
    expect(await prisma.availabilitySlot.findUnique({ where: { id: slot.id } })).toMatchObject({ reservedAt: null });
    const unrelated = await prisma.service.create({ data: { facilityId: ids.facility, code: "UNLINKED", nameEn: "Unlinked", nameSw: "Unlinked", mode: "physical", priceTzs: 1 } });
    await expect(store.reserveAppointment(actor!.userId, { ...request, serviceId: unrelated.id, idempotencyKey: "unlinked-service" })).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect((await store.listServices(ids.provider, { limit: 20 })).data.map((row) => row.id)).toEqual([ids.service]);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { targetRef: second.id } });
    await expect(prisma.auditEvent.update({ where: { id: audit.id }, data: { action: "tampered" } })).rejects.toThrow("append-only");
    await expect(prisma.auditEvent.delete({ where: { id: audit.id } })).rejects.toThrow("append-only");
  });

  it("confirms only settled payments and makes cancellation reconciliation explicit", async () => {
    const actor = await store.resolveActor({ issuer: "integration", subject: "settled-owner", roles: ["patient"] });
    const slot = await prisma.availabilitySlot.create({ data: { providerId: ids.provider, startsAt: new Date("2099-01-02T00:00:00Z"), endsAt: new Date("2099-01-02T00:30:00Z"), mode: "physical" } });
    const appointment = await store.reserveAppointment(actor!.userId, { slotId: slot.id, serviceId: ids.service, mode: "physical", idempotencyKey: "settled-hold-001" });
    const payment = await store.queuePayment(actor!.userId, { appointmentId: appointment.id, amountTzs: 35000, method: "mpesa", idempotencyKey: "settled-payment-001" });
    const configuration = loadRuntimeConfig({ NODE_ENV: "test", WORKER_ID: "settlement-test" });
    await runOutboxBatch(store, configuration, { reserve: async () => ({ adapterReference: `test-settled:${payment.id}`, status: "paid", retryable: false }) }, new MockNotificationAdapter());
    expect((await store.transitionAppointment(actor!.userId, appointment.id, "confirm")).status).toBe("confirmed");
    expect((await store.transitionAppointment(actor!.userId, appointment.id, "confirm")).status).toBe("confirmed");
    await store.transitionAppointment(actor!.userId, appointment.id, "cancel");
    expect(await prisma.outboxEvent.findUnique({ where: { eventKey: `payment.reconciliation:${payment.id}` } })).toMatchObject({ status: "FAILED", lastErrorCode: "MANUAL_RECONCILIATION_REQUIRED" });
  });

  it("persists minimal preferences and idempotent own privacy request intake", async () => {
    const owner = await store.resolveActor({ issuer: "integration", subject: "privacy-owner", roles: [] });
    const stranger = await store.resolveActor({ issuer: "integration", subject: "privacy-stranger", roles: [] });
    await store.updateProfile(owner!.userId, { preferredLanguage: "en" });
    expect(await store.getProfile(owner!.userId)).toEqual({ preferredLanguage: "en" });
    const results = await Promise.all([store.createPrivacyRequest(owner!.userId, "export", "privacy-request-1"), store.createPrivacyRequest(owner!.userId, "export", "privacy-request-1")]);
    expect(results[0].data.id).toBe(results[1].data.id);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results[0].data.status).toBe("submitted");
    await expect(store.createPrivacyRequest(owner!.userId, "deletion", "privacy-request-1")).rejects.toBeInstanceOf(AppointmentConflictError);
    expect((await store.listPrivacyRequests(stranger!.userId, { limit: 20 })).data).toEqual([]);
    expect(await prisma.auditEvent.count({ where: { targetRef: results[0].data.id, action: "privacy.request-submitted" } })).toBe(1);
  });

  it("returns verified directory DTOs and keeps schedules and assigned cases scoped", async () => {
    const directory = await store.listProviders({ limit: 20 });
    expect(directory.data.map((row) => row.id)).toContain(ids.provider);
    expect(directory.data[0]).not.toHaveProperty("publicKey");
    expect(directory.data[0]).not.toHaveProperty("userId");
    const stranger = await store.resolveActor({ issuer: "integration", subject: "dto-stranger", roles: ["patient"] });
    expect((await store.listAppointments(stranger!, { limit: 20 })).data).toEqual([]);
    expect((await store.listPayments(stranger!.userId, { limit: 20 })).data).toEqual([]);
    const navigator = await prisma.user.create({ data: { publicHandle: "test-navigator", role: "NAVIGATOR" } });
    const assignment = await prisma.careNavigatorAssignment.create({ data: { navigatorUserId: navigator.id, userId: stranger!.userId, status: "OPEN" } });
    try {
      expect((await store.listAssignments(navigator.id, { limit: 20 })).data).toEqual([{ id: assignment.id, status: "OPEN", assignedAt: assignment.assignedAt.toISOString() }]);
      expect((await store.listAssignments(stranger!.userId, { limit: 20 })).data).toEqual([]);
    } finally { await prisma.careNavigatorAssignment.delete({ where: { id: assignment.id } }); }
    await prisma.providerVerification.updateMany({ where: { providerId: ids.provider }, data: { expiresAt: new Date(0) } });
    expect(await store.getProvider(ids.provider)).toBeNull();
    expect((await store.listProviders({ limit: 20 })).data).toEqual([]);
  });

  it("rejects suspended identities and never provisions a privileged role from a claim", async () => {
    expect(await store.resolveActor({ issuer: "integration", subject: "uninvited-admin", roles: ["platform-admin"] })).toBeNull();
    const principal = { issuer: "integration", subject: "suspend-me", roles: ["patient" as const] };
    const actor = await store.resolveActor(principal);
    await prisma.user.update({ where: { id: actor!.userId }, data: { status: "SUSPENDED" } });
    expect(await store.resolveActor(principal)).toBeNull();
  });

  it("dead-letters invalid payloads and retries unaccepted notifications without false delivery", async () => {
    const device = crypto.randomUUID();
    const poison = await prisma.outboxEvent.create({ data: { topic: "payment.reserve", aggregateType: "Payment", aggregateId: crypto.randomUUID(), eventKey: crypto.randomUUID(), payloadSafe: {} } });
    const notification = await prisma.outboxEvent.create({ data: { topic: "notification.send-neutral", aggregateType: "Device", aggregateId: device, eventKey: crypto.randomUUID(), payloadSafe: { deviceId: device, eventId: crypto.randomUUID() } } });
    // Scheduling uses database time, avoiding host/container clock skew in the test fixture.
    await prisma.$executeRaw`UPDATE "OutboxEvent" SET "availableAt" = NOW() - INTERVAL '1 second' WHERE "id" IN (${poison.id}::uuid, ${notification.id}::uuid)`;
    const configuration = loadRuntimeConfig({ NODE_ENV: "test", WORKER_ID: "retry-test" });
    await runOutboxBatch(store, configuration, new MockPaymentAdapter(), { sendNeutralUpdate: async () => ({ queued: false }) });
    expect(await prisma.outboxEvent.findUnique({ where: { id: poison.id } })).toMatchObject({ status: "FAILED", lastErrorCode: "INVALID_OUTBOX_PAYLOAD" });
    expect(await prisma.outboxEvent.findUnique({ where: { id: notification.id } })).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "ADAPTER_DELIVERY_FAILED" });
    await prisma.$executeRaw`UPDATE "OutboxEvent" SET "availableAt" = NOW() - INTERVAL '1 second' WHERE "id" = ${notification.id}::uuid`;
    const [first, second] = await Promise.all([store.claimOutbox("lease-one", 1), store.claimOutbox("lease-two", 1)]);
    expect(first.length + second.length).toBe(1);
    await store.completeOutboxEvent("wrong-worker", notification.id);
    expect(await prisma.outboxEvent.findUnique({ where: { id: notification.id } })).toMatchObject({ status: "PROCESSING" });
    await store.completeOutboxEvent(first.length ? "lease-one" : "lease-two", notification.id);
    expect(await prisma.outboxEvent.findUnique({ where: { id: notification.id } })).toMatchObject({ status: "DELIVERED" });
  });

});
