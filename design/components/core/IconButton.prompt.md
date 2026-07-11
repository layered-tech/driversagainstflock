Round, high-contrast control for floating map actions — recenter, layers, compass, mute, report.

```jsx
<IconButton label="Recenter" variant="glass"><LocateIcon/></IconButton>
<IconButton label="Layers" active><LayersIcon/></IconButton>
```

`glass` (default, frosted over map), `solid`, `brand`, `plain`. `active` adds a Signal-Green outline. Always pass `label`. Min size `md` (52px) for in-drive use.
