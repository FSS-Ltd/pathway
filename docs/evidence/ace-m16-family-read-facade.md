# ACE-M16 family read facade: first web slice

**Build step:** 1.3e5v. **Plan task:** ACE-M16, still incomplete. Mobile work is
paused.

The family overview accepts a site and child ID, but derives authority from a
current full guardian relationship in that site, an active ACE school enrolment,
an active account, and the active parent progress permission inside the tenant
RLS context. A student identity at the site cannot use the guardian facade.
The service checks the relationship again after reading the sections so a
revocation during the request does not return a partially assembled response.
Missing authority returns the same 404 response as a missing child.

| Section    | Current release decision                                                                                                                                                                                  | Disable flag                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Attendance | Current child's recorded daily marks from the last 30 calendar days, via the existing parent attendance reader. Unmarked days are not interpreted as absences.                                            | `ACE_FAMILY_FACADE_ATTENDANCE_ENABLED=false` |
| Notices    | Up to three published, delivered notices from the existing guardian inbox. This is a school/guardian scope across linked children, labelled as such in the web view. Only ID and title leave this facade. | `ACE_FAMILY_FACADE_NOTICES_ENABLED=false`    |
| Messages   | Unread count from the existing guardian-school conversation reader. This is a school/guardian scope across linked children, labelled as such in the web view. Message text does not leave this facade.    | `ACE_FAMILY_FACADE_MESSAGES_ENABLED=false`   |
| Homework   | Unavailable: no released assignment/response reader is established. An unsubmitted response must never be treated as released.                                                                            | No reader enabled                            |
| Reports    | Unavailable: the compilation/draft models do not yet provide a reviewed, published family projection. Embargoed drafts must never be shown.                                                               | No reader enabled                            |
| Slips      | Unavailable: no signed family read/response projection is established.                                                                                                                                    | No reader enabled                            |
| Faith      | Unavailable: no reviewed and audience-scoped family release reader is established.                                                                                                                        | No reader enabled                            |
| Finance    | Unavailable: no permitted school-finance summary scope is established.                                                                                                                                    | No reader enabled                            |

Each enabled reader is called independently. A section failure returns a
generic error for that section while the other released sections remain
available. All unavailable sections are explicit in the API contract and are
hidden from the web overview. The three server flags default to enabled and
can disable a supported section without deploying the web app. The overview
link is advertised only for an active ACE enrolment and current parent progress
permission; the endpoint repeats every access check.

The PostgreSQL HTTP suite covers two linked children with separate attendance,
limited and unrelated guardians, ended enrolment, a supplied child ID from
another site, anonymous access, relationship revocation, and one failed
section, released field minimisation, and an independent section disable flag.
The web unit test covers released content, section error and retry, denied
access, and signed-out state. The missing homework, report, slip, Faith, and
finance release readers and their embargo/unsubmitted tests are required
before ACE-M16 can be counted complete.
