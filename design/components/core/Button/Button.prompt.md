Pill-shaped primary action control — use for the main action on a screen, sheet, or card.

```jsx
<Button variant="primary" size="lg" onClick={start}>Start drive</Button>
<Button variant="secondary" leadingIcon={<span>↻</span>}>Re-route</Button>
<Button variant="ghost" size="sm">Cancel</Button>
```

Variants: `primary` (Signal Green fill), `secondary` (dark glass over map), `ghost` (transparent), `danger` (alert red). Sizes `sm | md | lg` map to 40 / 52 / 60px — never below the 44px touch floor for in-drive use (use `md`+). Compresses to 0.97 on press; no bounce.
