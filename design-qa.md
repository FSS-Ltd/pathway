# NexSteps Home landing page design QA

## Evidence

- Source visuals: `apps/web/public/images/homeschool/week-home.png`, `today.png`, `progress-overview.png`, `community-home.png`, and `regulations-overview.png`
- Combined source and implementation comparison: `docs/qa/nexsteps-home-comparison.png`
- Full-view implementation evidence: `docs/qa/nexsteps-home-contact-sheet.jpg`
- Focused implementation captures: `docs/qa/nexsteps-home-desktop-focus.png` and `docs/qa/nexsteps-home-mobile-focus.png`
- Desktop viewport: 1440 × 1000 CSS pixels
- Mobile viewport: 390 × 844 CSS pixels
- Comparison normalization: the 394 × 852 source screen was proportionally scaled and padded to 390 × 844 before being placed beside the 390 × 844 implementation capture. No crop or density substitution was applied.
- State: loaded production build, product reveal in view, navigation available, no form submission.

## Comparison history

1. Checked the hero, five product chapters, trust section, FAQ, waiting-list form, closing CTA, and footer at desktop width.
2. Checked the hero, product chapter, mobile menu, FAQ disclosure, and waiting-list form at mobile width.
3. Placed the source Week screen and the live Week reveal in one comparison image to verify the real product asset, crop, palette, typography density, and surface treatment.
4. Captured every major section as a desktop contact sheet because the page intentionally uses sticky scroll scenes; a static full-page capture does not represent those motion states correctly.

## Findings

- No P0, P1, or P2 fidelity, interaction, responsiveness, or accessibility issues were found.
- The five selected wireframe screens are used directly. No placeholder UI, CSS art, custom SVG illustration, or substituted product imagery is present.
- The landing-page typography, calm mint/yellow/sky chapter palette, rounded phone surfaces, borders, and soft elevation preserve the source product language while adapting it to an editorial marketing layout.
- Desktop and mobile layouts have no horizontal overflow. Copy remains readable, screenshots retain their aspect ratio, controls retain practical tap targets, and the form keeps explicit labels for every field.
- Mobile navigation expands correctly and exposes the Homeschool route. FAQ disclosures open correctly. The empty form reports five required invalid controls through native validation.
- The browser console contained no warnings or errors during the final interaction pass.
- P3 polish note: the mobile hero gives the value proposition and CTA the first viewport; the product preview follows immediately below the fold. This is an intentional conversion-first hierarchy rather than a blocking mismatch.
- Reduced-motion behavior is implemented in the product reveal component by removing motion transforms when `prefers-reduced-motion` is active. The final browser pass did not emulate the operating-system preference.

## Final result

passed
