# ACE-M18 family web shell: child detail navigation

**Build step:** 1.3e6a. **Plan task:** ACE-M18, still incomplete. Mobile work
remains paused.

The guardian detail layout adds current child and school context to the web
overview, attendance, sessions, and subject timetable routes. It reads the
existing account-scoped family-context endpoint. Child switching is offered
only among current full guardian links at the same school whose server
sections include the current route. The current child is marked with
`aria-current="page"`; keyboard focus uses the existing accent token.

The navigation has loading, failed-read with retry, and removed-link states.
A failed context read leaves the detail page available because each detail
API independently checks the guardian relationship and release rule. A
removed-link message directs the person back to the family landing; the
detail API remains the final access boundary. Session changes remount the
navigation and abort the old context read.

The web component test covers two linked overview children, a third child
with attendance only, another school, a student identity, section-specific
links, current-page semantics, missing access, retry, a late response from an
old account view, and sign-out. The existing PostgreSQL family-context and
detail API suites cover server access separately.

Full ACE-M18 still needs signed-in browser keyboard and screen-reader
evidence, and its mobile shell and device baselines remain paused.
