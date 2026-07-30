# NexSteps Home Product Contract

**Status:** Approved

**Approved:** 28 July 2026

**Primary users:** UK home-educating parents and invited trusted adults

**Primary surface:** Expo React Native mobile app

## Product promise

NexSteps Home gives a homeschooling family the useful structure of an
organisation without turning the parent into a school administrator. A parent
should understand what to do next immediately, without a tutorial.

The product helps a family:

- organise its week and today;
- record learning and evidence quickly;
- understand progress without punitive school language;
- prepare reports and evidence packs;
- find other opted-in home-educating adults safely;
- keep family permissions, privacy and membership clear;
- stay prepared for relevant official requirements.

## Approved navigation

After setup, the permanent parent navigation is:

`Week · Today · Community · Progress · Family`

Setup begins as an ascending three-action path:

1. Add the first child.
2. Choose the family's learning days or flexible-week preference.
3. Plan the first activity.

On completion, the setup surface becomes Week. An incomplete setup may be
skipped and resumed without producing a dead-end dashboard.

## Approved feature areas

| Area                   | Outcome                                                                | Detailed source                                         |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Setup                  | Reach a useful family week in three clear actions                      | [Community and family flows](community-user-flows.md)   |
| Week & Today           | Plan, follow, move and complete the family's rhythm                    | [Community and family flows](community-user-flows.md)   |
| Progress               | Review logs, evidence, subjects and report bundles                     | [Community and family flows](community-user-flows.md)   |
| Community              | Discover families, connect mutually, discuss and meet safely           | [Community and family flows](community-user-flows.md)   |
| Family                 | Manage children, adults, permissions, preferences, data and membership | [Community and family flows](community-user-flows.md)   |
| Regulations & Evidence | Follow verified UK guidance, organise evidence and share deliberately  | [Regulations and Evidence](regulations-and-evidence.md) |
| Moderation             | Review cross-household reports with least privilege and audit          | [Community and family flows](community-user-flows.md)   |

## Experience rules

1. One visually dominant primary action per screen.
2. Teach by creating useful data; do not add tutorial carousels or coach marks.
3. Use family language: `family week`, `learning day`, `activity`, `learning
record`, `save learning`.
4. Keep household information private by default.
5. Show parents exactly what Community shares before they opt in.
6. Require mutual adult consent before opening a private introduction.
7. Use descriptive progress and learning rhythm, not comparative scores or
   punitive attendance language.
8. Preserve drafts and recover from interruption.
9. Make empty, loading, error, permission and offline states useful and calm.
10. Never communicate a critical state through colour alone.

## Household and permission boundary

The recommended Phase 7 model is one lightweight `Org` with one `Tenant` per
household. The final implementation decision remains owned by Phase 7, but no
screen may weaken these rules:

- every child, learning log, evidence item, task, correspondence item and
  report is household/tenant scoped;
- each child request checks the guardian-child relationship;
- tutors and mentors receive explicit, narrow access;
- household permissions never imply Community moderation authority;
- private file access is authenticated and audited.

## Community boundary

Community is a core top-level surface but remains opt-in and off by default.

Community DTOs and screens must never expose:

- child IDs, names, ages, dates of birth or photos;
- child counts or learning stages for matching;
- learning logs, subjects, attendance, evidence or reports;
- household postcode, coordinates, exact distance or home address;
- private contact details before a deliberate adult choice.

Community MVP content is adult-authored text. Directory matching uses coarse
area, household interests, adult availability and meetup preference. Meetups
use public venues or approved online locations. Blocking is immediate.
Reported posts use the fail-safe visibility behaviour approved in Phase 8 until
an explicit product decision replaces it.

## Regulations & Evidence boundary

Regulations & Evidence is a verified preparedness hub, not a legal adviser.

- Launch content covers England, Wales, Scotland and Northern Ireland as
  separate scopes.
- The product uses `Prepared`, `In progress`, `Needs review` and `Not reviewed`.
- It never labels a household legally compliant or guarantees a right to home
  educate.
- Every requirement and update carries official-source provenance,
  jurisdiction, effective date, verification state and review date.
- High-impact summaries require human editorial review before publication.
- Community discussions cannot create or edit regulatory requirements.
- Existing private evidence is linked rather than duplicated.
- Evidence sharing is scoped, previewed, expiring, revocable and audited.

Persistent meaning:

> NexSteps helps you organise official information and your family's evidence.
> It does not provide legal advice or guarantee compliance.

## Visual contract

- White base surfaces.
- Mint `#76D7C4` for primary actions and active product states.
- Yellow `#FFD166` for one current-focus highlight.
- Charcoal `#333333` for primary text and text on mint/yellow.
- Nunito headings and Quicksand body text.
- Rounded, calm surfaces with restrained shadow and no nested-card stacks.
- Minimum 44x44pt touch targets and WCAG 2.2 AA contrast.

The production source of truth is the existing mobile token package. See
[design-system.md](design-system.md).

## Explicit non-goals

- A school MIS recreated for the home.
- Child accounts or child-to-child Community messaging in MVP.
- Public social profiles, public Community indexing or anonymous posts.
- Home-address meetups.
- Community media attachments in MVP.
- Public or unauthenticated report/evidence links.
- Automatic curriculum recommendations.
- Legal advice, representation or compliance certification.
- Automatic replies to government or local-authority correspondence.
- Unreviewed web scraping presented as verified official information.

## Decisions still requiring human approval

- NexSteps Home pricing and the point at which payment is required.
- Final household/guardian Community consent rule.
- UK coarse-location granularity.
- Community moderation staffing, retention and appeal policy.
- Final household-to-Org/Tenant decision.
- App Store-compliant purchase route.
- Regulations content-review ownership and service-level expectations.

These open decisions block only their owning implementation slices. They do not
authorise an implementer to silently choose a materially different product
behaviour.
