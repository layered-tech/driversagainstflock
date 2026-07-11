import React from 'react';

/**
 * DAF Card — content container. Two surfaces:
 *  tone="light" (white, marketing/docs) and tone="glass" (frosted, over map).
 */
export function Card({
  children,
  tone = 'light',        // light | glass
  padding = 'var(--space-6)',
  interactive = false,
  style = {},
  ...rest
}) {
  const isGlass = tone === 'glass';
  return (
    <div
      style={{
        background: isGlass ? 'var(--surface-glass)' : 'var(--surface-card)',
        color: isGlass ? 'var(--text-primary)' : 'var(--text-ink)',
        border: `1px solid ${isGlass ? 'var(--border-glass)' : 'var(--border-light)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: isGlass ? 'var(--shadow-float)' : 'var(--shadow-card)',
        backdropFilter: isGlass ? 'blur(var(--blur-glass))' : 'none',
        WebkitBackdropFilter: isGlass ? 'blur(var(--blur-glass))' : 'none',
        padding,
        transition: interactive ? 'transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard)' : 'none',
        cursor: interactive ? 'pointer' : 'default',
        ...style,
      }}
      onMouseEnter={interactive ? (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; } : undefined}
      onMouseLeave={interactive ? (e) => { e.currentTarget.style.transform = 'translateY(0)'; } : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
