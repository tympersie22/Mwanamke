-- This migration establishes durable identity mapping, owner-scoped ciphertext,
-- transactional slot ownership, payment idempotency, and the delivery outbox.

CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "issuerSubjectDigest" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAuthenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalIdentity_issuerSubjectDigest_key" ON "ExternalIdentity"("issuerSubjectDigest");
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncryptedHealthRecord" ADD COLUMN "clientRecordId" TEXT;
UPDATE "EncryptedHealthRecord" SET "clientRecordId" = "id"::text WHERE "clientRecordId" IS NULL;
ALTER TABLE "EncryptedHealthRecord" ALTER COLUMN "clientRecordId" SET NOT NULL;
CREATE UNIQUE INDEX "EncryptedHealthRecord_ownerUserId_clientRecordId_key" ON "EncryptedHealthRecord"("ownerUserId", "clientRecordId");
ALTER TABLE "EncryptedKeyEnvelope" ADD CONSTRAINT "EncryptedKeyEnvelope_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncryptedHealthRecord" ADD CONSTRAINT "EncryptedHealthRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncryptedHealthRecord" ADD CONSTRAINT "EncryptedHealthRecord_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "EncryptedKeyEnvelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Appointment") THEN
    RAISE EXCEPTION 'Appointment backfill is required before production persistence migration';
  END IF;
END $$;

ALTER TABLE "Appointment"
  ADD COLUMN "availabilitySlotId" UUID NOT NULL,
  ADD COLUMN "idempotencyKey" TEXT NOT NULL,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL;
CREATE UNIQUE INDEX "Appointment_availabilitySlotId_key" ON "Appointment"("availabilitySlotId");
CREATE UNIQUE INDEX "Appointment_userId_idempotencyKey_key" ON "Appointment"("userId", "idempotencyKey");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_availabilitySlotId_fkey" FOREIGN KEY ("availabilitySlotId") REFERENCES "AvailabilitySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "Payment_idempotencyKey_key";
ALTER TABLE "Payment" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Payment" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" SET NOT NULL;
CREATE UNIQUE INDEX "Payment_userId_idempotencyKey_key" ON "Payment"("userId", "idempotencyKey");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payloadSafe" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboxEvent_eventKey_key" ON "OutboxEvent"("eventKey");
CREATE INDEX "OutboxEvent_status_availableAt_createdAt_idx" ON "OutboxEvent"("status", "availableAt", "createdAt");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");
