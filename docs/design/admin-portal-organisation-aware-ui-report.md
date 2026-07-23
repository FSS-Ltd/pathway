# Admin Portal Organisation-Aware UI Report

**Date:** 2026-07-23
**Scope:** Admin portal navigation, screen visibility, and organisation-specific wording
**Status:** Recommendation for the next admin-portal implementation PR

## Executive recommendation

The admin portal should resolve its presentation from the organisation's `vertical`, with `sector` as the fallback. The current portal has the data needed for this decision, but the navigation and feature-visibility layer still treats every organisation alike.

For churches, the interface should read like a church operations platform rather than a generic childcare or education system. The primary vocabulary should be **People**, **Services**, **Rotas**, **Groups**, **Giving**, **Gift Aid**, **Pastoral follow-up**, **Children and youth**, **Events**, and **Safeguarding**. For schools, nurseries, charities, and clubs, the same underlying capabilities should be presented using the terms their teams use every day.

This is a presentation and routing change. It does not require separate data models for each organisation type.

## Evidence and terminology research

The terminology below is based on current language used by established church-management products, with UK-specific wording taken from ChurchSuite:

| Source | Terms and patterns observed | Implication for Nexsteps |
| --- | --- | --- |
| [Planning Center CHMS](https://www.planningcenter.com/use-cases/chms) | People, Groups, Events, attendance, volunteer scheduling, services, giving, workflows, prayer requests, check-in, pastoral follow-up | Church navigation should foreground relationships, ministry participation, services, and follow-up rather than lessons and classes. |
| [Planning Center Check-Ins](https://www.planningcenter.com/check-ins) | People, Registrations, Calendar, Services, Check-Ins, children’s ministry, household details, safety forms | Children’s ministry should have a clear check-in and safeguarding path linked to households and events. |
| [Planning Center Registrations](https://www.planningcenter.com/registrations) | Signups, events, attendee groups, attendance, check-in, payments | Use “Events” and “Sign-ups” for church participation flows. “Registration” is useful for an event workflow, not as the name of the whole people area. |
| [Tithely Church Management / Breeze](https://www.breezechms.com/) | People, Groups, Events, Service Planning, Forms, Giving, volunteer management, check-in and name tags, attendance and giving reports | “People” and “Groups” are more natural church terms than “Users” and “Classes”. “Service Planning” is a recognised church workflow. |
| [ChurchSuite](https://churchsuite.com/) | Rotas, communications, teams, youth and children ministry, donations, Gift Aid, attendance, engagement | For UK churches, “Rota” and “Gift Aid” should be first-class labels. “Donation” should not replace “Giving” in the day-to-day navigation. |

These products use different product names, but the shared mental model is consistent: a church platform organises people into households and groups, coordinates services and volunteers, records attendance and giving, and supports pastoral and safeguarding work.

## Current portal findings

The current implementation exposes most of the same routes to every organisation:

- `apps/admin/app/admin-shell.tsx` defines one mostly universal sidebar.
- `apps/admin/lib/sector-visibility.ts` currently returns `true` for every feature and is explicitly a placeholder.
- `apps/admin/app/settings/page.tsx` displays sector as read-only and lets an admin change vertical, but that context does not yet drive the portal shell.
- The portal currently labels routes as `Children`, `Parents & Guardians`, `Lessons`, `Classes`, `Sessions & Rota`, `Learning`, and `Guest pass` even when the organisation is a church, charity, or club.
- The API already exposes `sector` and `vertical`. The vertical capability endpoint is useful for base previews, but it is not the authority for an organisation's paid or enabled feature set.

The immediate problem is not missing data. It is that the same operational vocabulary is shown to different kinds of organisations.

## Recommended context resolution

Use this precedence when building the admin UI context:

1. `vertical`, when present. This distinguishes Independent, ACE, and State School.
2. `sector`, when vertical is absent. This supports existing organisations during migration.
3. A neutral fallback until the organisation context has loaded.

Presentation visibility must be the intersection of the resolved organisation policy and the authoritative active capability set from `/platform/capabilities`. The vertical preview endpoint (`/platform/verticals/:vertical/capabilities`) must not be treated as proof that a paid module is active.

The resolved context should be loaded once in the admin shell and shared with:

- sidebar navigation;
- page titles and breadcrumbs;
- dashboard cards and empty states;
- button labels and confirmation copy;
- route-level access checks;
- organisation settings and onboarding.

Do not implement this by hiding links only. Direct navigation must be checked against the same sector and capability policy on the server and in the API.

## Navigation and screen matrix

The table describes the first screen set to show. “Rename” means the existing route can remain while its visible label changes. “New screen” means the product needs a dedicated route or a clearly scoped view before the label should be added to navigation.

| Organisation context | Show first | Rename or hide | Notes |
| --- | --- | --- | --- |
| **Church** | Today, People, Groups, Services, Rotas, Events, Attendance, Giving, Gift Aid, Children and Youth, Safeguarding, Pastoral follow-up, Notices, Reports | Rename `Sessions & Rota` to `Services & Rotas`; rename `Guest pass` to `Visitor check-in` or hide until the workflow is church-ready; hide `Classes`, `Lessons`, `Parents & Guardians`, and school-only `Learning` | Keep services and rotas prominent. Treat households, groups, visitors, volunteers, giving, and safeguarding as the core church operating model. |
| **Independent School** | Today, Students, Parents & Guardians, Classes, Lessons, Sessions, Attendance, Safeguarding, Handover, Notices, Reports | Rename `Children` to `Students` or `Pupils` according to the school's chosen language; keep `Learning` as curriculum or learning records | Do not show Giving, Gift Aid, Services, or church-specific pastoral labels. |
| **ACE School** | Today, Students, Parents & Guardians, Classes, PACE/Learning, Attendance, Sessions, Safeguarding, Handover, Notices, Reports | Rename `Lessons` to `PACE work` where that is the configured operating model | Keep the ACE-specific term visible after the vertical is selected. Do not make the generic school interface carry the explanation. |
| **State School** | Today, Pupils, Parents & Carers, Classes, Lessons, Attendance, Sessions, Safeguarding, Handover, Notices, Reports | Prefer `Pupils` and `Parents & Carers` if the school selects UK public-sector language | Hide Giving, Gift Aid, Services, and church ministry views. |
| **Nursery** | Today, Children, Families, Rooms/Groups, Sessions, Attendance, Handover, Safeguarding, Notices, Reports | Rename `Classes` to `Rooms` or `Groups`; rename `Parents & Guardians` to `Families`; keep `Guest pass` only if it is used for authorised collection | Nursery staff need fast child, family, attendance, handover, and safeguarding access. |
| **Charity** | Today, People or Beneficiaries, Programmes, Events, Volunteers, Attendance/Outcomes, Safeguarding, Notices, Reports | Rename `Children` to `People` or `Beneficiaries`; hide Classes, Lessons, Parents & Guardians, and Gift Aid unless explicitly enabled | The portal should not imply a school or church model. Use the charity's configured beneficiary term where available. |
| **Club** | Today, Members, Groups/Teams, Fixtures or Sessions, Events, Attendance, Volunteers, Safeguarding, Notices, Reports | Rename `Children` to `Members`; rename `Sessions & Rota` to `Sessions` or `Fixtures`; show Guardians only when the club is configured as youth-focused | Keep the member and team relationship central. Avoid church-only Giving and pastoral labels. |

## Church screen and copy specification

### Shell and dashboard

Use:

- shell title: `Church admin` or the church's own name, not only `Nexsteps Admin`;
- dashboard heading: `Today at {churchName}`;
- dashboard subheading: `Keep your people, services, teams, and pastoral work moving.`;
- cards: `Upcoming services`, `Volunteer gaps`, `Attendance this week`, `Giving this month`, `Open pastoral follow-ups`, and `Safeguarding items`;
- empty state: `Your church week is clear. Add a service, event, or follow-up to get started.`

Avoid:

- `school`, `class`, `lesson`, `parent`, `pupil`, or `student` on church screens;
- `donations` as the main navigation label when `Giving` is the more familiar day-to-day term;
- generic `users` when the screen is about congregants, visitors, volunteers, or households.

### People and relationships

Recommended labels:

- `People` for the central directory;
- `Households` for family relationships and contact details;
- `Visitors` for first-time or occasional attendees;
- `Groups` for small groups, Bible studies, life groups, and ministry teams;
- `Follow-ups` for pastoral contacts and workflow reminders;
- `Prayer requests` as a distinct feature only when the product supports its permissions and retention rules.

Use `member` only when membership status is meaningful. A church directory commonly includes members, regular attenders, visitors, volunteers, and contacts who should not be collapsed into one status.

### Services, rota, and attendance

Recommended labels:

- `Services` for worship-service planning;
- `Rotas` for volunteer schedules;
- `Teams` for worship, welcome, production, children, youth, and other serving teams;
- `Events` for non-service gatherings such as small-group meetings, courses, outreach, and community events;
- `Attendance` for service, group, event, and children’s check-in records;
- `Check-in` for child and volunteer arrival workflows;
- `Handover` or `Ministry handover` for operational notes between teams.

The existing `Sessions & Rota` route can become `Services & Rotas` for churches, while the underlying data route remains stable during the migration.

### Giving and finance

Recommended labels:

- `Giving` as the top-level screen;
- `Funds` for designated or restricted giving categories;
- `Gift Aid` for UK declaration and claim workflows;
- `Statements` for donor/member giving statements;
- `Giving reports` for finance reporting;
- `Billing` only for the church's Nexsteps subscription and invoices.

Keep the distinction explicit: `Giving` is the church's operational record of contributions; `Billing` is the organisation's software subscription.

### Children, youth, and safeguarding

Use `Children & Youth` as a church ministry area. Within it, use `Check-in`, `Groups`, `Leaders`, `Attendance`, and `Safety information` where those functions exist. Keep sensitive details behind role-based access. Do not make a church user navigate through school-style `Classes` and `Parents & Guardians` to find children’s ministry work.

Use `Safeguarding` as the primary term. `Concerns`, `Notes`, `Incident`, `Disclosure`, and `Follow-up` should describe the workflow stages, with permissions and retention visible to authorised staff.

## Copy system by context

The UI should use a small terminology dictionary rather than scattered conditionals. A possible shape is:

```ts
type OrganisationCopy = {
  people: string;
  children: string;
  guardians: string;
  groups: string;
  sessions: string;
  attendance: string;
  volunteer: string;
  finance: string;
  followUp: string;
};
```

The dictionary should be selected from `vertical`, then `sector`, and passed to shared page components. It should control labels and helper copy only. Access and capability rules must remain separate from copy so a renamed screen cannot accidentally grant access.

Suggested baseline dictionaries:

| Context | People | Children | Guardians | Groups | Sessions | Finance | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Church | People | Children & Youth | Households | Groups | Services & Rotas | Giving | Pastoral follow-up |
| Independent/State School | Students/Pupils | Students/Pupils | Parents & Guardians / Parents & Carers | Classes | Sessions | Finance | Student support |
| ACE School | Students | Students | Parents & Guardians | Classes / PACE groups | Sessions | Finance | Student support |
| Nursery | Families | Children | Families | Rooms/Groups | Sessions | Finance | Handover follow-up |
| Charity | People/Beneficiaries | Participants | Contacts | Programmes/Groups | Activities | Funding | Case follow-up |
| Club | Members | Members | Guardians when youth-focused | Teams/Groups | Fixtures/Sessions | Membership | Member follow-up |

## Implementation sequence

1. Add a typed `OrganisationUiContext` resolver in the admin app. Include sector, vertical, labels, and presentation visibility.
2. Replace the placeholder `SECTOR_FEATURES` map with a policy that returns visible navigation and copy for each context. It must not manufacture capabilities.
3. Refactor `AdminShell` to consume the policy and context once. Keep route URLs stable where possible and change visible labels first.
4. Add server-side route guards for hidden or unsupported sections. A hidden sidebar item is not an access boundary.
5. Update dashboard cards, page headings, empty states, and action labels using the same copy dictionary.
6. Deliver the first admin PR as a focused terminology/navigation phase: context resolution, navigation policy, copy dictionary, route guards, and tests. Do not expose labels for workflows that do not yet have a corresponding screen.
7. Design and deliver `Groups`, `Services`, `Rotas`, `Giving`, `Gift Aid`, and `Pastoral follow-up` as separate feature phases. Each phase needs its own API, data model, permissions, retention, and privacy review before navigation exposure.
8. Pilot the terminology/navigation phase with one church, one nursery, and one school before applying the default policy to existing organisations.

## Acceptance criteria for the next admin PR

- A Church organisation never sees `Classes`, `Lessons`, or `Parents & Guardians` in its primary navigation.
- A Church organisation sees the labels supported by its active capabilities, using `People`, `Services & Rotas`, `Groups`, `Giving`, `Safeguarding`, and church-specific dashboard copy where those screens exist.
- A school does not see `Giving`, `Gift Aid`, `Services`, or pastoral labels unless an explicitly enabled capability requires them.
- A nursery uses `Children`, `Families`, `Rooms`, `Sessions`, and `Handover`; a charity uses `Beneficiaries` or `Participants`, `Programmes`, `Activities`, and `Case follow-up`; a club uses `Members`, `Teams`, `Fixtures`, and `Membership`; an ACE school uses `PACE` where configured; Independent and State schools use their selected `Students`/`Pupils` and `Parents & Guardians`/`Parents & Carers` terms.
- Direct navigation to a hidden route is rejected or redirected according to the same policy.
- `vertical` overrides `sector` for Independent, ACE, and State School copy.
- Every context has a tested fallback for missing or loading organisation data.
- Existing URLs remain stable during the first label migration, with aliases or redirects where a new route is introduced.

## Sources

- [Planning Center](https://www.planningcenter.com/)
- [Planning Center as a Church Management System](https://www.planningcenter.com/use-cases/chms)
- [Planning Center Check-Ins](https://www.planningcenter.com/check-ins)
- [Planning Center Registrations](https://www.planningcenter.com/registrations)
- [Tithely Church Management / Breeze](https://www.breezechms.com/)
- [ChurchSuite](https://churchsuite.com/)
