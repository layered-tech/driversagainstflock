# Tooltip

Small inverse-surface bubble explaining an icon-only control on hover or keyboard focus. Wrap any trigger; positions on `side` with a matching arrow.

```jsx
<Tooltip content="Recenter map" side="top">
  <IconButton label="Recenter" variant="glass"><Icon name="navigation" size={20} /></IconButton>
</Tooltip>

<Tooltip content="Avoid monitored roads" side="right">
  <Icon name="shield-check" size={18} />
</Tooltip>
```

- `content` (node), `side` (`top`/`bottom`/`left`/`right`), `delay`
- Opens on hover **and** focus, so keyboard users get it too.
