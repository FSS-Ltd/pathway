# ACE-M17 student self facade: first web slice

**Build step:** 1.3e5x in
[PR #574](https://github.com/FSS-Ltd/pathway/pull/574). **Plan task:** ACE-M17,
still incomplete. Mobile work is paused.

The student summary route takes only a site ID. It derives one current child
from a student identity link inside the tenant RLS context, requires an active
ACE school enrolment and enabled student portal, and checks the link again
after loading attendance. A missing, disabled, or ambiguous link returns the
same 404 as an unavailable site. The web landing advertises the overview only
for a current ACE student enrolment. The API repeats the checks on every read.

| Section    | Current release decision                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attendance | The existing self-scoped daily reader supplies the last 30 calendar days of recorded marks. Unmarked days are not interpreted as absences. It can be disabled with `ACE_STUDENT_FACADE_ATTENDANCE_ENABLED=false`. |
| Homework   | Unavailable until the assignment and submission release readers exist.                                                                                                                                            |
| PACE       | Unavailable until a school-owned student release rule exists for the progress projection. The staff PACE roster is not reused.                                                                                    |
| Faith      | Unavailable until a versioned student audience reader is ready.                                                                                                                                                   |
| Reports    | Unavailable until a reviewed student summary publication reader exists. Drafts and embargoed versions are never returned.                                                                                         |
| Slips      | Unavailable until a versioned student-context reader exists.                                                                                                                                                      |
| Community  | Unavailable until the moderated student read policy and site toggle are ready.                                                                                                                                    |

The student overview shows only the released attendance section. It has
loading, empty, error, retry, signed-out, and access-revoked states. It uses the
existing web design tokens and keyboard-accessible controls. No student
direct-message link or compose action is added.

The PostgreSQL HTTP suite covers own versus another child's attendance,
unrelated and wrong-site callers, anonymous access, portal disablement,
inactive account, revoked link, ended school enrolment, revocation during a
read, section failure without internal error detail, and the independent
attendance disable flag. The web component test covers the rendered attendance,
hidden unavailable sections, empty and error states, retry, denial, and
signed-out state. The signed-in browser keyboard and screen-reader check
remains part of ACE-M20.

ACE-M17 remains incomplete until released homework, PACE, Faith, report, slip,
and Community projections have their access and release policies and the full
student read/denial matrix is evidenced.
