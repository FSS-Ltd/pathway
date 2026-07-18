import { OrgSector } from "@prisma/client";
import { sectorToVertical } from "../sector-mapping";

describe("sectorToVertical", () => {
  it("maps CHURCH, CLUB, and CHARITY directly", () => {
    expect(sectorToVertical("CHURCH")).toBe("CHURCH");
    expect(sectorToVertical("CLUB")).toBe("CLUB");
    expect(sectorToVertical("CHARITY")).toBe("CHARITY");
  });

  it("treats SCHOOL as new — no backfill mapping, set via signup/Phase 2 instead", () => {
    expect(sectorToVertical("SCHOOL")).toBeNull();
  });

  it("has no OrgSector value that maps to NURSERY", () => {
    for (const sector of Object.values(OrgSector)) {
      expect(sectorToVertical(sector)).not.toBe("NURSERY");
    }
  });
});
