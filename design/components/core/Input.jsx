import React from 'react';

/**
 * DAF Input — text field for search & forms. Works on dark glass (default)
 * and light surfaces (tone="light").
 */
export function Input({
  value,
  onChange,
  placeholder = '',
  leadingIcon = null,
  trailingIcon = null,
  tone = 'glass',        // glass | light
  size = 'md',           // md | lg
  disabled = false,
  style = {},
  ...rest
}) {
  const h = size === 'lg' ? 'var(--hit-large)' : 'var(--hit-comfy)';
  const isLight = tone === 'light';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: h,
        padding: '0 14px',
        borderRadius: 'var(--radius-sm)',
        background: isLight ? 'var(--surface-card)' : 'var(--surface-glass)',
        border: `1px solid ${isLight ? 'var(--border-light)' : 'var(--border-glass)'}`,
        boxShadow: isLight ? 'var(--shadow-card)' : 'var(--shadow-float)',
        backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
        WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {leadingIcon && (
        <span style={{ display: 'inline-flex', color: isLight ? 'var(--text-ink-faint)' : 'var(--text-tertiary)', fontSize: 18 }}>
          {leadingIcon}
        </span>
      )}
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--fs-body)',
          fontWeight: 'var(--fw-medium)',
          color: isLight ? 'var(--text-ink)' : 'var(--text-primary)',
        }}
        {...rest}
      />
      {trailingIcon && (
        <span style={{ display: 'inline-flex', color: isLight ? 'var(--text-ink-faint)' : 'var(--text-tertiary)', fontSize: 18 }}>
          {trailingIcon}
        </span>
      )}
    </div>
  );
}
