# Kairo design system — "sage"

Calm, minimal and premium. The references are soft, character-led wellness apps: a pale
sage canvas with mint light, white cards, a cute 3D-looking mascot, a big title with one quiet
line under it, glass chips, and a single dark pill for the action that matters. Premium apps
show very little text; Kairo follows suit. Every word on screen has to earn its place.

## Principles

1. **Say less.** A title and at most one quiet line per page. Captions appear only when they
   carry news (listening…, the linked task, "Add as task"). No explanatory paragraphs; settings
   rows get a description only where behaviour needs it.
2. **Title first.** Every screen opens with `<TopBar title sub right left />`: the page's name
   (44px), one line under it, circle buttons on the right, an optional back button on the left.
   Don't add a second header.
3. **One hero per screen.** A light wash card (`.card.hero`) holds the moment that matters: the
   timer on Home, the current task on Tasks, the headline on Stats and Summary, the player on
   Sounds. Everything else is a white card.
4. **One dark action.** The primary action is a deep ink pill or circle (`--cta`): play, "Get
   started", the active tab, the active nav item. Leaf green (`--brand`) is for progress, state
   and accents (rings, switches, meters, the add button), never for text-bearing buttons.
5. **Air over lines.** No borders between cards; 20px gaps, soft green-tinted shadows. Hairlines
   only inside lists.
6. **Round and soft.** Cards 30px (hero 38px), pills and buttons fully round, icons in circles.
7. **Alive, gently.** Kai breathes and blinks; the canvas light drifts very slowly; tabs, tips
   and chips ease in. Respect `prefers-reduced-motion` everywhere.
8. **Light-first, dark twin.** Design in light; dark is a stepped forest twin from the tokens.
   Never hard-code white text or white surfaces; use `--hero-ink`, `--surface`, etc.

## Tokens (`src/styles/tokens.css`)

- Canvas `--canvas` + `--canvas-glow-1/2/3`; surfaces `--surface`, `--surface-soft`,
  `--surface-sunk`, `--surface-tint`, `--glass`, `--nav-glass`; `--track` for the empty part of
  rings, meters and bars.
- Ink `--ink`, `--ink-2` (all small text, ≥ 4.5:1), `--ink-3` (icons, large text), `--ink-4`.
- Brand `--brand` (#2F9A5C), `--brand-hi`, `--brand-deep`, `--brand-tint`, `--brand-tint-2`,
  `--brand-ink` (text on white/tint). `--on-brand` only for icons on a brand fill (white on
  `--brand` is 3.6:1, too low for small text).
- Action `--cta`, `--cta-hover`, `--on-cta`, `--cta-shadow`.
- Hero washes `--hero` (mint), `--phase-short` (sky), `--phase-long` (lilac), each with a
  `-shadow`; on them use `--hero-ink`, `--hero-ink-2`, `--hero-track`, `--hero-fill`, and white
  glass `--hero-glass` / `--hero-glass-hover` / `--hero-glass-line`.
- Data `--productive` (dark green), `--neutral` (grey), `--distracting` (light coral): separated
  by lightness as well as hue, so they survive colour-blindness. Status `--good`, `--warn`,
  `--danger` with `-tint` and `-ink`.
- Radii `--r-sm 12 · --r-md 18 · --r-lg 24 · --r-xl 30 · --r-2xl 38 · --r-pill`.
- Type scale `--fs-caption 12 · --fs-label 13 · --fs-body 15 · --fs-title 17 · --fs-headline 22 ·
  --fs-display 44`. Spacing on a 4px rhythm `--sp-1 … --sp-12` (4 … 48).
- Motion: `--dur-press 120ms` (feedback), `--dur-state 200ms` (hover, toggles), `--dur-enter
  320ms`, `--dur-exit 200ms` (exits ≈ ⅔ of entrances), `--dur-page 480ms`; arrive with
  `--ease-out`, leave with `--ease-in`, bounce only with `--spring`.
- Layers `--z-raised 1 · --z-nav 40 · --z-sheet 60 · --z-onboarding 65 · --z-toast 70 ·
  --z-palette 80 · --z-skip 100`. Never a raw z-index above 1 in a view stylesheet.
- Shadows `--shadow-sm` (cards), `--shadow-md`, `--shadow-lg` (sheets), `--shadow-nav`.
- Font: Plus Jakarta Sans (variable). Weights 500/600/650/700. Titles −0.04em tracking.

## Kai (`src/components/Buddy.tsx`, `src/styles/kai.css`)

`<Buddy mood tone size still label />`. A soft mochi with a two-leaf sprout, lit from the top
left (radial body gradient, core shadow, bloom, a faint rim, one specular highlight).

- Moods: `idle` (open eyes, looks around), `focus` (eyes lowered onto the work, slower breath,
  ignores the pointer), `break` (sunglasses, gentle sway), `paused` (glancing aside), `happy`
  (^ ^ and a grin, little hops), `sleep` (closed eyes, drooping sprout, floating z's), `listen`
  (wide eyes, perked sprout, quicker breath), `think` (eyes up, wavy mouth), `calm` (eyes softly
  closed, still: used while breathing; the card scales Kai with the breath).
- Blossom: once today's focus goal is met (`useApp().bloom`), every Kai wears a flower where the
  leaves meet. `bloom={false}` opts a Kai out.
- Tones: `leaf` (default), `cloud` (white), `sky` (short break), `lilac` (long break).
- Motion is layered on nested groups (`.kai-hop > .kai-sway > .kai-breathe`), so breathing,
  swaying, a pop on mood change and a squish on tap combine. Blinks and glances come from JS at
  uneven intervals; eyes follow the pointer through one shared listener (sizes ≥ 40px).
- It must read at 24px: keep the face bold. The app icon (`branding/logo.svg`) is the cloud-tone
  Kai with lime leaves on a leaf-green squircle.

## Building blocks

React (`src/components/ui/index.tsx`): `TopBar`, `PageTitle`, `PillTabs`, `Segmented`,
`Switch`, `Slider` (`onBrand` on heroes), `Stepper`, `Sheet`, `Avatar`, `Delta`,
`SlideToConfirm`, `Equalizer`, `Toasts`, `cx`.

CSS (`src/styles/ui.css`, `shell.css`):

- Type: `.display` (+ `.page-sub` line), `.title`, `.label`, `.big-number` (+ `<small>` unit).
- Cards: `.card`, `.card.soft`, `.card.tint`, `.card.hero`, `.card-head`, `.card-title`,
  `.card-sub`.
- Buttons: `.btn` + `.btn-primary` / `.btn-dark` / `.btn-on-brand` (all the ink pill),
  `.btn-brand`, `.btn-soft`, `.btn-ghost`, `.btn-danger`, `.btn-glass` (on heroes), `.btn-sm`,
  `.btn-block`. Header links: `.btn.btn-ghost.btn-sm.card-link`.
- Circles: `.circle-btn` (+ `.sm | .lg | .xl`, `.ink` / `.on-brand` (ink), `.brand`, `.glass`,
  `.soft`, `.ghost`). Add `className="fill"` on Play/Pause icons.
- `.pills` / `.pill` (+ `.active` = ink), `.segmented`, `.chip` (+ `.on-brand` on heroes),
  `.badge` (+ `.brand | .good | .warn | .white`), `.icon-tile`, `.live-dot`, `.eq`.
- Inputs: `.input` (+ `.pill`), `.input-wrap`, `.select`, `.switch`, `.slider`, `.stepper`.
- Lists: `.list`, `.list-row`, `.list-main`, `.list-title`, `.list-sub`, `.list-trail`.
- `.meter`, `.legend`, `.swatch`, `.delta`, `.empty`.
- Sound artwork: `.art .art-<preset>` — the one place several colour families meet, as soft
  pastels like album art.

**Exemplar:** `src/views/HomeView.tsx` + `src/styles/views/home.css`.

## Navigation (`src/App.tsx`, `src/styles/shell.css`)

One set of destinations, three shapes (Material's adaptive navigation):

- **≥ 1100px: sidebar** (236px). Kai and the name, **Search ⌘K**, Home · Stats · Sounds · Tasks,
  a live **mini timer** (on every screen but Home, where the timer is already the hero), and
  Settings set apart below a hairline as secondary navigation.
- **761–1099px: rail** (88px). The same items, icon over label; the timer shrinks to its time and
  play button.
- **≤ 760px: tab bar.** A floating glass bar with all five items labelled; the active one gets an
  ink pill behind its icon.

Every item always shows its label (never icon-only). Apps & sites and the summaries highlight
Stats. A **skip link** is the first Tab stop; after navigating, focus moves to the new page's
`h1`. The scroller has `scroll-padding` so keyboard focus is never hidden behind the tab bar.

**Command palette** (`src/components/CommandPalette.tsx`): ⌘K / Ctrl+K anywhere (or the sidebar's
Search). Timer actions, screens, open tasks ("Focus on …"), sounds, theme and tracking, grouped,
best match first; arrow keys + Enter, Esc closes and returns focus. An unmatched query suggests
what to try. It's a combobox with a listbox (`aria-activedescendant`), the app behind is inert.

## Layout

Content sits in `.page` (max 1120px, 32px gutters, 18px on phones) to the right of the sidebar or
rail (`--sidebar-w`). Desktop screens are a
two-column grid (`1.3fr / 1fr`, 20px gap, `align-items: stretch`) whose rows start and end on the
same lines; the last card in a column stretches to take up the slack. ≤ 1024px stacks; ≤ 760px is
phone layout. The floating glass nav sits at the bottom; the page pads for it.

## Data visualisation

Thin bars (≤ 24px, rounded data end), 2px gaps between stacked segments, 2–3 solid hairline grid
lines, a legend for ≥ 2 series, tooltips on hover/focus, an `sr-only` table twin, text in ink
(never in series colours). Stack productive → neutral → distracting from the baseline. On a hero
wash, charts keep the data colours and use `--hero-track` for empty and neutral parts.

## Sound (`src/lib/audio/`)

`synth.ts` makes every loop *circular* (filters warmed up over the loop, events wrapping, whole
cycles of slow modulation), so loops repeat without a crossfade, and renders each to −20 LUFS
(ITU-R BS.1770 K-weighting, peaks under 0.92). It runs in `synth.worker.ts`; `engine.ts` mixes,
caches rendered loops (64 MB, least-recently-used out first), unlocks audio on the first gesture
and keeps the context awake until a chime has rung out. Live sounds (wind, binaural, pad) have
trims measured to the same loudness.

## Accessibility & interaction

Real buttons, `aria-label` on icon-only buttons, visible focus rings (ink on heroes), text ≥ 4.5:1
in both themes, reduced motion respected. Pointer targets are at least 24×24 on desktop and
44×44 on touch screens (`@media (pointer: coarse)` in `ui.css`; a control that must stay small
visually, like the task grip, gets a larger invisible hit area instead).

Toasts dismiss themselves after 4.5s (7s with an action), but never while hovered or focused;
they can carry one action, such as **Undo** after finishing a task.

## UI UX Pro Max (design QA)

The [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill is installed
for Claude Code in `.claude/skills/ui-ux-pro-max/`. Use it for any UI change: its rules
(`references/quick-reference.md`) are the checklist, and its search answers focused questions,
run from the project root:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "focus not obscured sticky" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "rerender memo list" --domain react
```

Its generated palettes and landing-page patterns don't fit Kairo (it's an app, and its sage
direction was chosen by the owner): keep this file as the source of truth and use the skill for
rules and reviews. Kairo's last audit (axe-core on every screen, light and dark, desktop and
phone) found no violations.

## Verify

`npm run typecheck`, then look at every screen in light and dark, desktop and phone width
(`npm run dev`, http://localhost:1420; `#panel` and `#capture` open the small windows).
