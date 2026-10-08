import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaceDiagnosticHistory } from "./pace-diagnostic-history";
import {
  fetchPaceDiagnosticHistory,
  type PaceDiagnosticResult,
} from "@/lib/pace-diagnostic-api";
import type { PagedSiteResults } from "@/components/ace/pace/use-site-paged-results";

const result: PaceDiagnosticResult = {
  id: "33333333-3333-4333-8333-333333333333",
  enrollmentId: "44444444-4444-4444-8444-444444444444",
  level: 3,
  outcome: "PASS",
  recordedAt: "2026-10-06T10:00:00.000Z",
  recordedBy: {
    id: "55555555-5555-4555-8555-555555555555",
    displayName: "Casey",
  },
  retraction: null,
};

const noAction = () => undefined;
const emptyHistory: PagedSiteResults<PaceDiagnosticResult> = {
  items: [],
  nextCursor: null,
  isLoading: false,
  isLoadingMore: false,
  error: null,
  loadMoreError: null,
  retry: noAction,
  loadMore: noAction,
};

function markup(
  history: PagedSiteResults<PaceDiagnosticResult>,
  includeRetracted = false,
  canRetract = false,
): string {
  return renderToStaticMarkup(
    <PaceDiagnosticHistory
      history={history}
      includeRetracted={includeRetracted}
      onIncludeRetractedChange={noAction}
      retraction={
        canRetract
          ? {
              onRetract: async () => ({
                id: "retraction-1",
                resultId: result.id,
                retractedAt: result.recordedAt,
              }),
              onRetracted: noAction,
            }
          : undefined
      }
    />,
  );
}

assert.match(markup(emptyHistory), /No active diagnostic results/);
assert.match(
  markup(emptyHistory, true),
  /No diagnostic results have been recorded/,
);
assert.match(
  markup({ ...emptyHistory, isLoading: true }),
  /Loading diagnostic results/,
);
assert.match(
  markup({ ...emptyHistory, error: "History unavailable" }),
  /History unavailable/,
);
assert.match(
  markup({ ...emptyHistory, error: "History unavailable" }),
  />Retry</,
);

const activeMarkup = markup({
  ...emptyHistory,
  items: [result],
  nextCursor: "cursor-2",
  loadMoreError: "More results unavailable",
});
assert.match(activeMarkup, /Level 3 · Pass/);
assert.match(activeMarkup, /Recorded .* by Casey/);
assert.match(activeMarkup, /Load more results/);
assert.match(activeMarkup, /More results unavailable/);
assert.doesNotMatch(activeMarkup, /Retract result/);
assert.match(
  markup({ ...emptyHistory, items: [result] }, false, true),
  /Retract result/,
);

const retractedResult: PaceDiagnosticResult = {
  ...result,
  retraction: {
    id: "66666666-6666-4666-8666-666666666666",
    reason: "Recorded for the wrong test",
    retractedAt: "2026-10-06T11:00:00.000Z",
    retractedBy: {
      id: "77777777-7777-4777-8777-777777777777",
      displayName: "Morgan",
    },
  },
};
const retractedMarkup = markup(
  { ...emptyHistory, items: [retractedResult] },
  true,
);
assert.match(retractedMarkup, /Retracted/);
assert.match(retractedMarkup, /Recorded for the wrong test/);
assert.match(retractedMarkup, /by Morgan/);
assert.doesNotMatch(retractedMarkup, /Retract result/);
assert.doesNotMatch(
  markup({ ...emptyHistory, items: [retractedResult] }, true, true),
  /Retract result/,
);

async function testHistoryRequest(): Promise<void> {
  const originalFetch = globalThis.fetch;
  try {
    let requestedUrl = "";
    let requestedSignal: AbortSignal | undefined;
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedSignal = init?.signal ?? undefined;
      return new Response(
        JSON.stringify({
          selection: {
            child: {
              id: "11111111-1111-4111-8111-111111111111",
              displayName: "Jordan Smith",
            },
            subject: {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Maths",
            },
          },
          items: [result],
          nextCursor: null,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const controller = new AbortController();
    const page = await fetchPaceDiagnosticHistory({
      childId: "11111111-1111-4111-8111-111111111111",
      subjectId: "22222222-2222-4222-8222-222222222222",
      includeRetracted: true,
      cursor: "cursor-2",
      signal: controller.signal,
    });
    const url = new URL(requestedUrl);
    assert.equal(url.pathname, "/ace/pace/diagnostics");
    assert.equal(url.searchParams.get("includeRetracted"), "true");
    assert.equal(url.searchParams.get("limit"), "50");
    assert.equal(url.searchParams.get("cursor"), "cursor-2");
    assert.ok(requestedSignal);
    controller.abort();
    assert.equal(requestedSignal.aborted, true);
    assert.deepEqual(page.items, [result]);
    assert.equal(page.selection.child.displayName, "Jordan Smith");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void testHistoryRequest();
