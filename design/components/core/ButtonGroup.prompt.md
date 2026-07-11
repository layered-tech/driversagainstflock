# ButtonGroup

Joins `<Button>`s into one segmented control. Outer corners round, inner corners square, segments share a hairline divider + single shadow. Each child keeps its own `variant`/`disabled`.

```jsx
// Horizontal, joined
<ButtonGroup>
  <Button variant="secondary" leadingIcon={<Icon name="zap" size={16} />}>Fastest</Button>
  <Button variant="secondary" leadingIcon={<Icon name="shield-check" size={16} />}>Private</Button>
  <Button variant="secondary">Eco</Button>
</ButtonGroup>

// Vertical, full-width
<ButtonGroup orientation="vertical" fullWidth>
  <Button variant="secondary" leadingIcon={<Icon name="plus" size={18} />}>Add stop</Button>
  <Button variant="secondary" leadingIcon={<Icon name="share-2" size={18} />}>Share ETA</Button>
  <Button variant="danger" leadingIcon={<Icon name="x" size={18} />}>End drive</Button>
</ButtonGroup>

// Detached — evenly spaced standalone pills
<ButtonGroup attached={false} fullWidth>
  <Button variant="ghost">Cancel</Button>
  <Button variant="primary">Confirm</Button>
</ButtonGroup>
```

- `orientation`: `horizontal` (default) | `vertical`
- `size`: force one size onto every segment
- `fullWidth`: stretch, segments share space equally
- `attached`: `true` joined (default) · `false` spaced pills
