import React from 'react';

/**
 * DAF IconButton — circular/square glass control for floating map actions
 * (recenter, layers, compass, mute). High-contrast over any map.
 */
export function IconButton({
  children,
  label,                 // aria-label (required for a11y)
  variant = 'glass',     // glass | solid | brand | plain
  size = 'md',           // sm | md | lg
  active = false,
  disabled = false,
  style = {},
  ...rest
}) {
  const dims = { sm: 38, md: 'var(--hit-comfy)', lg: 'var(--hit-large)' };
  const d = dims[size] || dims.md;

  const variants = {
    glass: {
      background: 'var(--surface-glass)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-float)',
      backdropFilter: 'blur(var(--blur-glass))',
      WebkitBackdropFilter: 'blur(var(--blur-glass))',
    },
    solid: {
      background: 'var(--surface-raised)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-float)',
    },
    brand: {
      background: 'var(--brand)',
      color: 'var(--brand-contrast)',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-float)',
    },
    plain: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: '1px solid transparent',
    },
  };
  const v = variants[variant] || variants.glass;
  const activeStyle = active
    ? { color: 'var(--brand)', border: '1px solid var(--brand)' }
    : {};

  return (
    <button
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: d,
        height: d,
        fontSize: size === 'sm' ? 18 : 20,
        borderRadius: 'var(--radius-pill)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'transform var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
        WebkitTapHighlightColor: 'transparent',
        flex: '0 0 auto',
        ...v,
        ...activeStyle,
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(var(--press-scale))'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {children}
    </button>
  );
}
