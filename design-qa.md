# NexSteps Home landing page design QA

## Evidence

- Source visuals: `apps/web/public/images/homeschool/week-home.png`, `today.png`, `progress-overview.png`, `community-home.png`, and `regulations-overview.png`
- Combined source and implementation comparison: `docs/qa/nexsteps-home-comparison.png`
- Full-view implementation evidence: `docs/qa/nexsteps-home-contact-sheet.jpg`
- Focused implementation captures: `docs/qa/nexsteps-home-desktop-focus.png` and `docs/qa/nexsteps-home-mobile-focus.png`
- User responsive-feedback source: `docs/qa/nexsteps-view-size-feedback.jpg` (1482 × 2416 pixels; CSS viewport and device density were not embedded in the HEIC source)
- Responsive comparison: `docs/qa/nexsteps-responsive-feedback-comparison.jpg`
- Exact 1100 CSS pixel before/after comparison: `docs/qa/nexsteps-responsive-before-after.jpg`
- Revised responsive captures: `docs/qa/nexsteps-responsive-after-390.jpg`, `nexsteps-responsive-after-1024.jpg`, `nexsteps-responsive-after-1100.jpg`, `nexsteps-responsive-after-1179.jpg`, and `nexsteps-responsive-after-1280.jpg`
- Revised focused captures: `docs/qa/nexsteps-responsive-product-1100.jpg` and `docs/qa/nexsteps-responsive-waitlist-1100.jpg`
- Desktop viewport: 1440 × 1000 CSS pixels
- Mobile viewport: 390 × 844 CSS pixels
- Comparison normalization: the 394 × 852 source screen was proportionally scaled and padded to 390 × 844 before being placed beside the 390 × 844 implementation capture. No crop or density substitution was applied.
- Responsive-feedback normalization: the 1482-pixel-wide source was proportionally scaled to 1100 pixels and its first 1200 pixels were compared with the 1100 × 1200 implementation capture. The exact before/after pair uses the same 1100 × 1200 CSS viewport and browser state.
- State: loaded production build, product reveal in view, navigation available, no form submission.

## Comparison history

1. Checked the hero, five product chapters, trust section, FAQ, waiting-list form, closing CTA, and footer at desktop width.
2. Checked the hero, product chapter, mobile menu, FAQ disclosure, and waiting-list form at mobile width.
3. Placed the source Week screen and the live Week reveal in one comparison image to verify the real product asset, crop, palette, typography density, and surface treatment.
4. Captured every major section as a desktop contact sheet because the page intentionally uses sticky scroll scenes; a static full-page capture does not represent those motion states correctly.
5. The user-provided feedback image exposed a P1 hero collision at the intermediate responsive layout: tall product imagery covered the paragraph, secondary CTA, and privacy line.
6. Moved the hero, product-reveal, and waiting-list split layouts to the 1280-pixel breakpoint. Increased the single-column hero-art stage so its bottom-anchored phone image cannot bleed upward into copy.
7. Re-captured 390, 1024, 1100, 1179, and 1280-pixel widths. At 1100 pixels the product artwork now begins 54 pixels after the privacy line, with no horizontal overflow or console errors.
8. Re-checked the first product chapter and waiting-list form at 1100 pixels. Both use readable single-column layouts and preserve the original hierarchy.

## Findings

- The earlier P1 intermediate-width collision is resolved. No P0, P1, or P2 fidelity, interaction, responsiveness, or accessibility issues remain.
- The five selected wireframe screens are used directly. No placeholder UI, CSS art, custom SVG illustration, or substituted product imagery is present.
- The landing-page typography, calm mint/yellow/sky chapter palette, rounded phone surfaces, borders, and soft elevation preserve the source product language while adapting it to an editorial marketing layout.
- Desktop and mobile layouts have no horizontal overflow. Copy remains readable, screenshots retain their aspect ratio, controls retain practical tap targets, and the form keeps explicit labels for every field.
- Typography: display sizes retain their editorial impact, while the 1024–1179 range now receives the full available line length before imagery begins. Heading wrapping is intentional at 390 and 1280 pixels and does not collide with adjacent content.
- Spacing and layout: intermediate widths use a single-column reading order; wide screens retain the two-column composition. The product art, form, and chapter screens have clear separation from their copy.
- Colors and tokens: the dark green, mint, cream, yellow, and sky palette is unchanged by the correction and keeps sufficient contrast.
- Image quality: all five real wireframe assets retain their aspect ratios, sharp rendering, rounded masks, and shadow treatment. No substitute artwork was introduced.
- Copy and content: no marketing or answer-engine copy changed; only its responsive presentation changed.
- Mobile navigation expands correctly and exposes the Homeschool route. FAQ disclosures open correctly. The empty form reports five required invalid controls through native validation.
- The browser console contained no warnings or errors during the final interaction pass.
- P3 polish note: the mobile hero gives the value proposition and CTA the first viewport; the product preview follows immediately below the fold. This is an intentional conversion-first hierarchy rather than a blocking mismatch.
- Reduced-motion behavior is implemented in the product reveal component by removing motion transforms when `prefers-reduced-motion` is active. The final browser pass did not emulate the operating-system preference.

## Final result

passed
