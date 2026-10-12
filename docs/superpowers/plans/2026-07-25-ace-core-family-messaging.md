# ACE Core Family, Messaging, and Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver secure parent/staff communication, notices, student and guardian identity, and family/student read facades, with a mobile conversation experience that behaves like iMessage while remaining unmistakably NexSteps.

**Architecture:** NestJS owns participant policy, relationship checks, persistence, idempotency, audit, and notifications. PostgreSQL is authoritative. Supabase Realtime private channels carry metadata-only invalidation and typing events; clients refetch authorised REST data. Web and Expo share typed DTOs and design contracts, but use platform-appropriate rendering.

**Tech Stack:** strict TypeScript, NestJS REST, Zod, Prisma/PostgreSQL with strict RLS, Supabase Realtime private Broadcast, Expo Router, React Native `FlatList`, Next.js, Auth0, Expo Notifications, Resend, Jest, React Native Testing Library, Playwright, and screenshot baselines.

## Global Constraints

- Depends on `ACE-F22`.
- Messaging is parent-to-staff and authorised staff-to-staff. Student-to-student direct messaging is prohibited.
- A user may not discover a conversation, participant, child, preview, unread count, attachment, or realtime topic without the same relationship and release checks required to read the message.
- Plaintext message bodies and attachment URLs are never placed in realtime events, push payloads, email subjects, logs, analytics, or error reporting.
- The iMessage requirement describes interaction and information hierarchy, not Apple artwork, exact Apple colours, proprietary icons, or unapproved features.
- The mobile composer, keyboard avoidance, safe-area handling, scroll anchoring, message grouping, optimistic send, retry, and read-state behaviour are release requirements, not polish.
- Notices are audience-targeted publications with receipt tracking. They do not silently create two-way conversations.
- Safeguarding reports remain in the safeguarding module. Messaging may create a minimal cross-reference, but never duplicates confidential case detail.
- All screenshots use synthetic names, messages, avatars, and organisation data.

## Mobile Messaging Visual Contract

| Element | Required behaviour |
| --- | --- |
| Inbox header | Large `Messages` title, trailing compose control, NexSteps wordmark/organisation context only where it does not crowd 320pt widths. |
| Search | Rounded search field below the title; searches authorised local results first, then paginated server results. |
| Conversation row | Circular identity mark, display name, one-line preview, trailing local timestamp, muted chevron if used, and an unread dot plus accessible unread label. |
| Conversation header | Compact back control, identity mark, participant name, relationship/subtitle, and an accessible details action. |
| Bubble layout | Incoming left, outgoing right; maximum 78% width; adjacent bubbles group by author and time; tails appear only on the final bubble of a group. |
| Bubble typography | Quicksand body at the platform dynamic text size; Nunito only for names, titles, and compact status labels. |
| Colour | Contrast-tested NexSteps outgoing token derived from the mint/serve palette; incoming neutral; no copied Apple blue. |
| Time | Centred date separators; delivery/read label only under the latest relevant outbound message. |
| Composer | Auto-growing rounded capsule pinned above keyboard and safe area; circular upward-arrow send button appears enabled only for non-empty trimmed text. |
| Loading older messages | Stable cursor pagination preserves the visible anchor. No jump to top or bottom. |
| Sending | Optimistic bubble keyed by client idempotency key; explicit sending, sent, delivered, failed, and read states; tap failed state to retry once without duplication. |
| Accessibility | 44pt targets, screen-reader bubble summaries, non-colour status cues, 200% font support, reduced motion, and logical focus after send/load. |

The official implementation references for the selected realtime model are [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast) and [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).

---

### Task 1: ACE-M01 - Define messaging DTOs and recipient policy

**Branch:** `feat/ace-message-contracts`

**Files:**
- Create: `packages/platform/src/messaging/contracts.ts`
- Create: `packages/platform/src/messaging/recipient-policy.ts`
- Test: `packages/platform/src/messaging/recipient-policy.spec.ts`
- Modify: `packages/platform/src/index.ts`

**Interfaces:**

```ts
export type ConversationKind = "parent-staff" | "staff-direct" | "staffroom";
export interface RecipientCandidate {
  userId: string;
  displayName: string;
  relationship: "guardian" | "teacher" | "supervisor" | "head" | "staff";
  childIds: string[];
}
export function canStartConversation(input: RecipientPolicyInput): RecipientPolicyDecision;
```

- [ ] Port the useful Oasis participant cases from `apps/api/src/routers/message.ts`; add explicit rejection tests for `StudentDirect`, cross-tenant users, inactive guardians, hidden staff, and unrelated children.
- [ ] Implement pure allow/deny policy codes without database or framework imports.
- [ ] Export cursor, inbox row, message, delivery-state, compose, and recipient-search DTO schemas with no sensitive internal IDs.
- [ ] Run platform unit tests, typecheck, and lint.

**Acceptance:** Every later route consumes one tested participant policy and the type system cannot represent student direct messaging.

**Rollback:** Remove the unused contracts before API adoption.

### Task 2: ACE-M02 - Implement conversation creation and authorised inbox reads

**Branch:** `feat/ace-conversation-api`

**Files:**
- Create: `apps/api/src/messaging/messaging.controller.ts`
- Create: `apps/api/src/messaging/messaging.service.ts`
- Create: `apps/api/src/messaging/dto/create-conversation.dto.ts`
- Create: `apps/api/src/messaging/dto/list-conversations.dto.ts`
- Test: `apps/api/src/messaging/messaging.service.spec.ts`
- Test: `apps/api/src/messaging/tests/messaging-inbox.e2e.spec.ts`

- [ ] Write failing tests for parent-staff creation, staff-direct creation, staffroom membership, relationship denial, capability denial, cross-tenant denial, duplicate participant sets, empty inbox, and cursor pagination.
- [ ] Resolve access in this order: membership, capability, permission, participant relationship, release policy, then RLS transaction context.
- [ ] Create a conversation and participant rows atomically; reuse an existing canonical conversation when policy says the participant set is equivalent.
- [ ] Return only the latest authorised preview, unread count, and cursor-safe timestamp.
- [ ] Audit conversation creation and denied cross-boundary attempts without storing message content.

**Acceptance:** An authorised user can create and list only their conversations, and ID guessing returns the standard not-found envelope.

**Rollback:** Disable create/list routes; persistence is unused and may remain.

### Task 3: ACE-M03 - Implement idempotent message send

**Branch:** `feat/ace-message-send`

**Files:**
- Create: `apps/api/src/messaging/dto/send-message.dto.ts`
- Create: `apps/api/src/messaging/message-command.service.ts`
- Test: `apps/api/src/messaging/message-command.service.spec.ts`
- Test: `apps/api/src/messaging/tests/message-send.e2e.spec.ts`

**Interfaces:**

```ts
export interface SendMessageCommand {
  conversationId: string;
  body: string;
  clientMessageId: string;
}
export type MessageDeliveryState = "sending" | "sent" | "delivered" | "failed" | "read";
```

- [ ] Test empty/whitespace, maximum length, inactive membership, removed participant, duplicate `clientMessageId`, concurrent retries, and staffroom send permission.
- [ ] Validate and normalise at the boundary; persist message and outbox record in one transaction.
- [ ] Enforce a unique `(tenantId, senderUserId, clientMessageId)` key and return the original message for an exact retry.
- [ ] Record content-free audit metadata and safe metrics.
- [ ] Verify RLS blocks direct cross-tenant inserts.

**Acceptance:** Network retries cannot duplicate a message and a removed participant cannot send.

**Rollback:** Disable the send command while preserving readable history.

### Task 4: ACE-M04 - Implement message history, read receipts, and delivery state

**Branch:** `feat/ace-message-history`

**Files:**
- Create: `apps/api/src/messaging/dto/list-messages.dto.ts`
- Create: `apps/api/src/messaging/dto/mark-conversation-read.dto.ts`
- Create: `apps/api/src/messaging/message-query.service.ts`
- Create: `apps/api/src/messaging/message-receipt.service.ts`
- Test: `apps/api/src/messaging/tests/message-history.e2e.spec.ts`

- [ ] Test newest page, older cursor, stable ordering for equal timestamps, removed participant history policy, unread counts, monotonic read cursor, and hidden message denial.
- [ ] Use opaque keyset cursors containing no raw participant or tenant information.
- [ ] Mark read through a monotonic last-read message reference; never write one receipt row per list refresh.
- [ ] Derive sent, delivered, and read state without exposing which staff member read a group message unless policy permits it.
- [ ] Add composite indexes and inspect the query plan against pilot-volume fixtures.

**Acceptance:** History pagination is stable, read state never moves backwards, and unread totals reconcile.

**Rollback:** Disable mutation of read cursors; message history remains readable.

### Task 5: ACE-M05 - Add private realtime authorisation and metadata broadcasts

**Branch:** `feat/ace-message-realtime`

**Files:**
- Create: `apps/api/src/realtime/realtime-token.controller.ts`
- Create: `apps/api/src/realtime/realtime-token.service.ts`
- Create: `apps/api/src/messaging/message-realtime.publisher.ts`
- Create: `packages/platform/src/messaging/realtime-events.ts`
- Test: `apps/api/src/messaging/tests/message-realtime-auth.e2e.spec.ts`

**Interfaces:**

```ts
export type MessageRealtimeEvent =
  | { type: "message.created"; conversationId: string; messageId: string }
  | { type: "conversation.read"; conversationId: string; readerScope: "participant" }
  | { type: "typing.changed"; conversationId: string; active: boolean; expiresAt: string };
```

- [ ] Test short token expiry, participant removal, cross-conversation subscription, cross-tenant topic guessing, and capability revocation.
- [ ] Mint short-lived realtime claims only after normal access and participant checks.
- [ ] Publish the minimum IDs needed for invalidation after transaction commit; do not publish message body, preview, person data, attachment key, or push text.
- [ ] Require private channels and RLS-backed topic authorisation.
- [ ] Make REST refetch authoritative after reconnect or event loss.

**Acceptance:** Only current participants can subscribe, and captured events contain no message content.

**Rollback:** Disable realtime token issuance; polling and focus refetch preserve correctness.

### Task 6: ACE-M06 - Add notification fan-out and preference rules

**Branch:** `feat/ace-message-notifications`

**Files:**
- Create: `apps/workers/src/messaging/message-notification.job.ts`
- Create: `apps/api/src/messaging/message-notification-policy.ts`
- Test: `apps/api/src/messaging/message-notification-policy.spec.ts`
- Test: `apps/workers/src/messaging/message-notification.job.spec.ts`

- [ ] Test muted conversation, quiet hours, same-device foreground suppression, inactive guardian, removed participant, duplicate outbox delivery, and safe generic copy.
- [ ] Fan out through the existing outbox to push and permitted email channels.
- [ ] Use generic lock-screen text such as “New NexSteps message”; fetch body only after authenticated app open.
- [ ] Respect per-user channel and quiet-hour preferences using the organisation timezone.
- [ ] Record delivery provider IDs and terminal failure categories without content.

**Acceptance:** One message produces at most one notification per selected user/channel and never leaks content.

**Rollback:** Pause the worker job without affecting persisted messages.

### Task 7: ACE-M07 - Build shared NexSteps messaging tokens and grouping primitives

**Branch:** `feat/ace-message-ui-foundation`

**Files:**
- Create: `packages/mobile-core/src/messaging/message-tokens.ts`
- Create: `packages/mobile-core/src/messaging/group-messages.ts`
- Test: `packages/mobile-core/src/messaging/group-messages.spec.ts`
- Create: `packages/mobile-core/src/messaging/index.ts`
- Modify: `packages/mobile-core/src/index.ts`

- [ ] Define semantic incoming/outgoing/background/status tokens for light and supported dark themes, each passing text contrast requirements.
- [ ] Derive grouping from sender, chronology, and a documented time threshold; keep date-separator logic pure and timezone-aware.
- [ ] Define bubble width, radius, tail, spacing, avatar, composer, and touch-target constants for 320 to 430pt widths.
- [ ] Add token snapshot and rule tests. Do not use Apple asset files or copy Apple colour constants.

**Acceptance:** Mobile screens share one tested grouping model and NexSteps-specific semantic tokens.

**Rollback:** Remove unused primitives before screen adoption.

### Task 8: ACE-M08 - Build the mobile iMessage-style inbox

**Branch:** `feat/ace-mobile-message-inbox`

**Files:**
- Modify: `apps/mobile/app/(serve)/(tabs)/communications/index.tsx`
- Create: `apps/mobile/src/features/messaging/use-conversation-list.ts`
- Create: `apps/mobile/src/features/messaging/conversation-row.tsx`
- Create: `apps/mobile/src/features/messaging/message-search.tsx`
- Test: `apps/mobile/src/features/messaging/conversation-row.test.tsx`
- Test: `apps/mobile/e2e/messaging-inbox.e2e.ts`

- [ ] Build the large title, compose action, rounded search, iMessage-density rows, circular identity marks, name, single-line preview, timestamp, unread dot, and accessible unread label.
- [ ] Implement pull-to-refresh, cursor pagination, skeleton, empty, offline-stale, initial-error, retry, and no-search-results states.
- [ ] Keep previews and timestamps from different conversations from visually colliding at 320pt and 200% font.
- [ ] Add deterministic screenshots at 320, 375, 390, and 430pt on iOS and Android.
- [ ] Verify a screen reader announces participant, relationship, preview, time, and unread state once.

**Acceptance:** The inbox matches the agreed iMessage information hierarchy at every target width while using NexSteps tokens.

**Rollback:** Keep the existing messages route behind the feature flag and disable the new screen.

### Task 9: ACE-M09 - Build the mobile iMessage-style conversation renderer

**Branch:** `feat/ace-mobile-conversation`

**Files:**
- Create: `apps/mobile/app/(serve)/(tabs)/communications/[conversationId].tsx`
- Create: `apps/mobile/src/features/messaging/message-list.tsx`
- Create: `apps/mobile/src/features/messaging/message-bubble.tsx`
- Create: `apps/mobile/src/features/messaging/message-date-separator.tsx`
- Test: `apps/mobile/src/features/messaging/message-bubble.test.tsx`
- Test: `apps/mobile/e2e/messaging-conversation.e2e.ts`

- [ ] Render incoming left and outgoing right bubbles with 78% maximum width, grouped spacing, and a tail only on the final bubble in a group.
- [ ] Show centred date separators and only the latest applicable outbound sending/sent/delivered/read label.
- [ ] Use an inverted or equivalent `FlatList` with stable keys, cursor pagination, `maintainVisibleContentPosition`, and preserved anchor while older messages prepend.
- [ ] Handle long unbroken strings, emoji, bidirectional text, deleted/withdrawn-safe placeholders if supported by policy, and 200% text.
- [ ] Add screen-reader message summaries with sender, local time, body, and delivery state in a logical order.

**Acceptance:** Scrolling, grouping, pagination, and status placement behave like a native text conversation without frame or anchor jumps.

**Rollback:** Disable the conversation feature flag; no data rollback.

### Task 10: ACE-M10 - Build the pinned mobile composer, optimistic send, and retry

**Branch:** `feat/ace-mobile-message-composer`

**Files:**
- Create: `apps/mobile/src/features/messaging/message-composer.tsx`
- Create: `apps/mobile/src/features/messaging/use-send-message.ts`
- Create: `apps/mobile/src/features/messaging/message-drafts.ts`
- Test: `apps/mobile/src/features/messaging/message-composer.test.tsx`
- Test: `apps/mobile/src/features/messaging/use-send-message.test.ts`

- [ ] Pin the auto-growing rounded text capsule above keyboard and safe area; keep the latest conversation content visible when keyboard height changes.
- [ ] Enable the circular upward-arrow send action only when trimmed text is non-empty and a send is allowed.
- [ ] Insert an optimistic bubble with a generated `clientMessageId`; reconcile it with the authoritative response.
- [ ] Persist a per-user/per-conversation local draft, restore it after navigation or app restart, and remove it only after accepted send.
- [ ] Expose failed state and retry with the same idempotency key; prevent double tap, duplicate send, and reordering.
- [ ] Add light, documented haptic feedback after accepted local send and respect reduced-motion/system settings.

**Acceptance:** The composer remains usable with both keyboards, safe areas, long drafts, offline failure, and retries without duplicates.

**Rollback:** Disable send in the new UI while retaining read-only conversation access.

### Task 11: ACE-M11 - Add typing, reconnect, and foreground synchronisation

**Branch:** `feat/ace-message-presence`

**Files:**
- Create: `apps/mobile/src/features/messaging/use-message-realtime.ts`
- Create: `apps/mobile/src/features/messaging/typing-indicator.tsx`
- Test: `apps/mobile/src/features/messaging/use-message-realtime.test.ts`
- Test: `apps/mobile/e2e/messaging-reconnect.e2e.ts`

- [ ] Debounce typing emission, suppress empty typing, expire remotely within a short fixed TTL, and never persist it.
- [ ] On foreground, reconnect, missed cursor, or token refresh, refetch REST pages and unread counts before trusting local state.
- [ ] Deduplicate realtime events against optimistic and already-fetched message IDs.
- [ ] Show an understated three-dot typing treatment with a screen-reader label; disable motion under reduced-motion settings.
- [ ] Test background/foreground, airplane mode, token expiry, duplicate events, out-of-order events, and participant removal.

**Acceptance:** Realtime improves responsiveness but loss or duplication never changes authoritative message state.

**Rollback:** Turn off presence events; REST synchronisation remains.

### Task 12: ACE-M12 - Build the web messaging workspace

**Branch:** `feat/ace-web-messaging`

**Files:**
- Create: `apps/admin/app/messages/page.tsx`
- Create: `apps/admin/app/messages/[conversationId]/page.tsx`
- Create: `apps/admin/app/family/messages/page.tsx`
- Create: `apps/admin/app/family/messages/[conversationId]/page.tsx`
- Create: `apps/admin/app/messages/message-workspace.tsx`
- Create: `apps/admin/app/messages/message-composer.tsx`
- Test: `apps/admin/app/messages/message-workspace.test.tsx`
- Test: `apps/admin/e2e/messaging.spec.ts`

- [ ] Build a responsive inbox/conversation split view using the same hierarchy, grouping, states, and tokens as mobile without forcing phone geometry onto desktop.
- [ ] Support keyboard traversal, visible focus, Enter-to-send with documented Shift+Enter newline, and announced delivery failures.
- [ ] Implement empty, loading, offline, permission-revoked, removed-participant, retry, and no-selection states.
- [ ] Verify 320px responsive web still presents a single-pane mobile-like flow.

**Acceptance:** Staff and guardians can complete the same secure messaging journey using keyboard, pointer, or screen reader.

**Rollback:** Hide the web navigation item and retain APIs.

### Task 13: ACE-M13 - Implement notices, audiences, and receipts

**Branch:** `feat/ace-notices`

**Files:**
- Create: `apps/api/src/notices/notices.controller.ts`
- Create: `apps/api/src/notices/notices.service.ts`
- Create: `apps/api/src/notices/notice-audience.service.ts`
- Test: `apps/api/src/notices/tests/notices.e2e.spec.ts`

- [ ] Test draft, scheduled, publish, cancel-before-publish, immutable published content, whole-site/class/group/guardian audience resolution, and cross-tenant denial.
- [ ] Freeze the recipient snapshot at publication; later enrolment changes do not silently rewrite historical reach.
- [ ] Track delivered/opened/acknowledged where configured, without treating an email tracking pixel as acknowledgement.
- [ ] Emit content-safe outbox events and audit draft/publish/cancel actions.
- [ ] Keep notices separate from conversations unless the author explicitly permits a governed reply channel.

**Acceptance:** A published notice has a reproducible audience and trustworthy receipt totals.

**Rollback:** Disable publish while retaining draft and historical reads.

### Task 14: ACE-M14 - Build notice authoring and family receipt experiences

**Branch:** `feat/ace-notice-ui`

**Files:**
- Modify: `apps/admin/app/notices/page.tsx`
- Create: `apps/admin/app/notices/notice-editor.tsx`
- Create: `apps/admin/app/family/notices/page.tsx`
- Create: `apps/admin/app/family/notices/[noticeId]/page.tsx`
- Create: `apps/mobile/app/(family)/(tabs)/notices/index.tsx`
- Create: `apps/mobile/app/(family)/(tabs)/notices/[noticeId].tsx`
- Test: `apps/admin/e2e/notices.spec.ts`
- Test: `apps/mobile/e2e/family-notices.e2e.ts`

- [ ] Build permission-aware draft, audience preview, schedule, confirmation, publish, and receipt-summary states for staff.
- [ ] Show guardians a chronological notice list with unread state, publication time, audience-safe detail, acknowledgement action, and offline retry.
- [ ] Require a second confirmation when an audience materially changes after preview.
- [ ] Test empty audience, revoked author permission, expired schedule, duplicate acknowledgement, and 200% font.

**Acceptance:** Staff can verify who will receive a notice, and guardians can read and acknowledge it accessibly.

**Rollback:** Hide authoring while retaining published family reads.

### Task 15: ACE-M15 - Provision guardian and student identities safely

**Branch:** `feat/ace-family-identity-provisioning`

**Files:**
- Create: `apps/api/src/identity/family-identity.service.ts`
- Create: `apps/api/src/identity/family-invite.controller.ts`
- Create: `apps/api/src/identity/dto/create-family-invite.dto.ts`
- Test: `apps/api/src/identity/tests/family-identity.e2e.spec.ts`

- [ ] Test invited/accepted/expired/revoked states, duplicate email, shared guardian across children, student age/policy restriction, and cross-tenant email collision.
- [ ] Provision Auth0 identity only through the existing identity abstraction; store no reusable invite token.
- [ ] Bind accepted identity to an explicit guardian-child or student-child relationship before granting any portal access.
- [ ] Audit invite, resend, revoke, accept, relationship add/remove, and account disable.
- [ ] Make bulk import deterministic and restartable without duplicate accounts.

**Acceptance:** Authentication alone grants no family data; an active tenant relationship is always required.

**Rollback:** Stop new invitations and revoke unused tokens; existing verified relationships remain.

### Task 16: ACE-M16 - Implement the family read facade and release policy

**Branch:** `feat/ace-family-facade`

**Files:**
- Create: `apps/api/src/family/family.controller.ts`
- Create: `apps/api/src/family/family.service.ts`
- Create: `apps/api/src/family/family-release-policy.ts`
- Test: `apps/api/src/family/tests/family-facade.e2e.spec.ts`

- [ ] Define explicit release decisions for attendance, homework, reports, slips, Faith content, notices, messages, and permitted finance summaries.
- [ ] Test one guardian with multiple children, two guardians with different legal access, ended enrolment, embargoed report, unsubmitted homework, and supplied-child ID attacks.
- [ ] Derive child scope exclusively from current relationship rows and RLS context.
- [ ] Return independent section errors so one unavailable module does not leak or break permitted sections.

**Acceptance:** Family data is assembled from authorised, released projections with no controller-side role shortcuts.

**Rollback:** Disable facade sections individually through server-owned flags.

### Task 17: ACE-M17 - Implement the student self facade

**Branch:** `feat/ace-student-facade`

**Files:**
- Create: `apps/api/src/student-self/student-self.controller.ts`
- Create: `apps/api/src/student-self/student-self.service.ts`
- Test: `apps/api/src/student-self/tests/student-self.e2e.spec.ts`

- [ ] Test that a student can read only their own released homework, PACE summary, Faith content, report summary, slips requiring their context, and enabled Community.
- [ ] Prove the student cannot enumerate peers, guardians, staff directories, private messages, staff notes, safeguarding data, behaviour notes, or unreleased reports.
- [ ] Apply tenant, identity, vertical, feature, release, and RLS checks to every endpoint.
- [ ] Return stable, age-appropriate error copy without security detail.

**Acceptance:** A student identity has a narrow self-service surface and no direct-message capability.

**Rollback:** Disable the student surface without affecting family or staff access.

### Task 18: ACE-M18 - Build the family web and mobile shells

**Branch:** `feat/ace-family-portal-shells`

**Files:**
- Create: `apps/admin/app/family/layout.tsx`
- Create: `apps/admin/app/family/page.tsx`
- Create: `apps/admin/app/family/family-navigation.tsx`
- Modify: `apps/mobile/app/(family)/_layout.tsx`
- Modify: `apps/mobile/app/(family)/(tabs)/_layout.tsx`
- Modify: `apps/mobile/app/(family)/(tabs)/home/index.tsx`
- Test: `apps/admin/e2e/family-shell.spec.ts`
- Test: `apps/mobile/e2e/family-shell.e2e.ts`

- [ ] Build relationship-aware web and mobile navigation from server capabilities and released sections, never hard-coded role labels.
- [ ] Show child switching only for current linked children and clear child-specific context before every deep link.
- [ ] Provide loading, empty, partial, offline-stale on mobile, permission-revoked, session-expired, and retry states.
- [ ] Test keyboard/screen-reader web navigation and mobile 320pt, 200% font, safe-area, and reduced-motion behaviour.

**Acceptance:** A guardian gets consistent web/mobile entry points and can navigate only to linked-child, released sections.

**Rollback:** Disable the family web route and mobile navigation cards independently.

### Task 19: ACE-M19 - Build the student mobile shell

**Branch:** `feat/ace-student-mobile-shell`

**Files:**
- Create: `apps/mobile/app/(student)/_layout.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/home/index.tsx`
- Test: `apps/mobile/e2e/student-shell.e2e.ts`

- [ ] Build self-only navigation from the student facade’s capabilities, release state, and Community toggle.
- [ ] Exclude messages, peer directory, staff directory, guardians, staff notes, sensitive behaviour, and safeguarding from routes and deep-link resolution.
- [ ] Provide loading, empty, partial, offline-stale, permission-revoked, disabled-Community, session-expired, and retry states.
- [ ] Verify 320pt, 200% font, VoiceOver/TalkBack, safe-area, reduced-motion, and deep-link rejection.

**Acceptance:** The student shell exposes only age-appropriate self-service sections and no private messaging.

**Rollback:** Disable the student route group without affecting staff or guardians.

### Task 20: ACE-M20 - Complete the family, identity, and messaging security gate

**Branch:** `security/ace-family-messaging-gate`

**Files:**
- Test: `apps/api/src/messaging/tests/family-messaging-security.e2e.spec.ts`
- Create: `docs/evidence/ace-family-messaging-release-gate.md`

- [ ] Run an access matrix covering parent, student, teacher, supervisor, head, support staff, removed member, disabled feature, and wrong tenant.
- [ ] Run IDOR probes across conversation, message, notice, child, identity, and realtime topic IDs.
- [ ] Run web keyboard/screen-reader checks and mobile screenshot/interaction baselines across target widths, keyboards, platforms, 200% font, and reduced motion.
- [ ] Record evidence that no API, navigation item, compose action, or realtime topic exposes student direct messaging.

**Acceptance:** The full identity and messaging slice is usable on supported devices and passes the release security matrix.

**Rollback:** Disable family/student shells and messaging UI independently; retain historical data and staff operations.

## Completion Evidence

- Unit and integration suites pass for participant policy, idempotency, cursors, receipts, release policy, and realtime claims.
- RLS and IDOR tests prove tenant, child, participant, and relationship isolation.
- Mobile visual baselines cover 320, 375, 390, and 430pt widths on iOS and Android.
- Keyboard-open, pagination-anchor, offline retry, reconnect, duplicate-event, and 200% font tests pass.
- A privacy review confirms no message content in realtime, push, email subject, logs, analytics, or traces.
- Product review signs off the iMessage interaction model and NexSteps branding together.
