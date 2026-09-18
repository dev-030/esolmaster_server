-- Keep webhook delivery processing idempotent and observable.
ALTER TYPE "BillingStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_ACTION_REQUIRED';

ALTER TABLE "UserSubscription"
  ADD COLUMN IF NOT EXISTS "checkoutSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "checkoutPlanId" TEXT,
  ADD COLUMN IF NOT EXISTS "checkoutSessionCreatedAt" TIMESTAMP(3);

CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "objectId" TEXT,
    "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");
CREATE INDEX "StripeWebhookEvent_status_createdAt_idx" ON "StripeWebhookEvent"("status", "createdAt");
CREATE INDEX "StripeWebhookEvent_objectId_idx" ON "StripeWebhookEvent"("objectId");
