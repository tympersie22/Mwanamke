ALTER TYPE "AppointmentStatus" ADD VALUE 'EXPIRED';
ALTER TABLE "Appointment" ADD COLUMN "holdExpiresAt" TIMESTAMP(3), ADD COLUMN "amountTzs" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam';
UPDATE "Appointment" a SET "amountTzs" = s."priceTzs" FROM "Service" s WHERE a."serviceId" = s."id";
-- Existing requested reservations become bounded holds; confirmed history is preserved.
UPDATE "Appointment" SET "holdExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '15 minutes' WHERE "status" = 'REQUESTED';
DROP INDEX "Appointment_availabilitySlotId_key";
CREATE UNIQUE INDEX "Appointment_active_slot_key" ON "Appointment"("availabilitySlotId") WHERE "status" IN ('REQUESTED', 'CONFIRMED');
CREATE INDEX "Appointment_status_holdExpiresAt_idx" ON "Appointment"("status", "holdExpiresAt");
CREATE TABLE "ProviderService" (
  "providerId" UUID NOT NULL REFERENCES "Provider"("id") ON DELETE CASCADE,
  "serviceId" UUID NOT NULL REFERENCES "Service"("id") ON DELETE CASCADE,
  PRIMARY KEY ("providerId", "serviceId")
);
-- Associations require reviewed operational provisioning. Do not infer them from old bookings.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AuditEvent is append-only'; END;
$$;
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
