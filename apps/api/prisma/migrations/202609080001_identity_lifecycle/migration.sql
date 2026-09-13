-- Establishes an explicit account lifecycle, authoritative provider-to-user
-- binding, and digest-only invitations for privileged roles. Passwords and
-- plaintext email addresses remain with the configured OIDC provider.

CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

ALTER TABLE "User" ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX "User_status_role_idx" ON "User"("status", "role");

ALTER TABLE "Provider"
  ADD CONSTRAINT "Provider_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RoleInvitation" (
    "id" UUID NOT NULL,
    "emailDigest" BYTEA NOT NULL,
    "tokenDigest" BYTEA NOT NULL,
    "intendedRole" "UserRole" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "issuerUserId" UUID NOT NULL,
    "acceptedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "RoleInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoleInvitation_tokenDigest_key" ON "RoleInvitation"("tokenDigest");
CREATE INDEX "RoleInvitation_emailDigest_intendedRole_status_idx" ON "RoleInvitation"("emailDigest", "intendedRole", "status");
CREATE INDEX "RoleInvitation_expiresAt_status_idx" ON "RoleInvitation"("expiresAt", "status");

ALTER TABLE "RoleInvitation"
  ADD CONSTRAINT "RoleInvitation_issuerUserId_fkey"
  FOREIGN KEY ("issuerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoleInvitation"
  ADD CONSTRAINT "RoleInvitation_acceptedByUserId_fkey"
  FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
