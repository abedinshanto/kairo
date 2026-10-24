# Kairo design system — "soft premium"

The UI was rebuilt to feel calm, clean and premium, following the owner's reference shots
(`/tmp/claude-0/-home-user-cloud-ssh/9b331f54-4135-5ec7-afc2-93a3164a8092/images/1.webp` … `5.png`).
**Open and study them before designing.** What we take from each:

| Ref | Take |
| --- | --- |
| 1.webp (task app) | Two-tone greeting ("HI ZJ, **nice to see you!**" ink + gray). Pill tabs with dim counts, active one solid royal blue. ONE huge royal-blue hero card per screen with 40px corners, 2 lighter cards peeking behind it. White circle icon buttons with a hairline. White "priority" tag on blue. "Drag to mark done" slider + white circle action button. Floating pill bottom nav (active = blue pill with label, others = soft circles). |
| 2.webp | Sky gradient hero with a cute character, centred friendly copy, glass pills. Character-led warmth = premium. |
| 3.webp (Fluentify) | Periwinkle canvas with blurred blue glows. Stat tiles: one tinted blue, one white, big number + small unit ("1.5 Hours"). Circle icon buttons. Soft striped/tinted cards. Floating glass nav. |
| 4.png (Sema) | Lots of air. Calm blurred blue blobs. Simple, short copy. Dark pill CTA. Mascots with heavy-lidded eyes. |
| 5.png | Light blue canvas, white cards, rounded blue hero, circle icon buttons, "swipe to pay" slider. Very few elements per screen. |

## Principles

1. **One hero per screen.** A single saturated blue (or phase-coloured) card carries the headline. Everything else is white, soft or tinted.
2. **Fewer, bigger things.** Max ~5 blocks per screen. Prefer one big number to six small ones. Progressive disclosure (sheets, "See all") over density.
3. **Air over lines.** No borders between cards; use spacing (16px gaps, 28px between sections) and `--shadow-sm`. Hairline dividers only inside lists.
4. **Round and soft.** Cards 32px radius (hero 40px), pills/buttons fully round, icons inside circles.
5. **Two-tone headings.** Every screen opens with `<PageTitle strong="…" dim="…" />`.
6. **Friendly.** Kai the buddy (`<Buddy />`) appears where it adds warmth (hero cards, empty states, onboarding). Copy is short, human, encouraging.
   Kai is a plump clay bean with bear-cub ears and stubby feet: solid navy eyes with crisp catchlights, soft blush, light from the top-left (base gradient, a core shadow at the bottom, a faint rim light, one small highlight) and no halos. The face carries the mood and the ears add body language. It must read at 40px, so keep details bold. The app icon (`branding/logo.svg`) is the white Kai on brand blue.
7. **Light-first.** Design in light; dark must also look right (tokens handle it — never hard-code `#fff` backgrounds for surfaces; white text on hero cards is fine).

## Tokens (src/styles/tokens.css — do not edit)

- Canvas `--canvas`; surfaces `--surface` (white cards), `--surface-soft`, `--surface-sunk`, `--surface-tint`, `--brand-tint`, `--brand-tint-2`.
- Ink `--ink`, `--ink-2` (secondary; **all small text**, ≥4.5:1 on canvas and cards), `--ink-3` (icons and the dim half of large titles only), `--ink-4` (disabled/outline).
- Brand `--brand` (#2058F5), `--brand-hi`, `--brand-deep`, `--brand-ink` (text on tint), hero fill `--hero` + `--hero-shadow`.
- Phase fills `--phase-short`, `--phase-long` (+ `-solid`, `-hi` for peeking cards, `-shadow`). Every stop of every hero fill keeps white text at ≥4.5:1.
- Glass on hero cards: `--hero-glass` / `--hero-glass-hover` (navy, so white labels keep their contrast). Never put white-on-white glass on a coloured card.
- Data: `--productive` (blue), `--neutral` (gray), `--distracting` (coral, `--distracting-tint`). Validated for colour-blind separation in both themes.
- Status: `--good`/`--good-tint`, `--warn`, `--danger`/`--danger-tint`; text on those tints uses `--good-ink`, `--warn-ink`, `--danger-ink`.
- Radii `--r-sm 12 · --r-md 18 · --r-lg 24 · --r-xl 32 · --r-2xl 40 · --r-pill`.
- Shadows `--shadow-sm` (cards), `--shadow-md`, `--shadow-lg` (sheets), `--shadow-nav`.
- Font: Plus Jakarta Sans (already loaded). Weights 500/600/650/700.

## Building blocks

React (`src/components/ui/index.tsx`): `PageTitle`, `TopBar`, `PillTabs`, `Segmented`, `Switch`, `Slider` (`onBrand` for hero cards), `Stepper`, `Sheet` (bottom sheet on phones, dialog on desktop), `Avatar` (initials, tinted by productivity), `Delta` (pill), `SlideToConfirm`, `Toasts`, `cx`.
`<Buddy mood="idle|focus|break|paused|happy|sleep" tone="blue|mint|violet|cloud" size={…} />` in `src/components/Buddy.tsx` (use `tone="cloud"` on blue cards).

CSS classes (`src/styles/ui.css`, `src/styles/shell.css`):

- Type: `.display` (40px two-tone, `.dim` span), `.title` (22px), `.label` (13px gray), `.big-number` (+ `<small>` unit), `.muted`, `.faint`.
- Cards: `.card` (white, 32px), `.card.soft`, `.card.tint` (pale blue), `.card.hero` (royal blue gradient, white text, sheen), `.card.flush`, `.card-head`, `.card-title`, `.card-sub`. Wrap a hero in `<div className="stacked">` for the peeking cards behind it.
- **Soundscape art is the one place colour families mix.** Preset tiles and the mix thumbnail use soft pastels (`.art-*`, `.sounds .preset.art-*`), like album art. Nowhere else.
- **Say it once.** A number, state or action appears once per viewport: no hero legend repeating the headline, no second play button for the same thing, no badge restating a progress bar.
- **One coloured hero per app, not per screen.** The stacked blue hero belongs to the moment that matters (the timer on Home, the current task on Tasks, Stats' headline number). Secondary screens (Apps, Settings) use white or tint cards.
- Header links ("See all", "All tasks", "Show more"): `.btn.btn-ghost.btn-sm.card-link`.
- Buttons: `.btn` + `.btn-primary | .btn-dark | .btn-soft | .btn-ghost | .btn-danger | .btn-on-brand | .btn-glass`, `.btn-sm`, `.btn-block`.
- Circles: `.circle-btn` (+ `.sm | .lg | .xl`, `.brand | .on-brand | .glass | .soft`). Add `className="fill"` on Play/Pause icons.
- `.pills` / `.pill` (+ `.active`, `.pill-count`, `.pills.sm`, `.pills.fade-end`), `.segmented`, `.chip` (+ `.active | .on-brand`), `.badge` (+ `.brand | .good | .warn | .white`).
- `.icon-tile` (44px rounded square, + `.good | .warn | .gray | .round`).
- Inputs: `.input` (+ `.pill`), `.input-wrap` (leading icon), `.select`, `.switch`, `.slider`, `.stepper`.
- Lists: `.list`, `.list-row`, `.list-main`, `.list-title`, `.list-sub`, `.list-trail`.
- `.meter` (+ `.distracting | .done`), `.legend`, `.legend-item`, `.swatch`, `.delta`, `.empty`.
- Layout: `.stack-lg` (28px rhythm), `.stack`, `.stack-sm`, `.section-title` (+ `.link`), `.grid-2`, `.grid-3`, `.topbar` via `<TopBar/>`.
- Sound artwork: `.art .art-deep-work | -rainy-night | -ocean-calm | -forest | -campfire | -flow | -custom`.

**Exemplar:** `src/views/HomeView.tsx` + `src/styles/views/home.css`. Match its spacing, density and tone.

## Data visualisation

Charts follow the bundled dataviz method: thin bars (≤ 24px, 4px rounded data end, square at the baseline), 2px surface gap between stacked segments, solid hairline grids (never dashed) kept to 2–3 lines, a legend whenever there are ≥ 2 series, tooltips on hover/focus, an `sr-only` table twin, text in ink colours (never in series colours). Productive = `--productive`, neutral = `--neutral`, distracting = `--distracting`, in that stacking order (bottom → top). Sequential heat = one blue hue light→dark.

## Rules for screen builders

- Each view file imports its own stylesheet: `import "../styles/views/<name>.css";`. Scope selectors under the view's root class.
- **Only edit the files you own.** Do not edit `tokens.css`, `ui.css`, `shell.css`, `ui/index.tsx`, `Buddy.tsx`, `App.tsx`, `store.ts`, `types.ts`, backends or other views. Need a new primitive? Build it inside your view/CSS. Report anything shared you'd change.
- Keep **every existing feature** of the screen (read the current/legacy implementation first — legacy screens live in `.legacy/`).
- Desktop (≥1024px) may use two columns; ≤760px is a single column; content sits in `.page` (max 1120px). Leave room for the floating nav (the page already pads the bottom).
- Accessibility: real buttons, `aria-label` on icon-only buttons, visible focus, 44px touch targets, text contrast ≥ 4.5:1.
- Verify: `npx tsc --noEmit` (fix errors in your files), then screenshot with the snap tool and **look at the images**; iterate until it looks as premium as the references.

### Screenshot tool

A Vite dev server runs at http://localhost:1420 (hot reload). Capture with:

```bash
S=/tmp/claude-0/-home-user-cloud-ssh/9b331f54-4135-5ec7-afc2-93a3164a8092/scratchpad
node $S/tools/snap.mjs <outDir> <view[,view]> <light|dark> <desktop|mobile> [--full]
# views: home stats sounds tasks settings apps onboarding deep
```

Then `Read` the PNG. If you see an error overlay caused by another file, wait ~20s and retry — other screens are being rebuilt in parallel.
