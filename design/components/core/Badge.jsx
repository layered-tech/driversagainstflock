import React from 'react';

/**
 * DAF Badge — compact status/label token.
 * tones: brand | alert | warning | info | neutral | ghost
 */
export function Badge({ children, tone = 'neutral', icon = null, size = 'md', style = {}, ...rest }) {
  const tones = {
    brand:   { bg: 'var(--green-050)',  fg: 'var(--green-700)',  bd: 'transparent' },
    alert:   { bg: 'var(--alert-100)',  fg: 'var(--alert-600)',  bd: 'transparent' },
    warning: { bg: 'var(--amber-100)',  fg: 'var(--amber-600)',  bd: 'transparent' },
    info:    { bg: 'var(--azure-100)',  fg: 'var(--azure-600)',  bd: 'transparent' },
    neutral: { bg: 'var(--ink-100)',    fg: 'var(--ink-700)',    bd: 'transparent' },
    ghost:   { bg: 'rgba(255,255,255,0.10)', fg: 'var(--text-primary)', bd: 'var(--border-glass)' },
  };
  const t = tones[tone] || tones.neutral;
  const isSm = size === 'sm';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: isSm ? 20 : 24,
        padding: isSm ? '0 8px' : '0 10px',
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-ui)',
        fontSize: isSm ? 'var(--fs-label)' : 'var(--fs-caption)',
        fontWeight: 'var(--fw-semibold)',
        letterSpacing: '0.01em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ display: 'inline-flex', fontSize: '1.05em' }}>{icon}</span>}
      {children}
    </span>
  );
}
