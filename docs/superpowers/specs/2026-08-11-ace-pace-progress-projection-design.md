# ACE PACE progress projection

## Decision

ACE-O03 rebuilds a subject's current PACE from its enrolment starting PACE and
terminal immutable assessment facts. A passed Final Test for the current PACE
advances it once; Self Tests, failed Final Tests, superseded facts, and facts
for another PACE do not change the projection. Facts are ordered by local
assessment date and stable id, so their database retrieval order cannot change
the result.

The projection compares the subject's actual ACE level with the learner's
assigned ACE level. It exposes a numeric delta and `needsAttention` only when
the subject is lower. It deliberately does not create age expectations,
cadence, or ahead/behind labels.

## UK display metadata

ACE Levels 1 through 12 map to UK Years 2 through 13 for tooltip display only.
Every tooltip states that it is not a placement recommendation. Diagnostic
placement and subject mastery remain authoritative.

## Boundaries

The function validates all input at the domain boundary, including ACE levels,
PACE numbers, local dates, fact identifiers, and correction links. It remains
pure: it performs no persistence, permission checks, or presentation work.
ACE-O08 will make the result viewable only with the sensitive site permission
`ace.pace.read`.
