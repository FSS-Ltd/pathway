import { randomUUID } from "node:crypto";
import {
  classifySlipChange,
  makeSlipSnapshot,
  parseSlipSnapshot,
  slipVersionHash,
} from "../permission-slip-version";
import { slipInputSchema } from "../trip-slip.dto";

const childA = randomUUID();
const childB = randomUUID();
const trip = {
  title: "Museum visit",
  destination: "Science Museum",
  startsAt: new Date("2026-11-10T09:00:00.000Z"),
  endsAt: new Date("2026-11-10T16:00:00.000Z"),
};
const input = {
  title: "Museum visit",
  description: "Bring lunch",
  consentText: "I consent to this visit.",
  deadlineAt: "2026-11-09T12:00:00+00:00",
  questions: [{ label: "Emergency contact", required: true }],
  recipientChildIds: [childB, childA],
};

describe("permission slip snapshots", () => {
  it("freezes a canonical recipient set and reproducible hash", () => {
    const first = makeSlipSnapshot(trip, input);
    const second = makeSlipSnapshot(
      trip,
      { ...input, recipientChildIds: [childA, childB] },
      first,
    );

    expect(second).toEqual(first);
    expect(first.recipientChildIds).toEqual([childA, childB].sort());
    expect(first.deadlineAt).toBe("2026-11-09T12:00:00.000Z");
    expect(
      slipVersionHash(parseSlipSnapshot(JSON.parse(JSON.stringify(first)))),
    ).toBe(slipVersionHash(first));
  });

  it("requires reconsent for wording, dates, questions, and recipients", () => {
    const first = makeSlipSnapshot(trip, input);
    const changes = [
      makeSlipSnapshot(trip, { ...input, consentText: "New consent." }, first),
      makeSlipSnapshot(
        { ...trip, endsAt: new Date("2026-11-10T17:00:00.000Z") },
        input,
        first,
      ),
      makeSlipSnapshot(
        trip,
        { ...input, questions: [{ label: "Medical details", required: true }] },
        first,
      ),
      makeSlipSnapshot(trip, { ...input, recipientChildIds: [childA] }, first),
    ];
    for (const changed of changes) {
      expect(classifySlipChange(first, changed)).toBe("MATERIAL");
      expect(slipVersionHash(changed)).not.toBe(slipVersionHash(first));
    }
  });

  it("classifies a display-title correction without changing consent", () => {
    const first = makeSlipSnapshot(trip, input);
    const corrected = makeSlipSnapshot(
      trip,
      { ...input, title: "Museum visit (Year 4)" },
      first,
    );
    expect(classifySlipChange(first, corrected)).toBe("NON_MATERIAL");
    expect(first.consentText).toBe(corrected.consentText);
  });

  it("rejects repeated question IDs before a draft is stored", () => {
    const id = randomUUID();
    expect(
      slipInputSchema.safeParse({
        ...input,
        questions: [
          { id, label: "Emergency contact", required: true },
          { id, label: "Medical details", required: false },
        ],
      }).success,
    ).toBe(false);
  });
});
