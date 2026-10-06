import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { fetchAllPacePages, PaceRoster } from "./pace-roster";
import { PaceEntryDialog, type PaceEntryFormValue } from "./pace-entry-dialog";
import { PaceCorrectionDialog } from "./pace-correction-dialog";
import { PolicyResultCallout } from "./policy-result-callout";
import type { AdminPaceCommandResponse } from "@/lib/api-client";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const childId = "11111111-1111-4111-8111-111111111111";
const subjectId = "22222222-2222-4222-8222-222222222222";
const assessmentId = "33333333-3333-4333-8333-333333333333";

const form: PaceEntryFormValue = {
  childId,
  subjectId,
  paceNumber: "1001",
  assessmentType: "FinalTest",
  score: "76",
  assessedAt: "2026-08-12T09:30",
  reason: "Recorded after supervised PACE test",
};

function successfulCommand(): AdminPaceCommandResponse {
  return {
    assessment: {
      id: assessmentId,
      childId,
      subjectId,
      paceNumber: 1001,
      assessmentType: "FinalTest",
      score: 76,
      result: "passed",
      assessedOn: "2026-08-12",
    },
    progress: {
      currentPace: 1002,
      targetPace: 1012,
      completedPaces: 1,
      trackStatus: "ON_TRACK",
      blockCode: null,
      lastAssessmentId: assessmentId,
      rebuiltAt: "2026-08-12T09:30:00.000Z",
    },
    duplicate: false,
  };
}

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };

function input(container: HTMLElement, id: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`#${id}`);
  assert.ok(element, `expected #${id}`);
  return element;
}

async function change(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    "value",
  )?.set;
  assert.ok(setter, "input value setter is available");
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function submit(formElement: HTMLFormElement): Promise<void> {
  await act(async () => {
    formElement.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function render(root: Root, node: React.ReactNode): Promise<void> {
  await act(async () => root.render(node));
}

async function fillEntryForm(container: HTMLElement): Promise<void> {
  await change(input(container, "pace-entry-pace-number"), form.paceNumber);
  await change(input(container, "pace-entry-score"), form.score);
  await change(input(container, "pace-entry-assessed-at"), form.assessedAt);
  await change(input(container, "pace-entry-reason"), form.reason);
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await render(
      root,
      <PaceRoster
        isLoading
        items={[]}
        exceptions={[]}
        error={null}
        canRecord={false}
        canCorrect={false}
        canReadDiagnostics={false}
        onRecord={() => undefined}
        onCorrect={() => undefined}
        onRetry={() => undefined}
      />,
    );
    assert.ok(
      container.querySelector('[aria-label="Loading PACE roster…"]'),
      "renders the roster loading state",
    );

    await render(
      root,
      <PaceRoster
        isLoading={false}
        items={[]}
        exceptions={[]}
        error="PACE roster is temporarily unavailable."
        canRecord={false}
        canCorrect={false}
        canReadDiagnostics={false}
        onRecord={() => undefined}
        onCorrect={() => undefined}
        onRetry={() => undefined}
      />,
    );
    assert.match(container.textContent ?? "", /No active PACE placements/);
    assert.ok(
      container.querySelector('button[type="button"]'),
      "offers a retry after a recoverable roster failure",
    );

    await render(
      root,
      <PaceRoster
        isLoading={false}
        items={[
          {
            child: { id: childId, displayName: "Jordan Smith" },
            subject: { id: subjectId, name: "Maths" },
            group: null,
            currentPace: 1001,
            targetPace: 1010,
            status: null,
            currentLevel: 1,
            rebuiltAt: null,
          },
        ]}
        exceptions={[]}
        error={null}
        canRecord={false}
        canCorrect={false}
        canReadDiagnostics
        onRecord={() => undefined}
        onCorrect={() => undefined}
        onRetry={() => undefined}
      />,
    );
    assert.equal(
      container
        .querySelector('a[href^="/ace/pace/diagnostics?"]')
        ?.getAttribute("href"),
      "/ace/pace/diagnostics?childId=" + childId + "&subjectId=" + subjectId,
    );
    await render(
      root,
      <PaceRoster
        isLoading={false}
        items={[
          {
            child: { id: childId, displayName: "Jordan Smith" },
            subject: { id: subjectId, name: "Maths" },
            group: null,
            currentPace: 1001,
            targetPace: 1010,
            status: null,
            currentLevel: 1,
            rebuiltAt: null,
          },
        ]}
        exceptions={[]}
        error={null}
        canRecord={false}
        canCorrect={false}
        canReadDiagnostics={false}
        onRecord={() => undefined}
        onCorrect={() => undefined}
        onRetry={() => undefined}
      />,
    );
    assert.equal(
      container.querySelector('a[href^="/ace/pace/diagnostics?"]'),
      null,
      "hides diagnostic history without its typed permission",
    );

    await render(
      root,
      <PolicyResultCallout
        policy={{ decision: "warn", code: "score-below-threshold" }}
      />,
    );
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /The score is below the site threshold\. The assessment was recorded without progression\./,
      "renders the server policy warning without recreating policy logic",
    );

    await render(
      root,
      <PolicyResultCallout policy={{ decision: "allow", code: "allowed" }} />,
    );
    assert.equal(
      container.textContent,
      "",
      "does not present an allowed policy result as a warning",
    );

    let saveAttempts = 0;
    let releaseSave: (() => void) | undefined;
    const pendingSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await render(
      root,
      <PaceEntryDialog
        isOpen
        rosterItem={{
          child: { id: childId, displayName: "Jordan Smith" },
          group: null,
          subject: { id: subjectId, name: "Mathematics" },
          currentPace: 1001,
          targetPace: 1012,
          status: "ON_TRACK",
          currentLevel: 10,
          rebuiltAt: null,
        }}
        canOverride={false}
        onClose={() => undefined}
        onSave={async () => {
          saveAttempts += 1;
          await pendingSave;
          return {
            assessment: {
              id: assessmentId,
              childId,
              subjectId,
              paceNumber: 1001,
              assessmentType: "FinalTest",
              score: 76,
              result: "passed",
              assessedOn: "2026-08-12",
            },
            progress: {
              currentPace: 1002,
              targetPace: 1012,
              completedPaces: 1,
              trackStatus: "ON_TRACK",
              blockCode: null,
              lastAssessmentId: assessmentId,
              rebuiltAt: "2026-08-12T09:30:00.000Z",
            },
            duplicate: false,
          };
        }}
        onAuthoriseOverride={async () => {
          throw new Error("not reached");
        }}
        onSuccess={() => undefined}
        onRefreshStepUp={async () => undefined}
      />,
    );
    await fillEntryForm(container);
    const entryForm = container.querySelector("form");
    assert.ok(entryForm, "renders the PACE entry form");
    await submit(entryForm);
    await submit(entryForm);
    assert.equal(saveAttempts, 1, "prevents duplicate assessment submission");
    await act(async () => releaseSave?.());
    const entrySuccess = container.querySelector('[role="status"]');
    assert.match(
      entrySuccess?.textContent ?? "",
      /Assessment recorded\./,
      "announces a successful assessment",
    );
    assert.equal(
      document.activeElement,
      entrySuccess,
      "moves focus to the assessment success message",
    );

    await render(
      root,
      <PaceEntryDialog
        isOpen
        rosterItem={{
          child: { id: childId, displayName: "Jordan Smith" },
          group: null,
          subject: { id: subjectId, name: "Mathematics" },
          currentPace: 1001,
          targetPace: 1012,
          status: "ON_TRACK",
          currentLevel: 10,
          rebuiltAt: null,
        }}
        canOverride
        onClose={() => undefined}
        onSave={async () => {
          throw new Error("Connection interrupted. Try again.");
        }}
        onAuthoriseOverride={async () => {
          const error = new Error("Recent step-up authentication is required.");
          Object.assign(error, { code: "STEP_UP_REQUIRED" });
          throw error;
        }}
        onSuccess={() => undefined}
        onRefreshStepUp={async () => undefined}
      />,
    );
    await fillEntryForm(container);
    const retryForm = container.querySelector("form");
    assert.ok(retryForm, "keeps the entry form available after an error");
    await submit(retryForm);
    assert.equal(
      input(container, "pace-entry-reason").value,
      form.reason,
      "preserves form input after a recoverable submission error",
    );
    assert.match(container.textContent ?? "", /Connection interrupted/);

    const override = container.querySelector<HTMLInputElement>(
      "#pace-entry-override",
    );
    assert.ok(override, "shows override only to an authorised operator");
    await act(async () => override.click());
    await submit(retryForm);
    assert.match(
      container.textContent ?? "",
      /Complete MFA, then refresh your session and retry the override/,
      "explains that the server requires fresh signed step-up evidence",
    );

    let overrideCalls = 0;
    const retriedAssessments: Array<{ policyOverrideId?: string }> = [];
    await render(
      root,
      <PaceEntryDialog
        isOpen
        rosterItem={{
          child: { id: childId, displayName: "Jordan Smith" },
          group: null,
          subject: { id: subjectId, name: "Mathematics" },
          currentPace: 1001,
          targetPace: 1012,
          status: "ON_TRACK",
          currentLevel: 10,
          rebuiltAt: null,
        }}
        canOverride
        onClose={() => undefined}
        onSave={async (input) => {
          retriedAssessments.push(input);
          if (retriedAssessments.length === 1) {
            throw new Error("Connection interrupted. Try again.");
          }
          return successfulCommand();
        }}
        onAuthoriseOverride={async () => {
          overrideCalls += 1;
          return {
            id: "44444444-4444-4444-8444-444444444444",
            childId,
            subjectId,
            pacePolicyId: "55555555-5555-4555-8555-555555555555",
            policyCode: "score-below-threshold",
            authorisedByUserId: "66666666-6666-4666-8666-666666666666",
            expiresAt: "2026-08-12T09:44:00.000Z",
            createdAt: "2026-08-12T09:30:00.000Z",
          };
        }}
        onSuccess={() => undefined}
        onRefreshStepUp={async () => undefined}
      />,
    );
    await submit(retryForm);
    await submit(retryForm);
    assert.equal(
      overrideCalls,
      1,
      "reuses the successfully created override when assessment recording is retried",
    );
    assert.deepEqual(
      retriedAssessments.map((input) => input.policyOverrideId),
      [
        "44444444-4444-4444-8444-444444444444",
        "44444444-4444-4444-8444-444444444444",
      ],
      "retries the assessment with the original override identifier",
    );

    let editedOverrideCalls = 0;
    const editedAssessments: Array<{ policyOverrideId?: string }> = [];
    await render(
      root,
      <PaceEntryDialog
        key="override-after-edit"
        isOpen
        rosterItem={{
          child: { id: childId, displayName: "Jordan Smith" },
          group: null,
          subject: { id: subjectId, name: "Mathematics" },
          currentPace: 1001,
          targetPace: 1012,
          status: "ON_TRACK",
          currentLevel: 10,
          rebuiltAt: null,
        }}
        canOverride
        onClose={() => undefined}
        onSave={async (input) => {
          editedAssessments.push(input);
          if (editedAssessments.length === 1) {
            throw new Error("Connection interrupted. Try again.");
          }
          return successfulCommand();
        }}
        onAuthoriseOverride={async () => {
          editedOverrideCalls += 1;
          return {
            id:
              editedOverrideCalls === 1
                ? "77777777-7777-4777-8777-777777777777"
                : "88888888-8888-4888-8888-888888888888",
            childId,
            subjectId,
            pacePolicyId: "55555555-5555-4555-8555-555555555555",
            policyCode: "score-below-threshold",
            authorisedByUserId: "66666666-6666-4666-8666-666666666666",
            expiresAt: "2026-08-12T09:44:00.000Z",
            createdAt: "2026-08-12T09:30:00.000Z",
          };
        }}
        onSuccess={() => undefined}
        onRefreshStepUp={async () => undefined}
      />,
    );
    await fillEntryForm(container);
    const editedOverride = input(container, "pace-entry-override");
    await act(async () => editedOverride.click());
    const editedOverrideForm = container.querySelector("form");
    assert.ok(editedOverrideForm, "renders an override entry form");
    await submit(editedOverrideForm);
    await change(input(container, "pace-entry-score"), "77");
    await submit(editedOverrideForm);
    assert.equal(
      editedOverrideCalls,
      2,
      "requests a fresh override after an assessment-bound field changes",
    );
    assert.deepEqual(
      editedAssessments.map((input) => input.policyOverrideId),
      [
        "77777777-7777-4777-8777-777777777777",
        "88888888-8888-4888-8888-888888888888",
      ],
      "does not reuse a stale override after the assessment changes",
    );

    const pageQueries: Array<{ limit: number; cursor?: string }> = [];
    const pagedItems = await fetchAllPacePages(async (query) => {
      pageQueries.push(query);
      return query.cursor
        ? { items: ["third"], nextCursor: null }
        : { items: ["first", "second"], nextCursor: "next-page" };
    });
    assert.deepEqual(
      pageQueries,
      [{ limit: 50 }, { limit: 50, cursor: "next-page" }],
      "requests every bounded cursor page",
    );
    assert.deepEqual(
      pagedItems,
      ["first", "second", "third"],
      "combines all roster or exception pages before rendering",
    );

    await render(
      root,
      <PaceCorrectionDialog
        isOpen
        assessmentId={assessmentId}
        rosterItem={{
          child: { id: childId, displayName: "Jordan Smith" },
          group: null,
          subject: { id: subjectId, name: "Mathematics" },
          currentPace: 1001,
          targetPace: 1012,
          status: "ON_TRACK",
          currentLevel: 10,
          rebuiltAt: null,
        }}
        onClose={() => undefined}
        onSave={async () => {
          throw new Error("The assessment changed. Review and retry.");
        }}
        onSuccess={() => undefined}
      />,
    );
    await change(input(container, "pace-correction-pace-number"), "1001");
    await change(input(container, "pace-correction-score"), "76");
    await change(
      input(container, "pace-correction-assessed-at"),
      form.assessedAt,
    );
    await change(input(container, "pace-correction-reason"), "Corrected score");
    const correctionForm = container.querySelector("form");
    assert.ok(correctionForm, "renders correction form");
    await submit(correctionForm);
    assert.equal(
      input(container, "pace-correction-reason").value,
      "Corrected score",
      "preserves correction input after a recoverable error",
    );
    assert.match(container.textContent ?? "", /Review and retry/);

    await render(
      root,
      <PaceCorrectionDialog
        isOpen
        assessmentId={assessmentId}
        rosterItem={{
          child: { id: childId, displayName: "Jordan Smith" },
          group: null,
          subject: { id: subjectId, name: "Mathematics" },
          currentPace: 1001,
          targetPace: 1012,
          status: "ON_TRACK",
          currentLevel: 10,
          rebuiltAt: null,
        }}
        onClose={() => undefined}
        onSave={async () => ({
          assessment: {
            id: assessmentId,
            childId,
            subjectId,
            paceNumber: 1001,
            assessmentType: "FinalTest",
            score: 76,
            result: "passed",
            assessedOn: "2026-08-12",
          },
          progress: {
            currentPace: 1002,
            targetPace: 1012,
            completedPaces: 1,
            trackStatus: "ON_TRACK",
            blockCode: null,
            lastAssessmentId: assessmentId,
            rebuiltAt: "2026-08-12T09:30:00.000Z",
          },
          duplicate: false,
        })}
        onSuccess={() => undefined}
      />,
    );
    await act(async () => {
      input(container, "pace-correction-reason").dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      );
    });
    const correctionSuccess = container.querySelector('[role="status"]');
    assert.match(
      correctionSuccess?.textContent ?? "",
      /Assessment correction recorded\./,
      "announces a successful correction",
    );
    assert.equal(
      document.activeElement,
      correctionSuccess,
      "moves focus to the correction success message",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}

void run()
  .then(() => console.log("pace-workflow.test.tsx: all assertions passed"))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
