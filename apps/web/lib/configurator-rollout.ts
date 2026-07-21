const ACQUISITION_FUNNEL_PATHS = new Set(["/pricing", "/buy"]);

export function configuratorRolloutHref(href: string): string {
  return process.env.NEXT_PUBLIC_USE_CONFIGURATOR === "true" &&
    ACQUISITION_FUNNEL_PATHS.has(href)
    ? "/configure"
    : href;
}
