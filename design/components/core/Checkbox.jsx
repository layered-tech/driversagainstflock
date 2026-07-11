import React from 'react';
import { Icon } from './Icon/Icon';

/**
 * DAF Checkbox — multi-select / opt-in toggle (e.g. "Avoid tolls",
 * "Avoid highways"). Brand fill with a Lucide check when on; supports an
 * indeterminate (mixed) state. Pairs an optional label + description.
 */
export function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',           // sm | md
  style = {},
  ...rest
}) {
  const dim = size === 'sm' ? 18 : 22;
  const on = checked || indeterminate;
  const toggle = () => !disabled && onChange && onChange(!checked);

  const box = (
    <span
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={!label ? 'checkbox' : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={(e) => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggle(); } }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        flex: '0 0 auto',
        borderRadius: 'var(--radius-xs)',
        background: on ? 'var(--brand)' : 'var(--surface-card)',
        border: `1.5px solid ${on ? 'transparent' : 'var(--border-strong)'}`,
        color: 'var(--brand-contrast)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {indeterminate
        ? <Icon name="minus" size={Math.round(dim * 0.66)} stroke={3} />
        : checked ? <Icon name="check" size={Math.round(dim * 0.66)} stroke={3} /> : null}
    </span>
  );

  if (!label) return React.cloneElement(box, { style: { ...box.props.style, ...style } });

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: description ? 'flex-start' : 'center',
        gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...rest}
    >
      {description ? React.cloneElement(box, { style: { ...box.props.style, marginTop: 1 } }) : box}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)', lineHeight: 1.3 }}>{label}</span>
        {description && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{description}</span>}
      </span>
    </label>
  );
}
