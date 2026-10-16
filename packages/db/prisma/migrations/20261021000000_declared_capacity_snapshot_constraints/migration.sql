ALTER TABLE "InstitutionalBillingSnapshot"
  DROP CONSTRAINT "InstitutionalBillingSnapshot_priced_complete",
  ADD CONSTRAINT "InstitutionalBillingSnapshot_priced_complete" CHECK (
    (
      "status" = 'PRICED'
      AND "pricingVersion" = 'DECLARED_CAPACITY_V2'
      AND "declaredCapacity" BETWEEN 0 AND 250
      AND "lines" IS NOT NULL
      AND jsonb_typeof("lines") = 'array'
      AND "subtotalPence" IS NOT NULL
    )
    OR (
      "status" = 'PRICED'
      AND "pricingVersion" <> 'DECLARED_CAPACITY_V2'
      AND "enrolledChildren" BETWEEN 0 AND 250
      AND "countSource" IS NOT NULL
      AND "includedChildren" IS NOT NULL
      AND "lines" IS NOT NULL
      AND "subtotalPence" IS NOT NULL
    )
    OR (
      "status" = 'CONTACT_SALES'
      AND "enrolledChildren" > 250
      AND "subtotalPence" IS NULL
    )
    OR (
      "status" = 'REVIEW_REQUIRED'
      AND "subtotalPence" IS NULL
    )
  );
