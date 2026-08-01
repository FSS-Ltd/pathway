export type AppTab = "Week" | "Today" | "Community" | "Progress" | "Family";

export type Tone = "mint" | "yellow" | "blue" | "neutral" | "danger";

export type FlowGroupId =
  | "setup"
  | "week-today"
  | "progress"
  | "community-families"
  | "community-conversations"
  | "community-meetups"
  | "family-settings"
  | "regulations-evidence"
  | "moderation"
  | "tablet-two-pane";

export type WireframeBlock =
  | {
      type: "notice";
      title: string;
      body: string;
      tone?: Tone;
    }
  | {
      type: "card";
      title: string;
      body: string;
      meta?: string;
      action?: string;
      target?: string;
      tone?: Tone;
    }
  | {
      type: "fields";
      fields: Array<{ label: string; value: string; helper?: string }>;
    }
  | {
      type: "chips";
      label?: string;
      items: string[];
      active?: string[];
    }
  | {
      type: "list";
      title?: string;
      items: Array<{
        title: string;
        detail?: string;
        meta?: string;
        target?: string;
      }>;
    }
  | {
      type: "stats";
      items: Array<{ value: string; label: string }>;
    }
  | {
      type: "message";
      sender: string;
      body: string;
      time: string;
      own?: boolean;
    }
  | {
      type: "week";
      activeDay: string;
      days: Array<{ day: string; date: string; count?: number }>;
    };

export interface WireframeScreen {
  id: string;
  group: FlowGroupId;
  eyebrow: string;
  title: string;
  description: string;
  tab?: AppTab;
  blocks: WireframeBlock[];
  primaryAction?: string;
  primaryTarget?: string;
  secondaryAction?: string;
}

/**
 * A tablet two-pane composite reuses an existing approved phone screen's
 * blocks verbatim as each pane's content - same copy, same tone, same
 * primitives - rather than authoring new content for tablet. `listScreenId`
 * and `detailScreenId` must both resolve via screensById.
 */
export interface TabletTwoPaneScreen {
  id: string;
  group: "tablet-two-pane";
  eyebrow: string;
  title: string;
  description: string;
  listScreenId: string;
  detailScreenId: string;
}
