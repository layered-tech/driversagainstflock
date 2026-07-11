# RadioGroup

Single-select from a small set. Brand ring + dot on the selected option; roving arrow-key navigation. Vertical by default.

```jsx
<RadioGroup
  value={pref}
  onChange={setPref}
  options={[
    { value: 'fast',    label: 'Fastest',  description: 'Lowest ETA, may pass cameras' },
    { value: 'private', label: 'Private',  description: 'Avoids monitored roads' },
    { value: 'eco',     label: 'Eco' },
  ]}
/>

// Horizontal, e.g. units
<RadioGroup orientation="horizontal" value={u} onChange={setU}
  options={[{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometers' }]} />
```

- `options`: `{ value, label, description?, disabled? }[]`
- `value`, `onChange`, `disabled`
- `orientation`: `vertical` | `horizontal`
