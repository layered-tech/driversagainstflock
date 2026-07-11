import React from 'react';

/**
 * DAF BottomSheet — the frosted sheet that rises from the bottom edge to hold
 * route comparisons, place details, and marker info over the map.
 */
export function BottomSheet({
  children,
  title = null,
  subtitle = null,
  trailing = null,       // header trailing control (e.g. close)
  grabber = true,
  style = {},
}) {
  return (
    <div
      style={{
        background: 'var(--surface-sheet)',
        borderTopLeftRadius: 'var(--radius-sheet)',
        borderTopRightRadius: 'var(--radius-sheet)',
        borderTop: '1px solid var(--border-glass)',
        boxShadow: 'var(--shadow-sheet)',
        padding: '8px var(--space-4) var(--space-5)',
        color: 'var(--text-primary)',
        ...style,
      }}
    >
      {grabber && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 12 }}>
          <span style={{ width: 'var(--sheet-grab)', height: 5, borderRadius: 'var(--radius-pill)', background: 'var(--border-strong)' }} />
        </div>
      )}
      {(title || trailing) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: subtitle ? 4 : 14 }}>
          <div style={{ minWidth: 0 }}>
            {title && <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-h3)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-heading)', color: 'var(--text-primary)' }}>{title}</div>}
            {subtitle && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          {trailing && <div style={{ flex: '0 0 auto' }}>{trailing}</div>}
        </div>
      )}
      {subtitle && <div style={{ height: 10 }} />}
      {children}
    </div>
  );
}
