# ACE-M01 messaging policy evidence

Build step 1.3e6b: [PR #579](https://github.com/FSS-Ltd/pathway/pull/579)
against `master`.

Step 1.3e6b adds a shared, framework-free recipient policy for the three
supported conversation kinds. Its input facts come from the existing
tenant-scoped staff membership, active guardian-child relationship, and
parent responder queries. The API calls it inside the transaction before
creating a parent-staff, staff-direct, or staffroom conversation. The existing
permission guards, RLS context, atomic participant write, and content-free
creation audit remain in force.

| Plan check                     | Evidence                                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No student direct conversation | `ConversationKind` and `conversationKindSchema` exclude it; the policy rejects unknown kinds and student participants.                                                                                                                                           |
| Participant denial cases       | Platform unit tests cover cross-tenant, duplicate, inactive, hidden, unlinked guardian, student, and invalid staff topology.                                                                                                                                     |
| Shared contracts               | Platform exports bounded cursor, inbox row, message, delivery state, compose, and recipient-search schemas. Compose validation is used by the API send boundary. Contracts expose no tenant, membership, or participant-row identifiers.                         |
| Current creation paths         | Parent creation rechecks the child link in its RLS transaction; direct staff and staffroom creation use the same policy after scoped membership queries. API service tests cover a student with staff membership and a staff actor removed during room creation. |

Local verification: platform unit 12/12 suites and 175 passing tests (five
existing database-dependent tests skipped); API unit 178/178 suites and 1,307
tests; platform and API typechecks; targeted ESLint and Prettier; API build;
`git diff --check`; and Graphify refresh passed. PostgreSQL is unavailable at
`localhost:5433`; current-revision CI must run the messaging database suites.
