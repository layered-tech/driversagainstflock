Binary toggle for drive preferences ("Avoid monitored roads", "Voice guidance").

```jsx
<Switch checked={avoid} onChange={setAvoid} label="Avoid monitored roads" />
```

On state = Signal Green. Slides calmly with no bounce. Omit `label` for a bare toggle inside a settings row.
