# Dialog & AlertDialog

Modal surfaces over the map. `Dialog` is a blurred-scrim panel (modal-shell radius) with optional tinted icon, title, description, body, and a right-aligned footer. `AlertDialog` is a confirm modal — not scrim-dismissable, renders Cancel + Confirm.

```jsx
// Dialog — control `open` from state
<Dialog
  open={open}
  onClose={() => setOpen(false)}
  icon="shield-check" tone="brand"
  title="Switch to Private route?"
  description="Avoids 3 monitored roads. Adds about 4 minutes."
  footer={
    <>
      <Button variant="ghost" onClick={() => setOpen(false)}>Not now</Button>
      <Button variant="primary" onClick={confirm}>Use Private</Button>
    </>
  }
/>

// AlertDialog — destructive confirm
<AlertDialog
  open={ending}
  destructive
  title="End this drive?"
  description="You'll lose turn-by-turn guidance to SFO."
  confirmLabel="End drive"
  onCancel={() => setEnding(false)}
  onConfirm={endDrive}
/>
```

- `Dialog`: `open`, `onClose`, `title`, `description`, `children`, `footer`, `icon`, `tone`, `size` (`sm`/`md`/`lg`), `dismissable`
- `AlertDialog`: `open`, `onCancel`, `onConfirm`, `title`, `description`, `confirmLabel`, `cancelLabel`, `destructive`
