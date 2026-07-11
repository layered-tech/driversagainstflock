A selectable route option for the route-comparison sheet.

```jsx
<RouteCard kind="private" eta="27 min" arrival="arrive 6:15" distance="13.1 mi" cameras={0} recommended selected />
<RouteCard kind="fast" eta="24 min" arrival="arrive 6:12" distance="12.4 mi" cameras={4} />
```

Fastest = bolt + solid azure swatch; Private = shield + solid green swatch. Camera count turns green at 0 ("No cameras"), red otherwise. `selected` adds the matching accent ring. Always show the icon + label alongside the swatch so the two routes stay distinguishable.
