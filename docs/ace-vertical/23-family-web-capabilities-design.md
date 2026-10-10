# Family web navigation capabilities

**Build step 1.3e5m.** This is the web portion of ACE-M18 for the family
landing. Mobile navigation and the broader M16 family read facade remain
separate work.

## Problem and approach

`GET /ace/family/contexts` already discovers current full guardian-child and
enabled student self links, but `/ace/family` renders every destination as a
fixed link. A disabled parent messaging or notice permission still leaves a
link that opens a denial. School volunteering only exists for ACE schools.

Add a bounded `sections` array to each returned context. Attendance, sessions,
and subject timetables are available for a discovered child context; their
existing readers independently enforce publication of individual records.
Parent notice and message entries additionally require the same active global
permission definition as their readers. Both readers exclude accounts that
also have a student identity at the site. Volunteering requires the ACE school
vertical. The web page renders only the sections the endpoint returns, using
the existing family routes and styling. School entries are deduplicated from
eligible parent contexts.

## Data, security, and failure behavior

No schema or migration is needed. Candidate site IDs come from the existing
identity RLS read, and current relationships and portal policy are checked in
each site's tenant RLS transaction. Identity discovery and the family
attendance and timetable readers require an active internal user, so disabling
an account removes navigation and blocks direct reads. Active permission
definitions are platform-global and read once for the response. The response
contains section names only, not permission records, unpublished content, or
other families' data. Each destination retains its own tenant, relationship,
permission, and publication checks; navigation capabilities are a convenience,
not authorization.
If discovery fails, the existing error and retry state remains. If a link is
revoked after discovery, its destination returns its existing denial and a
refresh removes it. Unpublished timetable content remains hidden by the
existing reader even when the timetable section is visible.

## Rollout and verification

Deploy the API before the web app. During a staggered rollout, the web client
normalizes an older response without `sections` to an empty list, so it hides
links until the new API is available. Rollback both to the prior release; no
data rollback is required. Verify linked parent, student, disabled permission,
non-ACE volunteering, and revoked-link responses in API tests; verify rendered
links and sign-in, empty, error, and retry states in the web test. A successful
result is that family navigation offers only currently usable web sections,
while direct URL requests remain protected by their own reader.
