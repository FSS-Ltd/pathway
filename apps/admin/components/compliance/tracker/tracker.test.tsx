import "@/lib/register-test-styles";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type {
  TrackerChecklist,
  TrackerChecklistItem,
  TrackerAttestationInput,
  TrackerProfileInput,
} from "@pathway/types";
import { TrackerWorkspace } from "./workspace";
import { Confirmation } from "./confirmation";
import { RetainedHistory } from "./retained-history";
import { ProfileEditor } from "./profile-editor";
import { emptyProfile, ProfileFields } from "./profile-fields";
import { resolveAdminNavItems } from "@/app/admin-navigation";
import { resolveOrgUi } from "@/lib/org-ui";
import { setApiTokenGetter } from "@/lib/api-transport";
const dom = new JSDOM("<html><body></body></html>", {
  url: "http://localhost/compliance",
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
const item: TrackerChecklistItem = {
  requirement: {
    id: "fire",
    version: 1,
    action: "Review fire precautions",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    applicabilityExplanation: "Applicable to these premises",
    unknownExplanation: "Operating premises unknown",
    expectedEvidence: ["Risk assessment"],
    allowsNotApplicable: false,
    sources: [
      {
        id: "source",
        url: "https://www.gov.uk/",
        title: "Official guidance",
        authority: "Authority",
        provision: "Provision",
      },
    ],
    signalKeys: ["personnel"],
  },
  applicability: "APPLICABLE",
  attestation: null,
  completed: false,
  stale: false,
  overdue: false,
  evidenceCount: 0,
  evidenceGap: true,
};
const progress = {
  completed: 0,
  applicable: 0,
  notApplicable: 0,
  unresolved: 0,
  stale: 0,
  overdue: 0,
  evidenceGaps: 0,
};
const checklist: TrackerChecklist = {
  profile: { profile: emptyProfile, version: 1, updatedAt: "2026-10-16" },
  organisationFacts: { sector: "SCHOOL", vertical: "ACE_SCHOOL", ace: true },
  items: [],
  progress,
  categories: [],
  coverage: [
    {
      jurisdiction: null,
      sector: null,
      topic: "premises_safety",
      status: "NOT_REVIEWED",
      regionalStatus: "UNAVAILABLE",
      reason: "Location and sector are unresolved.",
    },
  ],
  coverageGaps: 1,
  observedAt: "2026-10-16",
};
const role = {
  isOrgAdmin: false,
  isOrgOwner: false,
  isSiteAdmin: false,
  isStaff: false,
  isSafeguardingStaff: false,
  isSuperUser: false,
};
for (const permissions of [[], ["compliance.tracker.read"]]) {
  const nav = resolveAdminNavItems({
    role,
    currentOrgIsMasterOrg: false,
    capabilities: ["compliance.tracker.read"],
    permissions,
    ui: resolveOrgUi("ACE_SCHOOL", "SCHOOL"),
  });
  assert.equal(
    nav.some((value) => value.href === "/compliance"),
    permissions.length > 0,
    "tracker navigation requires its read permission",
  );
}
async function run() {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const previous = globalThis.fetch;
  const signals: AbortSignal[] = [];
  let fail = true;
  let conflict = true;
  let retained = false;
  let saved: TrackerAttestationInput | null = null;
  let changed = 0;
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  globalThis.fetch = async (input, init) => {
    if (init?.signal) signals.push(init.signal);
    const path = new URL(String(input)).pathname;
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer tracker-test",
    );
    if (path.endsWith("/attestations")) {
      saved = JSON.parse(String(init?.body));
      if (conflict) return response({}, 409);
      return response({
        ...saved,
        id: "confirmation",
        revision: 2,
        requirement: item.requirement,
        createdAt: "2026-10-16",
        createdByUserId: "actor",
      });
    }
    if (path.endsWith("/profile") && init?.method === "PUT")
      return response({}, 409);
    if (path.endsWith("/profile"))
      return response({ ...checklist.profile, version: 2 });
    if (fail) return response({}, 503);
    if (path.endsWith("/history/requirements"))
      return response({
        items: retained
          ? [
              {
                requirementId: "withdrawn",
                requirementVersion: 1,
                action: "Withdrawn action",
              },
            ]
          : [],
        nextCursor: null,
      });
    if (path.endsWith("/history") || path.endsWith("/evidence"))
      return response({ items: [], nextCursor: null });
    if (path.endsWith("/jurisdictions")) return response([]);
    if (path.endsWith("/signals"))
      return response([
        {
          key: "medical",
          status: "UNKNOWN",
          count: null,
          missingCount: null,
          description: "Permission unavailable",
          href: null,
          observedAt: "2026-10-16",
        },
      ]);
    return response({
      ...checklist,
      items: path.endsWith("/checklist") && saved ? [item] : [],
    });
  };
  setApiTokenGetter(async () => "tracker-test");
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  const click = async (text: string) => {
    const button = [...host.querySelectorAll("button")].find(
      (b) =>
        b.textContent?.trim() === text || b.getAttribute("aria-label") === text,
    );
    assert.ok(button, text);
    await act(async () => button.click());
    await settle();
  };
  try {
    let selectedProfile: TrackerProfileInput | null = null;
    await act(async () =>
      root.render(
        <ProfileFields
          value={{
            ...emptyProfile,
            jurisdictionId: "brussels",
            belgianEducationCommunity: "FRENCH",
            belgianSchoolRecognitionStatus: "COMMUNITY_RECOGNISED",
            belgianChildcareAuthority: "IRISCARE",
            belgianPaidUnderThreeCare: true,
          }}
          setValue={(next) => {
            selectedProfile = next;
          }}
          jurisdictions={[
            {
              id: "brussels",
              countryCode: "BE",
              subdivisionCode: "BE1",
              name: "Brussels-Capital Region",
              level: "REGION",
              parentJurisdictionId: "belgium",
            },
            {
              id: "flanders",
              countryCode: "BE",
              subdivisionCode: "BE2",
              name: "Flemish Region",
              level: "REGION",
              parentJurisdictionId: "belgium",
            },
            {
              id: "england",
              countryCode: "GB",
              subdivisionCode: "GB-ENG",
              name: "England",
              level: "NATION",
              parentJurisdictionId: "uk",
            },
          ]}
        />,
      ),
    );
    assert.match(
      host.textContent ?? "",
      /Region does not identify the education Community/,
    );
    assert.match(host.textContent ?? "", /Education language Community/);
    assert.match(host.textContent ?? "", /German Speaking/);
    assert.match(
      host.textContent ?? "",
      /School recognition with this education Community/,
    );
    assert.match(host.textContent ?? "", /Recognised by another authority/);
    assert.match(host.textContent ?? "", /Childcare licensing authority/);
    assert.match(host.textContent ?? "", /ONE/);
    assert.match(host.textContent ?? "", /Paid professional care/);
    const childcareSelect = [...host.querySelectorAll("label")]
      .find((label) => label.firstChild?.textContent?.trim() === "Childcare")
      ?.querySelector("select");
    assert.ok(childcareSelect);
    await act(async () => {
      childcareSelect.value = "false";
      childcareSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(selectedProfile?.belgianChildcareAuthority, null);
    assert.equal(selectedProfile?.belgianPaidUnderThreeCare, null);
    const educationSelect = [...host.querySelectorAll("label")]
      .find(
        (label) =>
          label.firstChild?.textContent?.trim() ===
          "Education language Community",
      )
      ?.querySelector("select");
    assert.ok(educationSelect);
    await act(async () => {
      educationSelect.value = "FLEMISH";
      educationSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(selectedProfile?.belgianSchoolRecognitionStatus, null);
    const operatingLocation = host.querySelector("select");
    assert.ok(operatingLocation);
    await act(async () => {
      operatingLocation.value = "flanders";
      operatingLocation.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(selectedProfile?.belgianChildcareAuthority, null);
    assert.equal(selectedProfile?.belgianEducationCommunity, null);
    assert.equal(selectedProfile?.belgianSchoolRecognitionStatus, null);
    await act(async () => {
      operatingLocation.value = "england";
      operatingLocation.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(selectedProfile?.jurisdictionId, "england");
    assert.equal(selectedProfile?.belgianEducationCommunity, null);
    assert.equal(selectedProfile?.belgianSchoolRecognitionStatus, null);
    assert.equal(selectedProfile?.belgianChildcareAuthority, null);
    assert.equal(selectedProfile?.belgianPaidUnderThreeCare, null);
    await act(async () => root.render(<TrackerWorkspace canManage />));
    await settle();
    assert.match(host.textContent ?? "", /could not be refreshed/);
    fail = false;
    await click("Retry tracker");
    assert.match(host.textContent ?? "", /No applicable items/);
    assert.match(host.textContent ?? "", /Coverage incomplete/);
    assert.equal(
      host.querySelector("#tracker-coverage-details")?.hasAttribute("hidden"),
      true,
      "coverage starts as a compact alert",
    );
    await click("Coverage incomplete");
    assert.equal(
      host.querySelector("#tracker-coverage-details")?.hasAttribute("hidden"),
      false,
    );
    await click("Coverage incomplete");
    await click("Checklist");
    assert.equal(
      host
        .querySelector("#tracker-tab-checklist")
        ?.getAttribute("aria-selected"),
      "true",
    );
    await click("Overview");
    assert.match(host.textContent ?? "", /Medical · Unknown/);
    assert.equal(host.querySelector('a[href*="medical"]'), null);
    assert.equal(host.querySelector("progress"), null);
    await click("Site compliance profile");
    assert.ok(host.querySelector('[aria-label="Site compliance profile"]'));
    assert.match(
      host.textContent ?? "",
      /Sector: School · from organisation settings/,
    );
    fail = true;
    await click("Refresh tracker and evidence");
    const saveProfile = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Save profile",
    );
    assert.ok(
      saveProfile?.matches(":disabled"),
      "stale tracker disables mutations without unmounting drafts",
    );
    fail = false;
    await click("Retry tracker");
    assert.equal(saveProfile.matches(":disabled"), false);
    const oldSignals = [...signals];
    await act(async () =>
      root.render(<TrackerWorkspace key="new-site" canManage={false} />),
    );
    await settle();
    assert.ok(oldSignals.every((signal) => signal.aborted));
    assert.equal(
      [...host.querySelectorAll("button")].some(
        (b) => b.textContent === "Save profile",
      ),
      false,
    );
    await act(async () =>
      root.render(
        <Confirmation
          item={item}
          profileVersion={1}
          onChange={() => changed++}
        />,
      ),
    );
    assert.equal(
      host.querySelectorAll('input[type="checkbox"]').length,
      1,
      "unconditional requirements have no N/A control",
    );
    const checkbox = host.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    assert.ok(checkbox);
    await act(async () => checkbox.click());
    await click("Save confirmation");
    assert.equal(checkbox.checked, true, "draft survives failed save");
    assert.equal(changed, 0);
    await click("Compare latest confirmation");
    assert.match(host.textContent ?? "", /Latest profile revision/);
    await click("Keep my draft against this revision");
    conflict = false;
    await click("Save confirmation");
    assert.equal(changed, 1);
    assert.equal(saved?.status, "COMPLETE");
    assert.equal(saved?.profileVersion, 1);
    assert.equal(saved?.notApplicableReason, null);
    await act(async () =>
      root.render(
        <Confirmation
          key="conditional"
          item={{
            ...item,
            requirement: { ...item.requirement, allowsNotApplicable: true },
          }}
          profileVersion={1}
          onChange={() => changed++}
        />,
      ),
    );
    assert.equal(host.querySelectorAll('input[type="checkbox"]').length, 2);
    const checks = host.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    await act(async () => checks[1].click());
    assert.equal(checks[0].disabled, true);
    assert.ok(host.querySelector("textarea[required]"));
    await act(async () =>
      root.render(
        <ProfileEditor
          initial={checklist.profile}
          jurisdictions={[
            {
              id: "oxfordshire",
              countryCode: "GB",
              subdivisionCode: "GB-ENG-E10000025",
              name: "Oxfordshire",
              level: "REGION",
              parentJurisdictionId: "england",
            },
            {
              id: "oxford",
              countryCode: "GB",
              subdivisionCode: "GB-ENG-E07000178",
              name: "Oxford",
              level: "LOCAL_AUTHORITY",
              parentJurisdictionId: "oxfordshire",
            },
            {
              id: "edinburgh",
              countryCode: "GB",
              subdivisionCode: "GB-SCT-S12000036",
              name: "City of Edinburgh",
              level: "LOCAL_AUTHORITY",
              parentJurisdictionId: "scotland",
            },
            {
              id: "belfast",
              countryCode: "GB",
              subdivisionCode: "GB-NIR-N09000003",
              name: "Belfast",
              level: "LOCAL_AUTHORITY",
              parentJurisdictionId: "northern-ireland",
            },
            {
              id: "dublin-city",
              countryCode: "IE",
              subdivisionCode: "IE-LA-265011",
              name: "Dublin City Council",
              level: "LOCAL_AUTHORITY",
              parentJurisdictionId: "ireland",
            },
            {
              id: "wien",
              countryCode: "AT",
              subdivisionCode: "AT-9",
              name: "Wien",
              level: "REGION",
              parentJurisdictionId: "austria",
            },
            {
              id: "brussels",
              countryCode: "BE",
              subdivisionCode: "BE1",
              name: "Brussels-Capital Region",
              level: "REGION",
              parentJurisdictionId: "belgium",
            },
          ]}
          canManage
          onSaved={() => changed++}
        />,
      ),
    );
    assert.match(
      host.querySelector('option[value="oxfordshire"]')?.textContent ?? "",
      /Oxfordshire · GB \(upper-tier council\)/,
    );
    assert.match(
      host.querySelector('option[value="oxford"]')?.textContent ?? "",
      /Oxford · GB \(district council\)/,
    );
    assert.match(
      host.querySelector('option[value="edinburgh"]')?.textContent ?? "",
      /City of Edinburgh · GB \(council area\)/,
    );
    assert.match(
      host.querySelector('option[value="belfast"]')?.textContent ?? "",
      /Belfast · GB \(local government district\)/,
    );
    assert.match(
      host.querySelector('option[value="dublin-city"]')?.textContent ?? "",
      /Dublin City Council · IE \(local authority\)/,
    );
    assert.match(
      host.querySelector('option[value="wien"]')?.textContent ?? "",
      /Wien · AT \(Bundesland\)/,
    );
    assert.match(
      host.querySelector('option[value="brussels"]')?.textContent ?? "",
      /Brussels-Capital Region · BE \(Region\)/,
    );
    await click("Save profile");
    assert.match(host.textContent ?? "", /draft has been kept/);
    await click("Compare latest profile");
    assert.match(host.textContent ?? "", /Latest saved revision: 2/);
    await click("Keep my draft against this revision");
    assert.equal(changed, 1);
    retained = true;
    await act(async () => root.render(<RetainedHistory />));
    await settle();
    assert.match(host.textContent ?? "", /Withdrawn action/);
    await click("Open retained record");
    assert.match(host.textContent ?? "", /Confirmation history/);
    assert.match(host.textContent ?? "", /Supporting evidence/);
    assert.equal(
      host.querySelector("form"),
      null,
      "retained records have no obsolete confirmation or upload form",
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
    setApiTokenGetter(null);
    host.remove();
  }
  console.log("Tracker runtime tests passed");
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
