# NativeWind styling

- The Expo mobile app in `./mobile-app` uses NativeWind for styling.
- Before changing mobile styling, search Context7 for NativeWind docs. If Context7 is unavailable, use the official NativeWind documentation.
- Prefer `className` utility classes on React Native components for layout, color, typography, spacing, borders, shadows, and state variants.
- Do not use React Native `StyleSheet` in `./mobile-app/src`.
- Keep shared app backgrounds and wrappers in Expo Router layout files instead of duplicating them on individual pages.
- Use NativeWind `styled` or component interop for third-party components that need class support.
- Use inline `style` only for runtime values or native props NativeWind cannot express, such as calculated safe-area offsets or `experimental_backgroundImage`.
