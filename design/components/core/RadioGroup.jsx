import React from 'react';

/**
 * DAF RadioGroup — single-select from a small set (e.g. route preference,
 * units, voice). Brand ring + dot on the selected option. Roving arrow-key
 * navigation; vertical by default.
 */
export function RadioGroup({
  options = [],          // [{ value, label, description?, disabled? }]
  value,
  onChange,
  orientation = 'vertical', // vertical | horizontal
  disabled = false,
  style = {},
  ...rest
}) {
  const selectedIdx = options.findIndex((o) => o.value === value);
  const firstEnabled = options.findIndex((o) => !o.disabled);

  const move = (from, dir) => {
    if (!options.length) return;
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) { onChange && onChange(options[i].value); break; }
    }
  };

  return (
    <div
      role="radiogroup"
      style={{
        display: 'flex',
        flexDirection: orientation === 'vertical' ? 'column' : 'row',
        gap: orientation === 'vertical' ? 14 : 22,
        flexWrap: 'wrap',
        ...style,
      }}
      {...rest}
    >
      {options.map((o, idx) => {
        const checked = o.value === value;
        const od = disabled || o.disabled;
        const tabbable = checked || (selectedIdx === -1 && idx === firstEnabled);
        return (
          <label
            key={o.value}
            style={{
              display: 'inline-flex',
              alignItems: o.description ? 'flex-start' : 'center',
              gap: 10,
              cursor: od ? 'not-allowed' : 'pointer',
              opacity: od ? 0.5 : 1,
            }}
          >
            <span
              role="radio"
              aria-checked={checked}
              aria-disabled={od || undefined}
              tabIndex={od ? -1 : tabbable ? 0 : -1}
              onClick={() => !od && onChange && onChange(o.value)}
              onKeyDown={(e) => {
                if (od) return;
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange && onChange(o.value); }
                else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(idx, 1); }
                else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(idx, -1); }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                flex: '0 0 auto',
                marginTop: o.description ? 1 : 0,
                borderRadius: '50%',
                background: 'var(--surface-card)',
                border: `1.5px solid ${checked ? 'var(--brand)' : 'var(--border-strong)'}`,
                outline: 'none',
                transition: 'border-color var(--dur-fast) var(--ease-standard)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--brand)',
                  transform: checked ? 'scale(1)' : 'scale(0)',
                  transition: 'transform var(--dur-fast) var(--ease-soft)',
                }}
              />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)', lineHeight: 1.3 }}>{o.label}</span>
              {o.description && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{o.description}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
