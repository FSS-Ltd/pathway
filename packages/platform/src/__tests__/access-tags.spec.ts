import { Prisma } from "@prisma/client";
import {
  ACCESS_TAG_DEFINITIONS,
  accessTagPermissionKeys,
  isAccessTagAvailable,
  type AccessTagKey,
} from "../access-tags";
import { CAPABILITY_DEFINITIONS } from "../capability-definitions";

const availableTags = [
  "finance-admin",
  "attendance-exporter",
  "attendance-recorder",
  "behaviour-viewer",
  "pace-full-access",
  "parent-message-responder",
] as const satisfies readonly AccessTagKey[];

describe("access-tag catalogue", () => {
  it("matches the persisted Oasis tag vocabulary exactly", () => {
    const storedTagValues = Prisma.dmmf.datamodel.enums
      .find((entry) => entry.name === "AccessTagKey")
      ?.values.map((value) => value.dbName ?? value.name);

    expect(Object.keys(ACCESS_TAG_DEFINITIONS).sort()).toEqual(
      storedTagValues?.sort(),
    );
  });

  it("makes only currently supported concepts grantable", () => {
    const actual = (Object.keys(ACCESS_TAG_DEFINITIONS) as AccessTagKey[])
      .filter(isAccessTagAvailable)
      .sort();

    expect(actual).toEqual([...availableTags].sort());
    for (const tag of availableTags) {
      const permissionKeys = accessTagPermissionKeys(tag);
      expect(permissionKeys.length).toBeGreaterThan(0);
      for (const key of permissionKeys) {
        expect(CAPABILITY_DEFINITIONS[key].delegable).toBe(true);
      }
    }
  });

  it("does not expose unsupported or protected permissions through pending tags", () => {
    const unavailable = (
      Object.keys(ACCESS_TAG_DEFINITIONS) as AccessTagKey[]
    ).filter((tag) => !isAccessTagAvailable(tag));

    for (const tag of unavailable) {
      expect(accessTagPermissionKeys(tag)).toEqual([]);
    }
    expect(ACCESS_TAG_DEFINITIONS.shopkeeper.permissionKeys).toEqual([]);
    expect(ACCESS_TAG_DEFINITIONS["calendar-manager"].permissionKeys).toEqual(
      [],
    );
  });

  it("maps the exporter tag only to ACE attendance export", () => {
    expect(accessTagPermissionKeys("attendance-exporter")).toEqual([
      "ace.attendance.export",
    ]);
  });

  it("keeps simulated investments outside every tag", () => {
    const mapped = Object.values(ACCESS_TAG_DEFINITIONS).flatMap(
      ({ permissionKeys }) => permissionKeys,
    );

    expect(mapped).not.toContain("merit.market.read");
    expect(mapped).not.toContain("merit.market.trade");
  });
});
