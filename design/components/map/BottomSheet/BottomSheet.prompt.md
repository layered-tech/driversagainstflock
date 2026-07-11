The sheet that rises from the bottom edge to hold route comparisons, place details, and marker info.

```jsx
<BottomSheet title="Choose your route" subtitle="2 routes · 1 avoids cameras" trailing={<IconButton label="Close">×</IconButton>}>
  <RouteCard … />
  <RouteCard … />
</BottomSheet>
```

24px top corners, grabber on by default, deep upward shadow. Anchor it to the bottom of the map frame; never let it cover more than ~⅔ of the map.
