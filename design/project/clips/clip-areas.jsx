// Clip 2 — Areas & alerts: watch a neighborhood. Global: DafClipAreas
(function () {
  const R = window.DafRig;
  const { PW, MOTION, ds, countTo, Glyph, ClipFrame, Screen, Tap, Mark, DafClip, mapView, TileLayer, haversineMi } = R;
  const G = () => window.DafGeo;
  const at = (V, p) => { const [x, y] = V.project(p[0], p[1]); return { px: x, py: y }; };
  // cameras around home (real-ish poles near Stanford/Palo Alto), with distance in mi from home
  const CAM_PTS = [[37.4154, -122.1691], [37.4262, -122.1595], [37.4297, -122.1536], [37.4188, -122.1718], [37.4420, -122.1600], [37.3990, -122.1560], [37.4345, -122.1265]];
  const noop = () => {};
  const eyebrow = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' };


  function AddScreen({ T, C }) {
    const { MapMarker, BottomSheet, SegmentedControl, Input, Slider, Button } = ds();
    const g = G();
    const home = g.home;
    const around = T >= C.Radius;
    const sw = MOTION.enter(C.Radius, 0.45)(T);
    const mi = animate({ from: 1, to: 2, start: C.Radius + 0.7, end: C.Radius + 2.1, ease: Easing.easeInOutCubic })(T);
    const miR = Math.round(mi);
    const V = mapView([home[0] - 0.016, home[1]], 12.6 - 0.5 * MOTION.draw(C.Radius + 0.5, 1.8)(T));
    const [CX, CY] = V.project(home[0], home[1]);
    const r = (mi * 1609.34) / (40075016.686 * Math.cos(home[0] * Math.PI / 180) / Math.pow(2, V.zoom + 8));
    const circ = MOTION.enter(C.Radius + 0.2, 0.5)(T);
    const inside = CAM_PTS.filter((c) => haversineMi(home, c) < mi).length;
    const opts = [{ value: 'search', label: 'Search' }, { value: 'around', label: 'Around me' }, { value: 'draw', label: 'Draw' }];
    const result = (kind, name, sub) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid var(--border)', minHeight: 56 }}>
        <span style={{ width: 44, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 0' }}>{kind}</span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{name}</div><div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div></div>
        <span style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--brand-soft)', color: 'var(--text-brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="plus" size={16} stroke={2.5} /></span>
      </div>
    );
    return (
      <Screen T={T} exit={C.Feed}>
        <TileLayer V={V} dim={0.08 * (1 - sw)} />
        <div style={{ position: 'absolute', left: CX, top: CY, width: 0, height: 0, zIndex: 2, opacity: circ }}>
          <div style={{ position: 'absolute', left: -r, top: -r, width: 2 * r, height: 2 * r, borderRadius: '50%', background: 'rgba(31,191,107,0.14)', border: '2px solid var(--brand)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.6)' }} />
          <div style={{ position: 'absolute', left: 0, top: -r - 14, transform: 'translate(-50%,-50%)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#fff', background: 'var(--brand)', padding: '3px 9px', borderRadius: 999, boxShadow: 'var(--shadow-marker)', whiteSpace: 'nowrap' }}>{miR} mi</div>
        </div>
        {CAM_PTS.map((c, i) => {
          const on = haversineMi(home, c) < mi;
          const [x, y] = V.project(c[0], c[1]);
          return (
            <div key={i} style={{ position: 'absolute', left: x, top: y, zIndex: 4, transform: `translate(-50%,-50%) scale(${on ? 1.3 : 1})`, opacity: on ? 1 : 0.4, transition: 'none' }}>
              <MapMarker variant="alpr" />
            </div>
          );
        })}
        <Mark T={T} at={0.4} px={CX} py={CY} z={3}><MapMarker variant="user" heading={30} /></Mark>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, transform: `translateY(${(1 - MOTION.enter(0.5, 0.8)(T)) * 500}px)` }}>
          <BottomSheet title="Add an area" subtitle="Watch a place for camera changes">
            <SegmentedControl tone="light" options={opts} value={around ? 'around' : 'search'} onChange={noop} style={{ width: '100%' }} />
            <div style={{ position: 'relative', minHeight: sw >= 1 ? 250 : 330, marginTop: 14 }}>
              <div style={{ position: 'absolute', inset: 0, opacity: 1 - sw, visibility: sw >= 1 ? 'hidden' : 'visible' }}>
                <Input tone="light" size="md" value="" placeholder="City, county or ZIP" leadingIcon={<Glyph name="search" size={18} />} onChange={noop} />
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                  {result('City', 'Palo Alto, CA', '38 cameras mapped')}
                  {result('County', 'Santa Clara County', '611 cameras mapped')}
                  {result('ZIP', '94305 · Stanford', '7 cameras mapped')}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '12px 0 0', lineHeight: 1.4 }}>Counts are cameras currently mapped in OpenStreetMap. Tap a result to start watching it.</p>
              </div>
              <div style={{ position: 'absolute', inset: 0, opacity: sw, transform: `translateY(${(1 - sw) * 10}px)`, visibility: sw <= 0 ? 'hidden' : 'visible' }}>
                <div style={{ border: '1px solid var(--border)', background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12 }}>
                  <Slider label="Radius" min={1} max={10} step={1} value={miR} showValue formatValue={(v) => `${v} mi`} onChange={noop} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--alert-500)', boxShadow: '0 0 0 3px rgba(255,77,79,0.18)' }} />
                    <span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{inside}</span> cameras mapped inside this circle</span>
                  </div>
                </div>
                <Input tone="light" size="md" value="Around home" placeholder="Name this area" onChange={noop} />
                <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '10px 0 14px', lineHeight: 1.4 }}>We save the circle's center, not your live location. It won't follow you.</p>
                <Button variant="primary" size="lg" fullWidth>Watch this area</Button>
              </div>
            </div>
          </BottomSheet>
        </div>
        <Tap T={T} at={C.Radius - 0.2} x={195} y={485} />
        <Tap T={T} at={C.Feed - 0.3} x={195} y={792} />
      </Screen>
    );
  }

  const FEED = [
    ['Santa Ynez St & Mayfield Ave', 'Added · Flock Safety', '2m', true],
    ['El Camino Real & Embarcadero Rd', 'Added · Flock Safety', 'Tue', true],
    ['Page Mill Rd & Hanover St', 'Removed · Motorola', 'Mon', false],
    ['Palm Dr & Arboretum Rd', 'Added · Flock Safety', 'Sun', true],
    ['Alma St & Churchill Ave', 'Added · Genetec', 'Sun', true],
  ];

  function FeedScreen({ T, C }) {
    const { SegmentedControl, Switch } = ds();
    const added = countTo(0, 4, C.Feed + 0.5, 0.9)(T);
    const sw = MOTION.pop(C.Feed + 1.9, 0.5)(T);
    const stat = (label, val, col) => (
      <div style={{ border: '1px solid var(--border)', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
        <div style={{ ...eyebrow, marginBottom: 6 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.02em', color: col }}>{val}</div>
      </div>
    );
    return (
      <Screen T={T} enter={C.Feed} exit={C.Alert}>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-page)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '58px 10px 6px' }}>
            <span style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="chevron-left" size={22} stroke={2.2} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em', lineHeight: 1.1 }}>Around home</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>2 mi radius · 4 cameras mapped</div>
            </div>
            <span style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="info" size={20} /></span>
          </div>
          <div style={{ padding: '8px 16px 0' }}>
            <SegmentedControl tone="light" options={[{ value: 'd', label: 'Today' }, { value: 'w', label: '7 days' }, { value: 'm', label: '30 days' }]} value="w" onChange={noop} style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 16px 4px' }}>
            {stat('Added', added, 'var(--alert-600)')}
            {stat('Removed', 1, 'var(--text-brand)')}
          </div>
          <div style={{ flex: 1, padding: '8px 16px 0', overflow: 'hidden' }}>
            <div style={{ ...eyebrow, margin: '10px 0 6px' }}>This week</div>
            <div style={{ border: '1px solid var(--border)', background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {FEED.map(([street, sub, time, isAdd], i) => {
                const e = MOTION.enter(C.Feed + 0.55 + i * 0.13, 0.5)(T);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minHeight: 60, borderTop: i ? '1px solid var(--border)' : 'none', opacity: e, transform: `translateY(${(1 - e) * 14}px)` }}>
                    <span style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: isAdd ? 'rgba(255,77,79,0.12)' : 'var(--brand-soft)', color: isAdd ? 'var(--alert-600)' : 'var(--text-brand)' }}><Glyph name={isAdd ? 'plus' : 'minus'} size={16} stroke={2.6} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{street}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>{time}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ padding: '12px 16px 34px', borderTop: '1px solid var(--border)', background: 'var(--surface-card)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-sm)', background: 'var(--brand-soft)', color: 'var(--text-brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="shield-check" size={20} /></span>
            <span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Instant alerts</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-tertiary)' }}>Plus a quiet weekly digest</span></span>
            <span style={{ transform: `scale(${0.8 + 0.2 * Math.min(1, sw)})`, display: 'inline-flex' }}>{Switch && <Switch checked={T >= C.Feed + 2.1} onChange={noop} />}</span>
          </div>
        </div>
      </Screen>
    );
  }

  function LockScreen({ T, C }) {
    const g = G();
    const n1 = MOTION.pop(C.Alert + 0.5, 0.6)(T);
    const n2 = MOTION.pop(C.Alert + 1.7, 0.6)(T);
    const notif = (title, when, body, p) => (
      <div style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', borderRadius: 24, border: '1px solid rgba(255,255,255,0.08)', opacity: Math.min(1, p * 2), transform: `translateY(${(1 - p) * -60}px) scale(${0.92 + 0.08 * p})` }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden', flex: '0 0 auto', display: 'inline-flex' }}><img src="assets/logo-mark.png" alt="" style={{ width: 38, height: 38, objectFit: 'cover', display: 'block' }} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{title}</span><span style={{ fontSize: 13, opacity: 0.7 }}>{when}</span></div>
          <div style={{ fontSize: 15, lineHeight: 1.3, marginTop: 1 }}>{body}</div>
        </div>
      </div>
    );
    return (
      <Screen T={T} enter={C.Alert} exit={C.Map} mode="fade">
        <div style={{ position: 'absolute', inset: 0, fontFamily: '-apple-system, system-ui, sans-serif', color: '#fff' }}>
          <TileLayer V={mapView(g.home, 14.5)} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,10,14,0.55)' }} />
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 78 }}>
            <Glyph name="shield" size={20} />
            <div style={{ fontSize: 21, fontWeight: 600, marginTop: 14, letterSpacing: '-0.01em' }}>Monday, October 13</div>
            <div style={{ fontSize: 88, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.03em', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>9:41</div>
          </div>
          <div style={{ position: 'absolute', left: 12, right: 12, top: 300, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notif('New camera in your area', 'now', 'An ALPR reader was added at Santa Ynez St & Mayfield Ave. Tap to see it on the map.', n1)}
            {notif('Your week around home', '8:00 AM', '1 camera added, 0 removed within 2 mi of home. Campus stayed quiet.', n2)}
          </div>
          <div style={{ position: 'absolute', left: 40, right: 40, bottom: 70, zIndex: 2, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="zap" size={22} /></span>
            <span style={{ width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="camera" size={22} /></span>
          </div>
        </div>
        <Tap T={T} at={C.Map - 0.25} x={195} y={340} />
      </Screen>
    );
  }

  function MapScreen({ T, C }) {
    const { MapMarker, BottomSheet, Badge, Button, IconButton } = ds();
    const g = G();
    const V = mapView([g.cam[0] - 0.0014, g.cam[1]], 16.25 + 0.2 * MOTION.draw(C.Map, 3)(T));
    const sheet = MOTION.enter(C.Map + 0.5, 0.7)(T);
    const cell = (k, v, mono) => (
      <div><div style={{ ...eyebrow, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 14, fontWeight: 500, fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>{v}</div></div>
    );
    return (
      <Screen T={T} enter={C.Map} mode="fade">
        <TileLayer V={V} />
        <Mark T={T} at={C.Map - 1} {...at(V, g.home)} z={3}><MapMarker variant="user" heading={30} /></Mark>
        <Mark T={T} at={C.Map + 0.3} {...at(V, g.cam)} z={5}><MapMarker variant="camera" heading={200} selected /></Mark>
        <div style={{ position: 'absolute', right: 12, top: 60, zIndex: 10 }}><IconButton label="Close" variant="glass" size="md"><Glyph name="x" size={20} /></IconButton></div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, transform: `translateY(${(1 - sheet) * 420}px)` }}>
          <BottomSheet title="New ALPR camera" subtitle="Santa Ynez St & Mayfield Ave · Stanford">
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <Badge tone="alert">ALPR</Badge>
              <Badge tone="neutral">Flock Safety</Badge>
              <Badge tone="neutral">Added today</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: 16 }}>
              {cell('Added', '2 min ago')}
              {cell('Direction', '200° · facing SSW')}
              {cell('Mapped by', '@daf_mapper', true)}
              {cell('OSM ID', 'node/12100912', true)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: 'var(--surface-card-alt)', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-brand)', display: 'inline-flex' }}><Glyph name="shield-check" size={16} /></span>
              <span>Private routes already steer around it.</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Button variant="primary" size="lg" fullWidth>Got it</Button>
              <Button variant="ghost" size="md" fullWidth>Open in OpenStreetMap ↗</Button>
            </div>
          </BottomSheet>
        </div>
      </Screen>
    );
  }

  function Piece({ tweaks }) {
    const { T, CUES: C, authoredTotal } = useComposition();
    const captions = [
      { at: 0.3, text: 'Pick a place to watch.' },
      { at: C.Radius, text: 'Set a radius around home. See what\u2019s inside.' },
      { at: C.Feed, text: 'Every camera added or removed, in one feed.' },
      { at: C.Alert, text: 'Get told the moment a new one goes up.' },
      { at: C.Map, text: 'Tap to see it on the map.' },
    ];
    if (!G()) return null;
    return (
      <ClipFrame T={T} CUES={C} total={authoredTotal} nightCue={C.Alert} tweaks={tweaks} captions={captions}>
        <AddScreen T={T} C={C} />
        <FeedScreen T={T} C={C} />
        <LockScreen T={T} C={C} />
        <MapScreen T={T} C={C} />
      </ClipFrame>
    );
  }

  window.DafClipAreas = () => <DafClip Piece={Piece} />;
})();
