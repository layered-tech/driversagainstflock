# Combobox

Autocomplete field that powers destination search in the SearchBar. Glass search field + floating results panel: substring filter with match highlighting, leading icons + sublabels + trailing meta, keyboard nav (↑/↓/Enter/Esc), empty state.

```jsx
<Combobox
  placeholder="Where to?"
  onSelect={(o) => goTo(o)}
  options={[
    { value: 'home', label: 'Home',  sublabel: '1100 Mission St',   icon: 'home',      meta: '4.2 mi' },
    { value: 'work', label: 'Work',  sublabel: '500 Howard St',     icon: 'briefcase', meta: '6.1 mi' },
    { value: 'sfo',  label: 'SFO Airport', sublabel: 'San Bruno',   icon: 'map-pin',   meta: '13 mi' },
    { value: 'last', label: 'Blue Bottle Coffee', sublabel: 'Recent', icon: 'clock' },
  ]}
/>

// Async / remote: filter yourself, disable the built-in one
<Combobox filter={false} options={remoteResults} onChange={fetchResults} onSelect={pick} />
```

- `options`: `{ value, label, sublabel?, icon?, meta? }[]`
- `onSelect`, `onChange` (per-keystroke, for async)
- `filter` (set `false` for pre-filtered/remote), `tone`, `size`, `maxVisible`
