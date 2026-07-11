# Toast & ToastViewport

Transient notification. Frosted card, tinted status chip (`info` / `success` / `warning` / `alert`), optional description + inline action + dismiss. Stack them in a screen corner with `ToastViewport`.

```jsx
// Standalone
<Toast tone="success" title="Re-routed" description="Avoiding 2 cameras ahead." onDismiss={dismiss} />
<Toast tone="alert" title="GPS lost" description="Reconnecting…"
       action={{ label: 'Retry', onClick: retry }} onDismiss={dismiss} />

// Stacked — render your live toasts as children
<ToastViewport placement="bottom-right">
  {toasts.map((t) => (
    <Toast key={t.id} tone={t.tone} title={t.title} description={t.description}
           onDismiss={() => remove(t.id)} />
  ))}
</ToastViewport>
```

- `Toast`: `tone`, `title`, `description`, `action {label,onClick}`, `onDismiss`, `icon`
- `ToastViewport`: `placement` — `top|bottom` × `left|center|right`
- Auto-dismiss is app logic — `setTimeout(() => remove(id), 4000)` when you push.
