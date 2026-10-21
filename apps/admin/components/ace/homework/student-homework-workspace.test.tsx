import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { StudentHomeworkView } from "./student-homework-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/student/sites/site-one/homework",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  let enabled = true;
  let submitted = false;
  let reviewState: "none" | "completed" | "returned" = "none";
  let interruptSubmit = true;
  const submitKeys: string[] = [];
  setApiClientToken("student-token");
  globalThis.fetch = async (input, init) => {
    methods.push(init?.method ?? "GET");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer student-token",
    );
    assert.match(String(input), /\/ace\/student\/sites\/site-one\/homework/);
    if (init?.method === "PATCH") {
      assert.deepEqual(JSON.parse(String(init.body)), {
        text: "A draft answer",
      });
      return Response.json({
        id: "submission",
        status: "DRAFT",
        draftText: "A draft answer",
        version: 0,
      });
    }
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as {
        idempotencyKey: string;
        text: string;
      };
      assert.ok(body.idempotencyKey);
      assert.equal(body.text, "A draft answer");
      submitKeys.push(body.idempotencyKey);
      if (interruptSubmit) {
        interruptSubmit = false;
        throw new TypeError("Network request failed");
      }
      submitted = true;
      return Response.json({
        id: "version",
        number: 1,
        late: false,
        submittedAt: "2026-10-20T12:00:00.000Z",
      });
    }
    return Response.json({
      submissionsEnabled: enabled,
      assignments: [
        {
          id: "assignment",
          title: "Fractions",
          instructions: "Complete the sheet.",
          dueAt: "2026-11-15T16:00:00.000Z",
          submission: {
            id: "submission",
            status:
              reviewState === "completed"
                ? "COMPLETED"
                : reviewState === "returned"
                  ? "RETURNED"
                  : submitted
                    ? "SUBMITTED"
                    : "DRAFT",
            draftText: "A draft answer",
            version: submitted ? 1 : 0,
            versions: submitted
              ? [
                  {
                    id: "version",
                    number: 1,
                    text: "A draft answer",
                    late: false,
                    submittedAt: "2026-10-20T12:00:00.000Z",
                    evidence: null,
                    review:
                      reviewState === "none"
                        ? null
                        : {
                            decision:
                              reviewState === "completed"
                                ? "COMPLETED"
                                : "RETURNED",
                            feedback: "Please check the final step.",
                            releasedAt:
                              reviewState === "completed"
                                ? "2026-10-20T13:00:00.000Z"
                                : null,
                            staffNote: "Private staff note",
                          },
                  },
                ]
              : [],
          },
        },
      ],
    });
  };

  try {
    await act(async () =>
      root.render(
        <StudentHomeworkView siteId="site-one" status="authenticated" />,
      ),
    );
    assert.match(container.textContent ?? "", /My homework/);
    const open = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open assignment",
    );
    assert.ok(open);
    await act(async () => open.click());
    assert.equal(document.activeElement?.textContent, "Fractions");
    assert.equal(container.querySelector("textarea")?.value, "A draft answer");
    assert.ok(container.querySelector('label[for="answer-assignment"]'));
    assert.ok(container.querySelector('label[for="evidence-assignment"]'));

    const save = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save draft",
    );
    assert.ok(save);
    await act(async () => save.click());
    assert.ok(methods.includes("PATCH"));
    const submit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Submit work",
    );
    assert.ok(submit);
    await act(async () => submit.click());
    assert.match(container.textContent ?? "", /Connection lost/);
    assert.equal(container.querySelector("textarea")?.value, "A draft answer");
    await act(async () => submit.click());
    assert.equal(submitKeys.length, 2);
    assert.equal(submitKeys[0], submitKeys[1]);
    assert.ok(methods.includes("POST"));
    assert.match(
      container.textContent ?? "",
      /Your work has been sent to the school/,
    );
    assert.match(container.textContent ?? "", /Version 1/);

    const back = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Back to homework",
    );
    assert.ok(back);
    await act(async () => back.click());
    assert.equal(document.activeElement?.textContent, "My homework");

    reviewState = "completed";
    await act(async () =>
      root.render(
        <StudentHomeworkView
          key="completed"
          siteId="site-one"
          status="authenticated"
        />,
      ),
    );
    assert.match(container.textContent ?? "", /Completed/);
    const openCompleted = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open assignment",
    );
    assert.ok(openCompleted);
    await act(async () => openCompleted.click());
    assert.equal(container.querySelector("textarea"), null);
    assert.match(container.textContent ?? "", /Please check the final step/);
    assert.match(container.textContent ?? "", /feedback is shown above/);
    assert.doesNotMatch(container.textContent ?? "", /Feedback will appear/);
    assert.doesNotMatch(container.textContent ?? "", /Private staff note/);

    reviewState = "returned";
    await act(async () =>
      root.render(
        <StudentHomeworkView
          key="returned"
          siteId="site-one"
          status="authenticated"
        />,
      ),
    );
    const openReturned = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open assignment",
    );
    assert.ok(openReturned);
    await act(async () => openReturned.click());
    assert.ok(container.querySelector("textarea"));
    assert.match(container.textContent ?? "", /Feedback for your revision/);

    enabled = false;
    submitted = false;
    reviewState = "none";
    await act(async () =>
      root.render(
        <StudentHomeworkView
          key="disabled"
          siteId="site-one"
          status="authenticated"
        />,
      ),
    );
    assert.match(
      container.textContent ?? "",
      /Homework submissions are not available yet/,
    );
    const openDisabled = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open assignment",
    );
    assert.ok(openDisabled);
    await act(async () => openDisabled.click());
    assert.match(
      container.textContent ?? "",
      /Your school has not enabled homework submissions yet/,
    );
    assert.equal(container.querySelector("textarea"), null);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
