import assert from "node:assert/strict";
import React, { act } from "react";
import {
  dom,
  click,
  invoice,
  deferred,
} from "./finance-assurance-test-support";
import type { FinanceInvoiceDetail } from "@/lib/finance-workspace-client";
import { FinanceInvoiceWorkspace } from "./invoice-workspace";

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let transitions = 0;
  const transitionPayloads: unknown[] = [];
  const transitionKeys: unknown[] = [];
  let failure = 409;
  let currentDetail: FinanceInvoiceDetail = invoice;
  const readUrls: string[] = [];
  const firstPreview = deferred<Response>();
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") {
      transitions++;
      transitionPayloads.push(init.body ? JSON.parse(String(init.body)) : null);
      transitionKeys.push(new Headers(init.headers).get("Idempotency-Key"));
      return Response.json(
        { message: "Invoice changed; review again" },
        { status: failure },
      );
    }
    readUrls.push(String(input));
    if (readUrls.length === 1) return firstPreview.promise;
    return Response.json({
      ...currentDetail,
      lines: [{ ...invoice.lines[0], description: "Server tuition detail" }],
    });
  };
  try {
    const renderWorkspace = () =>
      root.render(
        <FinanceInvoiceWorkspace
          key={`${currentDetail.status}-${currentDetail.approvedAt}`}
          invoices={[currentDetail]}
          payerAccounts={[]}
          hasMorePayerAccounts={false}
          isLoadingMorePayerAccounts={false}
          onLoadMorePayerAccounts={async () => {}}
          currency="GBP"
          canCreate
          canReview
          isLoading={false}
          hasMore={false}
          isLoadingMore={false}
          onLoadMore={async () => {}}
          onRefresh={async () => {}}
        />,
      );
    await act(async () => renderWorkspace());
    await act(async () => click(container, "Issue invoice"));
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /Updating invoice/,
    );
    await act(async () =>
      firstPreview.resolve(
        Response.json({
          ...invoice,
          lines: [
            { ...invoice.lines[0], description: "Server tuition detail" },
          ],
        }),
      ),
    );
    assert.match(
      container.textContent ?? "",
      /Server tuition detail/,
      "Fetch and show server lines before issue confirmation",
    );
    assert.deepEqual(readUrls, [
      `http://api.test/finance/invoices/${invoice.id}`,
    ]);
    assert.match(container.textContent ?? "", /Fresh school legal entity/);
    assert.match(container.textContent ?? "", /Synthetic family/);
    assert.match(container.textContent ?? "", /1 Nov 2026/);
    assert.match(container.textContent ?? "", /20%/);
    assert.match(container.textContent ?? "", /50\.00/);
    assert.equal(transitions, 0);
    await act(async () => click(container, "Confirm issue"));
    assert.equal(transitions, 1);
    assert.deepEqual(transitionPayloads[0], {
      expectedRevision: invoice.reviewRevision,
    });
    const alert = container.querySelector('[role="alert"]');
    assert.match(alert?.textContent ?? "", /Invoice changed/);
    assert.ok(
      !container.querySelector("dialog[open]") ||
        container.querySelector("dialog[open]")?.contains(alert),
      "Conflict feedback must be inside active modal or modal must close",
    );
    failure = 500;
    currentDetail = { ...invoice, reviewRevision: "b".repeat(64) };
    await act(async () => click(container, "Issue invoice"));
    await act(async () => click(container, "Confirm issue"));
    assert.deepEqual(transitionPayloads[1], {
      expectedRevision: currentDetail.reviewRevision,
    });
    assert.notEqual(
      transitionKeys[0],
      transitionKeys[1],
      "A new server revision needs a distinct command identity",
    );
    const activeModal = container.querySelector("dialog[open]");
    assert.ok(activeModal);
    assert.match(
      activeModal.querySelector('[role="alert"]')?.textContent ?? "",
      /Invoice action could not be completed/,
    );
    await act(async () => click(container, "Cancel"));
    assert.equal(container.querySelector("dialog[open]"), null);
    const reviewStates: Array<{
      detail: FinanceInvoiceDetail;
      button: string;
      confirmation: string;
    }> = [
      {
        detail: { ...invoice, status: "DRAFT", approvedAt: null },
        button: "Send for review",
        confirmation: "Confirm send for review",
      },
      {
        detail: { ...invoice, approvedAt: null },
        button: "Approve",
        confirmation: "Confirm approval",
      },
    ];
    for (const state of reviewStates) {
      currentDetail = state.detail;
      await act(async () => renderWorkspace());
      const previousTransitions: number = transitions;
      await act(async () => click(container, state.button));
      const preview = container.querySelector("dialog[open]");
      assert.match(preview?.textContent ?? "", /Server tuition detail/);
      assert.match(preview?.textContent ?? "", /20%/);
      assert.ok(
        Array.from(preview?.querySelectorAll("button") ?? []).some(
          (button) => button.textContent === state.confirmation,
        ),
      );
      assert.equal(
        transitions,
        previousTransitions,
        "Review and approval must display detail before any mutation",
      );
      await act(async () => click(container, "Cancel"));
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
}
void run();
