import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import type {
  HomeworkAssignment,
  HomeworkOptions,
} from "@/lib/ace-homework-api";
import { HomeworkForm } from "./homework-form";
import { HomeworkList } from "./homework-list";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/homework",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const options: HomeworkOptions = {
  academicYears: [
    {
      id: "year",
      name: "2026–27",
      startsOn: "2026-09-01",
      endsOn: "2027-08-31",
    },
  ],
  yearBands: [{ id: "band", name: "Year 5" }],
  subjects: [{ id: "subject", name: "Mathematics" }],
  publicationEnabled: true,
};
const assignment: HomeworkAssignment = {
  id: "assignment",
  title: "Fractions",
  instructions: "Complete the sheet.",
  academicYearId: "year",
  yearBandId: "band",
  subjectId: "subject",
  dueAt: "2026-11-15T16:00:00.000Z",
  status: "DRAFT",
  version: 1,
  scheduledAt: null,
  scheduleFailureReason: null,
  publishedAt: null,
  cancelledAt: null,
};

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const actions: string[] = [];
  await act(async () =>
    root.render(
      <HomeworkList
        assignments={[assignment]}
        options={options}
        pendingId={null}
        onEdit={() => actions.push("edit")}
        onAction={(_, action) => actions.push(action)}
      />,
    ),
  );
  assert.match(container.textContent ?? "", /Fractions/);
  assert.match(container.textContent ?? "", /Year 5/);
  const publish = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Publish now",
  );
  assert.ok(publish);
  await act(async () => publish.click());
  assert.equal(actions.length, 0, "publication needs a separate confirmation");
  const confirm = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Confirm publication",
  );
  assert.ok(confirm);
  const form = confirm.closest("form");
  assert.ok(form);
  await act(async () =>
    form.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  assert.deepEqual(actions, ["publish"]);

  await act(async () =>
    root.render(
      <HomeworkList
        assignments={[assignment]}
        options={{ ...options, publicationEnabled: false }}
        pendingId={null}
        onEdit={() => actions.push("edit")}
        onAction={() => actions.push("action")}
      />,
    ),
  );
  assert.doesNotMatch(container.textContent ?? "", /Publish now|Schedule/);
  assert.match(container.textContent ?? "", /Edit draft/);

  await act(async () =>
    root.render(
      <HomeworkForm
        options={options}
        editing={null}
        pending={false}
        onSave={async () => undefined}
        onClose={() => undefined}
      />,
    ),
  );
  for (const id of [
    "homework-title",
    "homework-instructions",
    "homework-year",
    "homework-class",
    "homework-subject",
    "homework-due",
  ]) {
    const control = container.querySelector(`#${id}`);
    assert.ok(control, `missing ${id}`);
    assert.ok(
      container.querySelector(`label[for="${id}"]`),
      `missing label for ${id}`,
    );
  }
  await act(async () => root.unmount());
  container.remove();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
