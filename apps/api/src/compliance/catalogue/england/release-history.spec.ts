import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV11 } from "../v1.1";
import {
  getCurrentRequirement,
  buildTrackerChecklist,
  requirementSnapshot,
} from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

const now = new Date("2026-10-19T12:00:00Z");
describe("England published catalogue history", () => {
  it("preserves the published first release and gives additions a new release", () => {
    expect(catalogueSchema.parse(catalogueV11).requirements).toHaveLength(68);
    expect(TRACKER_CATALOGUE.version).toBe("1.13.0");
    expect(TRACKER_CATALOGUE.releasedAt).toBe("2026-10-19");
  });
  it.each(["eng-transport-review", "eng-boarding-classification"])(
    "retains %s version 1 but requires a new confirmation for its material update",
    (id) => {
      expect(
        TRACKER_CATALOGUE.requirements.find(
          (r) => r.id === id && r.version === 1,
        ),
      ).toEqual(catalogueV11.requirements.find((r) => r.id === id));
      expect(getCurrentRequirement(TRACKER_CATALOGUE, id, 1, now)).toBeNull();
      expect(
        getCurrentRequirement(TRACKER_CATALOGUE, id, 2, now),
      ).toMatchObject({ version: 2, supersedesVersion: 1 });
    },
  );
  it("keeps prior attestation history but does not count it as completion of a material update", () => {
    const published = catalogueSchema.parse(catalogueV11);
    const original = published.requirements.find(
      (r) => r.id === "eng-transport-review",
    );
    if (!original) throw new Error("Missing published transport requirement");
    const result = buildTrackerChecklist({
      catalogue: TRACKER_CATALOGUE,
      profile: {
        version: 1,
        updatedAt: "2026-10-16T12:00:00Z",
        profile: { ...testProfile, transport: true },
      },
      location: { countryCode: "GB", subdivisionCode: "GB-ENG" },
      evidenceCounts: {},
      now,
      attestations: [
        {
          id: "previous-confirmation",
          requirementId: original.id,
          requirementVersion: 1,
          profileVersion: 1,
          revision: 1,
          status: "COMPLETE",
          notes: "Original route confirmation",
          notApplicableReason: null,
          reviewDueAt: null,
          requirement: requirementSnapshot(original, published),
          createdAt: "2026-10-16T12:00:00Z",
          createdByUserId: "synthetic-staff",
        },
      ],
    });
    const transport = result.items.find(
      (item) => item.requirement.id === original.id,
    );
    expect(transport).toMatchObject({
      requirement: { version: 2 },
      stale: true,
      completed: false,
      attestation: {
        id: "previous-confirmation",
        requirementVersion: 1,
        notes: "Original route confirmation",
      },
    });
    expect(result.progress.completed).toBe(0);
  });
  it("retains the published route assessment alongside more precise procedural actions", () => {
    expect(
      getCurrentRequirement(
        TRACKER_CATALOGUE,
        "eng.state-curriculum-route",
        1,
        now,
      ),
    ).not.toBeNull();
    expect(
      getCurrentRequirement(
        TRACKER_CATALOGUE,
        "eng.curriculum-exception-procedure",
        1,
        now,
      ),
    ).not.toBeNull();
  });
});
