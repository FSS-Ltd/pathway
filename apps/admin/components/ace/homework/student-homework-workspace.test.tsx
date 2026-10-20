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
            status: submitted ? "SUBMITTED" : "DRAFT",
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

    enabled = false;
    submitted = false;
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
