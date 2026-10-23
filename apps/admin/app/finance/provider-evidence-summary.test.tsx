import "@/lib/register-test-styles";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderEvidenceSummary } from "./provider-evidence-summary";

const html = renderToStaticMarkup(
  <ProviderEvidenceSummary
    provider={{
      status: "UNAVAILABLE",
      source: "PERSISTED_RECONCILIATION",
      fetchedAt: "2026-10-23T12:00:00Z",
      context: {
        id: "connection",
        accountId: "acct_retained",
        livemode: false,
      },
      freshness: "STALE",
      periodStartCoverage: "UNPROVEN",
      truncated: false,
      coverage: [],
      feesByCurrency: [{ currency: "EUR", amountMinor: "10" }],
    }}
  />,
);
assert.match(html, /Provider access is unavailable/);
assert.match(html, /Saved provider evidence/);
assert.match(html, /acct_retained/);
assert.match(html, /Processor fees/);
assert.match(html, /EUR/);
assert.match(html, /0\.10/);
assert.doesNotMatch(html, /Connect the school/);
