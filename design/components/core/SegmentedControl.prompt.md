Sliding switch between exclusive views. Core use: the route mode toggle.

```jsx
<SegmentedControl
  value={mode}
  onChange={setMode}
  options={[
    { value: 'fast', label: 'Fastest', icon: <BoltIcon/> },
    { value: 'private', label: 'Private', icon: <ShieldIcon/> },
  ]}
/>
```

Thumb slides on change with a gentle settle. `tone="light"` for marketing/settings.
