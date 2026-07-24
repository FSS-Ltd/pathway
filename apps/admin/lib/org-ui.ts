import type { AdminOrgSector, AdminVertical } from "./api-client";

/**
 * Resolved organisation-UI context key. `vertical` is opt-in (set via the
 * Settings vertical picker, never backfilled), so most existing orgs only
 * have a `sector`. `SCHOOL` sector has no single vertical (see
 * packages/platform/src/sector-mapping.ts), so it gets its own row.
 */
export type OrgUiKey = AdminVertical | "SCHOOL" | "UNKNOWN";

/**
 * Route href -> label override. Deliberately string-only: this object must
 * never be able to grant or remove access. Visibility stays governed by
 * `access` + `capability` in admin-shell.tsx; this only renames what a
 * reachable screen is called.
 */
export type OrgUi = {
  labels: Record<string, string>;
};

const SECTOR_TO_KEY: Record<AdminOrgSector, OrgUiKey> = {
  CHURCH: "CHURCH",
  CLUB: "CLUB",
  CHARITY: "CHARITY",
  SCHOOL: "SCHOOL",
};

export function resolveOrgUiKey(
  vertical: AdminVertical | null | undefined,
  sector: AdminOrgSector | null | undefined,
): OrgUiKey {
  if (vertical) return vertical;
  if (sector) return SECTOR_TO_KEY[sector];
  return "UNKNOWN";
}

const EMPTY_UI: OrgUi = { labels: {} };

const DICTIONARY: Record<OrgUiKey, OrgUi> = {
  CHURCH: {
    labels: {
      "/children": "Children & Youth",
      "/classes": "Ministry groups",
      "/sessions": "Services & Rotas",
      "/guest-pass": "Visitor check-in",
    },
  },
  INDEPENDENT_SCHOOL: {
    labels: {
      "/children": "Students",
      "/sessions": "Sessions",
    },
  },
  ACE_SCHOOL: {
    labels: {
      "/children": "Students",
      "/lessons": "PACE work",
      "/sessions": "Sessions",
    },
  },
  STATE_SCHOOL: {
    labels: {
      "/children": "Pupils",
      "/parents": "Parents & Carers",
      "/sessions": "Sessions",
    },
  },
  SCHOOL: {
    labels: {
      "/children": "Students",
      "/sessions": "Sessions",
    },
  },
  NURSERY: {
    labels: {
      "/parents": "Families",
      "/classes": "Rooms",
      "/sessions": "Sessions",
    },
  },
  CHARITY: {
    labels: {
      "/children": "Participants",
      "/parents": "Contacts",
      "/classes": "Programmes",
      "/sessions": "Activities",
    },
  },
  CLUB: {
    labels: {
      "/children": "Members",
      "/parents": "Guardians",
      "/classes": "Teams",
      "/sessions": "Sessions",
    },
  },
  UNKNOWN: EMPTY_UI,
};

export function resolveOrgUi(
  vertical: AdminVertical | null | undefined,
  sector: AdminOrgSector | null | undefined,
): OrgUi {
  return DICTIONARY[resolveOrgUiKey(vertical, sector)];
}

/** Exact-path match, falling back to the first path segment (e.g. `/children/abc` -> `/children`). */
export function orgLabel(ui: OrgUi, path: string, fallback: string): string {
  if (ui.labels[path]) return ui.labels[path];
  const topSegment = `/${path.split("/").filter(Boolean)[0] ?? ""}`;
  return ui.labels[topSegment] ?? fallback;
}
