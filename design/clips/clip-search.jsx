// Clip 1 — Search → place details → directions (real map: Stanford → Whole Foods, Palo Alto). Global: DafClipSearch
(function () {
  const R = window.DafRig;
  const { PW, PH, MOTION, ds, typed, Glyph, ClipFrame, Screen, Tap, RoutePath, Mark, HomeMapScreen, DafClip, mapView, TileLayer, alongPts } = R;
  const G = () => window.DafGeo;
  const noop = () => {};

  const row = (icon, title, sub, bg, fg, pressed = 0) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 16px', background: `rgba(31,191,107,${0.12 * pressed})` }}>
      <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-sm)', background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name={icon} size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div><div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{sub}</div></div>
    </div>
  );
  const label = (t) => <div style={{ padding: '14px 16px 6px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{t}</div>;
  const at = (V, p) => { const [x, y] = V.project(p[0], p[1]); return { px: x, py: y }; };

  function HomeScreen({ T, C }) {
    const { MapMarker } = ds();
    const g = G();
    const V = mapView(g.start, 15.9 + 0.25 * MOTION.draw(0, 2.6)(T));
    const marks = (
      <React.Fragment>
        <Mark T={T} at={0.5} {...at(V, g.start)} z={3}><MapMarker variant="user" heading={30} /></Mark>
        <Mark T={T} at={0.7} {...at(V, g.cams[0])}><MapMarker variant="camera" heading={g.cams[0][2]} /></Mark>
        <Mark T={T} at={0.82} {...at(V, g.cams[4])}><MapMarker variant="camera" heading={g.cams[4][2]} /></Mark>
        <Mark T={T} at={0.94} {...at(V, g.cams[5])}><MapMarker variant="camera" heading={g.cams[5][2]} /></Mark>
        <Mark T={T} at={1.06} {...at(V, [37.4175, -122.1665])}><MapMarker variant="alpr" /></Mark>
        <Mark T={T} at={1.18} {...at(V, [37.4118, -122.1664])}><MapMarker variant="cluster" count={6} /></Mark>
      </React.Fragment>
    );
    return (
      <Screen T={T} exit={C.Search + 0.15}>
        <HomeMapScreen T={T} markers={marks} map={<TileLayer V={V} />} />
        <Tap T={T} at={C.Search - 0.15} x={195} y={86} />
      </Screen>
    );
  }

  function SearchScreen({ T, C }) {
    const { SearchBar } = ds();
    const IOSKeyboard = window.IOSKeyboard;
    const q = typed('Whole Foo', C.Search + 0.9, 10)(T);
    const results = q.length >= 5;
    const rp = MOTION.enter(C.Search + 1.4, 0.4)(T);
    const pressed = T >= C.Place - 0.2 ? 1 - MOTION.enter(C.Place - 0.2, 0.5)(T) * 0.4 : 0;
    return (
      <Screen T={T} enter={C.Search + 0.15} exit={C.Place} mode="fade">
        <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-page)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '54px 12px 12px', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--surface-card)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>{SearchBar && <SearchBar placeholder="Where to?" value={q} onChange={noop} onClear={q ? noop : undefined} />}</div>
            <span style={{ color: 'var(--text-brand)', fontWeight: 600, fontSize: 15 }}>Cancel</span>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 1 - rp, transform: `translateY(${rp * -10}px)` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 16px 8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--brand-soft)', color: 'var(--text-brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="home" /></span>
                  <div><div style={{ fontSize: 15, fontWeight: 600 }}>Home</div><div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Santa Ynez St</div></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--surface-card-alt)', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="briefcase" /></span>
                  <div><div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-brand)' }}>Set Work</div><div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>One tap from anywhere</div></div>
                </div>
              </div>
              {label('Favorites')}
              {row('star', 'Stanford Shopping Center', '660 Stanford Shopping Ctr', 'var(--brand-soft)', 'var(--text-brand)')}
              {label('Recent')}
              {row('clock', 'Palo Alto Caltrain', 'Yesterday', 'var(--surface-card-alt)', 'var(--text-secondary)')}
            </div>
            <div style={{ position: 'absolute', inset: 0, opacity: rp, transform: `translateY(${(1 - rp) * 12}px)`, visibility: results ? 'visible' : 'hidden' }}>
              {label('Results')}
              {row('map-pin', 'Whole Foods Market', '774 Emerson St, Palo Alto · 3.0 mi', 'var(--brand-soft)', 'var(--text-brand)', pressed)}
              {row('map-pin', 'Whole Foods Market', '4800 El Camino Real, Los Altos · 4.6 mi', 'var(--surface-card-alt)', 'var(--text-secondary)')}
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>{IOSKeyboard && <IOSKeyboard dark={false} />}</div>
        </div>
        <Tap T={T} at={C.Place - 0.2} x={150} y={178} />
      </Screen>
    );
  }

  function PlaceScreen({ T, C }) {
    const { MapMarker, BottomSheet, Button, IconButton } = ds();
    const g = G();
    const V = mapView([g.dest[0] - 0.0016, g.dest[1]], 16.3 + 0.15 * MOTION.draw(C.Place, 3)(T));
    const [dx, dy] = V.project(g.dest[0], g.dest[1]);
    const drop = MOTION.pop(C.Place + 0.25, 0.55)(T);
    const sheet = MOTION.enter(C.Place + 0.3, 0.7)(T);
    const info = (icon, text) => (
      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}><span style={{ color: 'var(--text-tertiary)' }}><Glyph name={icon} /></span><span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{text}</span></div>
    );
    return (
      <Screen T={T} enter={C.Place} exit={C.Routes} mode="fade">
        <TileLayer V={V} />
        <div style={{ position: 'absolute', left: dx, top: dy, zIndex: 4, transform: `translate(-50%, calc(-100% - ${(1 - drop) * 60}px))`, opacity: Math.min(1, drop * 3) }}>
          <MapMarker variant="destination" iconName="flag" selected />
        </div>
        <div style={{ position: 'absolute', right: 12, top: 60, zIndex: 10 }}><IconButton label="Close" variant="glass" size="md"><Glyph name="x" size={20} /></IconButton></div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, transform: `translateY(${(1 - sheet) * 420}px)` }}>
          <BottomSheet title="Whole Foods Market" subtitle="Grocery · Downtown Palo Alto">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--amber-600)', fontWeight: 600 }}><Glyph name="star" size={15} />4.1</span>
              <span style={{ color: 'var(--text-tertiary)' }}>(1,284) ·</span>
              <span style={{ color: 'var(--text-brand)', fontWeight: 600 }}>Open</span>
              <span style={{ color: 'var(--text-secondary)' }}>until 10 PM · 3.0 mi</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {info('map-pin', '774 Emerson St, Palo Alto, CA 94301')}
              {info('clock', '10 min drive · 3 cameras on the fast way')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', marginBottom: 16, background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--brand-soft)', color: 'var(--text-brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="star" /></span>
              <span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>Save to favorites</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-tertiary)' }}>Kept on this device only</span></span>
              <span style={{ color: 'var(--text-tertiary)' }}><Glyph name="chevron-right" /></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8 }}>
              <Button variant="primary" size="md" fullWidth>Directions</Button>
              <IconButton label="Save" variant="solid" size="md"><Glyph name="star" size={20} /></IconButton>
              <IconButton label="Share" variant="solid" size="md"><Glyph name="upload" size={20} /></IconButton>
            </div>
          </BottomSheet>
        </div>
        <Tap T={T} at={C.Routes - 0.25} x={130} y={792} />
      </Screen>
    );
  }

  function RoutesScreen({ T, C }) {
    const { MapMarker, BottomSheet, Button, IconButton, RouteCard } = ds();
    const g = G();
    const V = mapView([37.4292, -122.1655], 14.1 + 0.12 * MOTION.draw(C.Routes, 3.5)(T));
    const fp = g.routes[0].pts;
    const fast = MOTION.draw(C.Routes + 0.25, 1.0)(T);
    const priv = MOTION.draw(C.Routes + 0.6, 1.1)(T);
    const fastOp = 1 - 0.5 * MOTION.enter(C.Routes + 1.7, 0.5)(T);
    const sheet = MOTION.enter(C.Routes + 1.5, 0.7)(T);
    return (
      <Screen T={T} enter={C.Routes} exit={C.Drive} mode="fade">
        <TileLayer V={V} />
        <RoutePath d={V.pathOf(g.routes[0].pts)} kind="fast" p={fast} opacity={fastOp} width={6} />
        <RoutePath d={V.pathOf(g.routes[1].pts)} kind="private" p={priv} width={6} />
        <Mark T={T} at={C.Routes + 0.05} {...at(V, g.start)} z={3}><MapMarker variant="user" heading={20} /></Mark>
        <Mark T={T} at={C.Routes + 1.0} {...at(V, fp[22])} z={5}><MapMarker variant="camera" heading={110} /></Mark>
        <Mark T={T} at={C.Routes + 1.1} {...at(V, fp[50])} z={5}><MapMarker variant="camera" heading={330} /></Mark>
        <Mark T={T} at={C.Routes + 1.2} {...at(V, fp[70])} z={5}><MapMarker variant="camera" heading={40} /></Mark>
        <Mark T={T} at={C.Routes + 1.35} {...at(V, g.dest)} anchor="bottom" z={6}><MapMarker variant="destination" iconName="flag" selected /></Mark>
        <div style={{ position: 'absolute', left: 12, top: 60, zIndex: 10 }}><IconButton label="Back" variant="glass" size="md"><Glyph name="chevron-left" size={20} /></IconButton></div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, transform: `translateY(${(1 - sheet) * 420}px)` }}>
          <BottomSheet title="Choose your route" subtitle="2 routes · 1 avoids cameras">
            <div data-route-cards="" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <RouteCard kind="private" eta="11 min" arrival="ETA 6:16" distance="3.4 mi" cameras={0} recommended selected />
              <RouteCard kind="fast" eta="9 min" arrival="ETA 6:14" distance="3.1 mi" cameras={3} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14 }}>
              <span style={{ color: 'var(--node-monitored)', display: 'inline-flex' }}><Glyph name="triangle-alert" size={15} /></span>
              <span>Private adds <b style={{ color: 'var(--text-primary)' }}>2 min</b> to skip 3 cameras on Campus Dr &amp; Palm Dr</span>
            </div>
            <Button variant="primary" size="lg" fullWidth>Start drive</Button>
          </BottomSheet>
        </div>
        <Tap T={T} at={C.Drive - 0.25} x={195} y={800} />
      </Screen>
    );
  }

  // POV drive: heading-up, tilted camera behind the puck (puck pinned at PX,PY)
  const PX = 195, PY = 600, BW = 2600, BH = 2600;
  function DriveScreen({ T, C }) {
    const { MapMarker, NavBanner, SpeedLimitBadge } = ds();
    const g = G();
    const pts = g.routes[1].pts;
    const dur = Math.max(1, (isFinite(C.Outro) ? C.Outro : C.Drive + 8) - C.Drive);
    const f = animate({ from: 0.02, to: Math.min(0.2, 0.02 + 0.022 * dur), start: C.Drive, end: C.Drive + dur, ease: Easing.linear })(T);
    const c = alongPts(pts, f), n = alongPts(pts, f + 0.02);
    const heading = (Math.atan2((n[1] - c[1]) * Math.cos(c[0] * Math.PI / 180), n[0] - c[0]) * 180 / Math.PI + 360) % 360;
    const V = mapView(c, 17.3, BW, BH);
    const ban = MOTION.enter(C.Drive + 0.2, 0.6)(T);
    const sheet = MOTION.enter(C.Drive + 0.3, 0.6)(T);
    const tilt = 42 * MOTION.enter(C.Drive, 0.9)(T);
    return (
      <Screen T={T} enter={C.Drive} mode="fade">
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--map-land)', zIndex: 1, isolation: 'isolate' }}>
          <div style={{ position: 'absolute', inset: 0, transform: `perspective(900px) rotateX(${tilt}deg)`, transformOrigin: `${PX}px ${PY}px`, transformStyle: 'flat' }}>
            <div style={{ position: 'absolute', inset: 0, transform: `rotate(${-heading}deg)`, transformOrigin: `${PX}px ${PY}px` }}>
              <div style={{ position: 'absolute', left: PX - BW / 2, top: PY - BH / 2, width: BW, height: BH }}>
                <TileLayer V={V} />
                <RoutePath d={V.pathOf(pts)} kind="private" p={f} width={7} w={BW} h={BH} opacity={0.3} />
                <RoutePath d={V.pathOf(pts)} kind="private" from={Math.max(0, f - 0.004)} width={7} w={BW} h={BH} />
              </div>
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 520, background: 'linear-gradient(var(--map-land) 40%, rgba(0,0,0,0))', pointerEvents: 'none' }} />
        </div>
        <div style={{ position: 'absolute', left: PX, top: PY, zIndex: 5, transform: 'translate(-50%,-50%) translateZ(0) scale(1.15)', willChange: 'transform', isolation: 'isolate' }}><MapMarker variant="user" heading={0} /></div>
        <div style={{ position: 'absolute', top: 56, left: 12, right: 12, zIndex: 10, transform: `translateY(${(1 - ban) * -140}px) translateZ(0)`, opacity: ban, willChange: 'transform' }}>
          {NavBanner && <NavBanner maneuver="left" distance="400 ft" instruction="Turn left onto Campus Dr W" />}
        </div>
        <div className="daf-slb" style={{ position: 'absolute', left: 12, top: 150, zIndex: 10, opacity: ban, transform: 'translateZ(0)', willChange: 'transform' }}>{SpeedLimitBadge && <SpeedLimitBadge limit={25} current={23} size="md" />}</div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, transform: `translateY(${(1 - sheet) * 140}px) translateZ(0)`, willChange: 'transform', background: 'var(--surface-sheet)', borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: 'var(--shadow-sheet)', padding: '14px 16px 30px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 46, height: 46, borderRadius: 'var(--radius-sm)', background: 'var(--brand-soft)', color: 'var(--text-brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name="shield-check" size={24} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontFamily: 'var(--font-mono)' }}>
              <span style={{ fontWeight: 700, fontSize: 26, lineHeight: 1, letterSpacing: '-0.02em' }}>11 min</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>6:16</span>
              <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>3.4 mi</span>
            </div>
            <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-brand)' }}>Private</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-strong)' }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Whole Foods Market</span>
            </div>
          </div>
          <span style={{ width: 46, height: 46, borderRadius: 'var(--radius-sm)', background: 'var(--alert-500)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name="x" size={22} /></span>
        </div>
      </Screen>
    );
  }

  function Piece({ tweaks }) {
    const { T, CUES: C, authoredTotal } = useComposition();
    const captions = [
      { at: 0.3, text: 'Start on a map that shows the cameras.' },
      { at: C.Search, text: 'Search anywhere. Home and Work are one tap.' },
      { at: C.Place, text: 'Hours, distance, directions — all in one sheet.' },
      { at: C.Routes, text: 'Two routes. One skips the cameras.' },
      { at: C.Drive, text: 'Get there without the audience.' },
    ];
    if (!G()) return null;
    return (
      <ClipFrame T={T} CUES={C} total={authoredTotal} nightCue={C.Routes} tweaks={tweaks} captions={captions}>
        <HomeScreen T={T} C={C} />
        <SearchScreen T={T} C={C} />
        <PlaceScreen T={T} C={C} />
        <RoutesScreen T={T} C={C} />
        <DriveScreen T={T} C={C} />
      </ClipFrame>
    );
  }

  window.DafClipSearch = () => <DafClip Piece={Piece} />;
})();
