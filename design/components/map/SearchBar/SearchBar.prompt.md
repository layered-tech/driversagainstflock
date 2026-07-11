The primary "Where to?" affordance floating at the top of the map. A low-profile glass pill — not a tall hero bar — that carries (left→right): an optional hamburger menu, the search glyph, the input, an optional clear (✕) button, and an optional divider-separated directions button. Each control is opt-in via its handler.

```jsx
<SearchBar
  placeholder="Where to?"
  value={query}
  onChange={e => setQuery(e.target.value)}
  onMenu={openDrawer}
  onClear={() => setQuery('')}
  onDirections={openDirections}
/>
```

Leads with a Lucide search icon by default (override via `leading`). The ✕ only appears once `value` is non-empty and `onClear` is set; the directions button only appears when `onDirections` is set, separated by a hairline divider. On the map it's often `readOnly` and taps through to a full search screen — in that case omit `onClear` and wire `onFocus`. Use `trailing` for an extra slot (avatar/mic) before the directions button.
