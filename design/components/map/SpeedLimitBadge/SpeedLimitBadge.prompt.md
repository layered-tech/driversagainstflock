Posted speed-limit sign with an optional live current-speed read-out, for the active-driving UI.

```jsx
<SpeedLimitBadge limit={35} current={32} size="md" />
```

A real-world white US sign (stacked "SPEED LIMIT" + big tabular numeral) — it stays white in both light and dark. The bottom-corner read-out shows current speed: a calm gray while you're at or under the posted limit, hardening to black the moment you're over. Size accepts a named preset (`"sm"` 44 / `"md"` 58 / `"lg"` 80) or a raw px width. Pin it top-left over the map during navigation; this is glance-critical, so keep it large (≥`"md"`) and never decorate it.
