import { AccessTagKey as StoredAccessTagKey } from "@prisma/client";
import { ACCESS_TAG_DEFINITIONS } from "@pathway/platform";
import {
  allAccessTagKeys,
  fromStoredAccessTagKey,
  toStoredAccessTagKey,
} from "../access-tag-keys";

describe("access-tag storage keys", () => {
  it("covers every public and persisted tag exactly once", () => {
    const publicKeys = allAccessTagKeys();
    const storedKeys = publicKeys.map(toStoredAccessTagKey);

    expect([...publicKeys].sort()).toEqual(
      Object.keys(ACCESS_TAG_DEFINITIONS).sort(),
    );
    expect([...storedKeys].sort()).toEqual(
      Object.values(StoredAccessTagKey).sort(),
    );
    expect(new Set(publicKeys).size).toBe(publicKeys.length);
    expect(new Set(storedKeys).size).toBe(storedKeys.length);
    for (const key of publicKeys) {
      expect(fromStoredAccessTagKey(toStoredAccessTagKey(key))).toBe(key);
    }
  });
});
