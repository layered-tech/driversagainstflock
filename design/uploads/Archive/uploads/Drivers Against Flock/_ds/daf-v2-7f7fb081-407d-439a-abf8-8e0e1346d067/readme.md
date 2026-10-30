# Drivers Against Flock — Design System

> Privacy-first turn-by-turn navigation. *For drivers who prefer their routes with fewer creepy little boxes on poles.*

Drivers Against Flock (**DAF**) is a map-first navigation app that can route drivers around automated license-plate readers (ALPR cameras) and other roadside surveillance. It spans **Web** (marketing), **iOS**, and **Android**. This design system defines one visual language that scales from landing-page storytelling to full-screen maps, route comparison, marker details, and active turn-by-turn driving.

**Design ethos:** modern, privacy-first, trustworthy, practical, and *slightly* irreverent — never paranoid, gimmicky, or corporate. A serious navigation app with a privacy-aware edge.

### Sources provided
- `assets/logo-mark.png` → copied to `assets/logo-mark.png`. A stylized map mark: a place pin centered, with a **fastest (blue, solid)** and **private (green, solid)** route forming a path around it. This is the seed for the whole system.
- No codebase, Figma, or slide decks were attached. Everything here is built from the written brief + logo. If you have a codebase or Figma for the real product, attach it via the Import menu and we'll reconcile.

---

## CONTENT FUNDAMENTALS — voice & tone

We are **privacy-aware, not paranoid.** The brand can wink in marketing; the moment someone is driving, copy goes calm, direct, and literal.

- **Person:** "you" for the driver, "we" for DAF. Never "the user."
- **Casing:** Sentence case everywhere — buttons, titles, nav. Uppercase only on small eyebrows/labels (with `--ls-label` tracking).
- **Length:** Short. Route summaries are a clause, not a paragraph. In-drive instructions are a single imperative.
- **Numbers:** Concrete and tabular — "27 min", "13.1 mi", "4 cameras", "arrive 6:15".
- **Emoji:** Not in the product UI. Allowed sparingly as section glyphs on marketing/docs (e.g. privacy promises). Never in safety/driving copy.
- **Humor:** Dry, occasional, structural — *"creepy little boxes on poles"*, *"get there without the audience"*, *"a little less surveilled"*. One wink per surface, max. Never fear-based, never try-hard.

**Sounds like us**
- "This route skips 4 cameras. Two minutes slower, zero little boxes."
- "Turn right onto Market St." *(in-drive — plain, calm, no joke)*
- "We don't sell your trips. We don't keep them, either."

**Not us**
- "THEY are watching your EVERY move 😱" *(fear-mongering)*
- "Recalculating your optimal privacy-preserving trajectory…" *(robotic/corporate)*
- "Outsmart the surveillance state, legend 😎" *(try-hard, gimmicky)*

> **Rule:** Safety- and navigation-critical text (turn banners, hazard, speed) is never humorous. The wink lives in marketing, empty states, and informational copy only.

---

## VISUAL FOUNDATIONS

The system is **command UI floating over maps, in both light and dark.** It ships with a full **light and dark theme** — one semantic token set that flips via `[data-theme="light"|"dark"]` on any ancestor (default light). Controls are frosted-glass capsules that stay legible over either map. This theming discipline is the single most important rule — see *UI over map* below.

### Color
- **Brand — Signal Green `#1FBF6B`** (`--brand`). Means *go / private / safe*. Used for primary actions, the user-location dot, private routes, selected states. Full ramp `green-050…900`.
- **Ink neutrals** (`--ink-950…050`, warm-cool charcoal) feed the semantic surfaces/text. In **light**, glass is white @ 80% + blur and text is ink; in **dark**, glass is ink @ 82% + blur and text is near-white. You never reference the ramp directly — use `--surface-*`, `--text-*`, `--border-*`, which flip per theme.
- **Functional signals:** Azure `#2E8BFF` = fastest route · Alert red `#FF4D4F` = cameras/ALPR · Amber `#FFB02E` = monitored/caution · Violet `#7A5CFF` = destination.
- Always alias semantically (`--route-fast`, `--marker-alpr`, `--surface-glass`) — never hardcode hex in components.

### Type
- **Display — Geist** (300–800): headlines, big moments, sheet titles. Tight tracking (`--ls-display`). Precise, modern, a little technical.
- **UI/body — Hanken Grotesk** (300–800): every label, paragraph, control. Warm humanist grotesque, highly legible.
- **Data — JetBrains Mono** (400–700): speed, ETA, distance, coordinates, node IDs, badge numerals. Tabular figures via `--num-feature`.
- See the Type cards for the full scale (`--fs-display-xl` … `--fs-label`).

### Surfaces, borders, radii
- **Glass** (`--surface-glass`): translucent + `backdrop-filter: blur(16px)` + a 1px hairline. The default for anything floating over the map — themes automatically.
- **Solid** (`--surface-card`): sheets, panels, marketing, docs, forms.
- **Radii are a visible, role-mapped ladder** — `xs 6` tags · `sm 10` inputs & icon tiles · `md 14` route cards & rows · `lg 18` default card · `xl 24` hero · `2xl 32` modal shells · `pill` buttons/search/toggles. Each radius signals what kind of surface you're on; don't mix roles. See the *Radii* card.
- **Borders:** 1px hairlines (`--border`, `--border-glass`), theme-aware. No heavy outlines.

### Elevation (soft, neutral — no color cast)
- `--shadow-card` (resting light card) · `--shadow-float` (floating map controls) · `--shadow-sheet` (upward, bottom sheets) · `--shadow-marker` (tight, grounds pins). Shadows are pure ink at low opacity — never tinted.

### Backgrounds & imagery
- No gradient meshes, no purple, no decorative blobs. The "background" is almost always **the map** — a stylized vector canvas (`--map-land`, `--map-park`, `--map-water`, white roads). Marketing uses flat `--surface-page` and `--surface-inverse` bands.
- Imagery, when used, is the map itself or product screenshots — cool, clean, high-key. No stock photography of "hackers" or surveillance clichés.

### Motion (calm, grounded)
- Durations `90–420ms`; `--ease-standard` for most, `--ease-sheet` for sheets, `--ease-soft` for settling.
- **Hover:** light surfaces lift `translateY(-2px)`; brand fills brighten ~5%; glass controls adopt a brand outline when toggled active.
- **Press:** controls compress to `scale(0.97)` (`--press-scale`). **Never bounce.** Nothing safety-critical animates decoratively.
- Honors `prefers-reduced-motion` (all durations → 0).

### UI over map (the core discipline)
- Float controls in glass capsules; keep them edge-inset by `--gutter-screen` (16px) and stacked with `--gap-stack` (12px).
- Bottom sheets rise from the bottom and **never cover more than ~⅔ of the map.**
- Touch targets never below **44px**; in-drive controls use 46–52px. Spacing is tuned tight — dense and compact, not airy.
- Text on glass is always `--text-primary`/`--text-secondary` for guaranteed contrast.

### Routes & markers — read apart instantly
- **Fastest** = azure, **solid** line, `zap` bolt. **Private** = green, **solid** line, `shield-check`. Both routes are solid; color + icon + label keep them distinct.
- Surveillance markers (ALPR/camera) are **small glowing alert-red dots** — deliberately small relative to a large **~40°-wide pie cone of view** that fades from the dot outward (the `camera` variant), so the dot reads as the sensor and the cone as its reach. Places & destination are teardrop pins with a **large, vertically-centered glyph** in the head; user is a green dot with halo + heading cone; clusters show a count; monitored nodes are amber ring dots. Selected = enlarge + ring; inactive = 45% opacity.
- **Speed:** `SpeedLimitBadge` is the posted-limit + live-speed sign for active driving — a real-world white US sign (stays white in both themes) with a bottom-corner read-out that sits gray while at/under the limit and hardens to black when over. Named sizes (`sm`/`md`/`lg`) or raw px. Reads the pinned `--speed-*` tokens.

---

## ICONOGRAPHY

DAF ships **one icon primitive** — the `Icon` component — built on **[Lucide](https://lucide.dev)** geometry (24-grid, 2px rounded strokes). It's the single source of truth for both the React components and the specimen cards; nothing else draws glyphs.

```jsx
const { Icon } = window.DesignSystem_aa8750;
<Icon name="navigation" size={20} />
<Icon name="shield-check" size={18} color="var(--brand)" />
<Icon name="camera" size={18} color="var(--alert-500)" />
```

- `Icon` inherits `currentColor` by default — set the parent's `color` (or pass `color`) to tint. Sizes: 16 inline/meta · 18–20 controls · 24+ feature. See the *Icon* card for the full shipped set.
- Components that need built-in glyphs (NavBanner maneuvers, RouteCard route marks) use `Icon` internally; everything else accepts an icon node so you pass `<Icon …/>` in.
- **Map markers are NOT icons** — they are the dedicated `MapMarker` component (real shapes, cones, halos, pins), never an icon glyph dropped on the map.
- **Emoji**: only as marketing section glyphs. Never in product chrome or driving UI.
- The shipped set is a curated subset; add more names to `components/core/Icon/Icon.jsx` (copy the node array from lucide.dev) as the product needs them.

---

## TOKENS & FONTS

- Global entry: **`styles.css`** (root) — `@import`s only. Consumers link this one file.
- `tokens/colors.css` · `typography.css` · `spacing.css` · `radius.css` (radius + borders + elevation) · `motion.css` · `fonts.css`.
- **FONTS caveat:** Geist (display) / Hanken Grotesk (UI) / JetBrains Mono (data) are loaded from the **Google Fonts CDN** (`tokens/fonts.css`) — no local `.woff2` binaries are bundled. If you want self-hosted fonts or a different family, send the files and we'll wire up `@font-face`.

---

## INDEX — what's in this folder

| Path | What |
|---|---|
| `styles.css` | Root entry — imports all tokens & fonts. Link this. |
| `tokens/` | `colors · typography · spacing · radius · motion · fonts` CSS custom properties. |
| `assets/logo-mark.png` | The DAF route mark. |
| `guidelines/*.html` | Foundation specimen cards (Colors, Type, Spacing, Brand) shown in the Design System tab. |
| `components/core/` | Button, ButtonGroup, IconButton, Input, Switch, Checkbox, RadioGroup, Slider, Combobox, Badge, Chip, Card, SegmentedControl, Tooltip, Toast, Dialog. |
| `components/map/` | MapMarker, RouteCard, SearchBar, NavBanner, BottomSheet, SpeedLimitBadge. |
| `components/site/` | SiteHeader — shared top nav (marketing + app chrome). |
| `templates/` | Ready-to-copy starting pages: `web-landing`, `web-full-map`, `mobile-app`. |
| `SKILL.md` | Agent-Skill manifest for using this system downstream. |

**Components** are React (`window.DesignSystem_aa8750.<Name>`), styled entirely through the CSS custom properties above. Each has a `.d.ts` (props) and `.prompt.md` (usage).

**Templates** are the starting points consuming projects copy — `web-landing` (marketing), `web-full-map` (full-screen map app), and `mobile-app`. They compose the primitives above (e.g. both web pages share the `SiteHeader` component, differing only by `variant` and the links/CTA passed in). Build new screens by starting from a template or composing the primitives directly.

> Build new screens by composing the primitives — don't reinvent a Button inside a screen, and don't invent a new style per screen. The whole point is that the same rules scale everywhere.
