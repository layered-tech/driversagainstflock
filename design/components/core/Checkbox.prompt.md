# Checkbox

Multi-select / opt-in toggle. Brand fill + Lucide check when on; supports an indeterminate (mixed) state. Optional label + description.

```jsx
<Checkbox checked={a} onChange={setA} label="Avoid tolls" />
<Checkbox checked={b} onChange={setB} label="Avoid highways"
          description="Adds ~6 min on this route" />
<Checkbox indeterminate label="Select all filters" />
<Checkbox size="sm" checked label="Compact" />
```

- `checked`, `indeterminate`, `onChange`, `disabled`
- `label`, `description`
- `size`: `sm` | `md`
