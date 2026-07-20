/**
 * Analytics wrapper for Nexsteps marketing site.
 * Provides typed event tracking with provider abstraction.
 */

export type AnalyticsUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

export type AnalyticsEvent =
  | { type: "cta_demo_click"; location: string; sector?: string | null }
  | { type: "demo_submit"; sector?: string | null; utm?: AnalyticsUtm }
  | { type: "toolkit_download"; resourceSlug?: string; utm?: AnalyticsUtm }
  | { type: "pricing_view"; variant?: string | null; utm?: AnalyticsUtm }
  | {
      type: "sector_page_view";
      sector: "schools" | "clubs" | "churches" | "charities";
      utm?: AnalyticsUtm;
    }
  | { type: "app_login_click"; location: string; sector?: string | null }
  | { type: "readiness_start"; utm?: AnalyticsUtm }
  | { type: "readiness_step_view"; step: number; total: number; utm?: AnalyticsUtm }
  | { type: "readiness_complete"; score: number; band: string; utm?: AnalyticsUtm }
  | { type: "readiness_result_view"; score: number; band: string; utm?: AnalyticsUtm }
  | { type: "readiness_cta_click"; location: string; destination: string; utm?: AnalyticsUtm }
  | { type: "readiness_lead_submit"; utm?: AnalyticsUtm }
  | {
      type: "team_tracker_form_submit";
      organisationType: string;
      role: string;
      marketingOptIn: boolean;
      utm?: AnalyticsUtm;
    }
  | { type: "team_tracker_download"; utm?: AnalyticsUtm };

/**
 * Track an analytics event.
 * Safely no-ops if provider is not configured or on server-side.
 */
export function track(event: AnalyticsEvent): void {
  // No-op on server
  if (typeof window === "undefined") {
    return;
  }

  // Provider implementations
  // PostHog
  const win = window as Window & {
    posthog?: { capture: (event: string, props: Record<string, unknown>) => void };
    plausible?: (event: string, options?: { props?: Record<string, unknown> }) => void;
  };

  if (typeof win.posthog !== "undefined") {
    try {
      win.posthog.capture(event.type, {
        ...event,
        timestamp: new Date().toISOString(),
      });
      return;
    } catch (err) {
      console.warn("[Analytics] PostHog capture failed:", err);
    }
  }

  // Plausible
  if (typeof win.plausible !== "undefined") {
    try {
      win.plausible(event.type, {
        props: {
          ...event,
        },
      });
      return;
    } catch (err) {
      console.warn("[Analytics] Plausible capture failed:", err);
    }
  }

  // Custom endpoint (if configured)
  const customEndpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  if (customEndpoint) {
    try {
      fetch(customEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...event,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch((err) => {
        console.warn("[Analytics] Custom endpoint failed:", err);
      });
      return;
    } catch (err) {
      console.warn("[Analytics] Custom endpoint error:", err);
    }
  }

  // Development mode: log to console
  if (process.env.NODE_ENV === "development") {
    console.log("[Analytics] Event:", event);
  }
}
