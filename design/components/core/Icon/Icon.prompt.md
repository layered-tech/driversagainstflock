The one icon primitive for the whole system — Lucide line icons (24-grid, 2px stroke, round caps). Inherits `currentColor`.

```jsx
<Icon name="shield-check" size={20} />
<Icon name="camera" size={18} color="var(--alert-500)" />
```

Use `name` with Lucide kebab-case names. Icons inherit text color by default — set the parent's `color` (or pass `color`) to tint. Keep sizes on the scale: 16 (inline/meta), 18–20 (controls), 24+ (feature). Never mix an emoji or a different icon library alongside it.
