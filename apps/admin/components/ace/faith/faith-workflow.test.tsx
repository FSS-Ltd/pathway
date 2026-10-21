import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import type { FaithContent, FaithOptions } from "@/lib/ace-faith-api";
import { FaithContentList } from "./faith-content-list";
import { FaithDraftForm } from "./faith-draft-form";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/faith",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
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

const options: FaithOptions = {
  ageBands: [
    { id: "young", name: "Early years", minimumAge: 3, maximumAge: 5 },
    { id: "older", name: "Upper school", minimumAge: 11, maximumAge: 16 },
  ],
};
const content: FaithContent = {
  id: "content-one",
  title: "Belonging",
  latestVersionId: null,
  latestVersionNumber: 0,
  withdrawnAt: null,
  publishedNeedsReview: false,
  publishedVersion: null,
  drafts: [
    {
      id: "draft-one",
      updatedAt: "2026-10-21T09:00:00.000Z",
      title: "Belonging",
      contentPayload: { body: "A short story." },
      audience: { type: "ALL_ACTIVE_STUDENTS" },
      needsReview: false,
      status: "DRAFT",
      scheduledAt: null,
      scheduleFailureReason: null,
    },
  ],
};

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === name,
  );
  assert.ok(found, `expected ${name} button`);
  return found;
}

async function changeInput(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const actions: string[] = [];
  await act(async () =>
    root.render(
      <FaithContentList
        items={[content]}
        authoringEnabled
        publicationEnabled
        pendingId={null}
        onRevision={() => actions.push("revision")}
        onEditDraft={() => actions.push("edit")}
        onAction={(_, action) => actions.push(action)}
      />,
    ),
  );
  assert.match(container.textContent ?? "", /Belonging/);
  await act(async () => button(container, "Edit draft").click());
  assert.deepEqual(actions, ["edit"]);
  await act(async () => button(container, "Publish now").click());
  assert.deepEqual(
    actions,
    ["edit"],
    "publication requires explicit confirmation",
  );
  await act(async () =>
    button(container, "Confirm publication")
      .closest("form")
      ?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.deepEqual(actions, ["edit", "publish"]);

  await act(async () =>
    root.render(
      <FaithContentList
        items={[content]}
        authoringEnabled
        publicationEnabled={false}
        pendingId={null}
        onRevision={() => actions.push("revision")}
        onEditDraft={() => actions.push("edit")}
        onAction={() => actions.push("action")}
      />,
    ),
  );
  assert.equal(button(container, "Edit draft").disabled, false);
  assert.doesNotMatch(container.textContent ?? "", /Publish now|Schedule/);

  await act(async () =>
    root.render(
      <FaithContentList
        items={[
          {
            ...content,
            drafts: [
              { ...content.drafts[0], scheduledAt: "2026-11-01T12:00:00.000Z" },
            ],
          },
        ]}
        authoringEnabled={false}
        publicationEnabled={false}
        canCancelSchedule
        pendingId={null}
        onRevision={() => undefined}
        onEditDraft={() => undefined}
        onAction={() => undefined}
      />,
    ),
  );
  assert.ok(
    button(container, "Cancel schedule"),
    "site lead can cancel while publication is paused",
  );
  assert.equal(
    Array.from(container.querySelectorAll("button")).some((node) =>
      ["Publish now", "Schedule"].includes(node.textContent?.trim() ?? ""),
    ),
    false,
  );

  await act(async () =>
    root.render(
      <FaithContentList
        items={[
          {
            ...content,
            drafts: [
              { ...content.drafts[0], scheduledAt: "2026-11-01T12:00:00.000Z" },
            ],
          },
        ]}
        authoringEnabled={false}
        publicationEnabled
        pendingId={null}
        onRevision={() => actions.push("revision")}
        onEditDraft={() => actions.push("edit")}
        onAction={(_, action) => actions.push(action)}
      />,
    ),
  );
  assert.doesNotMatch(container.textContent ?? "", /Publish now|New revision/);
  await act(async () => button(container, "Cancel schedule").click());
  assert.deepEqual(
    actions,
    ["edit", "publish"],
    "schedule cancellation requires confirmation",
  );
  await act(async () =>
    button(container, "Confirm cancellation")
      .closest("form")
      ?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.deepEqual(actions, ["edit", "publish", "cancel-schedule"]);

  await act(async () =>
    root.render(
      <FaithContentList
        items={[
          {
            ...content,
            drafts: [
              {
                ...content.drafts[0],
                scheduleFailureReason: "PUBLISHER_ACCESS_CHANGED",
              },
            ],
          },
          {
            ...content,
            id: "content-two",
            drafts: [
              {
                ...content.drafts[0],
                id: "draft-two",
                scheduleFailureReason: "PUBLICATION_INPUT_CHANGED",
              },
            ],
          },
          {
            ...content,
            id: "content-three",
            drafts: [
              {
                ...content.drafts[0],
                id: "draft-three",
                scheduleFailureReason: "CONTENT_WITHDRAWN",
              },
            ],
          },
          {
            ...content,
            id: "content-four",
            drafts: [
              {
                ...content.drafts[0],
                id: "draft-four",
                scheduleFailureReason: "UNRECOGNISED_CODE",
              },
            ],
          },
        ]}
        authoringEnabled={false}
        publicationEnabled={false}
        pendingId={null}
        onRevision={() => undefined}
        onEditDraft={() => undefined}
        onAction={() => undefined}
      />,
    ),
  );
  assert.match(container.textContent ?? "", /no longer has publication access/);
  assert.match(container.textContent ?? "", /current publication changed/);
  assert.match(container.textContent ?? "", /This content was withdrawn/);
  assert.match(container.textContent ?? "", /could not be completed/);
  assert.doesNotMatch(
    container.textContent ?? "",
    /PUBLISHER_ACCESS_CHANGED|PUBLICATION_INPUT_CHANGED|CONTENT_WITHDRAWN|UNRECOGNISED_CODE/,
  );

  await act(async () =>
    root.render(
      <FaithDraftForm
        options={options}
        pending={false}
        onSave={async (input) => {
          actions.push(input.audience.type);
        }}
        onClose={() => undefined}
      />,
    ),
  );
  await changeInput(
    container.querySelector<HTMLInputElement>("#faith-title")!,
    "Belonging",
  );
  const body = container.querySelector<HTMLTextAreaElement>("#faith-body");
  assert.ok(body);
  const bodySetter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  assert.ok(bodySetter);
  await act(async () => {
    bodySetter.call(body, "A new reflection.");
    body.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const ageRadio = container.querySelector<HTMLInputElement>(
    "input[value='AGE_BAND']",
  );
  assert.ok(ageRadio);
  await act(async () => ageRadio.click());
  await act(async () =>
    button(container, "Save draft")
      .closest("form")
      ?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.match(container.textContent ?? "", /Choose at least one age band/);
  assert.deepEqual(
    actions,
    ["edit", "publish", "cancel-schedule"],
    "empty age-band targeting must not save",
  );
  const older = Array.from(
    container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"),
  ).find((item) => item.parentElement?.textContent?.includes("Upper school"));
  assert.ok(older);
  await act(async () => older.click());
  await act(async () =>
    button(container, "Save draft")
      .closest("form")
      ?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.deepEqual(actions, ["edit", "publish", "cancel-schedule", "AGE_BAND"]);

  await act(async () =>
    root.render(
      <FaithDraftForm
        key="edit-draft"
        initial={{
          faithContentId: content.id,
          draftId: content.drafts[0].id,
          expectedUpdatedAt: content.drafts[0].updatedAt,
          title: content.drafts[0].title,
          contentPayload: content.drafts[0].contentPayload,
          audience: content.drafts[0].audience,
        }}
        options={options}
        pending={false}
        onSave={async (input) => {
          assert.equal(input.faithContentId, content.id);
          assert.equal(input.draftId, content.drafts[0].id);
          assert.equal(input.expectedUpdatedAt, content.drafts[0].updatedAt);
          actions.push("updated");
        }}
        onClose={() => undefined}
      />,
    ),
  );
  assert.equal(
    container.querySelector<HTMLInputElement>("#faith-title")?.value,
    "Belonging",
  );
  await act(async () =>
    button(container, "Save draft")
      .closest("form")
      ?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(actions.at(-1), "updated");

  await act(async () =>
    root.render(
      <FaithDraftForm
        key="archived-band-revision"
        initial={{
          faithContentId: content.id,
          title: "Older draft",
          contentPayload: { body: "Existing content." },
          audience: { type: "AGE_BAND", ageBandIds: ["archived"] },
        }}
        options={options}
        pending={false}
        onSave={async (input) => {
          assert.deepEqual(input.audience, {
            type: "AGE_BAND",
            ageBandIds: ["young"],
          });
          actions.push("revised");
        }}
        onClose={() => undefined}
      />,
    ),
  );
  assert.match(container.textContent ?? "", /no longer available/);
  assert.ok(
    Array.from(
      container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"),
    ).every((item) => !item.checked),
    "archived age bands must not remain selected",
  );
  await act(async () =>
    button(container, "Save draft")
      .closest("form")
      ?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.match(container.textContent ?? "", /Choose at least one age band/);
  assert.equal(actions.at(-1), "updated");
  const young = Array.from(
    container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"),
  ).find((item) => item.parentElement?.textContent?.includes("Early years"));
  assert.ok(young);
  await act(async () => young.click());
  await act(async () =>
    button(container, "Save draft")
      .closest("form")
      ?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(actions.at(-1), "revised");
  await act(async () =>
    root.render(
      <FaithContentList
        items={[
          {
            ...content,
            drafts: [
              {
                ...content.drafts[0],
                contentPayload: null,
                audience: null,
                needsReview: true,
              },
            ],
          },
        ]}
        authoringEnabled
        publicationEnabled
        pendingId={null}
        onRevision={(_, replacement) => {
          assert.equal(replacement, true);
          actions.push("replacement");
        }}
        onEditDraft={() => actions.push("unsafe-edit")}
        onAction={() => actions.push("unsafe-action")}
      />,
    ),
  );
  assert.match(container.textContent ?? "", /This draft needs review/);
  assert.doesNotMatch(container.textContent ?? "", /A short story\./);
  assert.equal(
    Array.from(container.querySelectorAll("button")).some((node) =>
      ["Edit draft", "Publish now", "Schedule"].includes(
        node.textContent?.trim() ?? "",
      ),
    ),
    false,
  );
  await act(async () => button(container, "Create replacement draft").click());
  assert.equal(actions.at(-1), "replacement");

  await act(async () =>
    root.render(
      <FaithContentList
        items={[
          {
            ...content,
            latestVersionId: "version-bad",
            latestVersionNumber: 1,
            publishedNeedsReview: true,
            drafts: [],
          },
        ]}
        authoringEnabled
        publicationEnabled
        pendingId={null}
        onRevision={(_, replacement) => {
          assert.equal(replacement, true);
          actions.push("replacement");
        }}
        onEditDraft={() => actions.push("unsafe-edit")}
        onAction={(_, action) => actions.push(action)}
      />,
    ),
  );
  assert.match(
    container.textContent ?? "",
    /latest published version needs review/,
  );
  await act(async () => button(container, "Withdraw publication").click());
  await act(async () =>
    button(container, "Confirm withdrawal")
      .closest("form")
      ?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(actions.at(-1), "withdraw");

  await act(async () =>
    root.render(
      <FaithDraftForm
        key="malformed-replacement"
        initial={{ faithContentId: content.id, replacement: true }}
        options={options}
        pending={false}
        onSave={async () => actions.push("saved-replacement")}
        onClose={() => undefined}
      />,
    ),
  );
  assert.equal(
    container.querySelector<HTMLInputElement>("#faith-title")?.value,
    "",
  );
  assert.equal(
    container.querySelector<HTMLTextAreaElement>("#faith-body")?.value,
    "",
  );
  assert.equal(
    container.querySelector<HTMLInputElement>(
      "input[name='faith-audience']:checked",
    ),
    null,
  );
  await act(async () =>
    button(container, "Save draft")
      .closest("form")
      ?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.match(container.textContent ?? "", /Choose a student audience/);
  assert.notEqual(actions.at(-1), "saved-replacement");

  await act(async () => root.unmount());
  container.remove();
}

void run();
