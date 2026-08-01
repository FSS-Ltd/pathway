# Token conflicts: shared `mobileTokens` vs the approved wireframes

Recorded while building `src/design/tokens.ts` (Plan 01 of the NexSteps Home
build-plan series — see `../../../docs/NexStepsV2/nexsteps-home/build-plans/`).

Resolution rule: **the prototype wins on geometry, `design-system.md` wins on
semantics.** `packages/mobile-core/src/tokens.ts` is never mutated —
`apps/mobile` must stay byte-identical in behaviour.

## Colour

| Value | `mobileTokens` | `design-system.md` | Prototype CSS | Resolution |
|---|---|---|---|---|
| Muted/subtle text | `text.subtle: #999999` | Subtle text `#999999` | `--nsh-subtle: #8a9299` | Kept `mobileTokens.text.subtle` (#999999) — semantic token, shared across the app, not wireframe-specific chrome. |
| Soft blue | `accent.serveSoft: #E3F2FD` | — | `--nsh-blue-soft: #e8f4fc` | Neither is authoritative for a Home-only surface; not carried into `homeTokens.colors.wireframe` because nothing in the 76-screen inventory needs a distinct "serve" soft blue. Revisit if a Regulations & Evidence screen (Plan 10) needs the prototype's exact `#e8f4fc`. |

Everything else in `design-system.md`'s "Approved tokens" table matches
`mobileTokens` exactly (mint `#76D7C4`, strong mint `#5CC9B4`, soft mint
`#DDF5EF`, yellow `#FFD166`, soft yellow `#FFF7DA`, blue `#4DA9E5`, primary
text `#333333`, surface `#FFFFFF`, danger `#D4183D`) — no conflict, no
extension needed.

## Colours the wireframes use that neither `mobileTokens` nor
`design-system.md` name

Sourced from `prototypes/nexsteps-home/src/prototype.css` and
`styles.css` (see the prototype exploration in build-plans/PROGRESS.md).
Added under `homeTokens.colors.wireframe`:

| Token | Value | Prototype source |
|---|---|---|
| `line` | `#DDE3E8` | `--nsh-line` |
| `dangerSoft` | `#FFF0F2` | `--nsh-danger-soft` |
| `blueSoft` | `#E8F4FC` | `--nsh-blue-soft` |
| `eyebrow` | `#3D8C7D` | `.screen-eyebrow`, `.block-label` |
| `inlineAction` | `#318978` | `.inline-action` |
| `reviewCount` | `#377F72` | `.review-count` |
| `yellowIcon` | `#A96D00` | yellow-tone icon colour |
| `messageAvatar` | `#9A720A` | `.message-avatar` |
| `flowGroupHeading` | `#8A6200` | `.flow-group-heading > span` |

## Radius

`mobileTokens.radius` is `{sm:8, md:12, lg:16, xl:20, xxl:24, round:999}`.
The wireframes use 13/14/15px in several places that don't map onto that
scale cleanly. Added under `homeTokens.radius`:

| Token | Value | Wireframe source |
|---|---|---|
| `field` | 13 | `.field-group { border-radius: 13px }` |
| `control` | 14 | `.primary-button`/`.secondary-button`/`.week-day { border-radius: 14px }` |
| `stat` | 15 | `.stat-card { border-radius: 15px }` |

## Typography

`mobileTokens.typography.heading.lg` is `{size:30, lineHeight:36}` — close
to but not the same as the wireframe's screen title. The wireframes also use
`font-weight: 900`, which `mobileTokens.typography.weight` does not name
(its highest is `extraBold: "800"`). React Native's `fontWeight` accepts the
literal string `"900"` directly; no new weight token was added for a single
numeric string.

Added under `homeTokens.typography.wireframe`, values derived from
`prototype.css` (unitless CSS `line-height` is a multiplier of `font-size`;
`em` letter-spacing is `em-value × font-size`, rounded to the nearest whole
point since React Native's `letterSpacing` is expressed in points):

| Token | Source rule | size | lineHeight | letterSpacing | weight |
|---|---|---|---|---|---|
| `screenTitle` | `.screen-header h1` | 29 | 30 (29×1.02) | −1 (29×−0.035) | "900" |
| `flowIndexTitle` | `.flow-index h1` | 30 | 31 (30×1.02, same ratio as `screenTitle` — no distinct ratio stated for this rule) | −1 (30×−0.03) | "900" |
| `description` | `.screen-description` | 13 | 20 (13×1.55) | — | — |
| `eyebrow` | `.screen-eyebrow`, `.block-label` | 11 | — | 0.88 (11×0.08) | "800", uppercase |

## Fixed metrics

Added under `homeTokens.metrics`, all from `prototype.css`:

| Token | Value | Source |
|---|---|---|
| `screenContentTop` | 58 | `.screen-content` padding-top |
| `screenBottomPadding` | 28 | `.screen-content` padding-bottom (before safe-area addition) |
| `tabBarAwareBottomPadding` | 116 | `.screen-content.has-bottom-nav` padding-bottom (before safe-area addition) |
| `blockGap` | 12 | `.screen-blocks` gap |
| `listRowMinHeight` | 58 | `.list-row` min-height |
| `fieldGroupMinHeight` | 66 | `.field-group` min-height |
| `chipMinHeight` | 34 | `.choice-chip` min-height |
| `buttonMinHeight` | 50 | `.primary-button`/`.secondary-button` min-height |
| `statCardMinHeight` | 82 | `.stat-card` min-height |
| `weekDayMinHeight` | 78 | `.week-day` min-height |
| `tabBarBaseHeight` | 78 | `.bottom-navigation` height (before safe-area addition) |
