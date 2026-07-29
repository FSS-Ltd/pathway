# NexSteps Home Implementation Map

This document maps the approved product flows to Pathway's production
boundaries. It is an implementation guide, not permission to skip the owning
Phase 4, 7 or 8 plan.

## Flow-to-production map

| Flow group                | Screens | Owning phase      | Candidate mobile surface                                                 | Backend and data boundary                                                                          |
| ------------------------- | ------: | ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `setup`                   |       9 | Phase 7           | `(auth)` followed by the Home/family setup stack                         | Auth0, household creation, `Child`, guardian relationships, learning-week preference               |
| `week-today`              |       8 | Phase 7           | Family tabs for Week and Today plus activity/task/calendar detail routes | Household-scoped activity, task and calendar APIs; Learning log integration                        |
| `progress`                |       9 | Phase 4 + Phase 7 | Family Progress tab and child-scoped detail routes                       | `Subject`, `LearningLog`, `Evidence`, `ReportBundle`                                               |
| `community-families`      |       8 | Phase 8           | Community preview, opt-in, directory, profile and connection stack       | Opt-in profile, coarse location, household connection requests                                     |
| `community-conversations` |       5 | Phase 8           | Community channel, thread and adult introduction routes                  | Dedicated cross-household Community policy and text content models                                 |
| `community-meetups`       |       8 | Phase 8           | Meetup discovery, RSVP, host and safety routes                           | Public-venue meetup, adult/household RSVP, blocking and reporting                                  |
| `family-settings`         |       8 | Phase 7           | Family tab and nested settings routes                                    | Children, adults, permissions, preferences, membership, privacy and sessions                       |
| `regulations-evidence`    |      17 | Phase 7 extension | `Family > Regulations & Evidence` stack                                  | Jurisdiction content, household preparedness, evidence links, correspondence, pack and share audit |
| `moderation`              |       4 | Phase 8           | Platform-admin moderation surface, not a household route                 | Platform moderator role, content snapshot, report, action, appeal and audit                        |

The exact 76 screen IDs and navigation targets are in
[screen-inventory.json](screen-inventory.json).

## Mobile route approach

The current production family route group contains the static `home`, `updates`
and `account` tabs. Do not replace all three in one large change.

Recommended migration:

1. Add a Home-education-gated parent shell using the existing Expo Router and
   `packages/mobile-core` space resolution.
2. Introduce Week and Today behind the new Home entitlement/capability.
3. Connect Progress to the Phase 4 Learning APIs.
4. Introduce Family as the settings and preparedness entry point.
5. Add Community last, after its API boundaries and consent state are live.
6. Retire old hardcoded Family Space routes only after equivalent live routes
   and rollback coverage exist.

Candidate route names must follow the current Expo Router tree when each slice
starts. The screen IDs remain stable even when a route filename changes.

## API boundaries

### Private household APIs

Private household modules may include:

- household setup and profile;
- week/activity planning;
- tasks and calendar;
- learning logs and evidence;
- report bundles;
- family people and permissions;
- Regulations & Evidence.

They use the existing request context, tenant boundary, guardian-child checks,
storage authorisation and audit conventions. A client-provided tenant ID is
never trusted.

### Community APIs

Community is the first deliberate cross-household feature. It must use a
dedicated module and explicit policy path. Do not relax a shared tenant guard.

Minimum domains:

- `CommunityProfile`
- `CommunityConnection`
- `CommunityChannel`
- `CommunityThread`
- `CommunityPost`
- `CommunityMeetup`
- `CommunityMeetupRsvp`
- `CommunityBlock`
- `CommunityReport`
- moderation action/audit records

Names may change during the Phase 8 design pass, but the child-data exclusion
and opt-in boundary may not.

### Regulations & Evidence APIs

Recommended mobile-facing boundary:

- `GET /family/regulations/overview`
- `GET /family/regulations/requirements`
- `GET /family/regulations/requirements/:id`
- `PATCH /family/regulations/requirements/:id/preparedness`
- `GET /family/regulations/updates`
- `GET /family/regulations/updates/:id`
- `GET /family/regulations/evidence`
- `POST /family/regulations/evidence-links`
- `POST /family/regulations/correspondence`
- `PATCH /family/regulations/correspondence/:id`
- `POST /family/regulations/evidence-packs`
- `POST /family/regulations/evidence-packs/:id/finalise`
- `POST /family/regulations/evidence-packs/:id/shares`
- `DELETE /family/regulations/evidence-packs/:id/shares/:shareId`

Official-content review APIs are separate from household APIs and require a
dedicated platform role.

## Storage and jobs

Use the existing authenticated storage abstraction for private evidence. New
files stay quarantined until scanning succeeds.

Worker-owned tasks include:

- report and evidence-pack generation;
- malware scanning and controlled derivatives;
- notification delivery;
- official-source monitoring and change detection;
- share expiry and audit maintenance.

Automated source monitoring may propose a change. It may not publish a legal
summary without the required human review.

## Capabilities and entitlements

Capabilities are additive:

- Home-education vertical capabilities grant the core household and Learning
  behaviours approved in Phase 7.
- Community participation requires current household opt-in in addition to any
  product entitlement.
- Regulations content-review and Community moderation use dedicated
  platform-level permissions.
- No Home capability is added to an ACE vertical grant map.
- No existing ACE capability is renamed to make room for Home.

Each capability change requires the existing definition/completeness tests and
negative access tests.

## Merge-safe delivery sequence

Each row is intended to be independently reviewable and revertible.

| Slice | Outcome                                                        | Merge-safety boundary                                |
| ----- | -------------------------------------------------------------- | ---------------------------------------------------- |
| H0    | Repository-owned design handoff                                | Documentation and standalone prototype only          |
| H1    | `HOME_EDUCATION` vertical, capabilities and household decision | Additive enums/maps; no UI                           |
| H2    | Home shell and setup                                           | Home/family routes only; existing spaces preserved   |
| H3    | Week, Today, tasks and calendar                                | Private household module; no Community               |
| H4    | Progress integration                                           | Consume Phase 4 interfaces; do not refactor Learning |
| H5    | Family people, permissions and privacy                         | Existing auth patterns; no cross-household access    |
| H6    | Regulations content and household data foundations             | Migrations separate from consumers                   |
| H7    | Regulations mobile flow and evidence packs                     | Private household routes only                        |
| H8    | Community opt-in, directory and connection                     | Narrow cross-household read path                     |
| H9    | Community conversations                                        | Text-only and opted-in                               |
| H10   | Public-venue meetups                                           | Adult/household RSVP only                            |
| H11   | Moderation, appeals and operating controls                     | Platform role and full audit                         |

## PR handoff template

Every implementation PR should state:

```text
Approved screens:
- <screen-id>

Owning phase:
- Phase <number>, PR <slice>

Production paths:
- <exact changed paths>

Data and permission boundary:
- <tenant, guardian-child, opt-in or platform-moderator rule>

States covered:
- loading
- empty
- validation/error
- offline/retry
- permission denied
- success

Validation:
- unit/type/lint commands
- API integration or contract tests
- mobile E2E journey
- iPhone and Pixel design comparison
```

If a PR cannot identify its approved screen IDs or a non-visual platform
contract that enables them, it is not ready to implement.
