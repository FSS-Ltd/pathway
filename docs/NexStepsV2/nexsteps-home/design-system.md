# NexSteps Home Design System Handoff

The approved prototype already matches the production mobile token family.
Production work must consume the existing tokens instead of copying CSS values
from the prototype.

## Production sources

- `packages/mobile-core/src/tokens.ts` — cross-platform mobile token source.
- `apps/mobile/src/design/tokens.ts` — mobile re-export and space helpers.
- `apps/mobile/src/components/primitives/ui.tsx` — existing cards, buttons,
  chips, list rows and section titles.
- `apps/mobile/src/components/navigation/family-bottom-nav.tsx` — current
  family navigation implementation to evolve deliberately.
- `packages/ui/src/theme.ts` — shared web/admin theme, not a substitute for
  React Native tokens.

## Approved tokens

| Role            | Token/value           | Usage                                                    |
| --------------- | --------------------- | -------------------------------------------------------- |
| Primary mint    | `#76D7C4`             | Main action, completed setup path, selected control      |
| Strong mint     | `#5CC9B4`             | Pressed/strong accent where the token system provides it |
| Soft mint       | `#DDF5EF`             | Calm information and selected backgrounds                |
| Focus yellow    | `#FFD166`             | One current-focus or family accent                       |
| Soft yellow     | `#FFF7DA`             | Focus background                                         |
| Supporting blue | `#4DA9E5`             | Information and serve-space distinction                  |
| Primary text    | `#333333`             | Headings and text on mint/yellow                         |
| Muted text      | `#666666`             | Supporting copy                                          |
| Subtle text     | `#999999`             | Non-critical metadata only                               |
| Surface         | `#FFFFFF`             | Cards and main surfaces                                  |
| Canvas          | `#F5F5F5` / `#F8F9FA` | App and muted backgrounds                                |
| Danger          | `#D4183D`             | Destructive or genuine safety state only                 |

Use the semantic token name from `mobileTokens`; do not introduce duplicate
screen-local colour constants.

## Typography

- Headings: `Nunito_700Bold`.
- Body: `Quicksand_400Regular`.
- Use production typography sizes and weights from `mobileTokens`.
- Preserve dynamic type and supported accessibility sizes.
- Do not force a one-line heading when the approved meaning requires wrapping.

## Layout and components

- Use 20pt horizontal screen padding unless the existing route shell defines a
  different responsive container.
- Use 16–24pt surface radius from the production radius scale.
- Use spacing and dividers before shadow.
- Avoid nested cards; use sections inside one parent surface.
- Keep one dominant primary action.
- Touch targets are at least 44x44pt.
- Use the approved icon library already present in the mobile app.
- Do not create icons with CSS, text glyphs, emoji or handcrafted SVG.

Prefer existing primitives:

- `SectionTitle`
- `BrandedCard`
- `Chip`
- `StandardButton`
- `ListRow`

Extract a new shared primitive only after two production screens need the same
behaviour and accessibility contract.

## Navigation

The approved permanent order is:

`Week · Today · Community · Progress · Family`

The current three-tab Family Space is an implementation starting point, not the
approved end state. Migrate it in small entitlement-gated steps as described in
[implementation-map.md](implementation-map.md).

Active and inactive states must include an icon/label or another non-colour
signal. Tab labels may not clip at supported font scales.

## Screen-state treatment

- Loading: skeletons match final geometry.
- Empty: one useful action, no fake data or empty metrics.
- Error: preserve entered data and offer a clear retry.
- Offline: distinguish queued private changes from unsent Community actions.
- Permission: explain the parent-safe reason without exposing internal role or
  tenant details.
- Success: update the source screen directly; avoid unnecessary confirmation
  pages unless the action is security-sensitive.

## Visual QA

For screens represented in [approved-screens](approved-screens):

1. Capture the production state at the same device dimensions.
2. Compare it beside the approved reference.
3. Check hierarchy, padding, typography, colour, radius, icon sizing, touch
   target and clipped content.
4. Verify the same flow on an iPhone and Pixel-class Android viewport.
5. Record intentional differences in the PR.

The representative screenshots are evidence. The full interaction and copy
contract lives in the prototype and screen inventory.
