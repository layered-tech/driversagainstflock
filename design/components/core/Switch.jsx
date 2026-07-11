import React from 'react';

/**
 * DAF Switch — binary toggle (e.g. "Avoid monitored roads", "Voice guidance").
 * On = Signal Green. Calm slide, no bounce.
 */
export function Switch({ checked = false, onChange, disabled = false, label, style = {}, ...rest }) {
  const toggle = (
    <span
      role="switch"
      aria-checked={checked}
      aria-label={!label ? 'toggle' : undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange && onChange(!checked)}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onChange && onChange(!checked); } }}
      style={{
        position: 'relative',
        width: 48,
        height: 28,
        flex: '0 0 auto',
        borderRadius: 'var(--radius-pill)',
        background: checked ? 'var(--brand)' : 'var(--border-strong)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background var(--dur-base) var(--ease-standard)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 23 : 3,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 5px rgba(11,14,18,0.35)',
          transition: 'left var(--dur-base) var(--ease-soft)',
        }}
      />
    </span>
  );

  if (!label) return React.cloneElement(toggle, { style: { ...toggle.props.style, ...style } });

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 12, cursor: disabled ? 'not-allowed' : 'pointer', ...style }} {...rest}>
      {toggle}
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)' }}>{label}</span>
    </label>
  );
}
