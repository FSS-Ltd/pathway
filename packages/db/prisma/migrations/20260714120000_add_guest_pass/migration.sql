-- Guest pass (day visitor): auto-deleted by the workers guest-pass-cleanup sweep.
ALTER TABLE "Child" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Child" ADD COLUMN "guestExpiresAt" TIMESTAMP(3);

CREATE INDEX "Child_isGuest_guestExpiresAt_idx" ON "Child"("isGuest", "guestExpiresAt");
