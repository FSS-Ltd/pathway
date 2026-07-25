const ACQUISITION_FUNNEL_PATHS = new Set(["/pricing", "/buy"]);

export function configuratorRolloutHref(href: string): string {
  return ACQUISITION_FUNNEL_PATHS.has(href) ? "/configure" : href;
}
