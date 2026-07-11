import React from 'react';

/**
 * DAF ButtonGroup — joins a set of <Button>s into one segmented control.
 * Outer corners stay rounded; inner corners square; segments share a
 * hairline divider and a single elevation. Works horizontally or
 * vertically and keeps each child Button's own variant/disabled state.
 */
export function ButtonGroup({
  children,
  orientation = 'horizontal', // 'horizontal' | 'vertical'
  size,                       // optional: force a size onto every segment
  fullWidth = false,         // stretch to fill, segments share space equally
  attached = true,           // true: joined segments · false: evenly spaced pills
  style = {},
  ...rest
}) {
  const vertical = orientation === 'vertical';
  const items = React.Children.toArray(children).filter(Boolean);
  const last = items.length - 1;
  const r = 'var(--radius-md)';
  const divider = '1px solid var(--border-glass)';

  if (!attached) {
    return (
      <div
        role="group"
        style={{
          display: fullWidth ? 'flex' : 'inline-flex',
          flexDirection: vertical ? 'column' : 'row',
          gap: 8,
          ...style,
        }}
        {...rest}
      >
        {items.map((child, i) =>
          React.cloneElement(child, {
            key: i,
            size: size || child.props.size,
            style: { flex: !vertical && fullWidth ? '1 1 0' : '0 0 auto', ...child.props.style },
          })
        )}
      </div>
    );
  }

  return (
    <div
      role="group"
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        flexDirection: vertical ? 'column' : 'row',
        borderRadius: r,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-float)',
        width: fullWidth ? '100%' : 'auto',
        ...style,
      }}
      {...rest}
    >
      {items.map((child, i) => {
        const first = i === 0;
        const end = i === last;
        const corners = vertical
          ? {
              borderTopLeftRadius: first ? r : 0,
              borderTopRightRadius: first ? r : 0,
              borderBottomLeftRadius: end ? r : 0,
              borderBottomRightRadius: end ? r : 0,
            }
          : {
              borderTopLeftRadius: first ? r : 0,
              borderBottomLeftRadius: first ? r : 0,
              borderTopRightRadius: end ? r : 0,
              borderBottomRightRadius: end ? r : 0,
            };
        const seam = first
          ? {}
          : vertical
          ? { borderTop: divider }
          : { borderLeft: divider };
        // Horizontal full-width: segments share width equally (flex-basis 0).
        // Vertical: keep each Button's natural height; width comes from
        // align-items: stretch (the column default), so flex must stay auto —
        // a flex-basis of 0 here would collapse rows to text height.
        const flex = !vertical && fullWidth ? '1 1 0' : '0 0 auto';
        return React.cloneElement(child, {
          key: i,
          size: size || child.props.size,
          style: {
            ...corners,
            ...seam,
            boxShadow: 'none',
            flex,
            ...(vertical ? { justifyContent: 'flex-start' } : null),
            ...child.props.style,
          },
        });
      })}
    </div>
  );
}
