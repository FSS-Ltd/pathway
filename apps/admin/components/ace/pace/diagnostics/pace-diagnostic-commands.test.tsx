import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { notifyActiveSiteChanged } from "@/lib/active-site-events";
import { setApiClientToken } from "@/lib/api-client";
import {
  recordPaceDiagnostic,
  retractPaceDiagnostic,
  type PaceDiagnosticResult,
} from "@/lib/pace-diagnostic-api";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/pace/diagnostics",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

const childId = "11111111-1111-4111-8111-111111111111";
const subjectId = "22222222-2222-4222-8222-222222222222";
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function change(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function run(): Promise<void> {
  const { PaceDiagnosticRecordForm } =
    await import("./pace-diagnostic-record-form");
  const { PaceDiagnosticRetraction } =
    await import("./pace-diagnostic-retraction");
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const responses: Array<Promise<Response> | Response> = [];
  globalThis.fetch = (input, init) => {
    requests.push({ url: String(input), init: init ?? {} });
    const response = responses.shift();
    assert.ok(response, "each request has a response");
    return Promise.resolve(response);
  };
  setApiClientToken("test-token");
  let recorded = 0;
  let retracted = 0;
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (element) => element.textContent === label,
    );

  try {
    await act(async () =>
      root.render(
        <PaceDiagnosticRecordForm
          childId={childId}
          subjectId={subjectId}
          childName="Jordan Smith"
          subjectName="Maths"
          onRecord={recordPaceDiagnostic}
          onRecorded={() => {
            recorded += 1;
          }}
        />,
      ),
    );
    assert.match(container.textContent ?? "", /assigned PACE will not change/);
    await submit(container.querySelector("form")!);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Choose a diagnostic level and outcome/,
    );
    assert.equal(requests.length, 0);

    const level = container.querySelector("select");
    assert.ok(level);
    await act(async () => {
      level.value = "3";
      level.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await act(async () =>
      container.querySelector<HTMLInputElement>('input[value="PASS"]')?.click(),
    );
    const recordResponse = deferred<Response>();
    responses.push(recordResponse.promise);
    await submit(container.querySelector("form")!);
    await submit(container.querySelector("form")!);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://api.test/ace/pace/diagnostics");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(
      new Headers(requests[0].init.headers).get("Authorization"),
      "Bearer test-token",
    );
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
      childId,
      subjectId,
      level: 3,
      outcome: "PASS",
    });
    assert.equal(button("Recording…")?.disabled, true);
    await act(async () =>
      recordResponse.resolve(
        new Response(
          JSON.stringify({ id: result.id, recordedAt: result.recordedAt }),
          { status: 201 },
        ),
      ),
    );
    assert.equal(recorded, 1);
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /Diagnostic recorded/,
    );
    assert.equal(document.activeElement?.getAttribute("role"), "status");

    await act(async () =>
      root.render(
        <PaceDiagnosticRetraction
          result={result}
          onRetract={(id, reason) => retractPaceDiagnostic(id, { reason })}
          onRetracted={() => {
            retracted += 1;
          }}
        />,
      ),
    );
    await act(async () => button("Retract result")?.click());
    assert.equal(document.activeElement?.tagName, "TEXTAREA");
    await submit(container.querySelector("form")!);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Enter a reason/,
    );
    assert.equal(requests.length, 1);
    await change(
      container.querySelector("textarea")!,
      "Recorded for wrong test",
    );
    responses.push(
      new Response(
        JSON.stringify({ message: "Diagnostic result already retracted" }),
        { status: 409 },
      ),
    );
    await submit(container.querySelector("form")!);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /already retracted/,
    );
    assert.equal(retracted, 0);
    assert.equal(
      requests[1].url,
      `http://api.test/ace/pace/diagnostics/${result.id}/retraction`,
    );
    assert.deepEqual(JSON.parse(String(requests[1].init.body)), {
      reason: "Recorded for wrong test",
    });

    const retractResponse = deferred<Response>();
    responses.push(retractResponse.promise);
    await submit(container.querySelector("form")!);
    await submit(container.querySelector("form")!);
    assert.equal(requests.length, 3);
    assert.equal(button("Retracting…")?.disabled, true);
    await act(async () =>
      retractResponse.resolve(
        new Response(
          JSON.stringify({
            id: "66666666-6666-4666-8666-666666666666",
            resultId: result.id,
            retractedAt: "2026-10-06T11:00:00.000Z",
          }),
          { status: 201 },
        ),
      ),
    );
    assert.equal(retracted, 1);
    assert.equal(container.querySelector("form"), null);

    await act(async () =>
      root.render(
        <PaceDiagnosticRecordForm
          childId={childId}
          subjectId={subjectId}
          childName="Jordan Smith"
          subjectName="Maths"
          onRecord={recordPaceDiagnostic}
          onRecorded={() => {
            recorded += 1;
          }}
        />,
      ),
    );
    const nextLevel = container.querySelector("select");
    assert.ok(nextLevel);
    await act(async () => {
      nextLevel.value = "2";
      nextLevel.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    await act(async () =>
      container.querySelector<HTMLInputElement>('input[value="FAIL"]')?.click(),
    );
    responses.push(
      new Response(JSON.stringify({ message: "Permission denied" }), {
        status: 403,
      }),
    );
    await submit(container.querySelector("form")!);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Permission denied/,
    );
    assert.equal(recorded, 1);

    const stale = deferred<Response>();
    responses.push(stale.promise);
    await submit(container.querySelector("form")!);
    await act(async () => notifyActiveSiteChanged());
    await act(async () =>
      stale.resolve(
        new Response(
          JSON.stringify({ id: result.id, recordedAt: result.recordedAt }),
          { status: 201 },
        ),
      ),
    );
    assert.equal(recorded, 1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
