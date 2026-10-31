// Clip 4 — Scorecard & post-drive recap. Global: DafClipScorecard
(function () {
  const R = window.DafRig;
  const { MOTION, ds, countTo, Glyph, ClipFrame, Screen, Tap, RoutePath, Mark, DafClip, mapView, TileLayer, alongPts } = R;
  const G = () => window.DafGeo;
  const at = (V, p) => { const [x, y] = V.project(p[0], p[1]); return { px: x, py: y }; };
  const mono = { fontFamily: 'var(--font-mono)' };
  const card = { background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' };
  const stat = (v, l, col, k) => (
    <div key={k} style={{ padding: '10px 8px', background: 'var(--surface-card-alt)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
      <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: col }}>{v}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 600 }}>{l}</div>
    </div>
  );

  function RecapScreen({ T, C }) {
    const { MapMarker, BottomSheet, Button } = ds();
    const g = G();
    const pts = g.routes[1].pts, fp = g.routes[0].pts;
    const V = mapView([37.4335, -122.1642], 13.9 + 0.1 * MOTION.draw(0, 3)(T));
    const draw = MOTION.draw(0.3, 1.3)(T);
    const sheet = MOTION.enter(1.0, 0.8)(T);
    const gain = countTo(0, 18, 1.6, 1.0)(T);
    const xp = 0.70 + 0.14 * MOTION.draw(C.Recap + 0.9, 0.9)(T);
    const avoided = countTo(0, 3, C.Recap + 0.2, 0.7)(T);
    const mins = countTo(0, 1, C.Recap + 0.5, 0.5)(T);
    const user = alongPts(pts, draw);
    return (
      <Screen T={T} exit={C.Score}>
        <TileLayer V={V} />
        <RoutePath d={V.pathOf(pts)} kind="private" p={draw} width={6} />
        {[44, 57, 70].map((i, k) => <Mark key={k} T={T} at={0.2} {...at(V, fp[i])} opacity={0.55}><MapMarker variant="camera" heading={[330, 160, 40][k]} /></Mark>)}
        <Mark T={T} at={1.4} {...at(V, g.dest)} anchor="bottom" z={6}><MapMarker variant="destination" iconName="flag" selected /></Mark>
        <div style={{ position: 'absolute', zIndex: 3, left: V.project(user[0], user[1])[0], top: V.project(user[0], user[1])[1], transform: 'translate(-50%,-50%)', opacity: 1 - MOTION.enter(1.3, 0.4)(T) }}><MapMarker variant="user" heading={20} /></div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, transform: `translateY(${(1 - sheet) * 480}px)` }}>
          <BottomSheet title="Arrived, unseen" subtitle="10 min · 3.0 mi · 6:15 PM">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', marginBottom: 12, background: 'var(--brand-soft)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ ...mono, fontSize: 26, fontWeight: 700, color: 'var(--text-brand)', minWidth: 54 }}>+{gain}</span>
              <span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>Privacy score → {64 + gain}</span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>Clean drive · streak is now 6</span></span>
              <span style={{ color: 'var(--amber-600)', display: 'inline-flex' }}><Glyph name="zap" size={20} /></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {stat(avoided, 'avoided', 'var(--text-brand)', 'a')}
              {stat(0, 'reads', undefined, 'b')}
              {stat(`+${mins} min`, 'for privacy', undefined, 'c')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', marginBottom: 12, background: 'var(--surface-card-alt)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}><Glyph name="fuel" size={15} /></span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>Detour fuel</span>
              <span style={{ ...mono, fontSize: 12.5, fontWeight: 600 }}>+0.1 mi · ≈$0.02</span>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}><span style={{ fontWeight: 600 }}>+180 XP</span><span style={{ ...mono, color: 'var(--text-tertiary)' }}>480 to Phantom</span></div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-card-alt)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${xp * 100}%`, height: '100%', borderRadius: 3, background: 'var(--brand)' }} /></div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Button variant="primary" size="lg" fullWidth>Done</Button>
              <Button variant="ghost" size="md" fullWidth>See what you skipped</Button>
            </div>
          </BottomSheet>
        </div>
        <Tap T={T} at={C.Score - 0.3} x={195} y={742} />
      </Screen>
    );
  }

  const BARS = [5, 4, 6, 3, 4, 2, 3, 1];

  function ScoreScreen({ T, C }) {
    const ring = MOTION.draw(C.Score + 0.5, 1.5)(T);
    const score = countTo(0, 82, C.Score + 0.5, 1.5)(T);
    const lvl = MOTION.pop(C.Score + 1.6, 0.5)(T);
    const n1 = countTo(0, 41, C.Score + 1.2, 1.0)(T), n2 = countTo(0, 6, C.Score + 1.3, 0.9)(T), n3 = countTo(0, 6, C.Score + 1.4, 0.9)(T);
    const scroll = -340 * MOTION.draw(C.Cost, 0.9)(T) - 150 * MOTION.draw(C.Private, 0.9)(T);
    const glow = MOTION.pop(C.Private + 0.7, 0.6)(T);
    const dash = 2 * Math.PI * 52;
    const tile = (v, l, col, k) => (
      <div key={k} style={{ padding: '12px 8px', ...card, borderRadius: 'var(--radius-md)', textAlign: 'center' }}><div style={{ ...mono, fontSize: 24, fontWeight: 700, color: col }}>{v}</div><div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 600 }}>{l}</div></div>
    );
    return (
      <Screen T={T} enter={C.Score}>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-page)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '60px 16px 10px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-card)', borderBottom: '1px solid var(--border)', zIndex: 2 }}>
            <span style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}><Glyph name="menu" size={22} /></span>
            <div style={{ flex: 1 }}><div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Scorecard</div><div style={{ ...mono, fontSize: 11.5, color: 'var(--text-tertiary)' }}>Last 30 days · on this device only</div></div>
            <span style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}><Glyph name="upload" size={20} /></span>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '18px 16px 22px', display: 'flex', flexDirection: 'column', gap: 14, transform: `translateY(${scroll}px)` }}>
              <div style={{ padding: '20px 16px 18px', ...card, boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: 148, height: 148 }}>
                  <svg viewBox="0 0 120 120" style={{ display: 'block', width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-card-alt)" strokeWidth="11" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--brand)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${dash * 0.82 * ring} ${dash}`} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <span style={{ ...mono, fontSize: 44, fontWeight: 700, lineHeight: 1 }}>{score}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Privacy score</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, transform: `scale(${lvl})`, opacity: Math.min(1, lvl) }}>
                  <span style={{ color: 'var(--text-brand)', display: 'inline-flex' }}><Glyph name="shield-check" size={18} /></span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Level 4 · Ghost</span>
                </div>
                <div style={{ width: '100%', marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}><span style={{ fontWeight: 600 }}>2,520 XP</span><span style={{ ...mono, color: 'var(--text-tertiary)' }}>480 to Phantom</span></div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-card-alt)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${84 * ring}%`, height: '100%', borderRadius: 3, background: 'var(--brand)' }} /></div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {tile(n1, 'avoided', 'var(--text-brand)', 'a')}{tile(n2, 'reads', 'var(--alert-500)', 'b')}{tile(n3, 'day streak', undefined, 'c')}
              </div>
              <div style={{ padding: '14px 15px 12px', ...card }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}><span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap' }}>Reads per week</span><span style={{ flex: 1 }} /><span style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)' }}>8 weeks</span></div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 86 }}>
                  {BARS.map((b, i) => { const e = MOTION.enter(C.Cost + 0.5 + i * 0.09, 0.6)(T); return <div key={i} style={{ flex: 1, height: `${(b / 6) * 100 * e}%`, minHeight: 5, borderRadius: '4px 4px 2px 2px', background: i === BARS.length - 1 ? 'var(--alert-500)' : 'var(--ink-300)' }} />; })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, ...mono, fontSize: 10.5, color: 'var(--text-tertiary)' }}><span>8 wks ago</span><span style={{ color: 'var(--alert-500)', fontWeight: 700 }}>This week · 1</span></div>
              </div>
              <div style={{ padding: '14px 15px', ...card }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}><Glyph name="fuel" size={17} /></span>
                  <span style={{ fontSize: 14.5, fontWeight: 700, flex: 1 }}>What privacy cost you</span>
                  <span style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)' }}>32 mpg · $4.60/gal</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
                  <div style={{ display: 'flex', gap: 10 }}><span style={{ color: 'var(--text-secondary)', flex: 1 }}>Detour miles this month</span><span style={{ ...mono, fontWeight: 600 }}>{(14.2 * MOTION.draw(C.Cost + 1.2, 0.8)(T)).toFixed(1)} mi</span></div>
                  <div style={{ display: 'flex', gap: 10 }}><span style={{ color: 'var(--text-secondary)', flex: 1 }}>Extra fuel</span><span style={{ ...mono, fontWeight: 600 }}>0.44 gal · $2.04</span></div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
                  <div style={{ display: 'flex', gap: 10 }}><span style={{ fontWeight: 600, flex: 1 }}>Per camera avoided</span><span style={{ ...mono, fontWeight: 700, color: 'var(--text-brand)' }}>5¢</span></div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', ...card, borderRadius: 'var(--radius-md)' }}>
                <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'rgba(255,77,79,0.12)', color: 'var(--alert-500)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="clock" size={18} /></span>
                <span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>Exposure timeline</span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)' }}>All 6 reads, newest first</span></span>
                <span style={{ color: 'var(--text-tertiary)', display: 'inline-flex' }}><Glyph name="chevron-right" size={16} /></span>
              </div>
              <div style={{ display: 'flex', gap: 12, padding: '14px 14px', borderRadius: 'var(--radius-md)', background: `rgba(31,191,107,${0.14 * Math.min(1, glow)})`, border: `1px solid rgba(31,191,107,${0.6 * Math.min(1, glow)})`, color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.5, transform: `scale(${1 + 0.02 * Math.min(1, glow)})` }}>
                <span style={{ flex: '0 0 auto', marginTop: 1, color: 'var(--text-brand)', display: 'inline-flex' }}><Glyph name="shield" size={18} /></span>
                <span>Scores are computed on this phone. Nothing leaves it — there's no leaderboard to lose.</span>
              </div>
            </div>
          </div>
        </div>
      </Screen>
    );
  }

  function Piece({ tweaks }) {
    const { T, CUES: C, authoredTotal } = useComposition();
    const captions = [
      { at: 0.3, text: 'Every drive ends with a recap.' },
      { at: C.Recap, text: '3 cameras skipped. One minute. Zero little boxes.' },
      { at: C.Score, text: 'Your privacy score, built up drive by drive.' },
      { at: C.Cost, text: 'See what privacy cost you. Usually cents.' },
      { at: C.Private, text: 'It all stays on your phone. No leaderboard to lose.' },
    ];
    if (!G()) return null;
    return (
      <ClipFrame T={T} CUES={C} total={authoredTotal} nightCue={C.Cost} tweaks={tweaks} captions={captions}>
        <RecapScreen T={T} C={C} />
        <ScoreScreen T={T} C={C} />
      </ClipFrame>
    );
  }

  window.DafClipScorecard = () => <DafClip Piece={Piece} />;
})();
