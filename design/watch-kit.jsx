// @ds-adherence-ignore -- device frames + spec glyphs (raw px by design)
// watch-kit.jsx — Wear OS round frame (Galaxy Watch 450px, authored at 225dp),
// Apple Watch 45mm frame (authored at 396×484pt), maneuver glyphs, haptic trace, callout pins.
// Exports (window): WearRound, AppleWatch, Maneuver, HapticTrace, Callout

const WEAR_DP = 225;      // authored canvas (dp); device is 450px @2x
const AW_W = 396, AW_H = 484; // authored canvas (pt), 45mm
const AW_K = 1.17;        // physical-size parity with a 450px round display

function WearRound({ children, scale = 0.8, ambient = false, time = '9:41', showTime = true, bg = '#000', style = {} }) {
  const px = 450 * scale, bezel = Math.round(px * 0.055);
  const outer = px + bezel * 2;
  return (
    <div style={{ position: 'relative', width: outer, height: outer, flex: '0 0 auto', ...style }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'linear-gradient(160deg,#2a2d31,#0c0d0f 70%)', boxShadow: '0 10px 28px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', right: -Math.round(bezel * 0.55), top: '38%', width: Math.round(bezel * 0.9), height: Math.round(px * 0.09), borderRadius: 4, background: '#1a1c1f', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', right: -Math.round(bezel * 0.55), top: '54%', width: Math.round(bezel * 0.9), height: Math.round(px * 0.09), borderRadius: 4, background: '#1a1c1f', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', left: bezel, top: bezel, width: px, height: px, borderRadius: '50%', overflow: 'hidden', background: bg }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: WEAR_DP, height: WEAR_DP, transform: `scale(${px / WEAR_DP})`, transformOrigin: 'top left', color: '#fff', fontFamily: 'var(--font-ui, Hanken Grotesk, system-ui)', filter: ambient ? 'grayscale(0.55) brightness(0.62)' : 'none' }}>
          {showTime && <div style={{ position: 'absolute', top: 7, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontWeight: 600, letterSpacing: 0.3, color: 'rgba(255,255,255,0.72)', fontFamily: 'var(--font-mono, JetBrains Mono, monospace)' }}>{time}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

function AppleWatch({ children, scale = 0.8, ambient = false, time = '9:41', showTime = true, title, bg = '#000', style = {} }) {
  const k = AW_K * scale;
  const sw = AW_W * k, sh = AW_H * k, bezel = Math.round(sw * 0.06);
  const r = 96 * k;
  return (
    <div style={{ position: 'relative', width: sw + bezel * 2, height: sh + bezel * 2, flex: '0 0 auto', ...style }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: r + bezel, background: 'linear-gradient(160deg,#26292d,#0b0c0e 70%)', boxShadow: '0 10px 28px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', right: -Math.round(bezel * 0.6), top: '22%', width: Math.round(bezel * 0.9), height: Math.round(sh * 0.13), borderRadius: 5, background: '#1a1c1f', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }} />
      <div style={{ position: 'absolute', right: -Math.round(bezel * 0.45), top: '42%', width: Math.round(bezel * 0.7), height: Math.round(sh * 0.17), borderRadius: 4, background: '#141618', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', left: bezel, top: bezel, width: sw, height: sh, borderRadius: r, overflow: 'hidden', background: bg }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: AW_W, height: AW_H, transform: `scale(${k})`, transformOrigin: 'top left', color: '#fff', fontFamily: 'var(--font-ui, Hanken Grotesk, system-ui)', filter: ambient ? 'grayscale(0.55) brightness(0.62)' : 'none' }}>
          {showTime && <div style={{ position: 'absolute', top: 20, right: 32, fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.78)', fontFamily: '-apple-system, "SF Pro", system-ui' }}>{time}</div>}
          {title && <div style={{ position: 'absolute', top: 20, left: 32, fontSize: 15, fontWeight: 600, color: '#1FBF6B', fontFamily: '-apple-system, "SF Pro", system-ui' }}>{title}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

// Maneuver glyphs — Lucide-grade geometry (24 grid, 2.2 stroke, round caps). Secondary branches at 35%.
const MAN = {
  'left':         [['M20 20v-7a4 4 0 0 0-4-4H4'], ['M9 14 4 9l5-5']],
  'right':        [['M4 20v-7a4 4 0 0 1 4-4h12'], ['m15 14 5-5-5-5']],
  'slight-left':  [['M14 21v-9L8 6'], ['M8 11V6h5']],
  'slight-right': [['M10 21v-9l6-6'], ['M16 11V6h-5']],
  'sharp-left':   [['M15 21V9.5a2 2 0 0 0-3.4-1.4L6 13.5'], ['M6 8v6h6']],
  'sharp-right':  [['M9 21V9.5a2 2 0 0 1 3.4-1.4L18 13.5'], ['M18 8v6h-6']],
  'keep-left':    [['M13 21v-8L8 8V3'], ['M4 7l4-4 4 4'], ['M13 13l4-4V6', .35]],
  'keep-right':   [['M11 21v-8l5-5V3'], ['M12 7l4-4 4 4'], ['M11 13 7 9V6', .35]],
  'straight':     [['M12 21V4'], ['m6 10 6-6 6 6']],
  'roundabout':   [['M12 22v-3.5'], ['M12 18.5a5.5 5.5 0 1 1 4.9-8'], ['M15.8 9.6 19.5 6'], ['M19.5 10V6h-4']],
  'uturn':        [['M17 21V9a5 5 0 0 0-10 0v6'], ['m3 11 4 4 4-4']],
  'depart':       [['M12 15V4'], ['m6 10 6-6 6 6'], ['M12 20.5h.01', 1, 3.5]],
  'arrive':       [['M5 21V4'], ['M5 4h12l-3 4 3 4H5'], ],
};
function Maneuver({ kind = 'straight', size = 56, color = 'currentColor', exit, style = {} }) {
  const segs = MAN[kind] || MAN.straight;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flex: '0 0 auto', color, ...style }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        {segs.map(([d, op = 1, sw], i) => <path key={i} d={d} opacity={op} strokeWidth={sw} />)}
      </svg>
      {kind === 'roundabout' && exit != null && (
        <span style={{ position: 'absolute', left: '50%', top: '58%', transform: 'translate(-50%,-50%)', fontSize: size * 0.3, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-mono, monospace)' }}>{exit}</span>
      )}
    </span>
  );
}

// Haptic trace — pulses over a ms timeline. pulses: [{t, d, amp(0-1), label, color}]
function HapticTrace({ pulses = [], total = 1200, width = 420, height = 86, color = 'var(--brand, #1FBF6B)', muted = 'var(--text-tertiary, #7a7f87)', tick = 200, caption }) {
  const padL = 10, padR = 10, base = height - 26, top = 10;
  const x = t => padL + (t / total) * (width - padL - padR);
  const ticks = []; for (let t = 0; t <= total; t += tick) ticks.push(t);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', maxWidth: '100%', fontFamily: 'var(--font-mono, monospace)' }}>
      <line x1={padL} x2={width - padR} y1={base} y2={base} stroke={muted} strokeOpacity="0.45" />
      {ticks.map(t => <g key={t}><line x1={x(t)} x2={x(t)} y1={base} y2={base + 4} stroke={muted} strokeOpacity="0.6" /><text x={x(t)} y={base + 15} fontSize="9" textAnchor="middle" fill={muted}>{t}</text></g>)}
      {pulses.map((p, i) => {
        const h = Math.max(6, (base - top) * (p.amp ?? 1));
        return <g key={i}>
          <rect x={x(p.t)} y={base - h} width={Math.max(3, x(p.t + p.d) - x(p.t))} height={h} rx="3" fill={p.color || color} opacity="0.92" />
          {p.label && <text x={x(p.t)} y={base - h - 4} fontSize="9.5" textAnchor="start" fill={p.color || color}>{p.label}</text>}
        </g>;
      })}
      {caption && <text x={width - padR} y={10} fontSize="9" textAnchor="end" fill={muted}>{caption}</text>}
    </svg>
  );
}

// Callout pin — numbered marker positioned by % over a frame.
function Callout({ n, x, y, tone = 'brand' }) {
  const bg = tone === 'alert' ? 'var(--alert-500, #FF4D4F)' : tone === 'ink' ? 'var(--text-primary, #111)' : 'var(--brand, #1FBF6B)';
  return (
    <span style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', width: 22, height: 22, borderRadius: '50%', background: bg, color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono, monospace)', boxShadow: '0 0 0 2px rgba(255,255,255,0.9), 0 2px 6px rgba(0,0,0,0.35)', zIndex: 5, pointerEvents: 'none' }}>{n}</span>
  );
}

// Supplementary glyphs not in the DS Icon set (Lucide geometry).
const WI = {
  smartphone: ['M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
  'phone-off': ['M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01', 'M2 2l20 20'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  'bell-off': ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0', 'M2 2l20 20'],
  vibrate: ['M2 8l2 2-2 2 2 2-2 2', 'M22 8l-2 2 2 2-2 2 2 2', 'M8 5h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  'vibrate-off': ['M8 5h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M2 2l20 20'],
  loader: ['M12 2v4', 'M12 18v4', 'M4.93 4.93l2.83 2.83', 'M16.24 16.24l2.83 2.83', 'M2 12h4', 'M18 12h4', 'M4.93 19.07l2.83-2.83', 'M16.24 7.76l2.83-2.83'],
  'link-off': ['M9 17H7A5 5 0 0 1 7 7', 'M15 7h2a5 5 0 0 1 4 8', 'M8 12h3', 'M2 2l20 20'],
  history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  'wifi-off': ['M12 20h.01', 'M8.5 16.4a5 5 0 0 1 7 0', 'M5 12.9a10 10 0 0 1 5.2-2.8', 'M19 12.9a10 10 0 0 0-2.1-1.5', 'M2 8.8a15 15 0 0 1 8.1-4.3', 'M22 8.8a15 15 0 0 0-5-3', 'M2 2l20 20'],
  'bluetooth-off': ['m17 17-5 5V12l-5 5', 'M2 2l20 20', 'M14.5 9.5 17 7l-5-5v4.5'],
  'circle-x': ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'm15 9-6 6', 'm9 9 6 6'],
  timer: ['M10 2h4', 'M12 14l3-3', 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z'],
  route: ['M6 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15', 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  lock: ['M3 11h18v11H3z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  watch: ['M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z', 'M12 10v2l1 1', 'M16.13 7.66l-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05', 'M7.88 16.36l.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05'],
  'arrow-up-right': ['M7 17 17 7', 'M7 7h10v10'],
  'map-pin': ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  'map-pin-off': ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0', 'M2 2l20 20'],
  camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  'circle-check': ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'm9 12 2 2 4-4'],
  'triangle-alert': ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  crosshair: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M22 12h-4', 'M6 12H2', 'M12 6V2', 'M12 22v-4'],
  'rotate-cw': ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  'shield-check': ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', 'm9 12 2 2 4-4'],
  zap: ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  navigation: ['M3 11 22 2l-9 19-2-8z'],
  'chevron-left': ['m15 18-6-6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-up': ['m18 15-6-6-6 6'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  layers: ['m12.83 2.18 8.5 4.05a.5.5 0 0 1 0 .9l-8.5 4.05a2 2 0 0 1-1.66 0L2.67 7.13a.5.5 0 0 1 0-.9l8.5-4.05a2 2 0 0 1 1.66 0', 'm22 12-9.17 4.37a2 2 0 0 1-1.66 0L2 12', 'm22 17-9.17 4.37a2 2 0 0 1-1.66 0L2 17'],
  gauge: ['m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0'],
  plus: ['M5 12h14', 'M12 5v14'],
  minus: ['M5 12h14'],
  'battery-low': ['M3 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M22 11v2', 'M5 10v4'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M2 14h4', 'M10 8h4', 'M18 16h4'],
  star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z'],
  activity: ['M22 12h-2.5a2 2 0 0 0-1.9 1.4L15 20 9 4l-2.6 6.6A2 2 0 0 1 4.5 12H2'],
  car: ['M19 17H5', 'M3 11l2-5h14l2 5', 'M3 11h18v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z', 'M7 17v2', 'M17 17v2'],
  'eye-off': ['M9.88 9.88a3 3 0 1 0 4.24 4.24', 'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68', 'M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61', 'M2 2l20 20'],
  'volume-2': ['M11 5 6 9H2v6h4l5 4z', 'M15.54 8.46a5 5 0 0 1 0 7.07', 'M19.07 4.93a10 10 0 0 1 0 14.14'],
};
function WIcon({ name = 'info', size = 20, color = 'currentColor', strokeWidth = 2, style = {} }) {
  const paths = WI[name] || WI.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: '0 0 auto', ...style }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

Object.assign(window, { WearRound, AppleWatch, Maneuver, HapticTrace, Callout, WIcon });
