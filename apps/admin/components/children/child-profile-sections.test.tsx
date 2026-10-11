import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChildProfileNavigation,
  type ChildProfileTab,
  type ChildProfileTabId,
} from "./child-profile-navigation";
import { ChildGuardianSection } from "./child-guardian-section";
import { ChildRecordHero } from "./child-record-hero";
import { childProfileLabel } from "./child-profile-label";
import { ChildProfileStatus } from "./child-profile-status";

assert.equal(childProfileLabel("ACE_SCHOOL"), "Student");
assert.equal(childProfileLabel("STATE_SCHOOL"), "Pupil");
assert.equal(childProfileLabel("NURSERY"), "Child");
assert.equal(childProfileLabel("CLUB"), "Member");

const tabs: ChildProfileTab[] = [
  { id: "overview", label: "Overview" },
  { id: "attendance", label: "Attendance" },
  { id: "contacts", label: "Contacts" },
];
const navigation = renderToStaticMarkup(
  <ChildProfileNavigation
    tabs={tabs}
    activeTab="overview"
    onChange={() => undefined}
    label="Record sections"
  />,
);
assert.match(navigation, /role="tablist"/);
assert.match(navigation, /aria-label="Record sections"/);
assert.match(
  navigation,
  /id="child-profile-tab-overview"[^>]*aria-selected="true"/,
);
assert.doesNotMatch(navigation, /Registration/);

const detail = {
  id: "child-1",
  fullName: "Morgan Lee",
  preferredName: null,
  primaryGroupLabel: "Year 3",
  ageGroupLabel: "Primary",
  hasPhotoConsent: false,
  hasAllergies: false,
  hasAdditionalNeeds: false,
  status: "active" as const,
  guardianContacts: [],
};
const editableHero = renderToStaticMarkup(
  <ChildRecordHero
    childId="child-1"
    detail={detail}
    personLabel="Student"
    canEdit
  />,
);
assert.match(editableHero, /Student record/);
assert.match(editableHero, /href="\/children\/child-1\/edit"/);
assert.match(editableHero, /Edit profile/);
const readOnlyHero = renderToStaticMarkup(
  <ChildRecordHero
    childId="child-1"
    detail={detail}
    personLabel="Student"
    canEdit={false}
  />,
);
assert.doesNotMatch(readOnlyHero, /Edit profile/);

const missingRecord = renderToStaticMarkup(
  <ChildProfileStatus
    state="missing"
    error={null}
    personLabel="Student"
    onRetry={() => undefined}
  />,
);
assert.match(missingRecord, /Student not found/);
assert.match(missingRecord, /Back to list/);
const failedRecord = renderToStaticMarkup(
  <ChildProfileStatus
    state="error"
    error="Unable to load this record."
    personLabel="Student"
    onRetry={() => undefined}
  />,
);
assert.match(failedRecord, /role="alert"/);
assert.match(failedRecord, /Retry/);

const emptyContacts = renderToStaticMarkup(
  <ChildGuardianSection contacts={[]} />,
);
assert.match(emptyContacts, /No guardian contacts have been recorded/);
const contact = renderToStaticMarkup(
  <ChildGuardianSection
    contacts={[
      {
        id: "one",
        fullName: "Morgan Lee",
        email: "morgan@example.org",
        phone: null,
        relationshipToChild: "Parent",
        contactType: "PRIMARY_GUARDIAN",
      },
    ]}
  />,
);
assert.match(contact, /morgan@example.org/);
assert.match(contact, /Not provided/);

async function testKeyboardTabs(): Promise<void> {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  function Harness() {
    const [activeTab, setActiveTab] =
      React.useState<ChildProfileTabId>("overview");
    return (
      <ChildProfileNavigation
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        label="Record sections"
      />
    );
  }
  await act(async () => root.render(<Harness />));
  const selected = () =>
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
  assert.equal(selected(), "Overview");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>("#child-profile-tab-attendance")
      ?.click(),
  );
  assert.equal(selected(), "Attendance");
  await act(async () => {
    document.querySelector("[role=tablist]")?.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      }),
    );
  });
  assert.equal(selected(), "Contacts");
  assert.equal(document.activeElement?.id, "child-profile-tab-contacts");
  await act(async () => {
    document
      .querySelector("[role=tablist]")
      ?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      );
  });
  assert.equal(selected(), "Overview");
  await act(async () => root.unmount());
  dom.window.close();
}

void testKeyboardTabs().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
