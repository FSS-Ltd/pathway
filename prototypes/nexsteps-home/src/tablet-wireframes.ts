import type { TabletTwoPaneScreen } from "./wireframe-types";

/**
 * Tablet two-pane composites for the flows approved for master/detail
 * treatment (Plan 03 of the NexSteps Home build-plan series). Each pane
 * reuses an existing approved phone screen's own blocks verbatim -
 * `listScreenId`/`detailScreenId` resolve via screensById at render time -
 * so the tablet layout is the identical approved content recomposed side
 * by side, not new copy. This keeps the tablet experience feeling like the
 * same product, and keeps a family member who only ever sees the phone
 * layout from encountering anything unfamiliar if they later pick up an
 * iPad: same cards, same language, same primary actions, just more of
 * them visible at once.
 *
 * "progress/detail" and "evidence gallery/detail" from the approved
 * candidate list are the same underlying list+detail shape - Learning
 * history, Evidence gallery and Reports all pair a ListCard-style list
 * with a ContentCard-style detail. One composite (learning-history +
 * log-detail) demonstrates the pattern; reports-list/report-detail-download
 * and evidence-gallery/evidence-detail-upload reuse it verbatim when a
 * later plan implements them for tablet - no separate mockup needed for a
 * layout shape that's already proven.
 */
export const tabletScreens: TabletTwoPaneScreen[] = [
  {
    id: "tablet-week-day",
    group: "tablet-two-pane",
    eyebrow: "Week · iPad",
    title: "Week and day, side by side",
    description:
      "The week list and the day plan share the screen - no tapping back and forth to see what's next.",
    listScreenId: "week-home",
    detailScreenId: "day-detail",
  },
  {
    id: "tablet-progress-detail",
    group: "tablet-two-pane",
    eyebrow: "Progress · iPad",
    title: "Learning history and detail, side by side",
    description:
      "Browse the record on the left, read one entry in full on the right. The same pattern covers Evidence and Reports.",
    listScreenId: "learning-history",
    detailScreenId: "log-detail",
  },
  {
    id: "tablet-correspondence",
    group: "tablet-two-pane",
    eyebrow: "Family · Correspondence · iPad",
    title: "Correspondence, side by side",
    description:
      "Every letter on the left, the one you're preparing a response to on the right.",
    listScreenId: "regulations-correspondence",
    detailScreenId: "regulations-correspondence-detail",
  },
  {
    id: "tablet-conversations",
    group: "tablet-two-pane",
    eyebrow: "Community · iPad",
    title: "Discussions, side by side",
    description:
      "Skim what other families are discussing on the left, read and reply without losing your place on the right.",
    listScreenId: "thread-list",
    detailScreenId: "thread-detail",
  },
  {
    id: "tablet-moderation",
    group: "tablet-two-pane",
    eyebrow: "Moderation · iPad",
    title: "Reports, side by side",
    description:
      "The queue on the left, the report a moderator is actually deciding on the right.",
    listScreenId: "moderation-queue",
    detailScreenId: "moderation-report",
  },
];

export const firstTabletScreenId = tabletScreens[0].id;
