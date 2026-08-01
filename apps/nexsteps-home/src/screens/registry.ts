/**
 * Screen ID -> route path contract, generated from
 * docs/NexStepsV2/nexsteps-home/screen-inventory.json (81 approved screens,
 * 28 July 2026, +5 tablet-two-pane composites added by Plan 03). Route
 * filenames may change as each plan lands; screen IDs
 * do not (implementation-map.md: "Candidate route names must follow the
 * current Expo Router tree when each slice starts. The screen IDs remain
 * stable even when a route filename changes.")
 *
 * Routing rule used to derive every path below:
 * - group "setup"      -> /(setup)/<id>
 * - group "moderation" -> /(moderation)/<id> (platform-admin, not a
 *   household route - implementation-map.md)
 * - everything else    -> keyed off the screen's own `tab` field (Week,
 *   Today, Community, Progress, Family), not its group - week-today and
 *   family-settings/regulations-evidence each span more than one tab's
 *   worth of screens by tab, not by group. Each tab's landing screen
 *   (screen-inventory.json's firstScreenByTab) is the tab's index route;
 *   every other screen in that tab nests under it by ID.
 *
 * When implementing a slice, update only the entries that slice's screens
 * cover if the actual route filename ends up differing from this contract
 * - do not let the map silently drift from what ships.
 */
export const screenRoutes = {
  welcome: "/(setup)/welcome",
  "account-create": "/(setup)/account-create",
  "email-verify": "/(setup)/email-verify",
  "account-recover": "/(setup)/account-recover",
  "children-list": "/(setup)/children-list",
  "child-add": "/(setup)/child-add",
  "learning-days": "/(setup)/learning-days",
  "first-activity": "/(setup)/first-activity",
  "setup-complete": "/(setup)/setup-complete",

  "week-home": "/(home)/(tabs)/week",
  "day-detail": "/(home)/(tabs)/week/day-detail",
  "activity-plan": "/(home)/(tabs)/week/activity-plan",
  "activity-detail": "/(home)/(tabs)/week/activity-detail",
  today: "/(home)/(tabs)/today",
  "quick-log": "/(home)/(tabs)/today/quick-log",
  "task-editor": "/(home)/(tabs)/week/task-editor",
  "calendar-editor": "/(home)/(tabs)/week/calendar-editor",

  "progress-overview": "/(home)/(tabs)/progress",
  "learning-history": "/(home)/(tabs)/progress/learning-history",
  "log-detail": "/(home)/(tabs)/progress/log-detail",
  "evidence-gallery": "/(home)/(tabs)/progress/evidence-gallery",
  "evidence-detail-upload": "/(home)/(tabs)/progress/evidence-detail-upload",
  subjects: "/(home)/(tabs)/progress/subjects",
  "reports-list": "/(home)/(tabs)/progress/reports-list",
  "report-request": "/(home)/(tabs)/progress/report-request",
  "report-detail-download": "/(home)/(tabs)/progress/report-detail-download",

  "community-preview": "/(home)/(tabs)/community/community-preview",
  "community-join": "/(home)/(tabs)/community/community-join",
  "community-privacy-preview": "/(home)/(tabs)/community/community-privacy-preview",
  "community-home": "/(home)/(tabs)/community",
  "family-directory": "/(home)/(tabs)/community/family-directory",
  "household-profile": "/(home)/(tabs)/community/household-profile",
  "send-hello": "/(home)/(tabs)/community/send-hello",
  "connection-requests": "/(home)/(tabs)/community/connection-requests",
  "private-intro": "/(home)/(tabs)/community/private-intro",
  "channel-list": "/(home)/(tabs)/community/channel-list",
  "thread-list": "/(home)/(tabs)/community/thread-list",
  "thread-detail": "/(home)/(tabs)/community/thread-detail",
  "thread-compose": "/(home)/(tabs)/community/thread-compose",
  "meetup-list": "/(home)/(tabs)/community/meetup-list",
  "meetup-detail": "/(home)/(tabs)/community/meetup-detail",
  "meetup-rsvp": "/(home)/(tabs)/community/meetup-rsvp",
  "meetup-create": "/(home)/(tabs)/community/meetup-create",
  "meetup-manage": "/(home)/(tabs)/community/meetup-manage",
  "community-settings": "/(home)/(tabs)/community/community-settings",
  "block-report": "/(home)/(tabs)/community/block-report",
  "report-confirmation": "/(home)/(tabs)/community/report-confirmation",

  "family-children": "/(home)/(tabs)/family",
  "child-details": "/(home)/(tabs)/family/child-details",
  "people-permissions": "/(home)/(tabs)/family/people-permissions",
  preferences: "/(home)/(tabs)/family/preferences",
  notifications: "/(home)/(tabs)/family/notifications",
  membership: "/(home)/(tabs)/family/membership",
  "privacy-data": "/(home)/(tabs)/family/privacy-data",
  "account-session": "/(home)/(tabs)/family/account-session",
  "regulations-jurisdiction": "/(home)/(tabs)/family/regulations-jurisdiction",
  "regulations-overview": "/(home)/(tabs)/family/regulations-overview",
  "regulations-requirements": "/(home)/(tabs)/family/regulations-requirements",
  "regulations-requirement-detail": "/(home)/(tabs)/family/regulations-requirement-detail",
  "regulations-evidence": "/(home)/(tabs)/family/regulations-evidence",
  "regulations-evidence-upload": "/(home)/(tabs)/family/regulations-evidence-upload",
  "regulations-updates": "/(home)/(tabs)/family/regulations-updates",
  "regulations-update-detail": "/(home)/(tabs)/family/regulations-update-detail",
  "regulations-correspondence": "/(home)/(tabs)/family/regulations-correspondence",
  "regulations-correspondence-detail": "/(home)/(tabs)/family/regulations-correspondence-detail",
  "regulations-correspondence-add": "/(home)/(tabs)/family/regulations-correspondence-add",
  "regulations-pack-scope": "/(home)/(tabs)/family/regulations-pack-scope",
  "regulations-pack-evidence": "/(home)/(tabs)/family/regulations-pack-evidence",
  "regulations-pack-preview": "/(home)/(tabs)/family/regulations-pack-preview",
  "regulations-pack-share": "/(home)/(tabs)/family/regulations-pack-share",
  "regulations-share-confirmation": "/(home)/(tabs)/family/regulations-share-confirmation",
  "regulations-share-activity": "/(home)/(tabs)/family/regulations-share-activity",

  "moderation-queue": "/(moderation)/moderation-queue",
  "moderation-report": "/(moderation)/moderation-report",
  "member-history": "/(moderation)/member-history",
  "moderation-resolution": "/(moderation)/moderation-resolution",

  // Tablet-two-pane composites (Plan 03): not separate routes. Each renders
  // its listScreenId's phone route via <TwoPane>, adapting at tablet width -
  // the route is shared with the list screen; only the viewport differs.
  "tablet-week-day": "/(home)/(tabs)/week",
  "tablet-progress-detail": "/(home)/(tabs)/progress/learning-history",
  "tablet-correspondence": "/(home)/(tabs)/family/regulations-correspondence",
  "tablet-conversations": "/(home)/(tabs)/community/thread-list",
  "tablet-moderation": "/(moderation)/moderation-queue",
} as const;

export type ScreenId = keyof typeof screenRoutes;
