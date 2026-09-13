CREATE TABLE "PrivacyRequest" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('export', 'deletion')),
  "status" TEXT NOT NULL DEFAULT 'submitted' CHECK ("status" IN ('submitted', 'in_review', 'completed', 'rejected')),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PrivacyRequest_userId_idempotencyKey_key" ON "PrivacyRequest"("userId", "idempotencyKey");
CREATE INDEX "PrivacyRequest_userId_id_idx" ON "PrivacyRequest"("userId", "id");
