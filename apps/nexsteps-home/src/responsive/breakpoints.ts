/**
 * Matches the precedent in `Design Branding Guidelines/src/components/MobileFirst.tsx`
 * (a web/Tailwind export of the older design, reference only — not imported).
 * `apps/mobile` has no equivalent: its `maxReadableWidth: 720` token is
 * declared and never used.
 */
export const breakpoints = {
  tablet: 768,
} as const;

export function isTabletWidth(width: number): boolean {
  return width >= breakpoints.tablet;
}
