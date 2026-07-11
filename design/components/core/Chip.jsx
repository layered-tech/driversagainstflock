import React from 'react';

/**
 * DAF Chip — selectable filter / quick action. Used for map filters
 * ("Cameras", "Gas", "Avoid tolls") and saved-place shortcuts.
 * Defaults to a glass tone for floating over the map.
 */
export function Chip({
  children,
  selected = false,
  icon = null,
  tone = 'glass',        // glass | light
  onClick,
  style = {},
  ...rest
}) {
  const isLight = tone === 'light';
  const base = isLight
    ? { bg: 'var(--surface-card)', fg: 'var(--text-ink)', bd: 'var(--border-light)' }
    : { bg: 'var(--surface-glass)', fg: 'var(--text-primary)', bd: 'var(--border-glass)' };
  const sel = selected
    ? { bg: 'var(--brand)', fg: 'var(--brand-contrast)', bd: 'transparent' }
    : base;

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 34,
        padding: '0 12px',
        background: sel.bg,
        color: sel.fg,
        border: `1px solid ${sel.bd}`,
        borderRadius: 'var(--radius-pill)',
        boxShadow: isLight ? 'none' : 'var(--shadow-float)',
        backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
        WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--fs-body-sm)',
        fontWeight: 'var(--fw-semibold)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        flex: '0 0 auto',
        transition: 'transform var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard)',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(var(--press-scale))'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {icon && <span style={{ display: 'inline-flex', fontSize: '1.05em' }}>{icon}</span>}
      {children}
    </button>
  );
}
