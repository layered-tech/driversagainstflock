import React from 'react';

/**
 * DAF SegmentedControl — switch between mutually-exclusive views.
 * Used for the route mode toggle (Fastest / Private) and map layers.
 * The active thumb slides; selected text is high-contrast.
 */
export function SegmentedControl({
  options = [],          // [{ value, label, icon? }]
  value,
  onChange,
  tone = 'glass',        // glass | light
  style = {},
}) {
  const isLight = tone === 'light';
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const count = options.length || 1;
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(${count}, 1fr)`,
        padding: 4,
        borderRadius: 'var(--radius-pill)',
        background: isLight ? 'var(--surface-card-alt)' : 'var(--surface-glass)',
        border: `1px solid ${isLight ? 'var(--border-light)' : 'var(--border-glass)'}`,
        backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
        WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 4,
          bottom: 4,
          left: `calc(4px + ${idx} * ((100% - 8px) / ${count}))`,
          width: `calc((100% - 8px) / ${count})`,
          borderRadius: 'var(--radius-pill)',
          background: isLight ? 'var(--surface-card)' : 'var(--surface-glass-2)',
          boxShadow: 'var(--shadow-card)',
          transition: 'left var(--dur-base) var(--ease-soft)',
        }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange && onChange(o.value)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              height: 40,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--fs-body-sm)',
              fontWeight: 'var(--fw-semibold)',
              color: active
                ? (isLight ? 'var(--text-ink)' : 'var(--text-primary)')
                : (isLight ? 'var(--text-ink-faint)' : 'var(--text-secondary)'),
              transition: 'color var(--dur-fast) var(--ease-standard)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {o.icon && <span style={{ display: 'inline-flex', fontSize: '1.1em' }}>{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
