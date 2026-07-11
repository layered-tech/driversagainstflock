The full map marker family. Position it absolutely on the map; pins anchor bottom-center, dots/cones center on the point.

```jsx
<MapMarker variant="user" heading={40} />
<MapMarker variant="camera" heading={210} />
<MapMarker variant="cluster" count={6} />
<MapMarker variant="place" iconName="coffee" />
<MapMarker variant="destination" selected />
<MapMarker variant="alpr" inactive />
<MapMarker variant="police" />
<MapMarker variant="police-hidden" />
```

Variants: `user` (green dot + halo + heading cone), `place` / `destination` (teardrop pins with a **large, vertically-centered glyph** in the head — set `iconName` or pass an `icon` node), `alpr` (small glowing red dot), `camera` (small dot + a **large ~40° cone of view** that fades from the dot outward, aimed at `heading`), `cluster` (count of nearby cameras), `monitored` (amber node dot), `police` (glowing blue shield badge — live police report via Waze), `police-hidden` (dashed blue ring with an outline shield — hidden police report via Waze). `selected` enlarges + rings; `inactive` dims to 45%. The surveillance dot is deliberately small relative to its cone, so the dot reads as the sensor and the cone as its reach. `heading` is degrees, 0 = up.
