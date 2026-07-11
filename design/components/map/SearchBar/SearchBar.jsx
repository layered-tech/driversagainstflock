import React from 'react';
import { Icon } from '../../core/Icon/Icon';

/**
 * DAF SearchBar — the primary "Where to?" affordance floating at the top of
 * the map. A low-profile glass pill that can carry, left-to-right: a leading
 * hamburger (menu) button, the search glyph, the input, a clear (✕) button
 * that appears once text is entered, and a divider-separated directions
 * button on the trailing edge. Each control is opt-in via its handler prop.
 */
export function SearchBar({
  placeholder = 'Where to?',
  value,
  onChange,
  onFocus,
  onMenu,                 // hamburger handler — renders the leading menu button
  onVoice,                // voice handler — renders the mic button before the directions divider
  onClear,                // clear handler — renders the ✕ button while the input has text
  onDirections,           // directions handler — renders the divider-separated directions button
  leading,                // override the default search glyph
  trailing = null,        // extra node injected before the directions button
  readOnly = false,
  style = {},
}) {
  const hasValue = value != null && String(value).length > 0;

  const IconBtn = ({ name, label, tone = 'var(--text-secondary)', onClick }) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        width: 36,
        height: 36,
        padding: 0,
        border: 'none',
        background: 'transparent',
        borderRadius: 'var(--radius-pill)',
        color: tone,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        transition: 'background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-glass-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(var(--press-scale))'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <Icon name={name} size={20} />
    </button>
  );

  const Divider = () => (
    <span aria-hidden="true" style={{ flex: '0 0 auto', width: 1, height: 24, background: 'var(--border-glass)' }} />
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 52,
        padding: '0 6px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-glass)',
        border: '1px solid var(--border-glass)',
        boxShadow: 'var(--shadow-float)',
        backdropFilter: 'blur(var(--blur-glass))',
        WebkitBackdropFilter: 'blur(var(--blur-glass))',
        ...style,
      }}
    >
      {onMenu && (
        <IconBtn name="menu" label="Open menu" tone="var(--text-primary)" onClick={onMenu} />
      )}

      <span style={{ display: 'inline-flex', flex: '0 0 auto', color: 'var(--text-tertiary)', marginLeft: onMenu ? 2 : 8 }}>
        {leading || <Icon name="search" size={18} />}
      </span>

      <input
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        placeholder={placeholder}
        readOnly={readOnly}
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
          cursor: readOnly ? 'pointer' : 'text',
        }}
      />

      {hasValue && onClear && (
        <IconBtn name="x" label="Clear search" tone="var(--text-tertiary)" onClick={onClear} />
      )}

      {trailing && <span style={{ display: 'inline-flex', flex: '0 0 auto' }}>{trailing}</span>}

      {onVoice && (
        <IconBtn name="mic" label="Voice search" tone="var(--text-secondary)" onClick={onVoice} />
      )}

      {onDirections && (
        <>
          <Divider />
          <IconBtn name="corner-up-right" label="Directions" tone="var(--text-primary)" onClick={onDirections} />
        </>
      )}
    </div>
  );
}
