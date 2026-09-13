import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { Prisma, PrismaClient, type Appointment, type UserRole } from "@prisma/client";
import type { EncryptedRecord } from "@mwanamke/security";
import type { ApiRole, Principal } from "./auth.js";
import type { PaymentResult } from "./adapters.js";
import { page, type ProfileDto, type PrivacyRequestDto, type ServiceDto, type PageQuery, type Page, type ProviderDto, type SlotDto, type AppointmentDto, type PaymentDto, type AssignmentDto } from "./dto.js";
import type { RuntimeConfig } from "./config.js";

export type Actor = { userId: string; role: ApiRole };
export type AppointmentRequest = { slotId: string; serviceId: string; mode: "physical" | "virtual"; idempotencyKey: string };
export type AppointmentResult = { id: string; status: "requested" | "confirmed" | "cancelled" | "expired" | "completed" | "no_show"; holdExpiresAt: string | null; amountTzs: number; timeZone: string; providerId: string; facilityId: string; serviceId: string; slotId: string; startsAt: string; mode: string };
export type PaymentQueueRequest = { appointmentId: string; amountTzs: number; method: "mpesa" | "mixx" | "airtel" | "halopesa" | "card" | "sponsor"; idempotencyKey: string };
export type PaymentQueueResult = { id: string; status: "queued" | "reserved" | "paid" | "failed"; idempotent: boolean };
export type ConsentRequest = { recipientKeyId: string; recordIds: string[]; purposeCode: string; expiresAt: string; encryptedSharingPackage: string };
export type OutboxItem = { id: string; topic: string; aggregateId: string; payload: Record<string, unknown>; attempts: number };
export type StaffRole = Exclude<ApiRole, "patient" | "system">;
export type DeviceRegistration = { id: string; label: string; algorithm: string; publicKey: string; authorizedAt: string; lastSeenAt: string | null };

export class SlotUnavailableError extends Error {}
export class ResourceNotFoundError extends Error {}
export class PaymentConflictError extends Error {}
export class AppointmentConflictError extends Error {}

export interface ApplicationStore {
  resolveActor(principal: Principal): Promise<Actor | null>;
  isReady(): Promise<boolean>;
  getProfile(userId: string): Promise<ProfileDto>;
  updateProfile(userId: string, profile: ProfileDto): Promise<ProfileDto>;
  listPrivacyRequests(userId: string, query: PageQuery): Promise<Page<PrivacyRequestDto>>;
  createPrivacyRequest(userId: string, kind: "export" | "deletion", idempotencyKey: string): Promise<{ data: PrivacyRequestDto; created: boolean }>;
  listProviders(query: PageQuery): Promise<Page<ProviderDto>>;
  listServices(providerId: string, query: PageQuery): Promise<Page<ServiceDto>>;
  getProvider(id: string): Promise<ProviderDto | null>;
  listAvailability(providerId: string, query: PageQuery): Promise<Page<SlotDto>>;
  listAppointments(actor: Actor, query: PageQuery): Promise<Page<AppointmentDto>>;
  listPayments(userId: string, query: PageQuery): Promise<Page<PaymentDto>>;
  listAssignments(userId: string, query: PageQuery): Promise<Page<AssignmentDto>>;
  createEncryptedRecord(ownerUserId: string, record: EncryptedRecord): Promise<{ id: string; created: boolean }>;
  getEncryptedRecord(ownerUserId: string, id: string): Promise<EncryptedRecord | null>;
  reserveAppointment(ownerUserId: string, request: AppointmentRequest): Promise<AppointmentResult>;
  transitionAppointment(ownerUserId: string, id: string, action: "confirm" | "cancel"): Promise<AppointmentResult>;
  expireHolds(): Promise<void>;
  queuePayment(ownerUserId: string, request: PaymentQueueRequest): Promise<PaymentQueueResult>;
  queueNotification(deviceId: string, eventId: string): Promise<void>;
  createConsent(ownerUserId: string, request: ConsentRequest): Promise<{ id: string; expiresAt: string }>;
  revokeConsent(ownerUserId: string, id: string): Promise<boolean>;
  createRoleInvitation(issuerUserId: string, email: string, intendedRole: StaffRole, ttlSec: number): Promise<{ id: string; token: string; expiresAt: string }>;
  acceptRoleInvitation(principal: Principal, token: string): Promise<Actor | null>;
  listDevices(userId: string): Promise<DeviceRegistration[]>;
  registerDevice(userId: string, label: string, algorithm: string, publicKey: string, attestationFormat: string, attestationEvidence: string): Promise<DeviceRegistration>;
  isDeviceActive(userId: string, id: string): Promise<boolean>;
  revokeDevice(userId: string, id: string): Promise<boolean>;
  aggregate(): Promise<{ activeMembers: number; appointmentCompletionRate: number; facilities: number; individualRecordsAvailable: false }>;
  claimOutbox(workerId: string, limit: number): Promise<OutboxItem[]>;
  paymentEventDeliverable(paymentId: string): Promise<boolean>;
  completePaymentEvent(workerId: string, eventId: string, paymentId: string, result: PaymentResult): Promise<void>;
  completeOutboxEvent(workerId: string, eventId: string): Promise<void>;
  retryOutboxEvent(workerId: string, eventId: string, errorCode: string, delayMs: number, terminal: boolean): Promise<void>;
  close(): Promise<void>;
}

const prismaRoleToApi: Record<UserRole, ApiRole> = {
  PATIENT: "patient",
  PROVIDER: "provider",
  NAVIGATOR: "navigator",
  FACILITY_ADMIN: "facility-admin",
  PLATFORM_ADMIN: "platform-admin",
  PROGRAMME_ADMIN: "programme-admin"
};

function canAutoProvisionPatient(principal: Principal): boolean {
  return principal.roles.length === 0 || principal.roles.length === 1 && principal.roles[0] === "patient";
}

export class MemoryApplicationStore implements ApplicationStore {
  private readonly actors = new Map<string, Actor>();
  private readonly records = new Map<string, { ownerUserId: string; record: EncryptedRecord }>();
  private readonly appointments = new Map<string, AppointmentResult>();
  private readonly reservedSlots = new Set<string>();
  private readonly payments = new Map<string, PaymentQueueResult>();
  private readonly consents = new Map<string, { ownerUserId: string; expiresAt: string; revoked: boolean }>();
  private readonly outbox = new Map<string, OutboxItem & { status: string; availableAt: number; workerId?: string }>();
  private readonly devices = new Map<string, DeviceRegistration & { userId: string; revokedAt?: string }>();
  private readonly invitations = new Map<string, { id: string; emailDigest: string; intendedRole: StaffRole; tokenDigest: string; expiresAt: string; status: "PENDING" | "ACCEPTED" | "REVOKED" }>();

  async resolveActor(principal: Principal): Promise<Actor | null> {
    const key = `${principal.issuer}\u0000${principal.subject}`;
    const existing = this.actors.get(key);
    if (existing) return existing;
    const role = principal.roles[0] ?? "patient";
    if (!role) return null;
    const actor = { userId: randomUUID(), role };
    this.actors.set(key, actor);
    return actor;
  }

  private readonly profiles = new Map<string, ProfileDto>();
  private readonly privacyRequests = new Map<string, PrivacyRequestDto>();
  async getProfile(userId: string): Promise<ProfileDto> { return this.profiles.get(userId) ?? { preferredLanguage: "sw" }; }
  async updateProfile(userId: string, profile: ProfileDto) { this.profiles.set(userId, profile); return profile; }
  async listPrivacyRequests(userId: string, query: PageQuery): Promise<Page<PrivacyRequestDto>> {
    return page([...this.privacyRequests.entries()].filter(([key, value]) => key.startsWith(`${userId}:`) && (!query.cursor || value.id > query.cursor)).map(([, value]) => value).sort((a, b) => a.id.localeCompare(b.id)), query.limit);
  }
  async createPrivacyRequest(userId: string, kind: "export" | "deletion", idempotencyKey: string) {
    const key = `${userId}:${idempotencyKey}`;
    const existing = this.privacyRequests.get(key);
    if (existing) { if (existing.kind !== kind) throw new AppointmentConflictError("Idempotency input mismatch"); return { data: existing, created: false }; }
    const data: PrivacyRequestDto = { id: randomUUID(), kind, status: "submitted", createdAt: new Date().toISOString() };
    this.privacyRequests.set(key, data);
    return { data, created: true };
  }

  async isReady() { return true; }
  async listProviders(_query: PageQuery): Promise<Page<ProviderDto>> { return { data: [], nextCursor: null }; }
  async listServices(_providerId: string, _query: PageQuery): Promise<Page<ServiceDto>> { return { data: [], nextCursor: null }; }
  async getProvider(_id: string): Promise<ProviderDto | null> { return null; }
  async listAvailability(_id: string, _query: PageQuery): Promise<Page<SlotDto>> { return { data: [], nextCursor: null }; }
  async listAppointments(actor: Actor, query: PageQuery): Promise<Page<AppointmentDto>> {
    const rows = [...this.appointments.entries()].filter(([key]) => actor.role === "patient" && key.startsWith(`${actor.userId}:`)).map(([, value]) => ({ ...value, mode: value.mode as "physical" | "virtual" })).sort((a, b) => a.id.localeCompare(b.id));
    return page(rows.filter((row) => !query.cursor || row.id > query.cursor), query.limit);
  }
  async listPayments(_id: string, _query: PageQuery): Promise<Page<PaymentDto>> { return { data: [], nextCursor: null }; }
  async listAssignments(_id: string, _query: PageQuery): Promise<Page<AssignmentDto>> { return { data: [], nextCursor: null }; }

  async createEncryptedRecord(ownerUserId: string, record: EncryptedRecord) {
    const existing = [...this.records.entries()].find(([, value]) => value.ownerUserId === ownerUserId && value.record.recordId === record.recordId);
    if (existing) return { id: existing[0], created: false };
    const id = randomUUID();
    this.records.set(id, { ownerUserId, record });
    return { id, created: true };
  }

  async getEncryptedRecord(ownerUserId: string, id: string) {
    const value = this.records.get(id);
    return value?.ownerUserId === ownerUserId ? value.record : null;
  }

  async reserveAppointment(ownerUserId: string, request: AppointmentRequest): Promise<AppointmentResult> {
    await this.expireHolds();
    const key = `${ownerUserId}:${request.idempotencyKey}`;
    const existing = this.appointments.get(key);
    if (existing) return existing;
    if (this.reservedSlots.has(request.slotId)) throw new SlotUnavailableError("Slot is no longer available");
    this.reservedSlots.add(request.slotId);
    const result: AppointmentResult = { id: randomUUID(), status: "requested", holdExpiresAt: new Date(Date.now() + 900_000).toISOString(), amountTzs: 0, timeZone: "Africa/Dar_es_Salaam", providerId: "development-provider", facilityId: "development-facility", serviceId: request.serviceId, slotId: request.slotId, startsAt: new Date(Date.now() + 3_600_000).toISOString(), mode: request.mode };
    this.appointments.set(key, result);
    this.addOutbox("appointment.held", "Appointment", result.id, `appointment.held:${result.id}`, { appointmentId: result.id, userId: ownerUserId });
    return result;
  }

  async expireHolds() {
    for (const appointment of this.appointments.values()) {
      if (appointment.status === "requested" && appointment.holdExpiresAt && Date.parse(appointment.holdExpiresAt) <= Date.now()) { appointment.status = "expired"; this.reservedSlots.delete(appointment.slotId); }
    }
  }
  async transitionAppointment(ownerUserId: string, id: string, action: "confirm" | "cancel"): Promise<AppointmentResult> {
    await this.expireHolds();
    const entry = [...this.appointments.entries()].find(([key, value]) => key.startsWith(`${ownerUserId}:`) && value.id === id);
    if (!entry) throw new ResourceNotFoundError();
    const appointment = entry[1];
    if (action === "cancel" && appointment.status === "cancelled" || action === "confirm" && appointment.status === "confirmed") return appointment;
    if (appointment.status !== "requested" && !(action === "cancel" && appointment.status === "confirmed")) throw new AppointmentConflictError();
    appointment.status = action === "confirm" ? "confirmed" : "cancelled";
    if (action === "cancel") this.reservedSlots.delete(appointment.slotId);
    return appointment;
  }

  async queuePayment(ownerUserId: string, request: PaymentQueueRequest): Promise<PaymentQueueResult> {
    const key = `${ownerUserId}:${request.idempotencyKey}`;
    const existing = this.payments.get(key);
    if (existing) return { ...existing, idempotent: true };
    const result: PaymentQueueResult = { id: randomUUID(), status: "queued", idempotent: false };
    this.payments.set(key, result);
    this.addOutbox("payment.reserve", "Payment", result.id, `payment.reserve:${result.id}`, { paymentId: result.id, ...request });
    return result;
  }

  async queueNotification(deviceId: string, eventId: string) {
    this.addOutbox("notification.send-neutral", "Device", deviceId, `notification.send-neutral:${eventId}`, { deviceId, eventId });
  }

  async createConsent(ownerUserId: string, request: ConsentRequest) {
    const id = randomUUID();
    this.consents.set(id, { ownerUserId, expiresAt: request.expiresAt, revoked: false });
    return { id, expiresAt: request.expiresAt };
  }

  async revokeConsent(ownerUserId: string, id: string) {
    const consent = this.consents.get(id);
    if (!consent || consent.ownerUserId !== ownerUserId) return false;
    consent.revoked = true;
    return true;
  }

  async createRoleInvitation(_issuerUserId: string, email: string, intendedRole: StaffRole, ttlSec: number) {
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
    this.invitations.set(id, { id, emailDigest: email.trim().toLowerCase(), intendedRole, tokenDigest: createHash("sha256").update(token).digest("hex"), expiresAt, status: "PENDING" });
    return { id, token, expiresAt };
  }
  async acceptRoleInvitation(principal: Principal, token: string) {
    if (principal.realm !== "workforce" || !principal.email || principal.emailVerified !== true) return null;
    const digest = createHash("sha256").update(token).digest("hex");
    const invitation = [...this.invitations.values()].find((row) => row.tokenDigest === digest && row.status === "PENDING");
    if (!invitation || Date.parse(invitation.expiresAt) <= Date.now() || invitation.emailDigest !== principal.email.trim().toLowerCase()) return null;
    const key = `${principal.issuer}\u0000${principal.subject}`;
    const actor = { userId: randomUUID(), role: invitation.intendedRole };
    this.actors.set(key, actor); invitation.status = "ACCEPTED";
    return actor;
  }
  async listDevices(userId: string) { return [...this.devices.values()].filter((device) => device.userId === userId && !device.revokedAt).map(({ userId: _userId, revokedAt: _revokedAt, ...device }) => device); }
  async registerDevice(userId: string, label: string, algorithm: string, publicKey: string, _attestationFormat: string, _attestationEvidence: string) {
    const device = { id: randomUUID(), userId, label, algorithm, publicKey, authorizedAt: new Date().toISOString(), lastSeenAt: null };
    this.devices.set(device.id, device); return device;
  }
  async isDeviceActive(userId: string, id: string) { const device = this.devices.get(id); return Boolean(device && device.userId === userId && !device.revokedAt); }
  async revokeDevice(userId: string, id: string) { const device = this.devices.get(id); if (!device || device.userId !== userId || device.revokedAt) return false; device.revokedAt = new Date().toISOString(); return true; }

  async aggregate() { return { activeMembers: this.actors.size, appointmentCompletionRate: 0, facilities: 0, individualRecordsAvailable: false as const }; }

  private addOutbox(topic: string, aggregateType: string, aggregateId: string, _eventKey: string, payload: Record<string, unknown>) {
    const id = randomUUID();
    this.outbox.set(id, { id, topic, aggregateId, payload: { ...payload, aggregateType }, attempts: 0, status: "PENDING", availableAt: Date.now() });
  }

  async claimOutbox(workerId: string, limit: number) {
    const items = [...this.outbox.values()].filter((item) => item.status === "PENDING" && item.availableAt <= Date.now()).slice(0, limit);
    for (const item of items) { item.status = "PROCESSING"; item.workerId = workerId; item.attempts += 1; }
    return items.map(({ id, topic, aggregateId, payload, attempts }) => ({ id, topic, aggregateId, payload, attempts }));
  }

  async paymentEventDeliverable(_paymentId: string) { return true; }

  async completePaymentEvent(workerId: string, eventId: string, _paymentId: string, result: PaymentResult) {
    const event = this.outbox.get(eventId);
    if (event?.workerId !== workerId || event.status !== "PROCESSING") return;
    event.status = "DELIVERED";
    for (const payment of this.payments.values()) if (payment.id === event.aggregateId) payment.status = result.status;
  }

  async completeOutboxEvent(workerId: string, eventId: string) {
    const event = this.outbox.get(eventId);
    if (event?.workerId === workerId) event.status = "DELIVERED";
  }

  async retryOutboxEvent(workerId: string, eventId: string, _errorCode: string, delayMs: number, terminal: boolean) {
    const event = this.outbox.get(eventId);
    if (event?.workerId !== workerId) return;
    event.status = terminal ? "FAILED" : "PENDING";
    event.availableAt = Date.now() + delayMs;
    delete event.workerId;
    if (terminal && event.topic === "payment.reserve") {
      for (const payment of this.payments.values()) if (payment.id === event.aggregateId) payment.status = "failed";
    }
  }

  async close() {}
}

type ClaimedSlot = { id: string; providerId: string; startsAt: Date; mode: string };
type ClaimedOutbox = { id: string; topic: string; aggregateId: string; payloadSafe: Prisma.JsonValue; attempts: number };

export class PostgresApplicationStore implements ApplicationStore {
  private readonly hmacKey: Buffer;
  private readonly auditKey: Buffer;

  constructor(private readonly prisma: PrismaClient, identitySubjectHmacKey: string, auditHmacKey = identitySubjectHmacKey) {
    this.hmacKey = Buffer.from(identitySubjectHmacKey, "base64");
    if (this.hmacKey.length < 32) throw new Error("IDENTITY_SUBJECT_HMAC_KEY must decode to at least 256 bits.");
    this.auditKey = Buffer.from(auditHmacKey, "base64");
    if (this.auditKey.length < 32) throw new Error("AUDIT_HMAC_KEY must decode to at least 256 bits.");
  }

  private identityDigest(principal: Principal): Buffer {
    return createHmac("sha256", this.hmacKey).update(principal.issuer).update("\u0000").update(principal.subject).digest();
  }

  async resolveActor(principal: Principal): Promise<Actor | null> {
    const digest = this.identityDigest(principal);
    const existing = await this.prisma.externalIdentity.findUnique({ where: { issuerSubjectDigest: digest }, include: { user: true } });
    if (existing) {
      if (existing.user.deletedAt || existing.user.status !== "ACTIVE") return null;
      const role = prismaRoleToApi[existing.user.role];
      await this.prisma.externalIdentity.update({ where: { id: existing.id }, data: { lastAuthenticatedAt: new Date() } });
      return { userId: existing.userId, role };
    }
    if (!canAutoProvisionPatient(principal)) return null;
    try {
      const user = await this.prisma.user.create({
        data: { publicHandle: `mw_${randomUUID()}`, role: "PATIENT", externalIdentities: { create: { issuerSubjectDigest: digest } } }
      });
      return { userId: user.id, role: "patient" };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const raced = await this.prisma.externalIdentity.findUnique({ where: { issuerSubjectDigest: digest }, include: { user: true } });
      return raced && !raced.user.deletedAt && raced.user.status === "ACTIVE" ? { userId: raced.userId, role: prismaRoleToApi[raced.user.role] } : null;
    }
  }

  async getProfile(userId: string): Promise<ProfileDto> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferredLanguage: true } });
    return { preferredLanguage: row.preferredLanguage as ProfileDto["preferredLanguage"] };
  }
  async updateProfile(userId: string, profile: ProfileDto): Promise<ProfileDto> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: userId }, data: { preferredLanguage: profile.preferredLanguage } });
      await this.audit(transaction, userId, "profile.preferences-updated", userId);
      return profile;
    });
  }
  async listPrivacyRequests(userId: string, query: PageQuery): Promise<Page<PrivacyRequestDto>> {
    const rows = await this.prisma.privacyRequest.findMany({ where: { userId, ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, orderBy: { id: "asc" }, take: query.limit + 1, select: { id: true, kind: true, status: true, createdAt: true } });
    return page(rows.map((row) => ({ ...row, kind: row.kind as PrivacyRequestDto["kind"], status: row.status as PrivacyRequestDto["status"], createdAt: row.createdAt.toISOString() })), query.limit);
  }
  async createPrivacyRequest(userId: string, kind: "export" | "deletion", idempotencyKey: string) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const existing = await transaction.privacyRequest.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
      if (existing && existing.kind !== kind) throw new AppointmentConflictError("Idempotency input mismatch");
      const row = existing ?? await transaction.privacyRequest.create({ data: { userId, kind, idempotencyKey } });
      if (!existing) await this.audit(transaction, userId, "privacy.request-submitted", row.id);
      const data: PrivacyRequestDto = { id: row.id, kind: row.kind as PrivacyRequestDto["kind"], status: row.status as PrivacyRequestDto["status"], createdAt: row.createdAt.toISOString() };
      return { data, created: !existing };
    });
  }

  private verifiedProviderWhere(): Prisma.ProviderWhereInput {
    return { active: true, verifications: { some: { status: "VERIFIED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } };
  }

  async listProviders(query: PageQuery): Promise<Page<ProviderDto>> {
    const rows = await this.prisma.provider.findMany({ where: { ...this.verifiedProviderWhere(), ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, orderBy: { id: "asc" }, take: query.limit + 1,
      select: { id: true, displayName: true, titleEn: true, titleSw: true, specializations: true, languages: true, gender: true } });
    return page(rows.map((row) => ({ ...row, verified: true as const })), query.limit);
  }

  async listServices(providerId: string, query: PageQuery): Promise<Page<ServiceDto>> {
    const rows = await this.prisma.service.findMany({ where: { active: true, facility: { verified: true }, providers: { some: { providerId, provider: this.verifiedProviderWhere() } }, ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, orderBy: { id: "asc" }, take: query.limit + 1, select: { id: true, nameEn: true, nameSw: true, mode: true, priceTzs: true, facility: { select: { id: true, nameEn: true, nameSw: true, locality: true, accessibilityEn: true, accessibilitySw: true } } } });
    return page(rows.map((row) => ({ ...row, mode: row.mode as ServiceDto["mode"] })), query.limit);
  }

  async getProvider(id: string): Promise<ProviderDto | null> {
    const row = await this.prisma.provider.findFirst({ where: { ...this.verifiedProviderWhere(), id }, select: { id: true, displayName: true, titleEn: true, titleSw: true, specializations: true, languages: true, gender: true } });
    return row ? { ...row, verified: true } : null;
  }

  async listAvailability(providerId: string, query: PageQuery): Promise<Page<SlotDto>> {
    await this.expireHolds();
    const rows = await this.prisma.availabilitySlot.findMany({ where: { providerId, provider: this.verifiedProviderWhere(), reservedAt: null, startsAt: { gt: new Date() }, ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, orderBy: { id: "asc" }, take: query.limit + 1, select: { id: true, providerId: true, startsAt: true, endsAt: true, mode: true } });
    return page(rows.map((row) => ({ ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), mode: row.mode as SlotDto["mode"] })), query.limit);
  }

  async listAppointments(actor: Actor, query: PageQuery): Promise<Page<AppointmentDto>> {
    if (actor.role !== "patient" && actor.role !== "provider") return { data: [], nextCursor: null };
    await this.expireHolds();
    const rows = await this.prisma.appointment.findMany({ where: { ...(actor.role === "patient" ? { userId: actor.userId } : { provider: { userId: actor.userId } }), ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, orderBy: { id: "asc" }, take: query.limit + 1, select: { id: true, status: true, providerId: true, facilityId: true, serviceId: true, availabilitySlotId: true, startsAt: true, mode: true, holdExpiresAt: true, amountTzs: true, timeZone: true } });
    return page(rows.map(({ availabilitySlotId, ...row }) => ({ ...row, holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null, slotId: availabilitySlotId, startsAt: row.startsAt.toISOString(), status: row.status.toLowerCase() as AppointmentDto["status"], mode: row.mode as AppointmentDto["mode"] })), query.limit);
  }

  async listPayments(userId: string, query: PageQuery): Promise<Page<PaymentDto>> {
    const rows = await this.prisma.payment.findMany({ where: { userId, ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, orderBy: { id: "asc" }, take: query.limit + 1, select: { id: true, appointmentId: true, amountMinor: true, currency: true, status: true, createdAt: true } });
    return page(rows.map(({ amountMinor, ...row }) => ({ ...row, amountTzs: amountMinor, currency: row.currency as "TZS", status: row.status === "CREATED" ? "queued" : row.status.toLowerCase() as PaymentDto["status"], createdAt: row.createdAt.toISOString() })), query.limit);
  }

  async listAssignments(navigatorUserId: string, query: PageQuery): Promise<Page<AssignmentDto>> {
    const rows = await this.prisma.careNavigatorAssignment.findMany({ where: { navigatorUserId, endedAt: null, ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, orderBy: { id: "asc" }, take: query.limit + 1, select: { id: true, status: true, assignedAt: true } });
    return page(rows.map((row) => ({ ...row, assignedAt: row.assignedAt.toISOString() })), query.limit);
  }

  async isReady() {
    try { await this.prisma.$queryRaw`SELECT 1`; return true; } catch { return false; }
  }

  async createEncryptedRecord(ownerUserId: string, record: EncryptedRecord) {
    const existing = await this.prisma.encryptedHealthRecord.findUnique({ where: { ownerUserId_clientRecordId: { ownerUserId, clientRecordId: record.recordId } } });
    if (existing) return { id: existing.id, created: false };
    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const envelope = await transaction.encryptedKeyEnvelope.create({ data: { ownerUserId, keyId: record.envelope.keyId, algorithm: record.envelope.algorithm, wrappedKey: Buffer.from(record.envelope.wrappedKey, "base64"), nonce: Buffer.from(record.envelope.nonce, "base64") } });
        return transaction.encryptedHealthRecord.create({ data: { ownerUserId, clientRecordId: record.recordId, recordType: record.recordType, ciphertext: Buffer.from(record.ciphertext, "base64"), nonce: Buffer.from(record.nonce, "base64"), envelopeId: envelope.id, clientVersion: record.version } });
      });
      return { id: created.id, created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const raced = await this.prisma.encryptedHealthRecord.findUniqueOrThrow({ where: { ownerUserId_clientRecordId: { ownerUserId, clientRecordId: record.recordId } } });
      return { id: raced.id, created: false };
    }
  }

  async getEncryptedRecord(ownerUserId: string, id: string): Promise<EncryptedRecord | null> {
    const record = await this.prisma.encryptedHealthRecord.findFirst({ where: { id, ownerUserId, deletedAt: null }, include: { envelope: true } });
    if (!record) return null;
    return { version: 1, algorithm: "AES-256-GCM", recordId: record.clientRecordId, recordType: record.recordType, ciphertext: Buffer.from(record.ciphertext).toString("base64"), nonce: Buffer.from(record.nonce).toString("base64"), envelope: { algorithm: "AES-256-GCM", keyId: record.envelope.keyId, wrappedKey: Buffer.from(record.envelope.wrappedKey).toString("base64"), nonce: Buffer.from(record.envelope.nonce).toString("base64") }, createdAt: record.createdAt.toISOString() };
  }

  private appointmentResult(row: Appointment): AppointmentResult {
    return { id: row.id, status: row.status.toLowerCase() as AppointmentResult["status"], holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null, amountTzs: row.amountTzs, timeZone: row.timeZone, providerId: row.providerId, facilityId: row.facilityId!, serviceId: row.serviceId, slotId: row.availabilitySlotId, startsAt: row.startsAt.toISOString(), mode: row.mode };
  }

  private async audit(transaction: Prisma.TransactionClient, actorRef: string, action: string, targetRef: string) {
    const id = randomUUID();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('mwanamke.audit.chain'))`;
    const previous = await transaction.auditEvent.findFirst({ orderBy: [{ occurredAt: "desc" }, { id: "desc" }], select: { eventHash: true } });
    const occurredAt = new Date();
    const previousHash = previous?.eventHash ?? null;
    const previousHashBase64 = previousHash ? Buffer.from(previousHash).toString("base64") : null;
    const eventHash = createHmac("sha256", this.auditKey).update(JSON.stringify({ id, actorRef, action, targetRef, occurredAt: occurredAt.toISOString(), previousHash: previousHashBase64 })).digest();
    await transaction.auditEvent.create({ data: { id, actorRef, action, targetRef, metadataSafe: {}, previousHash, eventHash, occurredAt } });
    await transaction.outboxEvent.create({ data: { topic: "audit.export", aggregateType: "AuditEvent", aggregateId: id, eventKey: `audit.export:${id}`, payloadSafe: { auditEventId: id, eventHash: eventHash.toString("base64"), actorRef, action, targetRef, occurredAt: occurredAt.toISOString(), previousHash: previousHashBase64 } } });
  }

  private async expireSlot(transaction: Prisma.TransactionClient, slotId: string) {
    const expired = await transaction.$queryRaw<Appointment[]>`UPDATE "Appointment" SET "status" = 'EXPIRED', "updatedAt" = NOW() WHERE "availabilitySlotId" = ${slotId}::uuid AND "status" = 'REQUESTED' AND "holdExpiresAt" <= NOW() RETURNING *`;
    for (const row of expired) {
      await transaction.availabilitySlot.update({ where: { id: slotId }, data: { reservedAt: null } });
      await this.audit(transaction, "system:hold-expiry", "appointment.expired", row.id);
      const payments = await transaction.payment.findMany({ where: { appointmentId: row.id, status: { in: ["RESERVED", "PAID", "SPONSORED"] } } });
      for (const payment of payments) await transaction.outboxEvent.upsert({ where: { eventKey: `payment.reconciliation:${payment.id}` }, update: {}, create: { topic: "payment.reconciliation-required", aggregateType: "Payment", aggregateId: payment.id, eventKey: `payment.reconciliation:${payment.id}`, payloadSafe: { paymentId: payment.id, appointmentId: row.id }, status: "FAILED", lastErrorCode: "MANUAL_RECONCILIATION_REQUIRED" } });
      await transaction.outboxEvent.create({ data: { topic: "appointment.expired", aggregateType: "Appointment", aggregateId: row.id, eventKey: `appointment.expired:${row.id}`, payloadSafe: { appointmentId: row.id } } });
    }
  }

  async expireHolds() {
    await this.prisma.$transaction(async (transaction) => {
      const slots = await transaction.$queryRaw<{ id: string }[]>`SELECT s."id" FROM "AvailabilitySlot" s WHERE EXISTS (SELECT 1 FROM "Appointment" a WHERE a."availabilitySlotId" = s."id" AND a."status" = 'REQUESTED' AND a."holdExpiresAt" <= NOW()) ORDER BY s."id" LIMIT 100 FOR UPDATE OF s SKIP LOCKED`;
      for (const slot of slots) await this.expireSlot(transaction, slot.id);
    });
  }

  async reserveAppointment(ownerUserId: string, request: AppointmentRequest): Promise<AppointmentResult> {
    return this.prisma.$transaction(async (transaction) => {
      // Serialize the same user's retry before locking any slot, including changed-input retries.
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${ownerUserId}::uuid FOR UPDATE`;
      const slots = await transaction.$queryRaw<ClaimedSlot[]>`SELECT "id", "providerId", "startsAt", "mode" FROM "AvailabilitySlot" WHERE "id" = ${request.slotId}::uuid FOR UPDATE`;
      const slot = slots[0];
      if (!slot) throw new ResourceNotFoundError();
      await this.expireSlot(transaction, slot.id);
      const existing = await transaction.appointment.findUnique({ where: { userId_idempotencyKey: { userId: ownerUserId, idempotencyKey: request.idempotencyKey } } });
      if (existing) {
        if (existing.availabilitySlotId !== request.slotId || existing.serviceId !== request.serviceId || existing.mode !== request.mode) throw new AppointmentConflictError("Idempotency input mismatch");
        return this.appointmentResult(existing);
      }
      const service = await transaction.service.findFirst({ where: { id: request.serviceId, active: true, mode: request.mode, facility: { verified: true }, providers: { some: { providerId: slot.providerId, provider: this.verifiedProviderWhere() } } } });
      if (!service) throw new ResourceNotFoundError("Provider does not offer this verified service");
      const claimed = await transaction.$queryRaw<{ expiresAt: Date }[]>`UPDATE "AvailabilitySlot" SET "reservedAt" = NOW() WHERE "id" = ${slot.id}::uuid AND "reservedAt" IS NULL AND "startsAt" > NOW() AND "mode" = ${request.mode} RETURNING NOW() + INTERVAL '15 minutes' AS "expiresAt"`;
      if (!claimed[0]) throw new SlotUnavailableError();
      const appointment = await transaction.appointment.create({ data: { userId: ownerUserId, providerId: slot.providerId, facilityId: service.facilityId, serviceId: service.id, availabilitySlotId: slot.id, idempotencyKey: request.idempotencyKey, startsAt: slot.startsAt, mode: slot.mode, status: "REQUESTED", holdExpiresAt: claimed[0].expiresAt, amountTzs: service.priceTzs } });
      await this.audit(transaction, ownerUserId, "appointment.held", appointment.id);
      await transaction.outboxEvent.create({ data: { topic: "appointment.held", aggregateType: "Appointment", aggregateId: appointment.id, eventKey: `appointment.held:${appointment.id}`, payloadSafe: { appointmentId: appointment.id } } });
      return this.appointmentResult(appointment);
    });
  }

  async transitionAppointment(ownerUserId: string, id: string, action: "confirm" | "cancel"): Promise<AppointmentResult> {
    await this.expireHolds();
    return this.prisma.$transaction(async (transaction) => {
      const initial = await transaction.appointment.findFirst({ where: { id, userId: ownerUserId } });
      if (!initial) throw new ResourceNotFoundError();
      await transaction.$queryRaw`SELECT "id" FROM "AvailabilitySlot" WHERE "id" = ${initial.availabilitySlotId}::uuid FOR UPDATE`;
      const appointment = await transaction.appointment.findUniqueOrThrow({ where: { id } });
      if (action === "confirm" && appointment.status === "CONFIRMED" || action === "cancel" && appointment.status === "CANCELLED") return this.appointmentResult(appointment);
      if (action === "confirm") {
        const valid = await transaction.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Appointment" WHERE "id" = ${id}::uuid AND "status" = 'REQUESTED' AND "holdExpiresAt" > NOW()`;
        if (!valid.length) throw new AppointmentConflictError("Hold is not active");
        if (appointment.amountTzs > 0 && !await transaction.payment.findFirst({ where: { appointmentId: id, status: { in: ["PAID", "SPONSORED"] } } })) throw new PaymentConflictError("Payment has not settled");
      } else if (!["REQUESTED", "CONFIRMED"].includes(appointment.status)) throw new AppointmentConflictError();
      const updated = await transaction.appointment.update({ where: { id }, data: { status: action === "confirm" ? "CONFIRMED" : "CANCELLED" } });
      if (action === "cancel") {
        await transaction.availabilitySlot.update({ where: { id: appointment.availabilitySlotId }, data: { reservedAt: null } });
        const payments = await transaction.payment.findMany({ where: { appointmentId: id, status: { in: ["RESERVED", "PAID", "SPONSORED"] } } });
        for (const payment of payments) await transaction.outboxEvent.upsert({ where: { eventKey: `payment.reconciliation:${payment.id}` }, update: {}, create: { topic: "payment.reconciliation-required", aggregateType: "Payment", aggregateId: payment.id, eventKey: `payment.reconciliation:${payment.id}`, payloadSafe: { paymentId: payment.id, appointmentId: id }, status: "FAILED", lastErrorCode: "MANUAL_RECONCILIATION_REQUIRED" } });
      }
      await this.audit(transaction, ownerUserId, `appointment.${action === "confirm" ? "confirmed" : "cancelled"}`, id);
      await transaction.outboxEvent.create({ data: { topic: `appointment.${action === "confirm" ? "confirmed" : "cancelled"}`, aggregateType: "Appointment", aggregateId: id, eventKey: `appointment.${action}:${id}`, payloadSafe: { appointmentId: id } } });
      return this.appointmentResult(updated);
    });
  }

  async queuePayment(ownerUserId: string, request: PaymentQueueRequest): Promise<PaymentQueueResult> {
    return this.prisma.$transaction(async (transaction) => {
      const owned = await transaction.appointment.findFirst({ where: { id: request.appointmentId, userId: ownerUserId } });
      if (!owned) throw new ResourceNotFoundError();
      await transaction.$queryRaw`SELECT "id" FROM "AvailabilitySlot" WHERE "id" = ${owned.availabilitySlotId}::uuid FOR UPDATE`;
      const existing = await transaction.payment.findUnique({ where: { userId_idempotencyKey: { userId: ownerUserId, idempotencyKey: request.idempotencyKey } } });
      if (existing) {
        if (existing.appointmentId !== request.appointmentId || existing.amountMinor !== request.amountTzs || existing.adapterCode !== request.method) throw new PaymentConflictError("Idempotency key was reused with different input");
        return { id: existing.id, status: existing.status === "CREATED" ? "queued" : existing.status.toLowerCase() as PaymentQueueResult["status"], idempotent: true };
      }
      const appointment = await transaction.appointment.findFirst({ where: { id: request.appointmentId, userId: ownerUserId }, include: { service: { select: { priceTzs: true } } } });
      if (!appointment) throw new ResourceNotFoundError("Appointment was not found");
      if (appointment.status !== "REQUESTED" || !appointment.holdExpiresAt || request.amountTzs !== appointment.amountTzs) throw new PaymentConflictError("Appointment or price has changed");
      const activeHold = await transaction.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Appointment" WHERE "id" = ${appointment.id}::uuid AND "holdExpiresAt" > NOW()`;
      if (!activeHold.length) throw new PaymentConflictError("Hold expired");
      const otherPayment = await transaction.payment.findFirst({ where: { appointmentId: appointment.id, status: { in: ["CREATED", "RESERVED", "PAID", "SPONSORED"] } } });
      if (otherPayment) throw new PaymentConflictError("A payment already exists for this appointment");
      const payment = await transaction.payment.create({ data: { appointmentId: appointment.id, userId: ownerUserId, amountMinor: request.amountTzs, adapterCode: request.method, idempotencyKey: request.idempotencyKey, status: "CREATED" } });
      await transaction.outboxEvent.create({ data: { topic: "payment.reserve", aggregateType: "Payment", aggregateId: payment.id, eventKey: `payment.reserve:${payment.id}`, payloadSafe: { paymentId: payment.id, appointmentId: appointment.id, amountTzs: request.amountTzs, method: request.method, idempotencyKey: request.idempotencyKey } } });
      return { id: payment.id, status: "queued", idempotent: false };
    });
  }

  async queueNotification(deviceId: string, eventId: string) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, revokedAt: null } });
    if (!device) throw new ResourceNotFoundError("Device was not found");
    await this.prisma.outboxEvent.create({ data: { topic: "notification.send-neutral", aggregateType: "Device", aggregateId: deviceId, eventKey: `notification.send-neutral:${eventId}`, payloadSafe: { deviceId, eventId } } });
  }

  async createConsent(ownerUserId: string, request: ConsentRequest) {
    const consent = await this.prisma.consentGrant.create({ data: { grantorUserId: ownerUserId, recipientKeyId: request.recipientKeyId, purposeCode: request.purposeCode, encryptedManifest: Buffer.from(request.encryptedSharingPackage, "base64"), expiresAt: new Date(request.expiresAt) } });
    return { id: consent.id, expiresAt: consent.expiresAt.toISOString() };
  }

  async revokeConsent(ownerUserId: string, id: string) {
    const consent = await this.prisma.consentGrant.findFirst({ where: { id, grantorUserId: ownerUserId } });
    if (!consent) return false;
    const existing = await this.prisma.consentRevocation.findFirst({ where: { consentGrantId: id } });
    if (!existing) await this.prisma.consentRevocation.create({ data: { consentGrantId: id, reasonCode: "USER_REVOKED" } });
    return true;
  }

  async createRoleInvitation(issuerUserId: string, email: string, intendedRole: StaffRole, ttlSec: number) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    const emailDigest = createHmac("sha256", this.hmacKey).update(email.trim().toLowerCase()).digest();
    const tokenDigest = createHash("sha256").update(token).digest();
    const row = await this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.roleInvitation.create({ data: { emailDigest, tokenDigest, intendedRole: intendedRole.replace("-", "_").toUpperCase() as UserRole, issuerUserId, expiresAt } });
      await this.audit(transaction, issuerUserId, "workforce.invitation-created", invitation.id);
      return invitation;
    });
    return { id: row.id, token, expiresAt: expiresAt.toISOString() };
  }

  async acceptRoleInvitation(principal: Principal, token: string) {
    if (principal.realm !== "workforce" || !principal.email || principal.emailVerified !== true) return null;
    const digest = this.identityDigest(principal);
    const tokenDigest = createHash("sha256").update(token).digest();
    const emailDigest = createHmac("sha256", this.hmacKey).update(principal.email.trim().toLowerCase()).digest();
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.roleInvitation.findFirst({ where: { tokenDigest, emailDigest, status: "PENDING", expiresAt: { gt: new Date() } } });
      if (!invitation) return null;
      const existing = await transaction.externalIdentity.findUnique({ where: { issuerSubjectDigest: digest } });
      if (existing && existing.userId !== invitation.acceptedByUserId) return null;
      const user = existing ? await transaction.user.findUniqueOrThrow({ where: { id: existing.userId } }) : await transaction.user.create({ data: { publicHandle: `mw_${randomUUID()}`, role: invitation.intendedRole, externalIdentities: { create: { issuerSubjectDigest: digest } } } });
      await transaction.roleInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedByUserId: user.id, acceptedAt: new Date() } });
      await this.audit(transaction, user.id, "workforce.invitation-accepted", invitation.id);
      return { userId: user.id, role: prismaRoleToApi[user.role] };
    });
  }

  async listDevices(userId: string) {
    const rows = await this.prisma.device.findMany({ where: { userId, revokedAt: null }, include: { keys: { where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { authorizedAt: "desc" } });
    return rows.map((row) => ({ id: row.id, label: row.label, algorithm: row.keys[0]?.algorithm ?? "unknown", publicKey: row.keys[0] ? Buffer.from(row.keys[0].publicKey).toString("base64") : "", authorizedAt: row.authorizedAt.toISOString(), lastSeenAt: row.lastSeenAt?.toISOString() ?? null }));
  }
  async registerDevice(userId: string, label: string, algorithm: string, publicKey: string, attestationFormat: string, attestationEvidence: string) {
    const row = await this.prisma.$transaction(async (transaction) => {
      const device = await transaction.device.create({ data: { userId, label, attestationFormat, attestationEvidenceHash: createHash("sha256").update(attestationEvidence).digest(), keys: { create: { algorithm, publicKey: Buffer.from(publicKey, "base64") } } }, include: { keys: true } });
      await this.audit(transaction, userId, "device.registered", device.id);
      return device;
    });
    return { id: row.id, label: row.label, algorithm, publicKey, authorizedAt: row.authorizedAt.toISOString(), lastSeenAt: null };
  }
  async isDeviceActive(userId: string, id: string) { return Boolean(await this.prisma.device.findFirst({ where: { id, userId, revokedAt: null } })); }
  async revokeDevice(userId: string, id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.device.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!result.count) return false;
      await transaction.deviceKey.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit(transaction, userId, "device.revoked", id); return true;
    });
  }

  async aggregate() {
    const [activeMembers, facilities, allAppointments, completedAppointments] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null, role: "PATIENT" } }),
      this.prisma.facility.count({ where: { verified: true } }),
      this.prisma.appointment.count(),
      this.prisma.appointment.count({ where: { status: "COMPLETED" } })
    ]);
    return { activeMembers, appointmentCompletionRate: allAppointments ? completedAppointments / allAppointments : 0, facilities, individualRecordsAvailable: false as const };
  }

  async claimOutbox(workerId: string, limit: number): Promise<OutboxItem[]> {
    const rows = await this.prisma.$queryRaw<ClaimedOutbox[]>`
      UPDATE "OutboxEvent"
      SET "status" = 'PROCESSING', "lockedAt" = NOW(), "lockedBy" = ${workerId}, "attempts" = "attempts" + 1, "updatedAt" = NOW()
      WHERE "id" IN (
        SELECT "id" FROM "OutboxEvent"
        WHERE (("status" = 'PENDING' AND "availableAt" <= NOW()) OR ("status" = 'PROCESSING' AND "lockedAt" < NOW() - INTERVAL '5 minutes'))
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING "id", "topic", "aggregateId", "payloadSafe", "attempts"
    `;
    return rows.map((row) => ({ id: row.id, topic: row.topic, aggregateId: row.aggregateId, payload: row.payloadSafe as Record<string, unknown>, attempts: row.attempts }));
  }

  async paymentEventDeliverable(paymentId: string) {
    const active = await this.prisma.$queryRaw<{ id: string }[]>`SELECT p."id" FROM "Payment" p JOIN "Appointment" a ON p."appointmentId" = a."id" WHERE p."id" = ${paymentId}::uuid AND p."status" = 'CREATED' AND a."status" = 'REQUESTED' AND a."holdExpiresAt" > NOW()`;
    return active.length > 0;
  }

  async completePaymentEvent(workerId: string, eventId: string, paymentId: string, result: PaymentResult) {
    await this.prisma.$transaction(async (transaction) => {
      const lease = await transaction.outboxEvent.updateMany({ where: { id: eventId, lockedBy: workerId, status: "PROCESSING" }, data: { status: "DELIVERED", deliveredAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: null } });
      if (lease.count === 0) return;
      const payment = await transaction.payment.update({ where: { id: paymentId }, data: { status: result.status === "reserved" ? "RESERVED" : result.status === "paid" ? "PAID" : "FAILED", adapterReference: result.adapterReference } });
      await this.audit(transaction, `worker:${workerId}`, `payment.${result.status}`, paymentId);
      if (payment.appointmentId && result.status !== "failed") {
        const appointment = await transaction.appointment.findUnique({ where: { id: payment.appointmentId } });
        if (appointment && ["CANCELLED", "EXPIRED"].includes(appointment.status)) {
          await transaction.outboxEvent.upsert({ where: { eventKey: `payment.reconciliation:${paymentId}` }, update: {}, create: { topic: "payment.reconciliation-required", aggregateType: "Payment", aggregateId: paymentId, eventKey: `payment.reconciliation:${paymentId}`, payloadSafe: { paymentId, appointmentId: appointment.id }, status: "FAILED", lastErrorCode: "MANUAL_RECONCILIATION_REQUIRED" } });
        }
      }
    });
  }

  async completeOutboxEvent(workerId: string, eventId: string) {
    await this.prisma.outboxEvent.updateMany({ where: { id: eventId, lockedBy: workerId, status: "PROCESSING" }, data: { status: "DELIVERED", deliveredAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: null } });
  }

  async retryOutboxEvent(workerId: string, eventId: string, errorCode: string, delayMs: number, terminal: boolean) {
    await this.prisma.$transaction(async (transaction) => {
      const event = await transaction.outboxEvent.findFirst({ where: { id: eventId, lockedBy: workerId, status: "PROCESSING" }, select: { aggregateType: true, aggregateId: true } });
      if (!event) return;
      const released = await transaction.$executeRaw`
        UPDATE "OutboxEvent" SET "status" = ${terminal ? "FAILED" : "PENDING"},
          "availableAt" = NOW() + (${delayMs} * INTERVAL '1 millisecond'),
          "lockedAt" = NULL, "lockedBy" = NULL, "lastErrorCode" = ${errorCode.slice(0, 100)}, "updatedAt" = NOW()
        WHERE "id" = ${eventId}::uuid AND "lockedBy" = ${workerId} AND "status" = 'PROCESSING'
      `;
      if (terminal && released === 1 && event.aggregateType === "Payment") {
        await transaction.payment.updateMany({ where: { id: event.aggregateId, status: "CREATED" }, data: { status: "FAILED" } });
      }
    });
  }

  async close() { await this.prisma.$disconnect(); }
}

export function createApplicationStore(configuration: RuntimeConfig): ApplicationStore {
  if (configuration.stateStore === "memory") return new MemoryApplicationStore();
  if (!configuration.databaseUrl || !configuration.identitySubjectHmacKey) throw new Error("PostgreSQL state requires DATABASE_URL and IDENTITY_SUBJECT_HMAC_KEY.");
  return new PostgresApplicationStore(new PrismaClient({ datasources: { db: { url: configuration.databaseUrl } } }), configuration.identitySubjectHmacKey, configuration.auditHmacKey);
}
