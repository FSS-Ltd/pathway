import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { TrackerJurisdiction, TrackerProfileInput } from "@pathway/types";
import { ProfileFacts } from "./profile-facts";
import { emptyProfile } from "./profile-fields";
const dom = new JSDOM("<html><body></body></html>");
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
const jurisdictions: TrackerJurisdiction[] = [
  {
    id: "england",
    countryCode: "GB",
    subdivisionCode: "GB-ENG",
    name: "England",
    level: "NATION",
    parentJurisdictionId: null,
  },
  {
    id: "local",
    countryCode: "GB",
    subdivisionCode: null,
    name: "Local area",
    level: "REGION",
    parentJurisdictionId: "england",
  },
  {
    id: "france",
    countryCode: "FR",
    subdivisionCode: null,
    name: "France",
    level: "COUNTRY",
    parentJurisdictionId: null,
  },
];
async function run() {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let value: TrackerProfileInput = { ...emptyProfile, jurisdictionId: "local" };
  function Fixture() {
    const [draft, setDraft] = React.useState(value);
    return (
      <ProfileFacts
        value={draft}
        jurisdictions={jurisdictions}
        setValue={(next) => {
          value = next;
          setDraft(next);
        }}
      />
    );
  }
  function select(label: string): HTMLSelectElement {
    const node = Array.from(host.querySelectorAll("label"))
      .find((item) => item.textContent?.startsWith(label))
      ?.querySelector("select");
    assert.ok(node, `Missing select: ${label}`);
    return node;
  }
  async function change(label: string, next: string) {
    const node = select(label);
    await act(async () => {
      node.value = next;
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  try {
    await act(async () => root.render(<Fixture />));
    assert.equal(
      select("Employs staff").value,
      "unknown",
      "omitted legacy fact must not become No",
    );
    assert.equal(
      select("English school category").value,
      "",
      "England ancestor makes English questions available without assuming classification",
    );
    assert.equal(
      select("Subject to English school medical/allergy duties").value,
      "unknown",
    );
    await change("Employs staff", "false");
    assert.equal(value.employsStaff, false);
    await change("Employs staff", "unknown");
    assert.equal(value.employsStaff, null);
    await change("Confirmed food business", "true");
    assert.equal(value.foodBusiness, true);
    assert.equal(
      value.food,
      null,
      "food-business classification does not infer activity facts",
    );
    await change("English school category", "INDEPENDENT");
    assert.equal(value.schoolCategory, "INDEPENDENT");
    assert.equal(value.fundingStatus, null);
    assert.equal(value.ace, null);
    await act(async () =>
      root.render(
        <ProfileFacts
          value={{ ...value, jurisdictionId: "france" }}
          jurisdictions={jurisdictions}
          setValue={() => {}}
        />,
      ),
    );
    assert.doesNotMatch(
      host.textContent ?? "",
      /English school category|Subject to the Early Years Foundation Stage/,
    );
    assert.match(host.textContent ?? "", /Operational facts/);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
