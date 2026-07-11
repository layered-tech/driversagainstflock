import React from 'react';

// Named size presets — `size` also accepts any raw px number.
const SIZES = { sm: 44, md: 58, lg: 80 };

/**
 * DAF SpeedLimitBadge — posted limit on a white US-style sign, with an optional
 * live current-speed read-out tucked into the BOTTOM corner. The read-out is a
 * calm gray at or under the posted limit and hardens to black when you're over.
 *
 * The sign is a real-world object, so it stays white in BOTH themes (it reads
 * `--speed-*` tokens, which are pinned light-and-dark in colors.css).
 */
export function SpeedLimitBadge({
  limit = 35,
  current = null,
  size = 'md',
  unit = 'mph',
  style = {},
}) {
  const px = typeof size === 'number' ? size : (SIZES[size] || SIZES.md);
  const hasCurrent = current !== null && current !== undefined;
  const over = hasCurrent && Number(current) > Number(limit);

  // Geometry derives from `px` (the sign width).
  const signH = px * 1.2;
  const ring = Math.max(3, px * 0.07);
  const dial = px * 0.46;

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        width: px,
        height: signH + dial * 0.5,
        ...style,
      }}
    >
      {/* the white sign */}
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: px,
          height: signH,
          background: '#FFFFFF',
          border: `${Math.max(2, px * 0.045)}px solid #11151B`,
          borderRadius: px * 0.14,
          boxShadow: 'var(--shadow-marker)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: size * 0.04,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 800,
            fontSize: px * 0.15,
            lineHeight: 1.02,
            letterSpacing: '0.04em',
            color: '#11151B',
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          Speed<br />Limit
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            fontSize: px * 0.46,
            lineHeight: 0.92,
            color: '#11151B',
            fontFeatureSettings: 'var(--num-feature)',
          }}
        >
          {limit}
        </span>
      </span>

      {/* live current-speed read-out, straddling the bottom-right corner */}
      {hasCurrent && (
        <span
          style={{
            position: 'absolute',
            bottom: 0,
            right: -dial * 0.5,
            width: dial,
            height: dial,
            borderRadius: '50%',
            background: '#FFFFFF',
            border: `${ring}px solid ${over ? 'var(--speed-over)' : 'var(--speed-limit-ring)'}`,
            boxShadow: 'var(--shadow-marker)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            fontSize: dial * 0.46,
            lineHeight: 1,
            color: over ? 'var(--speed-over)' : 'var(--speed-ok)',
            fontFeatureSettings: 'var(--num-feature)',
          }}
        >
          {current}
        </span>
      )}
    </span>
  );
}
