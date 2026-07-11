import React from 'react';

/**
 * DAF Tooltip — a small inverse-surface bubble that explains an icon-only
 * control on hover or keyboard focus. Wrap any trigger; positions on the
 * given side with a matching arrow.
 */
export function Tooltip({
  content,
  side = 'top',          // top | bottom | left | right
  delay = 120,
  children,
  style = {},
}) {
  const [show, setShow] = React.useState(false);
  const timer = React.useRef();
  const open = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setShow(true), delay); };
  const close = () => { clearTimeout(timer.current); setShow(false); };
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const gap = 8;
  const bubble = { position: 'absolute', zIndex: 70 };
  const arrowBase = { position: 'absolute', width: 8, height: 8, background: 'var(--surface-inverse)', transform: 'rotate(45deg)' };
  const arrow = { ...arrowBase };

  if (side === 'top')    { bubble.bottom = '100%'; bubble.left = '50%'; bubble.transform = 'translateX(-50%)'; bubble.marginBottom = gap; arrow.top = '100%'; arrow.left = '50%'; arrow.marginLeft = -4; arrow.marginTop = -4; }
  if (side === 'bottom') { bubble.top = '100%';    bubble.left = '50%'; bubble.transform = 'translateX(-50%)'; bubble.marginTop = gap;    arrow.bottom = '100%'; arrow.left = '50%'; arrow.marginLeft = -4; arrow.marginBottom = -4; }
  if (side === 'left')   { bubble.right = '100%';  bubble.top = '50%';  bubble.transform = 'translateY(-50%)'; bubble.marginRight = gap;  arrow.left = '100%'; arrow.top = '50%'; arrow.marginTop = -4; arrow.marginLeft = -4; }
  if (side === 'right')  { bubble.left = '100%';   bubble.top = '50%';  bubble.transform = 'translateY(-50%)'; bubble.marginLeft = gap;   arrow.right = '100%'; arrow.top = '50%'; arrow.marginTop = -4; arrow.marginRight = -4; }

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', ...style }}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      <span
        role="tooltip"
        style={{
          ...bubble,
          opacity: show ? 1 : 0,
          visibility: show ? 'visible' : 'hidden',
          transition: 'opacity var(--dur-fast) var(--ease-standard)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          background: 'var(--surface-inverse)',
          color: 'var(--text-inverse)',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--fs-body-sm)',
          fontWeight: 'var(--fw-semibold)',
          lineHeight: 1.3,
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-float)',
        }}
      >
        {content}
        <span style={arrow} />
      </span>
    </span>
  );
}
