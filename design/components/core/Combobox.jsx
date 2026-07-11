import React from 'react';
import { Icon } from './Icon/Icon';

/**
 * DAF Combobox — autocomplete field that powers destination search in the
 * SearchBar. A glass search field with a floating results panel: substring
 * filtering with match highlighting, leading icons + sublabels + trailing
 * meta (distance), keyboard nav (↑/↓/Enter/Esc), and an empty state.
 */
export function Combobox({
  options = [],          // [{ value, label, sublabel?, icon?, meta? }]
  onSelect,              // (option) => void
  onChange,              // (query) => void — for async/remote results
  placeholder = 'Search destinations',
  emptyText = 'No matches',
  filter = true,         // built-in substring filter; false = pre-filtered
  tone = 'glass',        // glass | light
  size = 'md',           // md | lg
  maxVisible = 6,
  style = {},
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hi, setHi] = React.useState(0);
  const rootRef = React.useRef(null);
  const listRef = React.useRef(null);
  const isLight = tone === 'light';

  const q = query.trim().toLowerCase();
  const filtered = filter && q
    ? options.filter((o) => `${o.label} ${o.sublabel || ''}`.toLowerCase().includes(q))
    : options;

  React.useEffect(() => { setHi(0); }, [query, open]);
  React.useEffect(() => {
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, []);

  const choose = (o) => {
    if (!o) return;
    setQuery(o.label);
    setOpen(false);
    onSelect && onSelect(o);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(filtered.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { if (open && filtered[hi]) { e.preventDefault(); choose(filtered[hi]); } }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const h = size === 'lg' ? 'var(--hit-large)' : 'var(--hit-comfy)';
  const fieldBg = isLight ? 'var(--surface-card)' : 'var(--surface-glass-2)';
  const panelBg = isLight ? 'var(--surface-card)' : 'var(--surface-glass-2)';

  const renderMatch = (text) => {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <span style={{ fontWeight: 'var(--fw-bold)', color: 'var(--text-primary)' }}>{text.slice(i, i + q.length)}</span>
        {text.slice(i + q.length)}
      </>
    );
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }} {...rest}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: h,
          padding: '0 14px',
          borderRadius: 'var(--radius-sm)',
          background: fieldBg,
          border: '1px solid var(--border-glass)',
          boxShadow: 'var(--shadow-float)',
          backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
          WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
        }}
      >
        <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)', flex: '0 0 auto' }}>
          <Icon name="search" size={18} />
        </span>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange && onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--fs-body)',
            fontWeight: 'var(--fw-medium)',
            color: 'var(--text-primary)',
          }}
        />
        {query && (
          <button
            aria-label="Clear"
            onClick={() => { setQuery(''); setOpen(true); onChange && onChange(''); }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, flex: '0 0 auto', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: '50%', WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 40,
            background: panelBg,
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-float)',
            backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
            WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
            padding: 6,
            maxHeight: maxVisible * 52 + 12,
            overflowY: 'auto',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '14px 12px', fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-tertiary)', textAlign: 'center' }}>{emptyText}</div>
          ) : (
            filtered.map((o, i) => {
              const active = i === hi;
              return (
                <button
                  key={o.value ?? i}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => choose(o)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    width: '100%',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: active ? 'var(--surface-card-alt)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background var(--dur-instant) var(--ease-standard)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flex: '0 0 auto', borderRadius: 'var(--radius-sm)', background: isLight ? 'var(--surface-card-alt)' : 'var(--surface-glass)', color: 'var(--text-secondary)' }}>
                    <Icon name={o.icon || 'map-pin'} size={18} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-medium)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{renderMatch(o.label)}</span>
                    {o.sublabel && <span style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.sublabel}</span>}
                  </span>
                  {o.meta && <span style={{ flex: '0 0 auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-tertiary)', fontFeatureSettings: 'var(--num-feature)' }}>{o.meta}</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
