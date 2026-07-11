import React from 'react';

/* Curated Lucide icon set (Lucide geometry: 24×24 viewBox, 2px stroke,
   round caps & joins). Each entry is an array of [tag, attrs] nodes. */
const ICONS = {
  // search / nav chrome
  search:        [['circle', { cx: 11, cy: 11, r: 8 }], ['path', { d: 'm21 21-4.3-4.3' }]],
  navigation:    [['polygon', { points: '3 11 22 2 13 21 11 13 3 11' }]],
  'navigation-2':[['polygon', { points: '12 2 19 21 12 17 5 21 12 2' }]],
  layers:        [['path', { d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z' }], ['path', { d: 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65' }], ['path', { d: 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65' }]],
  plus:          [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
  minus:         [['path', { d: 'M5 12h14' }]],
  'share-2':     [['circle', { cx: 18, cy: 5, r: 3 }], ['circle', { cx: 6, cy: 12, r: 3 }], ['circle', { cx: 18, cy: 19, r: 3 }], ['path', { d: 'm8.59 13.51 6.83 3.98' }], ['path', { d: 'm15.41 6.51-6.82 3.98' }]],
  x:             [['path', { d: 'M18 6 6 18' }], ['path', { d: 'M6 6l12 12' }]],
  'rotate-cw':   [['path', { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' }], ['path', { d: 'M21 3v5h-5' }]],
  'volume-2':    [['polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }], ['path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }], ['path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }]],
  mic:           [['path', { d: 'M12 19v3' }], ['path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }], ['rect', { x: 9, y: 2, width: 6, height: 13, rx: 3 }]],
  'chevron-right':[['path', { d: 'm9 18 6-6-6-6' }]],
  'chevron-down':[['path', { d: 'm6 9 6 6 6-6' }]],
  sun:           [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2' }], ['path', { d: 'M12 20v2' }], ['path', { d: 'm4.93 4.93 1.41 1.41' }], ['path', { d: 'm17.66 17.66 1.41 1.41' }], ['path', { d: 'M2 12h2' }], ['path', { d: 'M20 12h2' }], ['path', { d: 'm6.34 17.66-1.41 1.41' }], ['path', { d: 'm19.07 4.93-1.41 1.41' }]],
  moon:          [['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]],
  user:          [['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  menu:          [['path', { d: 'M4 12h16' }], ['path', { d: 'M4 6h16' }], ['path', { d: 'M4 18h16' }]],
  sliders:       [['line', { x1: 4, x2: 4, y1: 21, y2: 14 }], ['line', { x1: 4, x2: 4, y1: 10, y2: 3 }], ['line', { x1: 12, x2: 12, y1: 21, y2: 12 }], ['line', { x1: 12, x2: 12, y1: 8, y2: 3 }], ['line', { x1: 20, x2: 20, y1: 21, y2: 16 }], ['line', { x1: 20, x2: 20, y1: 12, y2: 3 }], ['line', { x1: 2, x2: 6, y1: 14, y2: 14 }], ['line', { x1: 10, x2: 14, y1: 8, y2: 8 }], ['line', { x1: 18, x2: 22, y1: 16, y2: 16 }]],
  info:          [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
  'circle-check':[['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'm9 12 2 2 4-4' }]],
  clock:         [['circle', { cx: 12, cy: 12, r: 10 }], ['polyline', { points: '12 6 12 12 16 14' }]],

  // routes / surveillance
  zap:           [['path', { d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z' }]],
  shield:        [['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }]],
  'shield-check':[['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
  check:         [['path', { d: 'M20 6 9 17l-5-5' }]],
  camera:        [['path', { d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z' }], ['circle', { cx: 12, cy: 13, r: 3 }]],
  'scan-eye':    [['path', { d: 'M3 7V5a2 2 0 0 1 2-2h2' }], ['path', { d: 'M17 3h2a2 2 0 0 1 2 2v2' }], ['path', { d: 'M21 17v2a2 2 0 0 1-2 2h-2' }], ['path', { d: 'M7 21H5a2 2 0 0 1-2-2v-2' }], ['circle', { cx: 12, cy: 12, r: 1 }], ['path', { d: 'M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0' }]],
  'triangle-alert':[['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }], ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]],

  // places
  'map-pin':     [['path', { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0' }], ['circle', { cx: 12, cy: 10, r: 3 }]],
  flag:          [['path', { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' }], ['path', { d: 'M4 22V4' }]],
  star:          [['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }]],
  coffee:        [['path', { d: 'M10 2v2' }], ['path', { d: 'M14 2v2' }], ['path', { d: 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1' }], ['path', { d: 'M6 2v2' }]],
  fuel:          [['line', { x1: 3, x2: 15, y1: 22, y2: 22 }], ['line', { x1: 4, x2: 14, y1: 9, y2: 9 }], ['path', { d: 'M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18' }], ['path', { d: 'M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5' }]],
  home:          [['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }], ['path', { d: 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }]],
  briefcase:     [['path', { d: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' }], ['rect', { width: 20, height: 14, x: 2, y: 6, rx: 2 }]],

  // maneuvers
  'corner-up-right':[['polyline', { points: '15 14 20 9 15 4' }], ['path', { d: 'M4 20v-7a4 4 0 0 1 4-4h12' }]],
  'corner-up-left': [['polyline', { points: '9 14 4 9 9 4' }], ['path', { d: 'M20 20v-7a4 4 0 0 0-4-4H4' }]],
  'arrow-up':       [['path', { d: 'm5 12 7-7 7 7' }], ['path', { d: 'M12 19V5' }]],
  'git-merge':      [['circle', { cx: 18, cy: 18, r: 3 }], ['circle', { cx: 6, cy: 6, r: 3 }], ['path', { d: 'M6 21V9a9 9 0 0 0 9 9' }]],
  'undo-2':         [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11' }]],

  // editing / contribution
  pencil:           [['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }], ['path', { d: 'm15 5 4 4' }]],
  'trash-2':        [['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }], ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }], ['line', { x1: 10, x2: 10, y1: 11, y2: 17 }], ['line', { x1: 14, x2: 14, y1: 11, y2: 17 }]],
  upload:           [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['polyline', { points: '17 8 12 3 7 8' }], ['line', { x1: 12, x2: 12, y1: 3, y2: 15 }]],
  crosshair:        [['circle', { cx: 12, cy: 12, r: 10 }], ['line', { x1: 22, x2: 18, y1: 12, y2: 12 }], ['line', { x1: 6, x2: 2, y1: 12, y2: 12 }], ['line', { x1: 12, x2: 12, y1: 6, y2: 2 }], ['line', { x1: 12, x2: 12, y1: 22, y2: 18 }]],
  'chevron-left':   [['path', { d: 'm15 18-6-6 6-6' }]],
};

/**
 * DAF Icon — the single Lucide-based icon primitive used across the system.
 * Renders a stroked 24-grid SVG that inherits `currentColor`.
 */
export function Icon({ name, size = 20, stroke = 2, color = 'currentColor', strokeColor, style = {}, title, ...rest }) {
  const nodes = ICONS[name];
  const sc = strokeColor || color;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={sc}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      {...rest}
    >
      {title && <title>{title}</title>}
      {(nodes || []).map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

/** Names available in this build — handy for icon-grid specimens. */
export const ICON_NAMES = Object.keys(ICONS);
