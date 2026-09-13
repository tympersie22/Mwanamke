-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'PROVIDER', 'NAVIGATOR', 'FACILITY_ADMIN', 'PLATFORM_ADMIN', 'PROGRAMME_ADMIN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'RESERVED', 'PAID', 'FAILED', 'REFUNDED', 'SPONSORED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'RETIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "publicHandle" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'sw',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceKey" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "algorithm" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedKeyEnvelope" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "keyId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "wrappedKey" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptedKeyEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedHealthRecord" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "recordType" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "envelopeId" UUID NOT NULL,
    "clientVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EncryptedHealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedDocument" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "ciphertextObjectKey" TEXT NOT NULL,
    "ciphertextDigest" BYTEA NOT NULL,
    "envelopeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EncryptedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderDeviceId" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "envelopeId" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentGrant" (
    "id" UUID NOT NULL,
    "grantorUserId" UUID NOT NULL,
    "recipientKeyId" TEXT NOT NULL,
    "purposeCode" TEXT NOT NULL,
    "encryptedManifest" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRevocation" (
    "id" UUID NOT NULL,
    "consentGrantId" UUID NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reasonCode" TEXT,

    CONSTRAINT "ConsentRevocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "displayName" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleSw" TEXT NOT NULL,
    "specializations" TEXT[],
    "languages" TEXT[],
    "gender" TEXT NOT NULL,
    "publicKey" BYTEA,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderVerification" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "authorityCode" TEXT NOT NULL,
    "credentialDigest" BYTEA NOT NULL,
    "reviewerId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ProviderVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" UUID NOT NULL,
    "countryCode" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameSw" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "latitudeApprox" DECIMAL(7,3),
    "longitudeApprox" DECIMAL(7,3),
    "accessibilityEn" TEXT,
    "accessibilitySw" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameSw" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "priceTzs" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "facilityId" UUID,
    "serviceId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "reservedAt" TIMESTAMP(3),

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" UUID NOT NULL,
    "appointmentId" UUID,
    "userId" UUID NOT NULL,
    "destinationFacilityId" UUID NOT NULL,
    "operationalStatus" TEXT NOT NULL,
    "encryptedClinicalPackage" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaboratoryOrder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultDocumentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaboratoryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "pharmacyFacilityId" UUID NOT NULL,
    "encryptedPrescriptionId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "appointmentId" UUID,
    "userId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "adapterCode" TEXT NOT NULL,
    "adapterReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorEntitlement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "programmeCode" TEXT NOT NULL,
    "coveredServiceCodes" TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "remainingMinor" INTEGER,

    CONSTRAINT "SponsorEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareNavigatorAssignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "navigatorUserId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CareNavigatorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyContact" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "encryptedPayload" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "envelopeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "operationalStatus" TEXT NOT NULL,
    "encryptedContext" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "neutralOnly" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietStart" TEXT,
    "quietEnd" TEXT,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetRef" TEXT,
    "metadataSafe" JSONB NOT NULL,
    "previousHash" BYTEA,
    "eventHash" BYTEA NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalContent" (
    "id" UUID NOT NULL,
    "contentKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalContentReview" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "reviewerUserId" UUID NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalContentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryConfiguration" (
    "id" UUID NOT NULL,
    "countryCode" TEXT NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "emergencyNumbers" JSONB NOT NULL,
    "enabledPaymentAdapters" TEXT[],
    "enabledChannels" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CountryConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanguageResource" (
    "id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "LanguageResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_publicHandle_key" ON "User"("publicHandle");

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt");

-- CreateIndex
CREATE INDEX "Device_userId_revokedAt_idx" ON "Device"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "DeviceKey_deviceId_revokedAt_idx" ON "DeviceKey"("deviceId", "revokedAt");

-- CreateIndex
CREATE INDEX "EncryptedKeyEnvelope_ownerUserId_createdAt_idx" ON "EncryptedKeyEnvelope"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedHealthRecord_ownerUserId_createdAt_idx" ON "EncryptedHealthRecord"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedDocument_ciphertextObjectKey_key" ON "EncryptedDocument"("ciphertextObjectKey");

-- CreateIndex
CREATE INDEX "EncryptedDocument_ownerUserId_createdAt_idx" ON "EncryptedDocument"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedMessage_conversationId_sequence_key" ON "EncryptedMessage"("conversationId", "sequence");

-- CreateIndex
CREATE INDEX "ConsentGrant_grantorUserId_expiresAt_idx" ON "ConsentGrant"("grantorUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "ConsentRevocation_consentGrantId_revokedAt_idx" ON "ConsentRevocation"("consentGrantId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_userId_key" ON "Provider"("userId");

-- CreateIndex
CREATE INDEX "Provider_active_gender_idx" ON "Provider"("active", "gender");

-- CreateIndex
CREATE INDEX "ProviderVerification_status_expiresAt_idx" ON "ProviderVerification"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Facility_countryCode_regionCode_verified_idx" ON "Facility"("countryCode", "regionCode", "verified");

-- CreateIndex
CREATE INDEX "Service_facilityId_active_idx" ON "Service"("facilityId", "active");

-- CreateIndex
CREATE INDEX "Appointment_userId_startsAt_idx" ON "Appointment"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_providerId_startsAt_status_idx" ON "Appointment"("providerId", "startsAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySlot_providerId_startsAt_mode_key" ON "AvailabilitySlot"("providerId", "startsAt", "mode");

-- CreateIndex
CREATE INDEX "Referral_userId_createdAt_idx" ON "Referral"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LaboratoryOrder_userId_createdAt_idx" ON "LaboratoryOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PharmacyRequest_userId_createdAt_idx" ON "PharmacyRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_adapterReference_key" ON "Payment"("adapterReference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SponsorEntitlement_userId_expiresAt_idx" ON "SponsorEntitlement"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "CareNavigatorAssignment_navigatorUserId_status_idx" ON "CareNavigatorAssignment"("navigatorUserId", "status");

-- CreateIndex
CREATE INDEX "SafetyContact_ownerUserId_createdAt_idx" ON "SafetyContact"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyEvent_userId_createdAt_idx" ON "EmergencyEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventHash_key" ON "AuditEvent"("eventHash");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_action_idx" ON "AuditEvent"("occurredAt", "action");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalContent_contentKey_version_language_key" ON "ClinicalContent"("contentKey", "version", "language");

-- CreateIndex
CREATE INDEX "ClinicalContentReview_contentId_reviewedAt_idx" ON "ClinicalContentReview"("contentId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CountryConfiguration_countryCode_jurisdictionCode_key" ON "CountryConfiguration"("countryCode", "jurisdictionCode");

-- CreateIndex
CREATE UNIQUE INDEX "LanguageResource_locale_namespace_resourceKey_version_key" ON "LanguageResource"("locale", "namespace", "resourceKey", "version");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceKey" ADD CONSTRAINT "DeviceKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRevocation" ADD CONSTRAINT "ConsentRevocation_consentGrantId_fkey" FOREIGN KEY ("consentGrantId") REFERENCES "ConsentGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderVerification" ADD CONSTRAINT "ProviderVerification_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalContentReview" ADD CONSTRAINT "ClinicalContentReview_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ClinicalContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
