# NexSteps Home Implementation Acceptance Criteria

These gates apply to every production PR. A PR may satisfy only the subset
relevant to its approved screen IDs, but it must not weaken any cross-cutting
boundary.

## Required PR evidence

- [ ] Approved screen IDs are listed.
- [ ] Owning Phase 4, 7 or 8 slice is identified.
- [ ] Exact production routes, APIs, entities and permissions are stated.
- [ ] Loading, empty, validation/error, permission and success states are
      covered where relevant.
- [ ] Offline and retry behaviour is covered for any mutation.
- [ ] Type, lint and relevant unit checks pass.
- [ ] API or storage boundaries have negative authorisation tests.
- [ ] A mobile E2E test covers the critical user outcome.
- [ ] iPhone and Pixel layouts are visually compared for changed core screens.
- [ ] Accessibility and dynamic-type checks are recorded.
- [ ] Graphify is updated after code or documentation changes.

## Product-wide gates

- [ ] A first-time parent can understand the next action without a tutorial.
- [ ] Setup completes or resumes without a dead-end dashboard.
- [ ] The permanent navigation follows Week, Today, Community, Progress,
      Family.
- [ ] One action is visually dominant on each screen.
- [ ] Parent-facing language avoids tenant, organisation, pupil, register and
      capability terminology.
- [ ] Household data is tenant-isolated and guardian-child authorised.
- [ ] Private file access never exposes a storage key or permanent public URL.
- [ ] Analytics contain no child names, private notes, message text, document
      contents or precise location.
- [ ] Destructive actions explain consequences and require confirmation.

## Community gates

- [ ] Community is visible as an inviting preview but returns no protected
      Community data before opt-in.
- [ ] Directory visibility defaults to off.
- [ ] A live preview shows exactly what other adults will see.
- [ ] Directory and Community DTO contract tests reject every child field.
- [ ] Coarse location is used; exact distance, coordinates, postcode and home
      address are absent.
- [ ] Connection requires mutual adult consent before private messaging.
- [ ] Community MVP posts are adult-authored text.
- [ ] Meetups use public venues or approved online locations.
- [ ] RSVPs identify adults/households and aggregate party size, not children.
- [ ] Blocking takes immediate effect and does not notify the blocked party.
- [ ] Report visibility follows the approved fail-safe policy.
- [ ] Moderator access is platform-level, least-privilege and audited.

## Regulations & Evidence gates

- [ ] England, Wales, Scotland and Northern Ireland are distinct scopes.
- [ ] Every requirement/update has an official source, jurisdiction,
      verification state, effective date when available and review date.
- [ ] High-impact summaries cannot publish without required human review.
- [ ] The UI uses preparedness language and never claims legal compliance.
- [ ] Community content cannot create or modify official requirements.
- [ ] Existing Evidence is linked rather than copied.
- [ ] Correspondence and evidence are tenant- and child-authorised.
- [ ] Files remain unavailable while malware scanning is pending or failed.
- [ ] Pack preview shows the exact selected content before export or sharing.
- [ ] Secure shares expire, can be revoked and generate access audit events.
- [ ] Stale or unavailable sources are clearly de-emphasised.
- [ ] The legal-information disclaimer is available from the feature.

## Accessibility and visual gates

- [ ] Core text and controls meet WCAG 2.2 AA contrast.
- [ ] Touch targets are at least 44x44pt.
- [ ] Colour is never the only signal.
- [ ] Screen-reader names include the control state where relevant.
- [ ] Forms expose inline errors and an accessible summary.
- [ ] Dynamic type does not clip actions, deadlines or navigation labels.
- [ ] Switch and keyboard traversal follow visual order.
- [ ] Reduced motion is respected.
- [ ] Production screens use `mobileTokens` and existing primitives.
- [ ] No emoji, text glyph, CSS drawing or custom approximate icon replaces an
      approved icon-library asset.

## Release gate

Before a NexSteps Home slice is enabled for real households:

- [ ] Data migration and rollback are documented.
- [ ] Tenant and cross-household negative tests pass.
- [ ] Audit events contain useful identifiers without sensitive payloads.
- [ ] Backup/restore implications are reviewed.
- [ ] Privacy Notice and retention schedules cover the new data.
- [ ] Support and moderation runbooks exist for the enabled feature.
- [ ] Feature entitlement and rollout controls have safe defaults.
- [ ] Product has reviewed intentional differences from the approved flow.
