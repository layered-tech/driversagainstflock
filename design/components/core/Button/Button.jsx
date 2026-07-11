import React from 'react';

/**
 * DAF Button — primary action control.
 * Calm, confident, touch-first. Compresses slightly on press; never bounces.
 */
export function Button({
  children,
  variant = 'primary',   // primary | secondary | ghost | danger
  size = 'md',           // sm | md | lg
  leadingIcon = null,
  trailingIcon = null,
  fullWidth = false,
  disabled = false,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { h: 38, px: 14, fs: 'var(--fs-body-sm)', gap: 8, r: 'var(--radius-pill)' },
    md: { h: 'var(--hit-comfy)', px: 18, fs: 'var(--fs-body)', gap: 8, r: 'var(--radius-pill)' },
    lg: { h: 'var(--hit-large)', px: 24, fs: 'var(--fs-body-lg)', gap: 9, r: 'var(--radius-pill)' },
  };
  const s = sizes[size] || sizes.md;

  const variants = {
    primary: {
      background: 'var(--brand)',
      color: 'var(--brand-contrast)',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-float)',
    },
    secondary: {
      background: 'var(--surface-glass-2)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-float)',
      backdropFilter: 'blur(var(--blur-glass))',
      WebkitBackdropFilter: 'blur(var(--blur-glass))',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-primary)',
      border: '1px solid transparent',
    },
    danger: {
      background: 'var(--alert-500)',
      color: '#fff',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-float)',
    },
  };
  const v = variants[variant] || variants.primary;

  return (
    <button
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        height: s.h,
        padding: `0 ${s.px}px`,
        width: fullWidth ? '100%' : 'auto',
        fontFamily: 'var(--font-ui)',
        fontSize: s.fs,
        fontWeight: 'var(--fw-semibold)',
        letterSpacing: '0.005em',
        lineHeight: 1,
        borderRadius: s.r,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
        transition: 'transform var(--dur-fast) var(--ease-standard), filter var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard)',
        WebkitTapHighlightColor: 'transparent',
        ...v,
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(var(--press-scale))'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {leadingIcon && <span style={{ display: 'inline-flex', fontSize: '1.15em' }}>{leadingIcon}</span>}
      {children}
      {trailingIcon && <span style={{ display: 'inline-flex', fontSize: '1.15em' }}>{trailingIcon}</span>}
    </button>
  );
}
