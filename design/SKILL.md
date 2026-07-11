---
name: drivers-against-flock-design
description: Use this skill to generate well-branded interfaces and assets for Drivers Against Flock (DAF), a privacy-first navigation app, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping map-first, privacy-aware navigation UI across web, iOS, and Android.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files (tokens, components, and guidelines cards).

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

Key things to honor for DAF:
- **Light + dark, both first-class.** One semantic token set flips via `[data-theme="light"|"dark"]` (default light). Controls are frosted-glass capsules that stay legible over either map. Reference `--surface-*`/`--text-*`/`--border-*`, never raw ramps. Keep floating UI edge-inset; never cover more than ~⅔ of the map.
- **One signature color, Signal Green `#1FBF6B`** (go/private/safe). Azure = fastest route, alert red = cameras, amber = monitored, violet = destination.
- **Fastest vs private routes differ by color + icon + label** — fastest = solid azure + bolt, private = solid green + shield (both solid lines).
- **Type:** Geist (display) / Hanken Grotesk (UI) / JetBrains Mono (data & badges).
- **Icons:** one `Icon` primitive built on Lucide geometry — the only glyph source. `<Icon name="shield-check" />`. Map markers are the `MapMarker` component, not icons.
- **Speed:** a white speed-limit sign with a stroked bottom-corner circle showing current speed (gray at/under the limit, black when over) — `SpeedLimitBadge`.
- **Voice:** clear, grounded, privacy-aware, human; dry humor *sparingly* ("creepy little boxes on poles"). Driving/safety copy is always calm and literal — never joking.
- Touch targets ≥ 44px; spacing tuned tight (dense, compact); calm motion, press compresses (no bounce).

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
