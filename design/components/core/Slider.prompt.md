# Slider

Continuous value selector. White knob on a brand-filled track (Switch idiom). Click the track, drag the knob, or use arrow / PageUp·Down / Home / End keys. Controlled or uncontrolled.

```jsx
// Uncontrolled with a formatted readout
<Slider defaultValue={8} min={0} max={50} step={1}
        label="Search radius" showValue formatValue={(v) => `${v} mi`} />

// Controlled
<Slider value={vol} min={0} max={100} onChange={setVol} label="Voice volume" showValue />
```

- `value` / `defaultValue` · `min` · `max` · `step`
- `label`, `showValue`, `formatValue` for the readout row
- `disabled`
