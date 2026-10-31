// DAF motion rig — shared by the marketing clips (9:16, phone floating on a flat brand ground).
// Globals: DafRig = { W, H, PW, PH, MOTION, hexLerp, ClipFrame, Screen, Tap, MapSvg, RoutePath, typed, countTo, DafClip, HomeMapScreen, Glyph }

const W = 1080, H = 1920;
const PW = 390, PH = 844, PS = 1.5;
const PHONE_TOP = 470;
const LIGHT = { bg: '#F5F7F9', ink: '#11151B', ink2: '#4A5562', ink3: '#828D9B', line: '#E7EAEE' };
const DARK  = { bg: '#0B0E12', ink: '#F5F7F9', ink2: '#A9B2BD', ink3: '#828D9B', line: '#262E37' };
const BRAND = '#1FBF6B';

const MOTION = {
  enter: (start, dur = 0.6) => animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeOutCubic }),
  pop:   (start, dur = 0.45) => animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeOutBack }),
  draw:  (start, dur = 1.0) => animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeInOutCubic }),
};

function hexLerp(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
const ds = () => window.DesignSystem_c71fad || {};
const typed = (str, start, cps = 11) => (T) => str.slice(0, Math.max(0, Math.min(str.length, Math.floor((T - start) * cps))));
const countTo = (from, to, start, dur = 1, ease = Easing.easeOutCubic) => (T) => Math.round(animate({ from, to, start, end: start + dur, ease })(T));

// Lucide glyph via the DS Icon primitive
function Glyph({ name, size = 18, color, stroke }) {
  const { Icon } = ds();
  return Icon ? <Icon name={name} size={size} color={color} stroke={stroke} /> : null;
}

// ── Stage frame: ground, step dots, caption, phone, lockup, outro ─────────
function ClipFrame({ T, CUES, total, nightCue, tweaks = {}, captions, children }) {
  const nightOn = tweaks.nightFlip !== false && isFinite(nightCue);
  const p = nightOn ? animate({ from: 0, to: 1, start: nightCue - 0.25, end: nightCue + 0.4, ease: Easing.easeInOutSine })(T) : 0;
  const night = nightOn && T >= nightCue;
  const pal = { bg: hexLerp(LIGHT.bg, DARK.bg, p), ink: hexLerp(LIGHT.ink, DARK.ink, p), ink2: hexLerp(LIGHT.ink2, DARK.ink2, p), line: hexLerp(LIGHT.line, DARK.line, p) };
  const outroAt = isFinite(CUES.Outro) ? CUES.Outro : total;
  const o = MOTION.enter(outroAt, 0.9)(T);
  const e = MOTION.enter(0, 1.1)(T);
  const drift = Math.sin(T * 0.8) * 5;
  const phoneY = PHONE_TOP + (1 - e) * 160 + drift + o * 140;
  const phoneOp = Math.min(e, 1 - o);
  const lockY = 1795 + o * (900 - 1795);
  const lockS = 1 + o * 1.1;
  const tag = MOTION.enter(outroAt + 0.5, 0.6)(T);
  const IOSDevice = window.IOSDevice;
  const items = captions.map((c, i) => ({ ...c, until: c.until ?? (captions[i + 1] ? captions[i + 1].at : outroAt) }));
  const showSteps = tweaks.showSteps !== false;
  const showCaps = tweaks.captions !== 'off';
  if (window.DafRig) window.DafRig.maxZ = (tweaks.tiles || 'mapbox') === 'gray' ? 16 : 18;
  return (
    <div data-screen-label={`t=${Math.floor(T)}s`} style={{ position: 'absolute', inset: 0, background: pal.bg, overflow: 'hidden', fontFamily: 'var(--font-ui), "Hanken Grotesk", system-ui, sans-serif' }}>
      {showSteps && (
        <div style={{ position: 'absolute', top: 128, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10, opacity: Math.min(e, 1 - o) }}>
          {captions.map((c, i) => {
            const next = items[i].until;
            const f = T < c.at ? 0 : T >= next ? 1 : (T - c.at) / (next - c.at);
            return (
              <div key={i} style={{ width: 64, height: 6, borderRadius: 3, background: pal.line, overflow: 'hidden' }}>
                <div style={{ width: `${f * 100}%`, height: '100%', background: BRAND, borderRadius: 3 }} />
              </div>
            );
          })}
        </div>
      )}
      {showCaps && (
        <Captions items={items} style={{ top: 186, bottom: 'auto', left: 84, right: 84, textAlign: 'center', font: '700 58px/1.14 Geist, "Hanken Grotesk", system-ui, sans-serif', letterSpacing: '-0.02em', color: pal.ink, textShadow: 'none', textWrap: 'pretty' }} />
      )}
      <div data-theme={night ? 'dark' : 'light'} style={{ position: 'absolute', left: (W - PW * PS) / 2, top: 0, width: PW * PS, height: PH * PS, transform: `translateY(${phoneY}px)`, opacity: phoneOp, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
        <NightCtx.Provider value={{ night, tiles: tweaks.tiles || 'mapbox' }}>
        <div style={{ width: PW, height: PH, transform: `scale(${PS})`, transformOrigin: '0 0', position: 'relative' }}>
          {IOSDevice ? (
            <IOSDevice width={PW} height={PH} dark={night}>
              <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>{children}</div>
            </IOSDevice>
          ) : null}
          <div style={{ position: 'absolute', inset: 0, borderRadius: 48, pointerEvents: 'none', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16), 0 30px 70px rgba(0,0,0,0.55)', opacity: p, zIndex: 0 }} />
        </div>
        </NightCtx.Provider>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, transform: `translateY(${lockY}px) scale(${lockS})`, transformOrigin: '50% 0', opacity: e }}>
        <img src="assets/logo-mark.png" alt="" style={{ width: 46, height: 46, objectFit: 'cover', display: 'block', borderRadius: 11, boxShadow: '0 1px 2px rgba(11,14,18,0.18)' }} />
        <span style={{ font: '700 30px/1 Geist, system-ui, sans-serif', letterSpacing: '-0.02em', color: pal.ink }}>Drivers Against Flock</span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1040, textAlign: 'center', font: '500 34px/1.3 "Hanken Grotesk", system-ui, sans-serif', color: pal.ink2, opacity: tag, transform: `translateY(${(1 - tag) * 16}px)` }}>Privacy-first navigation</div>
    </div>
  );
}

// ── Phone screens: push / rise / fade in; slide under on exit ─────────────
function Screen({ T, enter, exit, mode = 'push', children, style }) {
  let x = 0, y = 0, op = 1, vis = true;
  if (enter != null && isFinite(enter)) {
    if (T < enter) vis = false;
    const p = MOTION.enter(enter, 0.55)(T);
    if (mode === 'push') x = (1 - p) * PW; else if (mode === 'rise') y = (1 - p) * PH; else op = p;
  }
  if (exit != null && isFinite(exit)) {
    const q = MOTION.enter(exit, 0.55)(T);
    if (T >= exit + 0.6) vis = false;
    x -= q * PW * 0.3;
    op *= 1 - q;
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: `translate(${x}px,${y}px)`, opacity: op, visibility: vis ? 'visible' : 'hidden', ...style }}>
      {children}
    </div>
  );
}

// Finger tap: dot settles then fades, ring expands
function Tap({ T, at, x, y }) {
  const p = (T - at) / 0.7;
  const vis = p >= 0 && p <= 1;
  const dot = Easing.easeOutCubic(clamp(p / 0.25, 0, 1));
  const fade = 1 - Easing.easeInQuad(clamp((p - 0.3) / 0.7, 0, 1));
  const ring = Easing.easeOutCubic(clamp(p, 0, 1));
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 80, pointerEvents: 'none', visibility: vis ? 'visible' : 'hidden' }}>
      <div style={{ position: 'absolute', left: -20, top: -20, width: 40, height: 40, borderRadius: '50%', background: 'rgba(31,191,107,0.30)', border: `2px solid ${BRAND}`, transform: `scale(${0.6 + 0.4 * dot})`, opacity: fade }} />
      <div style={{ position: 'absolute', left: -20, top: -20, width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(31,191,107,0.9)', transform: `scale(${1 + 1.6 * ring})`, opacity: (1 - ring) * 0.8 }} />
    </div>
  );
}

// ── Real map: OpenStreetMap raster tiles, Web Mercator, rendered from a (center, zoom) view ──
const NightCtx = React.createContext({ night: false, tiles: 'mapbox' });
const TILE = 256;
const lon2x = (lon, z) => (lon + 180) / 360 * Math.pow(2, z) * TILE;
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z) * TILE; };
// mapView([lat,lon], zoom) -> { project(lat,lon) -> [x,y] in phone px, tiles, s, zi }
function mapView(center, zoom, w = PW, h = PH, maxZ) {
  if (maxZ == null) maxZ = window.DafRig && window.DafRig.maxZ || 18;
  const zi = Math.min(maxZ, Math.round(zoom)), s = Math.pow(2, zoom - zi);
  const cx = lon2x(center[1], zi), cy = lat2y(center[0], zi);
  const project = (lat, lon) => [(lon2x(lon, zi) - cx) * s + w / 2, (lat2y(lat, zi) - cy) * s + h / 2];
  const n = Math.pow(2, zi);
  const x0 = Math.floor((cx - w / (2 * s)) / TILE) - 1, x1 = Math.floor((cx + w / (2 * s)) / TILE) + 1;
  const y0 = Math.floor((cy - h / (2 * s)) / TILE) - 1, y1 = Math.floor((cy + h / (2 * s)) / TILE) + 1;
  const tiles = [];
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) if (ty >= 0 && ty < n) tiles.push({ tx, ty, x: (tx * TILE - cx) * s + w / 2, y: (ty * TILE - cy) * s + h / 2 });
  return { project, tiles, s, zi, center, zoom, w, h, pathOf: (pts) => pts.map((p, i) => { const [x, y] = project(p[0], p[1]); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join(' ') };
}
const TILE_SRC = {
  mapbox: { url: (z, x, y, night) => { const m = window.DafMap || {}; return `https://api.mapbox.com/styles/v1/${night ? m.dark : m.light}/tiles/256/${z}/${x}/${y}@2x?access_token=${m.token}`; }, credit: '© Mapbox © OpenStreetMap', bg: (n) => n ? '#1A1D23' : '#EAEDF0', filter: () => 'none' },
  gray: { url: (z, x, y, night) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${night ? 'Dark' : 'Light'}_Gray_Base/MapServer/tile/${z}/${y}/${x}`, credit: 'Esri, HERE, Garmin · © OpenStreetMap contributors', bg: (n) => n ? '#2B2B2B' : '#F1F1EF', filter: () => 'none' },
};
function TileLayer({ V, dim = 0 }) {
  const { night, tiles } = React.useContext(NightCtx);
  const src = TILE_SRC[tiles] || TILE_SRC.mapbox;
  const wrap = Math.pow(2, V.zi);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: src.bg(night) }}>
      <div style={{ position: 'absolute', inset: 0, filter: src.filter(night) }}>
        {V.tiles.map((t) => { const tx = ((t.tx % wrap) + wrap) % wrap; return (
          <img key={t.tx + '/' + t.ty} alt="" crossOrigin="anonymous" draggable={false} src={src.url(V.zi, tx, t.ty, night)} style={{ position: 'absolute', left: t.x, top: t.y, width: TILE * V.s + 0.5, height: TILE * V.s + 0.5, display: 'block' }} />
        ); })}
      </div>
      {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(11,14,18,${dim})` }} />}
      <div style={{ position: 'absolute', right: 6, bottom: 36, fontSize: 8.5, color: night ? 'rgba(245,247,249,0.75)' : 'rgba(17,21,27,0.7)', background: night ? 'rgba(17,21,27,0.55)' : 'rgba(255,255,255,0.7)', padding: '1px 5px', borderRadius: 4, fontFamily: 'var(--font-ui)' }}>{src.credit}</div>
    </div>
  );
}
const haversineMi = (a, b) => { const R = 3958.8, d = Math.PI / 180, dLat = (b[0] - a[0]) * d, dLon = (b[1] - a[1]) * d; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
// point along a polyline at fraction f (0..1 by vertex index)
const alongPts = (pts, f) => { const i = Math.max(0, Math.min(pts.length - 1, f * (pts.length - 1))); const a = pts[Math.floor(i)], b = pts[Math.min(pts.length - 1, Math.floor(i) + 1)], k = i - Math.floor(i); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };

// Schematic vector map (fallback), pannable/zoomable
function MapSvg({ dx = 0, dy = 0, scale = 1, dim = 0 }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--map-land)' }}>
      <svg viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', left: '-20%', top: '-20%', width: '140%', height: '140%', display: 'block', transform: `translate(${dx}px,${dy}px) scale(${scale})`, transformOrigin: '50% 50%' }}>
        <rect x="0" y="0" width="600" height="900" fill="var(--map-land)" />
        <rect x="180" y="320" width="230" height="240" rx="10" fill="var(--map-land-alt)" />
        <rect x="60" y="120" width="150" height="150" rx="10" fill="var(--map-land-alt)" />
        <path d="M600 -20 L600 320 C 520 312, 470 240, 470 158 C 470 86, 548 44, 524 -20 Z" fill="var(--map-water)" />
        <path d="M-20 640 C 90 612, 210 656, 232 760 C 248 842, 150 928, 40 928 L -20 928 Z" fill="var(--map-park)" />
        <ellipse cx="470" cy="700" rx="92" ry="70" fill="var(--map-park)" />
        <g stroke="var(--map-road-minor)" strokeWidth="6" strokeLinecap="round">
          {[80, 185, 295, 405, 515].map((x) => <line key={'v' + x} x1={x} y1="-20" x2={x} y2="920" />)}
          {[110, 215, 325, 445, 560, 685, 800].map((y) => <line key={'h' + y} x1="-20" y1={y} x2="620" y2={y} />)}
        </g>
        <g stroke="var(--map-road)" strokeWidth="14" strokeLinecap="round" fill="none">
          <path d="M300 -20 C 322 200, 276 420, 312 640 C 332 770, 300 860, 300 920" />
          <path d="M-20 268 C 180 300, 360 372, 640 352" />
          <path d="M-20 612 C 200 588, 420 650, 640 600" />
        </g>
      </svg>
      {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(11,14,18,${dim})` }} />}
    </div>
  );
}

// Route line drawn tip-to-tail (0..1), in phone px coords (390×844)
function RoutePath({ d, kind = 'private', p = 1, from = 0, opacity = 1, width = 7, w = PW, h = PH }) {
  const col = kind === 'fast' ? 'var(--route-fast)' : 'var(--route-private)';
  const casing = kind === 'fast' ? 'var(--route-fast-casing)' : 'var(--route-private-casing)';
  const dash = `${Math.max(0, Math.min(1, p) - from)} 1`, off = -from;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'visible', pointerEvents: 'none', opacity }}>
      <path d={d} pathLength="1" fill="none" stroke={casing} strokeWidth={width + 5} strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={off} />
      <path d={d} pathLength="1" fill="none" stroke={col} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={off} />
    </svg>
  );
}

// Marker placed by percent (x,y) or phone px (px,py), popping in at `at`
function Mark({ T, at = 0, x, y, px, py, anchor = 'center', z = 4, children, opacity = 1 }) {
  const s = MOTION.pop(at, 0.5)(T);
  const ty = anchor === 'bottom' ? '-100%' : '-50%';
  const left = px != null ? px : `${x}%`, top = py != null ? py : `${y}%`;
  return (
    <div style={{ position: 'absolute', left, top, zIndex: z, transform: `translate(-50%,${ty}) scale(${s})`, transformOrigin: anchor === 'bottom' ? '50% 100%' : '50% 50%', opacity: opacity * Math.min(1, s * 2) }}>
      {children}
    </div>
  );
}

const glassBtn = (brand) => ({ width: 48, height: 48, border: '1px solid var(--border-glass)', background: 'var(--surface-glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-float)', color: brand ? 'var(--brand)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' });

// Map home — search capsule, chips, right-edge controls (map layer passed in as `map`)
function HomeMapScreen({ T, markers, controlsAt = 0.2, map }) {
  const { SearchBar, Chip } = ds();
  const noop = () => {};
  const top = MOTION.enter(controlsAt, 0.7)(T);
  return (
    <React.Fragment>
      {map}
      {markers}
      <div style={{ position: 'absolute', top: 60, left: 12, right: 12, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 10, transform: `translateY(${(1 - top) * -40}px)`, opacity: top }}>
        {SearchBar && <SearchBar placeholder="Where to?" readOnly onMenu={noop} onVoice={noop} onDirections={noop} style={{ width: '100%' }} />}
        <div style={{ display: 'flex', gap: 8, paddingRight: 70, flexWrap: 'wrap' }}>
          {['Restaurants', 'Gas', 'Coffee', 'Hotels'].map((c) => Chip ? <Chip key={c} tone="glass" style={{ height: 30, fontSize: 13, padding: '0 12px' }}>{c}</Chip> : null)}
        </div>
      </div>
      <div style={{ position: 'absolute', right: 12, top: 122, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 12, transform: `translateX(${(1 - top) * 60}px)`, opacity: top }}>
        <div style={glassBtn()}><Glyph name="sliders" size={20} /></div>
        <div style={glassBtn()}><Glyph name="plus" size={22} /></div>
        <div style={glassBtn()}><Glyph name="minus" size={22} /></div>
        <div style={glassBtn()}><Glyph name="crosshair" size={20} /></div>
        <div style={glassBtn(true)}><Glyph name="pencil" size={20} /></div>
      </div>
    </React.Fragment>
  );
}

// Clip shell: stage + tweaks
function DafClip({ Piece }) {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS || { motionEditor: true, nightFlip: true, showSteps: true, captions: 'on' });
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: '#0a0a0a' }}>
      <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={LIGHT.bg}>
        <Piece tweaks={t} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Clip" />
        <TweakToggle label="Light → dark flip" value={t.nightFlip !== false} onChange={(v) => setTweak('nightFlip', v)} />
        <TweakToggle label="Step dots" value={t.showSteps !== false} onChange={(v) => setTweak('showSteps', v)} />
        <TweakRadio label="Captions" value={t.captions || 'on'} options={['on', 'off']} onChange={(v) => setTweak('captions', v)} />
        <TweakRadio label="Map tiles" value={t.tiles || 'mapbox'} options={['mapbox', 'gray']} onChange={(v) => setTweak('tiles', v)} />
        <TweakSection label="Editor" />
        <TweakToggle label="Motion editor" value={t.motionEditor !== false} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </div>
  );
}

window.DafRig = { W, H, PW, PH, BRAND, MOTION, hexLerp, ds, typed, countTo, Glyph, ClipFrame, Screen, Tap, MapSvg, RoutePath, Mark, glassBtn, HomeMapScreen, DafClip, mapView, TileLayer, NightCtx, haversineMi, alongPts };
