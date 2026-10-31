// Clip 3 — Contribute: add a camera to OpenStreetMap. Global: DafClipContribute
(function () {
  const R = window.DafRig;
  const { PW, MOTION, ds, typed, countTo, Glyph, ClipFrame, Screen, Tap, Mark, HomeMapScreen, DafClip, mapView, TileLayer, glassBtn } = R;
  const G = () => window.DafGeo;
  const at = (V, p) => { const [x, y] = V.project(p[0], p[1]); return { px: x, py: y }; };
  const eyebrow = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' };
  const mono = { fontFamily: 'var(--font-mono)' };

  function HomeScreen({ T, C }) {
    const { MapMarker } = ds();
    const g = G();
    const V = mapView([g.cam[0] + 0.001, g.cam[1]], 16.2 + 0.2 * MOTION.draw(0, 2.4)(T));
    const marks = (
      <React.Fragment>
        <Mark T={T} at={0.5} {...at(V, g.start)} z={3}><MapMarker variant="user" heading={200} /></Mark>
        <Mark T={T} at={0.7} {...at(V, g.cams[4])}><MapMarker variant="camera" heading={g.cams[4][2]} /></Mark>
        <Mark T={T} at={0.85} {...at(V, [37.4172, -122.1664])}><MapMarker variant="alpr" /></Mark>
      </React.Fragment>
    );
    return (
      <Screen T={T} exit={C.Aim}>
        <HomeMapScreen T={T} markers={marks} map={<TileLayer V={V} />} />
        <Tap T={T} at={C.Aim - 0.3} x={366} y={386} />
      </Screen>
    );
  }

  function EditScreen({ T, C }) {
    const { MapMarker, IconButton, Button } = ds();
    const g = G();
    const p = MOTION.draw(C.Aim + 0.5, 1.7)(T);
    const c0 = [g.cam[0] + 0.0012, g.cam[1] - 0.0012];
    const center = [c0[0] + (g.cam[0] - c0[0]) * p, c0[1] + (g.cam[1] - c0[1]) * p];
    const V = mapView(center, 16.6 + 0.4 * p);
    const bar = MOTION.enter(C.Aim, 0.6)(T);
    const tray = MOTION.enter(C.Aim + 0.2, 0.6)(T);
    return (
      <Screen T={T} enter={C.Aim} exit={C.Preset} mode="fade">
        <TileLayer V={V} />
        <Mark T={T} at={C.Aim - 1} {...at(V, g.cams[4])}><MapMarker variant="camera" heading={g.cams[4][2]} /></Mark>
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 6, color: 'var(--brand)', filter: 'drop-shadow(0 2px 6px rgba(11,14,18,0.35))' }}><Glyph name="crosshair" size={58} stroke={2.2} /></div>
        <div style={{ position: 'absolute', top: 56, left: 12, right: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px 7px 6px', background: 'var(--surface-glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', transform: `translateY(${(1 - bar) * -80}px)`, opacity: bar }}>
          <IconButton label="Close editor" variant="plain" size="md"><Glyph name="x" size={20} /></IconButton>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Editing the map</span>
          <span style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{g.cam[0].toFixed(4)}, {g.cam[1].toFixed(4)}</span>
        </div>
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 30, zIndex: 10, display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', transform: `translateY(${(1 - tray) * 120}px)`, opacity: tray }}>
          <span style={{ width: 46, height: 46, borderRadius: 'var(--radius-sm)', background: 'var(--brand)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name="plus" size={24} stroke={2.4} /></span>
          <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>Add a camera here</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>Or tap a camera to edit or delete it</span></span>
          <Button variant="ghost" size="md" disabled>Review</Button>
        </div>
        <Tap T={T} at={C.Preset - 0.3} x={120} y={780} />
      </Screen>
    );
  }

  const TAGS = [['man_made', 'surveillance'], ['surveillance', 'public'], ['surveillance:type', 'ALPR'], ['surveillance:zone', 'traffic'], ['camera:type', 'fixed'], ['manufacturer', 'Flock Safety']];
  const PRESETS = [['Flock Safety', 'Falcon · ALPR', 'assets/presets/flock.jpg'], ['Motorola', 'Vigilant · ALPR', 'assets/presets/motorola.jpg'], ['Genetec', 'AutoVu · ALPR', 'assets/presets/genetec.webp']];

  function FormScreen({ T, C }) {
    const { Button, Input, Chip, MapMarker } = ds();
    const g = G();
    const picked = T >= C.Preset + 0.85;
    const sel = MOTION.pop(C.Preset + 0.85, 0.4)(T);
    const scroll = -430 * MOTION.draw(C.Direction, 0.8)(T);
    const deg = countTo(180, 250, C.Direction + 0.6, 1.4)(T);
    const WIND = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const wind = (h) => WIND[Math.round(h / 22.5) % 16];
    const rot = (360 - deg) % 360; // bezel rotation that puts `deg` under the fixed notch
    const DS = 320, DR = DS / 2, WR = 118; // dial size, radius, satellite window radius
    const ticks = (step, r1, r2) => { let d = ''; for (let a = 0; a < 360; a += step) { const s = Math.sin(a * Math.PI / 180), c = Math.cos(a * Math.PI / 180); d += `M${(DR + r1 * s).toFixed(1)} ${(DR - r1 * c).toFixed(1)}L${(DR + r2 * s).toFixed(1)} ${(DR - r2 * c).toFixed(1)}`; } return d; };
    const dialV = mapView(g.cam, 17.6, WR * 2, WR * 2);
    const field = (k, tag, child) => (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}><span style={eyebrow}>{k}</span><span style={{ ...mono, fontSize: 10.5, color: 'var(--text-tertiary)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 6px' }}>{tag}</span></div>
        {child}
      </div>
    );
    return (
      <Screen T={T} enter={C.Preset} exit={C.Publish}>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-page)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '54px 12px 12px', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-card)', borderBottom: '1px solid var(--border)', zIndex: 2 }}>
            <span style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="chevron-left" size={20} /></span>
            <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>Add camera</span>
            <span style={{ ...mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-brand)', background: 'var(--brand-soft)', padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>new node</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'var(--surface-card-alt)', borderBottom: '1px solid var(--border)', zIndex: 2 }}>
            <span style={{ ...mono, fontSize: 11, fontWeight: 600, color: 'var(--text-brand)', whiteSpace: 'nowrap' }}>{g.cam[0].toFixed(4)}, {g.cam[1].toFixed(4)}</span>
            <span style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>Santa Ynez & Mayfield</span>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 20, transform: `translateY(${scroll}px)` }}>
              <div>
                <div style={{ ...eyebrow, marginBottom: 8 }}>Preset</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                  {PRESETS.map(([name, sub, img], i) => {
                    const on = picked && i === 0;
                    return (
                      <div key={name} style={{ display: 'flex', flexDirection: 'column', border: on ? '1px solid var(--brand)' : '1px solid var(--border)', boxShadow: on ? `inset 0 0 0 1px var(--brand), 0 0 0 ${3 * sel}px var(--brand-soft)` : 'none', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--surface-card)' }}>
                        <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '4 / 3', background: 'var(--surface-card-alt)' }}>
                          <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          {on && <span style={{ position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${sel})` }}><Glyph name="check" size={11} stroke={3.2} /></span>}
                        </span>
                        <span style={{ display: 'block', padding: '6px 8px 7px' }}><span style={{ display: 'block', fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{name}</span><span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-tertiary)', lineHeight: 1.2, marginTop: 2 }}>{sub}</span></span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '2px 14px', marginTop: 12 }}>
                  {TAGS.map(([k, v], i) => {
                    const e = MOTION.enter(C.Preset + 1.1 + i * 0.16, 0.4)(T);
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: i < TAGS.length - 1 ? '1px solid var(--border)' : 'none', ...mono, fontSize: 12 }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>{k}</span>
                        <span style={{ fontWeight: 600, opacity: e, transform: `translateX(${(1 - e) * 10}px)`, whiteSpace: 'nowrap' }}>{v}</span>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.4 }}>Standard OSM tagging for a Flock Safety reader, written as-is.</p>
              </div>
              {field('Operator', 'operator', <Input tone="light" value="Stanford University" onChange={() => {}} />)}
              {field('Direction faced', 'camera:direction', (
                <div>
                  <div style={{ position: 'relative', width: DS, height: DS, margin: '0 auto', borderRadius: '50%', background: 'var(--surface-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-float)' }}>
                    <div style={{ position: 'absolute', left: DR - WR, top: DR - WR, width: WR * 2, height: WR * 2, borderRadius: '50%', overflow: 'hidden', background: '#54524d' }}>
                      <div style={{ position: 'absolute', inset: 0, transform: `rotate(${rot}deg)` }}><TileLayer V={dialV} /></div>
                      <svg width={WR * 2} height={WR * 2} viewBox="0 0 256 256" style={{ position: 'absolute', inset: 0, display: 'block', zIndex: 2 }}>
                        <defs><linearGradient id="mcConeHot" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="rgba(255,77,79,0.62)" /><stop offset="1" stopColor="rgba(255,77,79,0.05)" /></linearGradient></defs>
                        <path d="M128 128 L87.6 17.1 A118 118 0 0 1 168.4 17.1 Z" fill="url(#mcConeHot)" />
                        <path d="M128 128 L87.6 17.1 M168.4 17.1 L128 128" stroke="rgba(255,77,79,0.85)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                        <path d="M128 128 L128 12" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeDasharray="2 6" fill="none" strokeLinecap="round" />
                      </svg>
                      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 3 }}><MapMarker variant="alpr" /></div>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.10)', zIndex: 4 }} />
                      <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', zIndex: 5, background: 'rgba(11,14,18,0.78)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 999, padding: '4px 11px', ...mono, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.02em', color: '#fff', whiteSpace: 'nowrap' }}>{deg}° · {wind(deg)}</div>
                    </div>
                    <div style={{ position: 'absolute', inset: 0, transform: `rotate(${rot}deg)` }}>
                      <svg width={DS} height={DS} viewBox={`0 0 ${DS} ${DS}`} style={{ position: 'absolute', inset: 0, display: 'block' }}>
                        <circle cx={DR} cy={DR} r={DR - 1.5} fill="none" stroke="var(--border)" />
                        <circle cx={DR} cy={DR} r={WR + 1} fill="none" stroke="var(--border)" />
                        <path d={ticks(6, DR - 10, DR - 4)} stroke="var(--text-tertiary)" strokeWidth="1" fill="none" opacity="0.55" />
                        <path d={ticks(30, DR - 14, DR - 4)} stroke="var(--text-primary)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.85" />
                      </svg>
                      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => { const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a]; return (
                        <span key={a} style={{ position: 'absolute', left: DR + (DR - 24) * Math.sin(a * Math.PI / 180), top: DR - (DR - 24) * Math.cos(a * Math.PI / 180), transform: `translate(-50%,-50%) rotate(${-rot}deg)`, ...mono, fontSize: card ? 13 : 9.5, fontWeight: card ? 700 : 500, color: a === 0 ? 'var(--alert-500)' : card ? 'var(--text-primary)' : 'var(--text-tertiary)', lineHeight: 1, whiteSpace: 'nowrap' }}>{card || a}</span>
                      ); })}
                    </div>
                    <svg width={DS} height={DS} viewBox={`0 0 ${DS} ${DS}`} style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}>
                      <polygon points={`${DR},24 ${DR - 8.5},5 ${DR + 8.5},5`} fill="var(--alert-500)" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 12px', borderRadius: 999, ...mono, fontSize: 13, fontWeight: 600, background: 'var(--brand-soft)', color: 'var(--text-brand)', whiteSpace: 'nowrap' }}>{deg}° · {wind(deg)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', border: '1px dashed var(--border-strong)', whiteSpace: 'nowrap' }}><Glyph name="plus" size={14} />Add direction</span>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '10px 0 0', lineHeight: 1.4 }}>Drag the ring until the cone covers what the camera sees.</p>
                </div>
              ))}
              {field('Mounted on', 'camera:mount', (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Chip tone="light" selected>Pole</Chip><Chip tone="light">Gantry</Chip><Chip tone="light">Building</Chip><Chip tone="light">Traffic light</Chip>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '12px 16px 28px', borderTop: '1px solid var(--border)', background: 'var(--surface-card)', zIndex: 2 }}>
            <Button variant="primary" size="lg" fullWidth leadingIcon={<Glyph name="plus" size={18} />}>Add to changeset</Button>
            <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', textAlign: 'center', margin: '9px 0 0' }}>Staged on your phone — nothing publishes until you review.</p>
          </div>
        </div>
        <Tap T={T} at={C.Preset + 0.7} x={72} y={232} />
        <Tap T={T} at={C.Publish - 0.3} x={195} y={768} />
      </Screen>
    );
  }

  function PublishedScreen({ T, C }) {
    const { Button } = ds();
    const chk = MOTION.pop(C.Publish + 0.35, 0.6)(T);
    const txt = MOTION.enter(C.Publish + 0.6, 0.5)(T);
    const rows = [['ALPR reader · Flock Safety', 'node/12100912 · v1', 'created'], ['ALPR reader · Flock Safety', 'node/11640217 · v4', 'direction updated']];
    return (
      <Screen T={T} enter={C.Publish}>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-page)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px 24px', textAlign: 'center' }}>
            <span style={{ width: 72, height: 72, borderRadius: 999, background: 'var(--brand-soft)', color: 'var(--text-brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, transform: `scale(${chk})` }}><Glyph name="check" size={34} stroke={2.4} /></span>
            <div style={{ opacity: txt, transform: `translateY(${(1 - txt) * 12}px)` }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.01em', lineHeight: 1.2 }}>Changeset published</div>
              <div style={{ ...mono, fontSize: 12.5, color: 'var(--text-brand)', marginTop: 6 }}>changeset/171,224,908</div>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '12px 0 0' }}>2 changes, credited to <b style={{ color: 'var(--text-primary)' }}>@daf_mapper</b>.</p>
            </div>
            <div style={{ width: '100%', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '2px 14px', margin: '20px 0 0', textAlign: 'left' }}>
              {rows.map(([a, b, c], i) => {
                const e = MOTION.enter(C.Publish + 0.9 + i * 0.18, 0.45)(T);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i === 0 ? '1px solid var(--border)' : 'none', opacity: e, transform: `translateY(${(1 - e) * 10}px)` }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--marker-alpr)', boxShadow: '0 0 0 4px rgba(255,77,79,0.14)', flex: '0 0 auto' }} />
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{a}</div><div style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)' }}>{b}</div></div>
                    <span style={{ ...mono, fontSize: 11, fontWeight: 600, color: 'var(--text-brand)' }}>{c}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '14px 0 0', opacity: txt }}>Live on OpenStreetMap. Every DAF driver's map picks it up within minutes.</p>
          </div>
          <div style={{ padding: '12px 16px 28px', borderTop: '1px solid var(--border)', background: 'var(--surface-card)' }}><Button variant="primary" size="lg" fullWidth>Done</Button></div>
        </div>
      </Screen>
    );
  }

  function Piece({ tweaks }) {
    const { T, CUES: C, authoredTotal } = useComposition();
    const captions = [
      { at: 0.3, text: 'Spot a camera on a pole?' },
      { at: C.Aim, text: 'Open the editor. Aim the crosshair.' },
      { at: C.Preset, text: 'Pick the make. The standard tags write themselves.' },
      { at: C.Direction, text: 'Point the cone where it looks.' },
      { at: C.Publish, text: 'Publish to OpenStreetMap. Everyone\u2019s map gets better.' },
    ];
    if (!G()) return null;
    return (
      <ClipFrame T={T} CUES={C} total={authoredTotal} nightCue={C.Direction} tweaks={tweaks} captions={captions}>
        <HomeScreen T={T} C={C} />
        <EditScreen T={T} C={C} />
        <FormScreen T={T} C={C} />
        <PublishedScreen T={T} C={C} />
      </ClipFrame>
    );
  }

  window.DafClipContribute = () => <DafClip Piece={Piece} />;
})();
