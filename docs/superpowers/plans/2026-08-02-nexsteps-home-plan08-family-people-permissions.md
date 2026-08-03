# NexSteps Home — Plan 08: Family, People, Permissions, Privacy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 8 `family-settings` screens (H5 slice) of the NexSteps Home
build-plan series: `family-children`, `child-details`, `people-permissions`,
`preferences`, `notifications`, `membership`, `privacy-data`, `account-session`.

**Architecture:** Six screens are thin UI over backend that already exists
(children CRUD, org people/invites, billing entitlements). Two screens
(`preferences`+`notifications`, and `account-session`) need small, real backend
additions. Every screen follows the established two-layer frontend pattern
(`src/lib/api/<domain>.ts` + `src/lib/queries/<domain>.ts` wrapping
`apiClient`/TanStack Query) and the `household-setup.controller.ts` precedent
of plain `AuthUserGuard` (no `CapabilityGuard`) for household-config
endpoints — these are settings any household member/admin can reach, not
ACE-vertical capability-gated features.

**Tech Stack:** NestJS (`apps/api`), Prisma (`packages/db`), Expo Router +
React Native + TanStack Query (`apps/nexsteps-home`), Zod validation, Stripe
(existing `Org.stripeCustomerId`).

**This plan is not a substitute for the approved handoff.** The product
spec already exists and is not repeated here in full — read before
implementing:
- Screens/copy/navigation: `docs/NexStepsV2/nexsteps-home/screen-inventory.json`
  (`family-settings` group) and
  `prototypes/nexsteps-home/src/wireframes-data.ts:1467-1711` (exact wireframe
  block content for all 8 screens).
- Cross-cutting rules: `docs/NexStepsV2/nexsteps-home/product-contract.md`,
  `docs/NexStepsV2/nexsteps-home/acceptance-criteria.md`,
  `docs/NexStepsV2/nexsteps-home/design-system.md`.
- Production boundary: `docs/NexStepsV2/nexsteps-home/implementation-map.md`
  (H5 row, PR handoff template at `:155-185`).
- Live handoff ledger: `docs/NexStepsV2/nexsteps-home/build-plans/PROGRESS.md`
  — update it after every sub-plan lands, per that file's own convention.

## Global Constraints

- Household = one `Org` + one `Tenant` (H1 decision, already implemented).
  A client-provided tenant/org ID is never trusted — always resolve via
  `@CurrentTenant`/`@CurrentOrg` from the authenticated request context.
- No Home capability is added to an ACE vertical grant map; no existing ACE
  capability is renamed (`implementation-map.md:130-131`). Household-config
  endpoints in this plan use plain `AuthUserGuard`, not `CapabilityGuard`.
- Household permissions never imply Community moderation authority
  (`acceptance-criteria.md:31` boundary — do not wire these screens to any
  Community/moderation endpoint).
- Every mutation covers: loading, empty, validation/error, offline/retry,
  permission denied, success (`implementation-map.md:172-178`,
  `design-system.md:82-91`). Reuse `NoticeCard`/`ContentCard`/`ListCard` for
  these — no new empty/error primitives without checking these first.
- No hardcoded/mocked screen content — every screen wires to a real endpoint,
  matching this series' standing principle (see PROGRESS.md's repeated notes
  on this).
- Destructive actions (remove person's access, delete family account, sign
  out other sessions) explain consequences and require confirmation
  (`acceptance-criteria.md:35`).
- Production screens use `mobileTokens` and existing primitives only; extract
  a new shared primitive only once two screens need the same behaviour
  (`design-system.md:66-67`).
- `graphify update .` after any code/doc change (project `CLAUDE.md`
  Graphify gate).
- Every PR states approved screen IDs, owning phase/slice, exact production
  paths, and the data/permission boundary, per the PR handoff template
  (`implementation-map.md:159-185`).

## Scope decision (recorded here, not re-litigated per sub-plan)

Research before this plan was written found that `people-permissions`
needs **no new backend** — `GET /:orgId/people`, `POST/GET /:orgId/invites`,
`POST /:orgId/invites/:id/{resend,revoke}`, `POST /invites/accept`, and
`DELETE /:orgId/people/:userId` already exist and are already org-scoped,
which for a household is exactly tenant-scoped (`apps/api/src/orgs/`,
`apps/api/src/invites/`). Two screens genuinely have **no backend to
reuse**: `account-session` (no device-session tracking, no user-facing
password-change endpoint, no 2FA anywhere in the codebase) and
`privacy-data` (DSAR today is admin-only/child-scoped/JSON-only; exports
are attendance-CSV-only; no deletion-request workflow exists). Product
decisions taken for those two (2026-08-02, this session):
- `account-session`: build a **real, independent session-tracking model**
  (not dependent on Auth0's session-list API, whose availability varies by
  Auth0 plan tier).
- `privacy-data`: build a **real async export job** (zip of household data);
  "delete family account" **files a support/deletion request** rather than
  executing an irreversible delete — a full retention/deletion engine is not
  built until legal/compliance defines the policy.

Given six materially different backend surfaces (children, org-people,
household-config, billing, DSAR/export, auth), this plan is split into six
independently mergeable sub-plans, sequenced easiest/most-reuse first,
matching this series' own precedent (Plan 06 shipped backend before screens;
H2 already has a "partial" sub-row in the series README). Each sub-plan is
its own PR.

| Sub-plan | Screens | New backend | Risk |
| --- | --- | --- | --- |
| 08a | `family-children`, `child-details` | none (reuse `children`) | low |
| 08b | `preferences`, `notifications` | new `Tenant`/prefs fields | low |
| 08c | `people-permissions` | none (reuse `orgs`/`invites`) | low |
| 08d | `membership` | 1 new endpoint (Stripe portal) | low-medium |
| 08e | `privacy-data` | new export job + deletion request | medium |
| 08f | `account-session` | new session model + password + 2FA | highest |

## File Structure

New frontend files (all sub-plans, `apps/nexsteps-home/`):
- `app/(home)/(tabs)/family/child-details.tsx`
- `app/(home)/(tabs)/family/people-permissions.tsx`
- `app/(home)/(tabs)/family/preferences.tsx`
- `app/(home)/(tabs)/family/notifications.tsx`
- `app/(home)/(tabs)/family/membership.tsx`
- `app/(home)/(tabs)/family/privacy-data.tsx`
- `app/(home)/(tabs)/family/account-session.tsx`
- `src/lib/api/org-people.ts`, `src/lib/api/preferences.ts` (household prefs,
  not `VolunteerPreference` — do not touch `apps/api/src/preferences/`),
  `src/lib/api/billing.ts`, `src/lib/api/privacy.ts`, `src/lib/api/account-session.ts`
- `src/lib/queries/org-people.ts`, `src/lib/queries/preferences.ts`,
  `src/lib/queries/billing.ts`, `src/lib/queries/privacy.ts`,
  `src/lib/queries/account-session.ts`
- `src/components/primitives/ToggleRow.tsx` (new — no on/off switch primitive
  exists today; `ChipRow` is chip-select, not a labelled boolean switch)

Modified: `app/(home)/(tabs)/family/index.tsx` (currently a placeholder;
becomes `family-children`), `src/screens/registry.ts` (routes already
correct, no change needed — verify only), `src/components/primitives/index.ts`
(export `ToggleRow`).

New/modified backend files per sub-plan are listed under each sub-plan
below.

---

# Sub-plan 08a: Children (`family-children`, `child-details`)

**Screens:** `family-children` (`/(home)/(tabs)/family`), `child-details`
(`/(home)/(tabs)/family/child-details`).

**Data and permission boundary:** `GET /children` and `GET /children/:id`
already tenant-scope via `@CurrentTenant("tenantId")`
(`apps/api/src/children/children.controller.ts`); `PATCH /children/:id`
already gates edits via `assertCanEditChild` (site admin or linked guardian
only). No new backend.

**States:** loading (skeleton list / skeleton fields), empty (`NoticeCard`:
"Add your first child" + primary action to child-add — reuse the existing
setup-flow screen, do not duplicate it), error (`NoticeCard` tone="danger",
retry), permission-denied (a guardian who isn't linked to a child gets a
403 from `PATCH` — surface as `NoticeCard`, not a silent failure), success
(list/detail re-render from the invalidated query, no confirmation page per
`design-system.md:90-91`).

**Files:**
- Modify: `apps/nexsteps-home/app/(home)/(tabs)/family/index.tsx`
- Create: `apps/nexsteps-home/app/(home)/(tabs)/family/child-details.tsx`
- Create: `apps/nexsteps-home/src/lib/queries/children.ts` (extracted out of
  `queries/family-planner.ts`, which currently holds `useChildren`/
  `useCreateChild` — this sub-plan is the natural point to split it into its
  own file, matching the one-file-per-domain convention every other domain
  already follows; add `useUpdateChild` here too)
- Test: `apps/nexsteps-home/src/lib/queries/children.test.ts`

**Interfaces:**
- Consumes: `childrenApi.listChildren()`, `childrenApi.getChild(id: string)`,
  `childrenApi.updateChild(id: string, input: UpdateChildInput)` — all
  already exist in `apps/nexsteps-home/src/lib/api/children.ts`. Read that
  file before writing the query hooks; do not re-derive its request shapes.
- Produces: `useChildren()`, `useChild(id: string)`, `useUpdateChild()` for
  `child-details.tsx` to consume.

- [ ] **Step 1: Read the existing children API client and query file**

  Run: `cat apps/nexsteps-home/src/lib/api/children.ts apps/nexsteps-home/src/lib/queries/family-planner.ts`

  Confirm exact exported function names/signatures before writing hooks
  against them — do not guess.

- [ ] **Step 2: Write the failing test for the extracted query module**

```ts
// apps/nexsteps-home/src/lib/queries/children.test.ts
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as childrenApi from "../api/children";
import { useChild, useChildren, useUpdateChild } from "./children";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("children queries", () => {
  it("useChildren fetches the list", async () => {
    vi.spyOn(childrenApi, "listChildren").mockResolvedValue([
      { id: "c1", firstName: "Maya" } as never,
    ]);
    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].firstName).toBe("Maya");
  });

  it("useChild fetches a single child by id", async () => {
    vi.spyOn(childrenApi, "getChild").mockResolvedValue({ id: "c1", firstName: "Maya" } as never);
    const { result } = renderHook(() => useChild("c1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(childrenApi.getChild).toHaveBeenCalledWith("c1");
  });

  it("useUpdateChild invalidates both list and detail queries on success", async () => {
    vi.spyOn(childrenApi, "updateChild").mockResolvedValue({ id: "c1", firstName: "Maya R." } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateChild(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await result.current.mutateAsync({ id: "c1", input: { firstName: "Maya R." } });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["children"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["children", "c1"] });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

  Run: `pnpm --filter nexsteps-home test src/lib/queries/children.test.ts`
  Expected: FAIL — `./children` module does not exist yet.

- [ ] **Step 4: Write the query module**

```ts
// apps/nexsteps-home/src/lib/queries/children.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as childrenApi from "../api/children";
import type { UpdateChildInput } from "../api/children";

export const useChildren = () =>
  useQuery({ queryKey: ["children"], queryFn: childrenApi.listChildren });

export const useChild = (id: string) =>
  useQuery({
    queryKey: ["children", id],
    queryFn: () => childrenApi.getChild(id),
    enabled: Boolean(id),
  });

export const useUpdateChild = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateChildInput }) =>
      childrenApi.updateChild(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["children"] });
      queryClient.invalidateQueries({ queryKey: ["children", variables.id] });
    },
  });
};
```

  Remove `useChildren`/`useCreateChild` from `queries/family-planner.ts` and
  re-export `useCreateChild` unchanged from the new `children.ts` (keep it —
  it's used by the existing setup flow; just move it, don't duplicate it).
  Update every import site (`grep -rn "from.*queries/family-planner" apps/nexsteps-home/app` first).

- [ ] **Step 5: Run test to verify it passes**

  Run: `pnpm --filter nexsteps-home test src/lib/queries/children.test.ts`
  Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/nexsteps-home/src/lib/queries/children.ts apps/nexsteps-home/src/lib/queries/children.test.ts apps/nexsteps-home/src/lib/queries/family-planner.ts
git commit -m "refactor: extract children query hooks from family-planner queries"
```

- [ ] **Step 7: Build `family-children` (list) screen**

  Read `prototypes/nexsteps-home/src/wireframes-data.ts:1467-1510` for the
  exact block content (Regulations & Evidence teaser card, one `ContentCard`
  per child with tone "mint" for the first, an "Add a child" card, and a
  `NoticeCard` "Never shared to Community"). Read
  `apps/nexsteps-home/app/(home)/(tabs)/progress/index.tsx` immediately
  before writing this file — copy its `SafeAreaView`/`ScrollView`/
  loading-error-empty structure exactly, do not invent a new shell.

```tsx
// apps/nexsteps-home/app/(home)/(tabs)/family/index.tsx
import { router } from "expo-router";
import { SafeAreaView, ScrollView, View } from "react-native";
import { ContentCard, NoticeCard, ScreenActions, ScreenHeader } from "../../../../../src/components/primitives";
import { homeTokens } from "../../../../../src/design/tokens";
import { useChildren } from "../../../../../src/lib/queries/children";

export default function FamilyChildrenScreen() {
  const { data: children, isLoading, isError } = useChildren();

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
          paddingTop: homeTokens.metrics.screenContentTop,
          paddingBottom: homeTokens.metrics.tabBarAwareBottomPadding,
          gap: homeTokens.metrics.blockGap,
        }}
      >
        <ScreenHeader eyebrow="Family" title="Children" description="Private profiles that shape planning and progress." />
        <ContentCard
          title="Regulations & Evidence"
          body="Stay prepared and keep important records together."
          meta="2 to review"
          action="Open"
          tone="yellow"
          onPress={() => router.push("/(home)/(tabs)/family/regulations-overview")}
        />
        {isError && <NoticeCard tone="danger" title="Couldn't load children" body="Check your connection and try again." />}
        {isLoading && <NoticeCard title="Loading" body="Fetching your children." />}
        {!isLoading && !isError && children?.length === 0 && (
          <NoticeCard title="Add your first child" body="A name or nickname and age are enough." />
        )}
        {children?.map((child) => (
          <ContentCard
            key={child.id}
            title={child.preferredName || child.firstName}
            body={`Age ${child.age ?? "—"}`}
            action="Open"
            tone="mint"
            onPress={() => router.push({ pathname: "/(home)/(tabs)/family/child-details", params: { childId: child.id } })}
          />
        ))}
        <ContentCard title="Add a child" body="A name or nickname and age are enough." action="Add child" tone="yellow" onPress={() => router.push("/(setup)/child-add")} />
        <NoticeCard title="Never shared to Community" body="Child profiles and records stay inside the family account." />
      </ScrollView>
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <ScreenActions primaryLabel="Open Maya" onPrimaryPress={() => children?.[0] && router.push({ pathname: "/(home)/(tabs)/family/child-details", params: { childId: children[0].id } })} />
      </View>
    </SafeAreaView>
  );
}
```

  Before finalizing: check whether `Child` already exposes an `age` field
  from `GET /children` (`childSelect` in `children.service.ts`) or only
  `dateOfBirth` — if only `dateOfBirth`, compute age client-side rather than
  adding a backend field for a display-only value.

- [ ] **Step 8: Build `child-details` screen**

  Read `prototypes/nexsteps-home/src/wireframes-data.ts:1512-1539`. Fields:
  name/nickname, age, learning stage (read-only `FieldGroup` become editable
  via `FieldInput`), learning-days `ChipRow`, a "Subjects" card linking to
  the existing `subjects` screen, an "Archive profile" review card (this is
  a *new* concept — check `Child` model for an existing `archivedAt`/
  `isActive`-style field before assuming one needs adding; if none exists,
  do not build the archive action in this sub-plan — file it as a follow-up
  rather than inventing a soft-delete field mid-plan for one card).
  Wire `FieldInput`'s `onChangeText` to local state, `ScreenActions`
  primary "Save changes" to `useUpdateChild().mutateAsync`.

- [ ] **Step 9: Add a mobile E2E test for the critical path**

  Follow the existing E2E pattern for Plan 06/07 screens (check
  `apps/nexsteps-home/fidelity/` and any `*.e2e.ts` under `apps/nexsteps-home`
  first — copy the harness, don't invent a new one). Critical journey:
  open Family tab → see child list → open a child → edit name → save →
  see updated name back on the list.

- [ ] **Step 10: Run full verification and commit**

  Run: `pnpm -r typecheck && pnpm -r lint && pnpm test:unit`
  Expected: all green, matching every prior plan's verification bar.

```bash
git add apps/nexsteps-home/app/\(home\)/\(tabs\)/family/index.tsx apps/nexsteps-home/app/\(home\)/\(tabs\)/family/child-details.tsx
git commit -m "feat: add family children list and child details screens"
```

**PR handoff block (fill in when opening the PR):**
```text
Approved screens: family-children, child-details
Owning phase: Phase 7, PR H5a
Production paths: apps/nexsteps-home/app/(home)/(tabs)/family/{index,child-details}.tsx, src/lib/queries/children.ts
Data and permission boundary: tenant-scoped via existing GET/PATCH /children; guardian-child edit check unchanged
States covered: loading, empty, validation/error, offline/retry, permission denied, success
```

---

# Sub-plan 08b: Preferences & notifications

**Screens:** `preferences`, `notifications` (both
`/(home)/(tabs)/family/{preferences,notifications}`).

**Why these are paired:** both are flat lists of household-level settings,
both need the exact same new backend shape (a small set of `Tenant`-scoped
fields, read/write via plain `AuthUserGuard`), and both reuse the
`household-setup.controller.ts` pattern verbatim
(`apps/api/src/household-setup/household-setup.controller.ts:1-35`).

**Data model decision:** extend `Tenant` with two new fields rather than a
new table — this mirrors the existing `learningDays`/`setupCompletedAt`
precedent exactly (small, fixed, household-singleton settings, not a
growing list):

```prisma
// packages/db/prisma/schema.prisma, inside model Tenant, near learningDays:
planningPreferences Json @default("{}")
notificationPreferences Json @default("{}")
```

Do not model each toggle as its own column — the wireframe's rows
(`week starts`, `default activity duration`, `daily planning limit`, `time
format`, `language`; `today summary`, `activity reminders`, `tasks due`,
`community hellos`, `channel activity`, `meetups nearby`, `quiet hours`)
are display/edit pairs with no query/filter/join requirement, so a single
JSON column per concern is the correct level of structure (a full relational
table per toggle would be schema churn for values nothing ever queries by).
Validate shape at the API boundary with Zod, not at the DB layer.

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add the two `Tenant` fields above)
- Create: `packages/db/prisma/migrations/<timestamp>_add_household_preferences/migration.sql`
- Create: `apps/api/src/household-setup/dto/preferences.dto.ts`
- Modify: `apps/api/src/household-setup/household-setup.controller.ts` (add 4 endpoints)
- Modify: `apps/api/src/household-setup/household-setup.service.ts` (add 4 methods)
- Test: `apps/api/src/household-setup/household-setup.controller.spec.ts`,
  `household-setup.service.spec.ts` (extend existing files — check they
  exist first: `ls apps/api/src/household-setup/*.spec.ts`)
- Create: `apps/nexsteps-home/src/lib/api/preferences.ts`,
  `apps/nexsteps-home/src/lib/queries/preferences.ts`
- Create: `apps/nexsteps-home/src/components/primitives/ToggleRow.tsx`
- Create: `apps/nexsteps-home/app/(home)/(tabs)/family/preferences.tsx`,
  `.../notifications.tsx`

**Interfaces:**
- Produces (backend): `GET /household-setup/planning-preferences` →
  `{ weekStartsOn: "Mon"|"Sun", defaultActivityDurationMinutes: number,
  dailyPlanningLimit: number, timeFormat: "12h"|"24h", language: string }`;
  `PATCH /household-setup/planning-preferences` (same shape, all optional,
  `.strict()`); `GET /household-setup/notification-preferences` →
  `{ todaySummary: boolean, activityReminders: boolean, tasksDue: boolean,
  communityHellos: boolean, channelActivity: boolean, meetupsNearby: boolean,
  quietHours: { start: string, end: string, enabled: boolean } }`;
  `PATCH /household-setup/notification-preferences` (same shape, optional).
- Produces (frontend primitive): `ToggleRow({ label, detail?, value: boolean,
  onValueChange: (next: boolean) => void, disabled? })` — renders a label,
  optional detail subtitle, and a native `Switch` (React Native's built-in
  component — this is exactly the "native platform feature" rung; do not
  pull in a third-party switch library). Sub-plan 08b is the second screen
  needing this pattern (notifications *and*, later, membership's "quiet
  hours" toggle), which is what justifies a new shared primitive per
  `design-system.md:66-67`.

- [ ] **Step 1: Write the failing service test for planning preferences**

```ts
// apps/api/src/household-setup/household-setup.service.spec.ts (add to existing file)
describe("planning preferences", () => {
  it("returns defaults when no preferences have been set", async () => {
    prismaMock.tenant.findUniqueOrThrow.mockResolvedValue({ planningPreferences: {} });
    const result = await service.getPlanningPreferences("tenant-1");
    expect(result).toEqual({
      weekStartsOn: "Mon",
      defaultActivityDurationMinutes: 45,
      dailyPlanningLimit: 2,
      timeFormat: "24h",
      language: "en-GB",
    });
  });

  it("merges a partial update into existing preferences", async () => {
    prismaMock.tenant.findUniqueOrThrow.mockResolvedValue({ planningPreferences: { timeFormat: "24h" } });
    prismaMock.tenant.update.mockResolvedValue({ planningPreferences: { timeFormat: "12h" } });
    await service.updatePlanningPreferences({ timeFormat: "12h" }, "tenant-1");
    expect(prismaMock.tenant.update).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: { planningPreferences: { timeFormat: "12h" } },
      select: { planningPreferences: true },
    });
  });
});
```

  (Match this repo's actual existing mock style in
  `household-setup.service.spec.ts` — read it first; the snippet above shows
  intent, not necessarily the exact mock helper names in use.)

- [ ] **Step 2: Run test to verify it fails**

  Run: `pnpm --filter api test household-setup.service.spec.ts`
  Expected: FAIL — `getPlanningPreferences` is not a function.

- [ ] **Step 3: Add the Prisma fields and migration**

```bash
cd packages/db && pnpm prisma migrate dev --name add_household_preferences --create-only
```

  Then hand-verify the generated SQL only adds the two nullable-with-default
  JSON columns to `Tenant` — no other drift. Follow the exact throwaway-DB
  verification method Plan 06 used (spin up an isolated `postgres:16-alpine`
  container, apply full migration history, diff with `prisma migrate diff`,
  tear down) rather than running against a shared local Postgres — see
  `PROGRESS.md`'s Plan 06 entry for the exact commands used last time.

- [ ] **Step 4: Write the DTOs**

```ts
// apps/api/src/household-setup/dto/preferences.dto.ts
import { z } from "zod";

export const planningPreferencesSchema = z
  .object({
    weekStartsOn: z.enum(["Mon", "Sun"]).optional(),
    defaultActivityDurationMinutes: z.number().int().min(5).max(240).optional(),
    dailyPlanningLimit: z.number().int().min(1).max(10).optional(),
    timeFormat: z.enum(["12h", "24h"]).optional(),
    language: z.string().min(2).max(10).optional(),
  })
  .strict();
export type PlanningPreferencesDto = z.infer<typeof planningPreferencesSchema>;

export const notificationPreferencesSchema = z
  .object({
    todaySummary: z.boolean().optional(),
    activityReminders: z.boolean().optional(),
    tasksDue: z.boolean().optional(),
    communityHellos: z.boolean().optional(),
    channelActivity: z.boolean().optional(),
    meetupsNearby: z.boolean().optional(),
    quietHours: z
      .object({ start: z.string(), end: z.string(), enabled: z.boolean() })
      .optional(),
  })
  .strict();
export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesSchema>;

export const PLANNING_PREFERENCES_DEFAULTS: Required<PlanningPreferencesDto> = {
  weekStartsOn: "Mon",
  defaultActivityDurationMinutes: 45,
  dailyPlanningLimit: 2,
  timeFormat: "24h",
  language: "en-GB",
};

export const NOTIFICATION_PREFERENCES_DEFAULTS: Required<NotificationPreferencesDto> = {
  todaySummary: true,
  activityReminders: true,
  tasksDue: true,
  communityHellos: true,
  channelActivity: true,
  meetupsNearby: false,
  quietHours: { start: "20:30", end: "07:30", enabled: true },
};
```

- [ ] **Step 5: Implement the service methods**

```ts
// apps/api/src/household-setup/household-setup.service.ts — add:
async getPlanningPreferences(tenantId: string) {
  const { planningPreferences } = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { planningPreferences: true },
  });
  return { ...PLANNING_PREFERENCES_DEFAULTS, ...(planningPreferences as object) };
}

async updatePlanningPreferences(dto: PlanningPreferencesDto, tenantId: string) {
  const current = await this.getPlanningPreferences(tenantId);
  const merged = { ...current, ...dto };
  await prisma.tenant.update({ where: { id: tenantId }, data: { planningPreferences: merged } });
  return merged;
}
// getNotificationPreferences / updateNotificationPreferences: identical shape, swap the field and defaults constant.
```

- [ ] **Step 6: Run test to verify it passes**

  Run: `pnpm --filter api test household-setup.service.spec.ts`
  Expected: PASS

- [ ] **Step 7: Add the controller endpoints and their spec**

```ts
// apps/api/src/household-setup/household-setup.controller.ts — add:
@Get("planning-preferences")
getPlanningPreferences(@CurrentTenant("tenantId") tenantId: string) {
  return this.service.getPlanningPreferences(tenantId);
}

@Patch("planning-preferences")
updatePlanningPreferences(@Body() body: unknown, @CurrentTenant("tenantId") tenantId: string) {
  const parsed = planningPreferencesSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.format());
  return this.service.updatePlanningPreferences(parsed.data, tenantId);
}
// GET/PATCH notification-preferences: identical shape.
```

  Add controller spec cases mirroring the existing `learning-days` tests in
  `household-setup.controller.spec.ts` (read it first) — one happy path,
  one 400 on an invalid enum value (e.g. `weekStartsOn: "Wed"`).

- [ ] **Step 8: Run the full API test suite and commit**

  Run: `pnpm --filter api test household-setup`
  Expected: PASS

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/src/household-setup
git commit -m "feat: add household planning and notification preferences endpoints"
```

- [ ] **Step 9: Write the frontend API + query modules**

```ts
// apps/nexsteps-home/src/lib/api/preferences.ts
import { apiClient } from "./http";

export type PlanningPreferences = { weekStartsOn: "Mon" | "Sun"; defaultActivityDurationMinutes: number; dailyPlanningLimit: number; timeFormat: "12h" | "24h"; language: string };
export type NotificationPreferences = { todaySummary: boolean; activityReminders: boolean; tasksDue: boolean; communityHellos: boolean; channelActivity: boolean; meetupsNearby: boolean; quietHours: { start: string; end: string; enabled: boolean } };

export const getPlanningPreferences = () => apiClient.request<PlanningPreferences>("/household-setup/planning-preferences");
export const updatePlanningPreferences = (input: Partial<PlanningPreferences>) =>
  apiClient.request<PlanningPreferences>("/household-setup/planning-preferences", { method: "PATCH", body: JSON.stringify(input) });
export const getNotificationPreferences = () => apiClient.request<NotificationPreferences>("/household-setup/notification-preferences");
export const updateNotificationPreferences = (input: Partial<NotificationPreferences>) =>
  apiClient.request<NotificationPreferences>("/household-setup/notification-preferences", { method: "PATCH", body: JSON.stringify(input) });
```

```ts
// apps/nexsteps-home/src/lib/queries/preferences.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as preferencesApi from "../api/preferences";

export const usePlanningPreferences = () => useQuery({ queryKey: ["planning-preferences"], queryFn: preferencesApi.getPlanningPreferences });
export const useUpdatePlanningPreferences = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: preferencesApi.updatePlanningPreferences,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planning-preferences"] }),
  });
};
export const useNotificationPreferences = () => useQuery({ queryKey: ["notification-preferences"], queryFn: preferencesApi.getNotificationPreferences });
export const useUpdateNotificationPreferences = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: preferencesApi.updateNotificationPreferences,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });
};
```

- [ ] **Step 10: Build the `ToggleRow` primitive**

```tsx
// apps/nexsteps-home/src/components/primitives/ToggleRow.tsx
import { Switch, Text, View } from "react-native";
import { homeTokens } from "../../design/tokens";

export type ToggleRowProps = { label: string; detail?: string; value: boolean; onValueChange: (next: boolean) => void; disabled?: boolean };

export function ToggleRow({ label, detail, value, onValueChange, disabled }: ToggleRowProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: homeTokens.metrics.rowVerticalPadding }}>
      <View style={{ flex: 1, paddingRight: homeTokens.metrics.rowGap }}>
        <Text style={homeTokens.typography.rowTitle}>{label}</Text>
        {detail && <Text style={homeTokens.typography.rowDetail}>{detail}</Text>}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} />
    </View>
  );
}
```

  Check `homeTokens.metrics`/`homeTokens.typography` for the exact token
  names before using them — the names above are illustrative of the
  convention, confirm against `apps/nexsteps-home/src/design/tokens.ts`.
  Export it from `src/components/primitives/index.ts`.

- [ ] **Step 11: Build `preferences.tsx` and `notifications.tsx` screens**

  Read `prototypes/nexsteps-home/src/wireframes-data.ts:1569-1616` for exact
  copy. `preferences` uses `list()` blocks with an "Edit" trailing action per
  row (these open an inline editor or a small picker — for the fixed-choice
  rows `weekStartsOn`/`timeFormat`/`language`, use `ChipRow` for
  single-select rather than free text, since these are closed enumerations,
  not open text). `notifications` uses `ToggleRow` per boolean row plus one
  `ContentCard` for "Quiet hours" (its own start/end + enabled toggle).

- [ ] **Step 12: Add unit tests for the query hooks and an E2E toggle test**

  Mirror Step 2 of sub-plan 08a's test structure for
  `queries/preferences.test.ts`. E2E: toggle "Meetups nearby" on, reload,
  confirm it persisted (validates the mutation + invalidation wiring, not
  just that the screen renders).

- [ ] **Step 13: Run full verification and commit**

  Run: `pnpm -r typecheck && pnpm -r lint && pnpm test:unit`

```bash
git add apps/nexsteps-home
git commit -m "feat: add household preferences and notifications screens"
```

**PR handoff block:**
```text
Approved screens: preferences, notifications
Owning phase: Phase 7, PR H5b
Production paths: apps/api/src/household-setup/*, packages/db/prisma/schema.prisma, apps/nexsteps-home/app/(home)/(tabs)/family/{preferences,notifications}.tsx
Data and permission boundary: Tenant-scoped, plain AuthUserGuard (any household member may read/update, matching children.controller.ts's precedent)
States covered: loading, empty, validation/error, offline/retry, permission denied, success
```

---

# Sub-plan 08c: People & permissions

**Screen:** `people-permissions` (`/(home)/(tabs)/family/people-permissions`).

**No new backend.** Reuse, unmodified:
- `GET /:orgId/people` (`apps/api/src/orgs/orgs.controller.ts:241`) — list
  household adults. Already `ORG_ADMIN`-gated
  (`OrgPeopleService.assertOrgAdmin`) — this matches the wireframe's implied
  audience (the household owner managing access), so no guard change.
- `POST /orgs/:orgId/invites`, `GET /orgs/:orgId/invites?status=pending`,
  `POST /orgs/:orgId/invites/:inviteId/resend`,
  `POST /orgs/:orgId/invites/:inviteId/revoke` (`apps/api/src/invites/`).
- `DELETE /:orgId/people/:userId` — "remove access" (maps to a "manage
  access" secondary action the wireframe doesn't show a dedicated screen for
  yet; wire it as a confirm-then-call action from a row's detail sheet, not
  a new screen, per YAGNI — the wireframe's primary action is "Manage
  Jordan's access" which targets `preferences`, not a dedicated management
  screen. Do not build a `people-permissions/[userId].tsx` detail route this
  plan doesn't have a screen ID or wireframe for).

**Known, documented limitation:** `OrgRole` has `ORG_ADMIN`/`ORG_BILLING`/
`ORG_MEMBER`; the wireframe's "Contributor · selected learning logs only"
implies a data-scoped role no model in this codebase supports (see the
research this plan is based on — `PermissionDefinition`/`OrgRoleDefinition`
is a general org-role-with-permissions engine, but has no row-level scoping
to specific `LearningLog`/`Child` records). For this plan: display
`ORG_ADMIN` as "Owner", `ORG_MEMBER` as "Parent", and do **not** offer a
"Contributor" invite option in the UI yet — inviting always grants
`ORG_MEMBER`. Leave a `ponytail:` comment at the invite-role picker noting
this ceiling and that a true narrow/scoped role needs a data-model change,
not a UI change, before it can ship.

**Files:**
- Create: `apps/nexsteps-home/src/lib/api/org-people.ts` (wraps
  `GET /:orgId/people`, invite create/list/resend/revoke — resolve `orgId`
  from the auth context the same way other API modules do; check
  `src/lib/auth/` for how the current org id is already surfaced to API
  calls before adding a second mechanism)
- Create: `apps/nexsteps-home/src/lib/queries/org-people.ts`
- Create: `apps/nexsteps-home/app/(home)/(tabs)/family/people-permissions.tsx`
- Test: `apps/nexsteps-home/src/lib/queries/org-people.test.ts`

**Interfaces:**
- Produces: `useOrgPeople()`, `usePendingInvites()`, `useInviteAdult()`,
  `useRevokeInvite()`, `useRemovePersonAccess()`.

- [ ] **Step 1: Read how orgId is resolved client-side today**

  Run: `grep -rn "orgId" apps/nexsteps-home/src/lib/auth apps/nexsteps-home/src/lib/api/*.ts`

  Confirm whether an existing helper (e.g. from the active-site/org auth
  context) already exposes the current org id, or whether the API layer
  needs `apiClient` to inject it server-side via `@CurrentOrg` instead (in
  which case the frontend never needs to know the literal org id — prefer
  this if `apiClient.request` already sends the right auth headers for the
  server to resolve org/tenant itself, matching every other domain module's
  pattern of never passing tenant/org IDs from the client).

- [ ] **Step 2: Write the failing test for the query hooks**

```ts
// apps/nexsteps-home/src/lib/queries/org-people.test.ts
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as orgPeopleApi from "../api/org-people";
import { useInviteAdult, useOrgPeople } from "./org-people";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("org-people queries", () => {
  it("useOrgPeople fetches household members", async () => {
    vi.spyOn(orgPeopleApi, "listOrgPeople").mockResolvedValue([
      { id: "u1", name: "Sam R.", orgRole: "ORG_ADMIN" } as never,
    ]);
    const { result } = renderHook(() => useOrgPeople(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].name).toBe("Sam R.");
  });

  it("useInviteAdult posts an invite and invalidates the people and invites queries", async () => {
    vi.spyOn(orgPeopleApi, "inviteAdult").mockResolvedValue({ id: "inv1" } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useInviteAdult(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await result.current.mutateAsync({ email: "auntie.may@example.com", name: "Auntie May" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["org-people"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["org-invites"] });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

  Run: `pnpm --filter nexsteps-home test src/lib/queries/org-people.test.ts`
  Expected: FAIL — modules don't exist.

- [ ] **Step 4: Write the API module** (exact request shapes must match
  `apps/api/src/invites/dto/create-invite.dto.ts` and
  `apps/api/src/orgs/org-people.service.ts`'s `OrgPersonRow` — read both
  before writing types here, do not guess field names)

```ts
// apps/nexsteps-home/src/lib/api/org-people.ts
import { apiClient } from "./http";

export type OrgPersonRow = { id: string; name: string; displayName: string | null; email: string; orgRole: "ORG_ADMIN" | "ORG_BILLING" | "ORG_MEMBER"; siteAccessSummary: { allSites: boolean; siteCount: number } };
export type InviteRow = { id: string; email: string; name: string | null; orgRole: string | null; usedAt: string | null; revokedAt: string | null; expiresAt: string };
export type InviteAdultInput = { email: string; name?: string };

// orgId resolution: see Step 1's finding — replace `currentOrgId()` below with whatever that step confirms.
export const listOrgPeople = () => apiClient.request<OrgPersonRow[]>(`/${currentOrgId()}/people`);
export const listPendingInvites = () => apiClient.request<InviteRow[]>(`/orgs/${currentOrgId()}/invites?status=pending`);
export const inviteAdult = (input: InviteAdultInput) =>
  apiClient.request<InviteRow>(`/orgs/${currentOrgId()}/invites`, { method: "POST", body: JSON.stringify(input) });
export const revokeInvite = (inviteId: string) =>
  apiClient.request<InviteRow>(`/orgs/${currentOrgId()}/invites/${inviteId}/revoke`, { method: "POST" });
export const removePersonAccess = (userId: string) =>
  apiClient.request<void>(`/${currentOrgId()}/people/${userId}`, { method: "DELETE" });
```

- [ ] **Step 5: Write the query module** (same shape as sub-plan 08a's
  `children.ts` — `useQuery`/`useMutation` + `invalidateQueries` on the two
  relevant keys)

- [ ] **Step 6: Run test to verify it passes**

  Run: `pnpm --filter nexsteps-home test src/lib/queries/org-people.test.ts`
  Expected: PASS

- [ ] **Step 7: Build the `people-permissions` screen**

  Read `prototypes/nexsteps-home/src/wireframes-data.ts:1541-1567`. Use
  `ListCard` for the members list (`title` = name, `detail` = "Owner · full
  family and billing access" style string built from `orgRole` + a static
  per-role description map, `meta` = "You"/"Active"/"Invited" — "You" when
  the row's `id` matches the current authenticated user id, "Invited" when
  the row comes from `listPendingInvites()` rather than `listOrgPeople()`,
  else "Active"). One `NoticeCard` ("Community identity..."). One
  `ContentCard` "Invite an adult" opening an inline form (email + optional
  name — no role picker yet, see the documented limitation above) that
  calls `useInviteAdult()`.

- [ ] **Step 8: Add a negative-authorization test**

  Per `acceptance-criteria.md:16` ("API or storage boundaries have negative
  authorisation tests") — this reuses an already-tested endpoint, so this
  step is confirming existing coverage, not writing new backend tests:

  Run: `pnpm --filter api test org-people` and `pnpm --filter api test invites`
  Expected: existing suites already cover the non-admin-rejected case; if
  they don't, that's a pre-existing gap outside this plan's scope — flag it,
  don't silently expand this plan to fix it.

- [ ] **Step 9: Run full verification and commit**

  Run: `pnpm -r typecheck && pnpm -r lint && pnpm test:unit`

```bash
git add apps/nexsteps-home
git commit -m "feat: add people and permissions screen"
```

**PR handoff block:**
```text
Approved screens: people-permissions
Owning phase: Phase 7, PR H5c
Production paths: apps/nexsteps-home/app/(home)/(tabs)/family/people-permissions.tsx, src/lib/{api,queries}/org-people.ts
Data and permission boundary: reuses existing ORG_ADMIN-gated GET/:orgId/people and org-scoped invites; no new backend
States covered: loading, empty, validation/error, offline/retry, permission denied, success
Known limitation: no data-scoped "Contributor" role yet - invite always grants ORG_MEMBER
```

---

# Sub-plan 08d: Membership

**Screen:** `membership` (`/(home)/(tabs)/family/membership`).

**Reuse:** `GET /billing/entitlements` (`apps/api/src/billing/billing.controller.ts`)
already returns `subscription: { planCode, status, periodStart, periodEnd,
cancelAtPeriodEnd }`, `maxChildren`, `leaderSeatsIncluded` — exactly the
"Current plan" card and "Included" list in the wireframe.

**One new endpoint:** "Manage billing" needs a Stripe Billing Portal link.
`Org.stripeCustomerId` (`packages/db/prisma/schema.prisma:553`) already
exists and is populated by the existing Stripe checkout/webhook flow — this
is the "already-installed dependency" rung: use the Stripe SDK already
wired in `apps/api/src/billing/providers/stripe-*.provider.ts`, don't add a
new billing library.

**Files:**
- Create: `apps/api/src/billing/billing-portal.controller.ts` (or add to
  existing `billing.controller.ts` if it's under ~200 lines — check first,
  split only if it's already large)
- Modify: `apps/api/src/billing/billing.module.ts` (register if a new
  controller file)
- Test: `apps/api/src/billing/billing-portal.controller.spec.ts`
- Create: `apps/nexsteps-home/src/lib/api/billing.ts`,
  `src/lib/queries/billing.ts`
- Create: `apps/nexsteps-home/app/(home)/(tabs)/family/membership.tsx`

**Interfaces:**
- Produces: `POST /billing/portal` → `{ url: string }` (a one-time Stripe
  Billing Portal session URL), guarded `AuthUserGuard` +
  `@CurrentOrg("orgId")`, 404s with a clear message if `Org.stripeCustomerId`
  is null (household has never had a paid subscription — the wireframe's
  "Manage billing" secondary action should be disabled/hidden in that case,
  not call an endpoint that 404s).

- [ ] **Step 1: Read the existing Stripe provider wiring**

  Run: `cat apps/api/src/billing/providers/stripe-buy-now.provider.ts | head -40`
  and `grep -n "new Stripe(" apps/api/src -r`

  Confirm how the Stripe client is already instantiated (API key source,
  API version pin) so the portal endpoint reuses the same client
  construction rather than creating a second one.

- [ ] **Step 2: Write the failing controller test**

```ts
// apps/api/src/billing/billing-portal.controller.spec.ts
describe("POST /billing/portal", () => {
  it("returns a portal session url for an org with a stripe customer", async () => {
    stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.com/session/abc" });
    orgServiceMock.getOrg.mockResolvedValue({ id: "org1", stripeCustomerId: "cus_123" });
    const result = await controller.createPortalSession("org1");
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: expect.any(String),
    });
    expect(result).toEqual({ url: "https://billing.stripe.com/session/abc" });
  });

  it("throws NotFoundException when the org has no stripe customer", async () => {
    orgServiceMock.getOrg.mockResolvedValue({ id: "org1", stripeCustomerId: null });
    await expect(controller.createPortalSession("org1")).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

  Run: `pnpm --filter api test billing-portal.controller.spec.ts`
  Expected: FAIL — controller doesn't exist.

- [ ] **Step 4: Implement the endpoint**

```ts
// apps/api/src/billing/billing-portal.controller.ts
import { Controller, NotFoundException, Post, UseGuards } from "@nestjs/common";
import { CurrentOrg } from "@pathway/auth";
import { prisma } from "@pathway/db";
import Stripe from "stripe";
import { AuthUserGuard } from "../auth/auth-user.guard";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string); // match the existing pinned apiVersion from Step 1's finding

@Controller("billing")
@UseGuards(AuthUserGuard)
export class BillingPortalController {
  @Post("portal")
  async createPortalSession(@CurrentOrg("orgId") orgId: string) {
    const org = await prisma.org.findUniqueOrThrow({ where: { id: orgId }, select: { stripeCustomerId: true } });
    if (!org.stripeCustomerId) {
      throw new NotFoundException("This household has no billing account yet");
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: process.env.NEXSTEPS_HOME_BILLING_RETURN_URL as string,
    });
    return { url: session.url };
  }
}
```

  Add `NEXSTEPS_HOME_BILLING_RETURN_URL` to whatever env-var convention the
  repo already uses (check `apps/api/.env.example` or equivalent) rather
  than hardcoding a URL.

- [ ] **Step 5: Run test to verify it passes, register the controller, commit**

  Run: `pnpm --filter api test billing-portal.controller.spec.ts`

```bash
git add apps/api/src/billing
git commit -m "feat: add stripe billing portal session endpoint"
```

- [ ] **Step 6: Frontend — API/query modules and the `membership` screen**

  `GET /billing/entitlements` response shape is already defined server-side
  (§5 of the research this plan is based on) — mirror those exact field
  names in the frontend type, do not rename them. Card 1 = current plan
  (`subscription.planCode`, `subscription.status`, formatted
  `subscription.periodEnd`). List = static copy for "Included" rows (these
  are marketing copy, not per-org data — matches the wireframe, which shows
  fixed inclusions, not a dynamic entitlement list). "Manage billing"
  secondary action calls the new `POST /billing/portal` and opens
  `result.url` (use `expo-web-browser`'s `openBrowserAsync` if already a
  dependency — check `package.json` before adding it fresh) if
  `Org.stripeCustomerId` exists, else the button is disabled with a
  `NoticeCard` explaining why.

- [ ] **Step 7: Run full verification and commit**

  Run: `pnpm -r typecheck && pnpm -r lint && pnpm test:unit`

```bash
git add apps/nexsteps-home
git commit -m "feat: add membership screen"
```

**PR handoff block:**
```text
Approved screens: membership
Owning phase: Phase 7, PR H5d
Production paths: apps/api/src/billing/billing-portal.controller.ts, apps/nexsteps-home/app/(home)/(tabs)/family/membership.tsx
Data and permission boundary: org-scoped via existing @CurrentOrg; portal session requires an org-level stripeCustomerId
States covered: loading, empty (no subscription yet), validation/error, offline/retry, permission denied, success
```

---

# Sub-plan 08e: Privacy & data

**Screen:** `privacy-data` (`/(home)/(tabs)/family/privacy-data`).

**Scope (per the product decision recorded above):** a real async export
job for "Download family data" and "Download report archive"; "Delete
family account" creates a support-routed deletion request record, it does
not delete anything itself.

**New model:**

```prisma
// packages/db/prisma/schema.prisma
enum DataExportKind {
  FAMILY_DATA
  REPORT_ARCHIVE
}

enum DataExportStatus {
  PENDING
  READY
  FAILED
  EXPIRED
}

model DataExportRequest {
  id            String            @id @default(uuid())
  tenantId      String
  tenant        Tenant            @relation(fields: [tenantId], references: [id])
  requestedById String
  requestedBy   User              @relation(fields: [requestedById], references: [id])
  kind          DataExportKind
  status        DataExportStatus  @default(PENDING)
  downloadToken String?           @unique
  expiresAt     DateTime?
  failureReason String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@index([tenantId, kind, createdAt])
}

model AccountDeletionRequest {
  id            String    @id @default(uuid())
  tenantId      String
  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  requestedById String
  requestedBy   User      @relation(fields: [requestedById], references: [id])
  reason        String?
  status        String    @default("SUBMITTED") // SUBMITTED | IN_REVIEW | COMPLETED | CANCELLED
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([tenantId, createdAt])
}
```

Add both relations to `Tenant`/`User` (`dataExportRequests`,
`accountDeletionRequests` — follow the existing relation-naming convention
in the schema, e.g. `User.requestedReportBundles` as the closest analog).

**Reuse, do not reinvent:** `ReportBundle`
(`packages/db/prisma/schema.prisma:2281`) already has an async
generate-then-download-token pattern for report PDFs
(`apps/api/src/reports/`) — read that module in full before writing the
export job; `DataExportRequest`'s worker should follow its exact job/status/
download-token lifecycle, not a new one. Same for storage: use the existing
authenticated storage abstraction the `reports`/`evidence` modules already
use for private files (`implementation-map.md:106-107`) — do not add a new
storage client.

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (new enums/models above)
- Create: migration
- Create: `apps/api/src/privacy/privacy.controller.ts`,
  `privacy.service.ts`, `privacy.module.ts`, `dto/index.ts`
- Create: `apps/api/src/privacy/export-job.worker.ts` (mirror
  `apps/api/src/reports/`'s worker registration exactly — same queue
  mechanism, check what that is first: `grep -rn "Queue\|bull\|pg-boss" apps/api/src/reports`)
- Test: `privacy.controller.spec.ts`, `privacy.service.spec.ts`,
  `export-job.worker.spec.ts`
- Create: `apps/nexsteps-home/src/lib/api/privacy.ts`,
  `src/lib/queries/privacy.ts`
- Create: `apps/nexsteps-home/app/(home)/(tabs)/family/privacy-data.tsx`

**Interfaces:**
- Produces: `POST /privacy/exports` (`{ kind: "FAMILY_DATA" | "REPORT_ARCHIVE" }`)
  → `DataExportRequest` (status `PENDING`); `GET /privacy/exports` → list,
  newest first; `GET /privacy/exports/:id/download` → 302 to the
  authenticated storage URL once `status === "READY"`, 409 while `PENDING`,
  410 once past `expiresAt`. `POST /privacy/deletion-requests`
  (`{ reason?: string }`) → `AccountDeletionRequest`; this endpoint also
  notifies support (reuse whatever the codebase already uses for internal
  notifications — check `apps/api/src/mailer/` before adding a new channel).

- [ ] **Step 1: Read the reports module's async job/download-token pattern in full**

  Run: `cat apps/api/src/reports/*.ts`

  This step has no test of its own — it's the research step that makes
  every following step accurate instead of guessed. Note the exact queue
  library, the exact `DownloadToken`-equivalent field lifecycle, and the
  exact storage-signing helper name before writing Step 4.

- [ ] **Step 2: Write the failing service test for requesting an export**

```ts
// apps/api/src/privacy/privacy.service.spec.ts
describe("requestExport", () => {
  it("creates a pending export request and enqueues the job", async () => {
    prismaMock.dataExportRequest.create.mockResolvedValue({ id: "exp1", status: "PENDING", kind: "FAMILY_DATA" });
    const result = await service.requestExport("FAMILY_DATA", "tenant-1", "user-1");
    expect(prismaMock.dataExportRequest.create).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", requestedById: "user-1", kind: "FAMILY_DATA", status: "PENDING" },
    });
    expect(queueMock.enqueue).toHaveBeenCalledWith("data-export", { exportRequestId: "exp1" });
    expect(result.status).toBe("PENDING");
  });
});
```

  (Replace `queueMock.enqueue`'s call shape with whatever Step 1 found the
  reports module actually calls.)

- [ ] **Step 3: Run test to verify it fails**

  Run: `pnpm --filter api test privacy.service.spec.ts`
  Expected: FAIL — service doesn't exist.

- [ ] **Step 4: Add the Prisma models/migration, then implement the service, controller, and worker**

  Follow the exact structure the reports module uses (Step 1). The worker's
  job: gather `children` (name, age, notes — no photos/binary evidence in
  the zip, link evidence by reference the same way the pack-export flow in
  `regulations-evidence` does — check that flow's "link rather than copy"
  rule at `acceptance-criteria.md:62` applies equally here), `learningLogs`,
  household `preferences`/`notificationPreferences`, then zip
  (`archiver` or whatever the reports module already uses — check before
  adding a new zip library) and upload via the shared storage abstraction,
  then mark `READY` with a signed, expiring `downloadToken`.

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Implement the deletion-request endpoint** (no worker — just
  a row + a support notification)

- [ ] **Step 7: Add negative-authorization tests**

  Confirm a user from a *different* tenant cannot request/download another
  household's export (`acceptance-criteria.md:16`) — this is the one place
  in Plan 08 introducing genuinely new cross-tenant-sensitive data
  (a zip of the whole household's records), so this test is not optional.

- [ ] **Step 8: Frontend — API/query modules and the `privacy-data` screen**

  "Prepare export"/"Prepare" call `POST /privacy/exports`, poll or
  re-fetch `GET /privacy/exports` (`useQuery` with `refetchInterval` while
  any request is `PENDING`, matching however the reports screens already
  poll `report-request`/`report-detail-download` — reuse that polling
  pattern exactly, check `apps/nexsteps-home/app/(home)/(tabs)/progress/report-request.tsx`
  first). "Manage" under "Community profile" links out to
  `community-settings` (existing screen) — do not build a second privacy
  toggle for the same setting. "Review" under "Delete family account" opens
  a confirmation view (explains consequences per `acceptance-criteria.md:35`)
  before calling `POST /privacy/deletion-requests`.

- [ ] **Step 9: Run full verification and commit**

**PR handoff block:**
```text
Approved screens: privacy-data
Owning phase: Phase 7, PR H5e
Production paths: apps/api/src/privacy/*, packages/db/prisma/schema.prisma, apps/nexsteps-home/app/(home)/(tabs)/family/privacy-data.tsx
Data and permission boundary: tenant-scoped, requester-authenticated; cross-tenant negative tests required (new zip-of-household-data surface)
States covered: loading, empty, validation/error, offline/retry, permission denied, success
Release-gate note: deletion is support-routed only in this plan - no automated retention/deletion engine ships here (acceptance-criteria.md release gate item "Data migration and rollback are documented" still applies to the export job itself)
```

---

# Sub-plan 08f: Account & sessions

**Screen:** `account-session` (`/(home)/(tabs)/family/account-session`).

**Highest risk, ship last.** No device-session tracking, no user-facing
password-change endpoint, and no 2FA exist anywhere in this codebase today
(confirmed by a repo-wide grep for `mfa|2fa|totp|revokeSession|logout` with
zero relevant matches). This sub-plan is deliberately specified at design
depth rather than full line-by-line TDD steps — expand it into bite-sized
tasks in its own session when picked up, the same way this repo's own root
plan fully specified Plan 01 but left Plans 02-14 as specifications
(`/Users/JeanFidele/.claude/plans/can-you-look-through-compressed-star.md:343-388`).

**Prerequisite check (do this before writing any code):** 2FA in the
wireframe ("Two-step verification: Authenticator app: On") implies Auth0
Guardian/MFA. Confirm the Auth0 tenant this environment points at has MFA
enabled (Auth0 dashboard → Security → Multi-factor Auth) before building
against `/mfa/associate`. If it isn't enabled, ship password-change and
session management now; add the 2FA toggle as a follow-up once MFA is
turned on tenant-side — do not build UI for a capability the tenant can't
actually perform yet.

**New model — independent of Auth0's session-list API (per the product
decision recorded above), because that API's availability varies by Auth0
plan tier:**

```prisma
model AuthSession {
  id           String    @id @default(uuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  deviceLabel  String    // e.g. "iPhone · Safari", derived from client-reported platform info, not raw user-agent sniffing
  ipAddress    String?
  city         String?   // coarse only, resolved server-side from ipAddress if a geo lookup is already used elsewhere in the codebase - check before adding a new geo-IP dependency
  lastSeenAt   DateTime  @default(now())
  createdAt    DateTime  @default(now())
  revokedAt    DateTime?

  @@index([userId, revokedAt])
}
```

**How a session gets registered and enforced (the part that makes this a
real security control, not just a display list):** the mobile app
generates one random session id at login time and sends it on every
authenticated request as a header (name it consistently with how the app
already names custom auth headers — check `src/lib/api/http.ts`'s existing
header set first, e.g. alongside the bearer token). A new lightweight guard
addition (extend `AuthUserGuard` or add a small companion guard run after
it) looks up `AuthSession` by that header value + `request.authUserId` and
rejects with 401 if `revokedAt` is set — this is what makes "sign out this
device" actually terminate access rather than just remove a row from a
list nobody enforces against. Registering a session (first authenticated
call after Auth0 login) upserts the `AuthSession` row; every subsequent
request opportunistically bumps `lastSeenAt` (rate-limit this to, say, once
per 5 minutes per session to avoid a write on every request — a `ponytail:`
note here is warranted: "write-through on every request is the ceiling
worth avoiding; a scheduled/batched lastSeenAt flush is the upgrade path if
this becomes a hot path").

**Password change:** `Auth0ManagementService.verifyPassword` already exists
(`apps/api/src/auth/auth0-management.service.ts:182`) but nothing calls
Auth0's password-change endpoint. Add a `changePassword(userId, newPassword)`
method (Auth0 Management API `PATCH /api/v2/users/{id}` with a `password`
field) and a `POST /auth/password` endpoint that first re-verifies the
current password via the existing `verifyPassword` before calling it —
never allow a password change without re-proving the current one, even
though the request is already authenticated (this is a standard
step-up check for a credential-change action, not redundant).

**Sign-out / sign-out-others:** "Sign out" = client discards its local
token + calls Auth0's logout endpoint (check whether
`apps/nexsteps-home/src/lib/auth/` already has a logout function — if
`apps/mobile` has one, mirror it rather than inventing a second logout
flow) + marks its own `AuthSession` row revoked. "Sign out other sessions" =
`POST /auth/sessions/revoke-others` marks every `AuthSession` for that user
except the caller's own revoked.

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (new `AuthSession` model)
- Create: migration
- Create: `apps/api/src/sessions-auth/` (new module name — do not reuse
  `apps/api/src/sessions/`, which is the unrelated class-scheduling
  `Session` model; a name collision there would be a real bug, not a style
  nit) with `sessions-auth.controller.ts`, `.service.ts`, `.module.ts`,
  `session-guard.ts`
- Modify: `apps/api/src/auth/auth0-management.service.ts` (add
  `changePassword`)
- Test: full spec coverage for the new module, plus a guard test proving a
  revoked session's subsequent request is rejected (this is the test that
  actually validates the security property, not just the CRUD)
- Modify: `apps/nexsteps-home/src/lib/api/http.ts` (attach the session-id
  header to every request; generate/persist the session id at login)
- Create: `apps/nexsteps-home/src/lib/api/account-session.ts`,
  `src/lib/queries/account-session.ts`
- Create: `apps/nexsteps-home/app/(home)/(tabs)/family/account-session.tsx`

**Interfaces:**
- Produces: `GET /auth/sessions` → `AuthSession[]` (current user's own,
  `revokedAt: null`, newest `lastSeenAt` first, with a `isCurrent: boolean`
  flag computed server-side by comparing to the requesting session-id
  header); `POST /auth/sessions/:id/revoke`; `POST /auth/sessions/revoke-others`;
  `POST /auth/password` (`{ currentPassword: string, newPassword: string }`).

**States:** same six as every other screen, plus one this screen is unique
in needing to get right: after "Sign out other sessions" succeeds, the
*current* device's list must re-fetch and show only itself — a stale list
that still shows a just-revoked device as active would be a real, visible
bug in a security-sensitive screen, not a cosmetic one.

**PR handoff block:**
```text
Approved screens: account-session
Owning phase: Phase 7, PR H5f
Production paths: apps/api/src/sessions-auth/*, apps/api/src/auth/auth0-management.service.ts, packages/db/prisma/schema.prisma, apps/nexsteps-home/app/(home)/(tabs)/family/account-session.tsx
Data and permission boundary: a session may only read/revoke its own user's AuthSession rows; password change requires re-verifying the current password
States covered: loading, empty, validation/error, offline/retry, permission denied, success (+ post-revoke list re-fetch correctness)
Prerequisite: Auth0 tenant MFA enablement confirmed before building the 2FA toggle; ships without it otherwise
```

---

## Self-review notes (writing-plans skill, run against this plan)

- **Spec coverage:** all 8 `screen-inventory.json` `family-settings` IDs are
  covered across 08a-08f; every `implementation-map.md` H5 boundary
  ("existing auth patterns; no cross-household access") is respected — no
  sub-plan reads/writes another tenant's data, and 08c explicitly declines
  to build anything Community-adjacent.
- **Placeholder scan:** every new endpoint has a concrete path, method, and
  request/response shape; every new Prisma field/model has concrete field
  names and types; no "TBD"/"add validation" left unfilled. The two
  intentionally lighter sub-plans (08e's job internals, 08f entirely) are
  labelled as specification-depth, not claimed as full TDD task lists —
  that's a stated scope choice, not an oversight.
- **Type consistency:** `PlanningPreferences`/`NotificationPreferences`
  field names match between the Zod schema (08b Step 4), the service (Step
  5), and the frontend type (Step 9) — `weekStartsOn`, `timeFormat`, etc.
  are spelled identically throughout. `useUpdateChild`'s `{ id, input }`
  shape (08a) matches its call site pattern used again nowhere else, so no
  drift risk there.
