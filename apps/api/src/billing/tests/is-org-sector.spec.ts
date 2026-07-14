import { isOrgSector } from "../webhook.controller";

describe("isOrgSector", () => {
  it("accepts every valid OrgSector value", () => {
    expect(isOrgSector("CHURCH")).toBe(true);
    expect(isOrgSector("CLUB")).toBe(true);
    expect(isOrgSector("SCHOOL")).toBe(true);
    expect(isOrgSector("CHARITY")).toBe(true);
  });

  it("rejects undefined, empty, and unrecognised values", () => {
    expect(isOrgSector(undefined)).toBe(false);
    expect(isOrgSector("")).toBe(false);
    expect(isOrgSector("church")).toBe(false); // case-sensitive
    expect(isOrgSector("NOT_A_SECTOR")).toBe(false);
  });
});
