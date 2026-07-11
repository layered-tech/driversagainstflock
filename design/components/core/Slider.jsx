import React from 'react';

/**
 * DAF Slider — continuous value selector (e.g. "Avoid detours over…",
 * voice volume, search radius). White knob on a brand-filled track,
 * matching the Switch idiom. Click the track, drag the knob, or use
 * arrow / Home / End keys.
 */
export function Slider({
  value,
  defaultValue = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  disabled = false,
  label,
  showValue = false,
  formatValue,           // (v) => string for the readout
  style = {},
  ...rest
}) {
  const isControlled = value != null;
  const [internal, setInternal] = React.useState(defaultValue);
  const [focused, setFocused] = React.useState(false);
  const v = isControlled ? value : internal;
  const trackRef = React.useRef(null);

  const span = max - min || 1;
  const pct = Math.min(100, Math.max(0, ((v - min) / span) * 100));

  const clamp = (n) => Math.min(max, Math.max(min, n));
  const snap = (n) => clamp(parseFloat((Math.round((n - min) / step) * step + min).toFixed(6)));
  const commit = (n) => {
    const nv = snap(n);
    if (nv === v) return;
    if (!isControlled) setInternal(nv);
    onChange && onChange(nv);
  };
  const fromX = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    return min + ((clientX - r.left) / (r.width || 1)) * span;
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    commit(fromX(e.clientX));
  };
  const onPointerMove = (e) => {
    if (disabled || !e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    commit(fromX(e.clientX));
  };
  const onKeyDown = (e) => {
    if (disabled) return;
    let nv = v;
    const big = (max - min) / 10;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nv = v + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nv = v - step;
    else if (e.key === 'PageUp') nv = v + big;
    else if (e.key === 'PageDown') nv = v - big;
    else if (e.key === 'Home') nv = min;
    else if (e.key === 'End') nv = max;
    else return;
    e.preventDefault();
    commit(nv);
  };

  const display = formatValue ? formatValue(v) : v;

  return (
    <div style={{ opacity: disabled ? 0.5 : 1, ...style }} {...rest}>
      {(label || showValue) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          {label && (
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-secondary)' }}>{label}</span>
          )}
          {showValue && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)', fontFeatureSettings: 'var(--num-feature)' }}>{display}</span>
          )}
        </div>
      )}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        style={{
          position: 'relative',
          height: 24,
          display: 'flex',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          touchAction: 'none',
        }}
      >
        <span style={{ position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 'var(--radius-pill)', background: 'var(--border-strong)' }} />
        <span style={{ position: 'absolute', left: 0, width: `${pct}%`, height: 6, borderRadius: 'var(--radius-pill)', background: 'var(--brand)', transition: 'width var(--dur-instant) var(--ease-standard)' }} />
        <span
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={v}
          aria-label={label || 'value'}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            position: 'absolute',
            left: `${pct}%`,
            transform: 'translateX(-50%)',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#fff',
            border: '1px solid var(--border-glass)',
            boxShadow: focused ? 'var(--shadow-focus)' : '0 2px 5px rgba(11,14,18,0.35)',
            outline: 'none',
            cursor: disabled ? 'not-allowed' : 'grab',
            transition: 'box-shadow var(--dur-fast) var(--ease-standard), left var(--dur-instant) var(--ease-standard)',
          }}
        />
      </div>
    </div>
  );
}
