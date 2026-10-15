import type { Prisma } from "@pathway/db";
import { TRACKER_SIGNAL_READERS } from "./tracker-signal-readers";

const actor = { tenantId: "site", orgId: "org", userId: "reader" };
const observedAt = new Date("2026-10-15T12:00:00.000Z");
interface MedicalSignalRow {
  id: string;
  allergies: string;
  allergiesConfirmedAt: Date | null;
  medicalConditions: string | null;
  medicationAtSite: string | null;
}
const record: MedicalSignalRow = {
  id: "child",
  allergies: "none",
  allergiesConfirmedAt: observedAt,
  medicalConditions: "none",
  medicationAtSite: "none",
};
const reader = TRACKER_SIGNAL_READERS.find((item) => item.key === "medical");
if (!reader) throw new Error("Medical signal reader is required");

describe("Medical evidence readability", () => {
  function fixture(rows: MedicalSignalRow[][]) {
    const findMany = jest.fn();
    for (const page of rows) findMany.mockResolvedValueOnce(page);
    // This isolated reader only uses the selected child delegate; a complete
    // Prisma transaction would make this a database integration test.
    const tx = { child: { findMany } } as unknown as Prisma.TransactionClient;
    return { tx, findMany };
  }
  it("returns unavailable instead of treating ciphertext as a complete medical entry", async () => {
    const { tx } = fixture([
      [{ ...record, allergies: "v1:unreadable:value:data" }],
    ]);
    expect(await reader.read(tx, actor, observedAt)).toBeNull();
  });
  it("distinguishes known absence, unknown entries and missing confirmations", async () => {
    const { tx, findMany } = fixture([
      [
        record,
        { ...record, id: "unknown", medicalConditions: "unknown" },
        { ...record, id: "unconfirmed", allergiesConfirmedAt: null },
        {
          ...record,
          id: "legacy",
          allergies: "Synthetic allergy",
          allergiesConfirmedAt: null,
        },
      ],
    ]);
    expect(await reader.read(tx, actor, observedAt)).toMatchObject({
      count: 4,
      missingCount: 3,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          OR: [{ isGuest: false }, { guestExpiresAt: { gt: observedAt } }],
        },
        take: 250,
      }),
    );
  });
  it("checks bounded pages without exposing medical details in its result", async () => {
    const page = Array.from({ length: 250 }, (_, i) => ({
      ...record,
      id: `child-${i}`,
    }));
    const { tx, findMany } = fixture([
      page,
      [
        {
          ...record,
          id: "last",
          medicationAtSite: "Synthetic private medication",
        },
      ],
    ]);
    const result = await reader.read(tx, actor, observedAt);
    expect(result).toMatchObject({ count: 251, missingCount: 0 });
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { gt: "child-249" } }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain(
      "Synthetic private medication",
    );
  });
});
