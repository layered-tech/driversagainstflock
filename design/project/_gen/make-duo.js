// Generator: derives the Duo* galleries (iPhone Duo, closed — 5.4″ outer display) from the Mobile* pages.
// Run via run_script: const src=await readFile('_gen/make-duo.js'); await (new (Object.getPrototypeOf(async function(){}).constructor)('readFile','saveFile','log','replaceText',src))(readFile,saveFile,log,replaceText);
//
// Device facts (Apple tech specs / HIG "Designing for iPhone Duo"):
//   outer display 466 × 678 pt (1398 × 2034 px @3x), aspect 1.45:1 — wider and shorter than a phone
//   the status bar, Dynamic Island (vertical), back/close, toolbar items and the tab bar stack in an 84 pt rail on the RIGHT edge
//   content is inset from the rail by the horizontal safe area; full-bleed backgrounds (the map) may run under it
//   sheets span the safe area only (the rail stays open to the map); back/close/cancel and toolbar glyphs move into the rail; wide items (segmented controls) stay in the bar
const PAGES = ['Explore','Navigate','Scorecard','Contribute','Settings','Areas'];
const F = { key:'Duo', label:'Duo', W:466, H:678, RAIL:84, bezel:10, radius:40, ri:30, pw:1500, ph:900, maxW:1500, sub:'outer display 466 × 678',
  blurb:'iPhone Duo, closed. The 5.4″ outer display is wider and shorter than a phone, so the status bar, back/close and the map\'s control stack move into the 84 pt rail on the right — where the thumb already is. The map runs edge to edge under the rail; everything tappable stays left of it. Same screens, same numbering as the phone set; Android cover screens can follow the same rail.' };
const RAIL_IN = F.W - F.RAIL;          // 382 — content column width
const RAIL_GUTTER = F.RAIL + 12;       // 96  — right offset for floating bars (rail + screen gutter)
const CTRL_TOP = 140;                  // rail app controls start below the island + status cluster
// BottomSheet takes its inset as a real style prop (an x-import style attr only positions the mount), so it rides in via dc-props from the logic class
// sheets span the safe area only (the rail stays exposed to the map beneath); tall sheets cap at ~60% of the shorter display and scroll inside
const SHEET_MAX = Math.round(F.H*0.66); // 447 — the ⅔ rule from the system
const SHEET_PROPS = `{ style: { maxHeight: ${SHEET_MAX}, overflowX: 'hidden', overflowY: 'auto', scrollbarWidth: 'none' } }`;
const iconBtn = (label,svg) => `<x-import component-from-global-scope="DesignSystem_c71fad.IconButton" label="${label}" variant="glass" size="md" hint-size="44px,44px">${svg}</x-import>`;
const X_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg>';
const MENU_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path></svg>';

const STATUS = `<div aria-hidden="true" style="position:absolute; top:0; right:0; width:${F.RAIL}px; height:${CTRL_TOP}px; z-index:55; pointer-events:none; display:flex; flex-direction:column; align-items:center; font-family:-apple-system, system-ui, sans-serif;">`
  + `<span style="display:block; width:22px; height:66px; border-radius:11px; background:#000; margin-top:12px;"></span>`
  + `<span style="margin-top:10px; font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; line-height:1;">9:41</span>`
  + `<span style="margin-top:6px; display:inline-flex; align-items:center; gap:4px;"><svg width="13" height="9" viewBox="0 0 19 12" fill="currentColor" style="display:block;"><rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7"></rect><rect x="4.8" y="5" width="3.2" height="7" rx="0.7"></rect><rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7"></rect><rect x="14.4" y="0" width="3.2" height="12" rx="0.7"></rect></svg><svg width="20" height="10" viewBox="0 0 27 13" style="display:block;"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" stroke-opacity="0.35" fill="none"></rect><rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor"></rect><path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill="currentColor" fill-opacity="0.4"></path></svg></span>`
  + `</div>`;
const HOME = `<div aria-hidden="true" style="position:absolute; left:50%; bottom:8px; transform:translateX(-50%); width:120px; height:5px; border-radius:3px; background:currentColor; opacity:0.3; z-index:60; pointer-events:none;"></div>`;
const KB = `<div style="position:absolute; left:0; right:0; bottom:0; z-index:40;"><x-import component="IOSKeyboard" from="./ios-frame.jsx" dark="{{ isDark }}" hint-size="100%,300px"></x-import></div>`;
// app controls stack in the rail: back/close first, then the screen's own toolbar — 44–48px glass tiles, centered in the 84pt column
const railStack = items => items.length ? `<div data-duo-rail="" style="position:absolute; right:0; top:${CTRL_TOP}px; width:${F.RAIL}px; z-index:10; display:flex; flex-direction:column; align-items:center; gap:10px;">${items.join('')}</div>` : '';

function frameOpen(dark){
  const b=F.bezel;
  return `<div style="position:relative; flex:0 0 auto; width:${F.W+2*b}px; height:${F.H+2*b}px; padding:${b}px; border-radius:${F.radius}px; background:#0b0d10; box-shadow:0 30px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.16);"><div style="position:relative; width:${F.W}px; height:${F.H}px; border-radius:${F.ri}px; overflow:hidden; background:var(--surface-page); color:${dark?'#fff':'var(--text-primary)'}; font-family:var(--font-ui);">`;
}
const frameClose = (kb) => `${STATUS}${kb?KB:''}${HOME}</div></div>`;

function splitChildren(html){
  const re=/<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9-]*\b[^>]*>/g;
  const VOID=new Set(['img','br','hr','input','meta','link','source','track']);
  const out=[]; let depth=0,start=-1,m;
  while((m=re.exec(html))){
    const t=m[0]; if(start<0) start=m.index;
    if(t.startsWith('<!--')){ if(depth===0){ out.push(html.slice(start,re.lastIndex)); start=-1; } continue; }
    if(t.startsWith('</')){ depth--; if(depth===0){ out.push(html.slice(start,re.lastIndex)); start=-1; } continue; }
    const name=t.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/)[1].toLowerCase();
    if(VOID.has(name)||t.endsWith('/>')){ if(depth===0){ out.push(html.slice(start,re.lastIndex)); start=-1; } continue; }
    depth++;
  }
  return out.map(s=>s.trim());
}
const innerOf = el => { const m=el.match(/^<[^>]*>([\s\S]*)<\/[a-zA-Z-]+>$/); return m?m[1].trim():el; };
// a header's plain back/close tile becomes a glass tile once it floats in the rail
const toRailBtn = x => x.replace('variant="plain" size="md" hint-size="40px,40px"','variant="glass" size="md" hint-size="44px,44px"');
// shift a shorthand padding's right side by the rail width
function padRight(style, extra){
  const m=style.match(/padding:(\d+)px(?: (\d+)px)?(?: (\d+)px)?(?: (\d+)px)?;/);
  if(!m) return style+` padding-right:${extra}px;`;
  const t=+m[1], r=m[2]!=null?+m[2]:t, b=m[3]!=null?+m[3]:t, l=m[4]!=null?+m[4]:r;
  return style.replace(m[0],`padding:${t}px ${r+extra}px ${b}px ${l}px;`);
}

function transformBlock(attrs,inner,page,ctx){
  const kb=/keyboard="\{\{ true \}\}"/.test(attrs);
  const rm=inner.match(/^\s*<div ([^>]*)>\n([\s\S]*)\n\s*<\/div>\s*$/);
  if(!rm){ ctx.warn.push('root nomatch '+page); return null; }
  let rootAttrs=rm[1], body=rm[2];
  const isPage=/background:var\(--surface-page\);(?: font-family:var\(--font-ui\);)? display:flex; flex-direction:column/.test(rootAttrs);
  const isOverlayPage=/background:var\(--surface-page\); overflow:hidden/.test(rootAttrs);
  const isLock=/Monday, October 13/.test(body);
  const ind='\n            ';
  const rail=[];

  // ── status-bar padding goes: the clock now lives in the rail
  body=body.replace(/padding:(54|58|60|66)px (\d+px \d+px)/g,'padding:14px $2')
           .replace(/padding:60px 24px 24px/g,'padding:24px 24px 24px')
           .replace(/padding:12px 16px 28px; border-top:1px solid var\(--border\);/g,'padding:12px 16px 18px; border-top:1px solid var(--border);')
           .replace(/padding:10px 16px 30px; border-top:1px solid var\(--border\);/g,'padding:10px 16px 18px; border-top:1px solid var(--border);')
           // touch devices show no persistent scrollbar; the slightly narrower column must never grow a horizontal one
           .split('flex:1; overflow:auto;').join('flex:1; min-height:0; overflow-x:hidden; overflow-y:auto; scrollbar-width:none;')
           // "1.2 mi" in the then-banner stays on one line in the narrower bar
           .split('font-size:var(--fs-caption); font-weight:600; color:var(--text-tertiary);">1.2 mi').join('font-size:var(--fs-caption); font-weight:600; color:var(--text-tertiary); white-space:nowrap;">1.2 mi');

  if(isLock){
    // system lock screen: time and notifications centre in the content column; flashlight/camera move to the rail's foot
    body=body.replace('position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; padding-top:78px;',`position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; padding-top:44px; padding-right:${F.RAIL}px;`)
             .replace('position:absolute; left:12px; right:12px; top:300px; z-index:2;',`position:absolute; left:12px; right:${RAIL_GUTTER}px; top:236px; z-index:2;`)
             .replace('position:absolute; left:40px; right:40px; bottom:70px; z-index:2; display:flex; justify-content:space-between;',`position:absolute; right:0; width:${F.RAIL}px; bottom:28px; z-index:2; display:flex; flex-direction:column; align-items:center; gap:14px;`);
    return frameOpen(true)+'\n          '+`<div ${rootAttrs}>`+ind+body.trim()+'\n          </div>\n        '+frameClose(false);
  }

  let kids=splitChildren(body);
  if(isPage){
    // page bands (headers, CTA bars, scroll columns) run edge to edge under the rail; only their content is inset.
    // a root that pads itself (first-launch cards) insets as a whole instead.
    const rootPads=/padding:/.test(rootAttrs);
    if(rootPads){
      rootAttrs=rootAttrs.replace(/style="([^"]*)"/,(m,s)=>`style="${padRight(s,F.RAIL)}"`);
      rootAttrs=rootAttrs.replace(/padding:(80|116)px/,(m,p)=>`padding:${p-40}px`);
    }
    // header back/close tiles move to the rail (Apple: navigation controls go to the side)
    kids=kids.map((k,i)=>{
      if(!rootPads && /^<div style="/.test(k)) k=k.replace(/^<div style="([^"]*)"/,(m,s)=>`<div style="${padRight(s,F.RAIL)}"`);
      if(i===0 && /background:var\(--surface-card\)/.test(k.slice(0,k.indexOf('>')))){
        // Cancel text → the rail's close tile
        const cancelRe=/<span style="color:var\(--text-brand\); font-weight:600; font-size:15px; flex:0 0 auto;">Cancel<\/span>\s*/;
        if(cancelRe.test(k)){ k=k.replace(cancelRe,''); rail.unshift(iconBtn('Close',X_SVG)); ctx.moved++; }
        // plain chevron / action glyphs in a title bar → rail (first is Back, the rest are toolbar items)
        const spanRe=/<span style="color:var\(--text-secondary\); display:inline-flex;">\s*(<svg[\s\S]*?<\/svg>)\s*<\/span>\s*/g;
        let n=0;
        k=k.replace(spanRe,(mm,svg)=>{ rail.push(iconBtn(n++===0?'Back':'Action',svg)); ctx.moved++; return ''; });
        // a top-level screen reached from the drawer gets the drawer's menu tile
        if(/>Recently added<\/div>/.test(k)){ rail.unshift(iconBtn('Menu',MENU_SVG)); ctx.moved++; k=k.replace('line-height:1.1;">Recently added','line-height:1.1; white-space:nowrap;">Recently added'); }
      }
      if(i>0 && !/^<div style="padding:14px /.test(k)) return k;
      const re=/<x-import component-from-global-scope="DesignSystem_c71fad\.IconButton" label="(Back|Close)"[^>]*>[\s\S]*?<\/x-import>\s*/;
      const m=k.match(re);
      if(m){ rail.push(toRailBtn(m[0].trim())); ctx.moved++; return k.replace(re,''); }
      // large-title headers draw their own 40px chevron / action circles: those are toolbar items, so they go to the rail too
      if(i===0 && /^<div style="display:flex; align-items:center; gap:4px; padding:14px \d+px 6px(?: 10px)?;">/.test(k)){
        const re2=/<span style="width:40px; height:40px; border-radius:var\(--radius-pill\);[^"]*">\s*(<svg[\s\S]*?<\/svg>)\s*<\/span>\s*/g;
        let n=0;
        k=k.replace(re2,(mm,svg)=>{ rail.push(`<x-import component-from-global-scope="DesignSystem_c71fad.IconButton" label="${n++===0?'Back':'Action'}" variant="glass" size="md" hint-size="44px,44px">${svg}</x-import>`); ctx.moved++; return ''; });
        if(n) k=k.replace(/padding:14px (\d+)px 6px(?: 10px)?;/,(m,r)=>`padding:18px ${+r+6}px 6px 16px;`);
      }
      return k;
    });
  }
  if(isOverlayPage){
    kids=kids.map(k=>{
      if(k.startsWith('<div style="position:absolute; inset:0; display:flex; flex-direction:column;">')) return k.replace('position:absolute; inset:0; display:flex; flex-direction:column;',`position:absolute; inset:0; display:flex; flex-direction:column; padding-right:${F.RAIL}px;`);
      return k;
    });
  }
  kids=kids.map(k=>{
    if(k.startsWith('<!--')) return k;
    // floating back/close → first in the rail
    if(/^<div style="position:absolute; (left|right):12px; top:60px; z-index:10;"><x-import component-from-global-scope="DesignSystem_c71fad\.IconButton" label="(Back|Close)"/.test(k)){ rail.unshift(innerOf(k)); ctx.moved++; return null; }
    // right-edge control stacks (filters/zoom/recenter/add, undo/clear) → the rail's toolbar
    if(/^<div style="position: ?absolute; right: ?12px; top: ?(122|182|200|116)px; z-index: ?1[01]; display: ?flex; flex-direction: ?column;/.test(k)){ rail.push(innerOf(k)); ctx.moved++; return null; }
    // top bars (search, nav banner, editing bar, directions form) stop at the rail; their close tile / × glyph moves into it
    if(/^<div style="position:absolute; top:(56|60)px; left:12px; right:12px;/.test(k)){
      let s=k.replace(/top:(56|60)px; left:12px; right:12px;/,`top:14px; left:12px; right:${RAIL_GUTTER}px;`);
      const re=/<x-import component-from-global-scope="DesignSystem_c71fad\.IconButton" label="(Back|Close)[^"]*"[^>]*>[\s\S]*?<\/x-import>\s*/;
      const m=s.match(re);
      if(m){ rail.unshift(toRailBtn(m[0].trim())); s=s.replace(re,'').replace('padding:7px 8px 7px 6px;','padding:7px 8px 7px 14px;'); ctx.moved++; }
      const xre=/<span style="color:var\(--text-secondary\); flex:0 0 auto; display:inline-flex;">\s*(<svg[^>]*>\s*<path d="M18 6 6 18"><\/path>\s*<path d="M6 6l12 12"><\/path>\s*<\/svg>)\s*<\/span>\s*/;
      const xm=s.match(xre);
      if(xm){ rail.unshift(iconBtn('Close',xm[1])); s=s.replace(xre,''); ctx.moved++; }
      return s;
    }
    if(/^<div style="position:absolute; left:16px; right:68px; top:60px;/.test(k)) return k.replace('left:16px; right:68px; top:60px;',`left:12px; right:${RAIL_GUTTER}px; top:14px;`);
    // bottom-anchored CTAs stop at the rail
    if(/^<div style="position:absolute; left:12px; right:12px; bottom:\d+px;/.test(k)) return k.replace('left:12px; right:12px;',`left:12px; right:${RAIL_GUTTER}px;`);
    // speed sign tracks the nav banner, which moved up with the status bar gone
    if(/^<div class="daf-slb" style="position:absolute; left:12px; top:182px;/.test(k)) return k.replace('top:182px;','top:140px;');
    // the control-stack tooltip now points at the rail
    if(/^<div style="position:absolute; right:70px; top:354px;/.test(k)) return k.replace('right:70px; top:354px;',`right:${F.RAIL+8}px; top:${CTRL_TOP+4*60-6}px;`);
    // bottom sheets (and the ETA bar / alert stack) span the safe area only — the rail stays open to the map beneath
    if(/^<div style="position:absolute; left:0; right:0; bottom:0; z-index:10;/.test(k)){
      let s=k.replace('position:absolute; left:0; right:0; bottom:0; z-index:10;',`position:absolute; left:0; right:${F.RAIL}px; bottom:0; z-index:10;`);
      if(s.includes('DesignSystem_c71fad.BottomSheet')) s=s.replace(/<x-import component-from-global-scope="DesignSystem_c71fad\.BottomSheet"([^>]*)>/,(m,a)=>`<x-import component-from-global-scope="DesignSystem_c71fad.BottomSheet"${a} dc-props="{{ duoSheet }}">`);
      ctx.sheets++;
      return s;
    }
    // centred dialogs centre in the content column, clear of the rail
    if(/^<div style="position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; align-items:center; justify-content:center;/.test(k)) return k.replace('position:absolute; inset:0;',`position:absolute; left:0; top:0; bottom:0; right:${F.RAIL}px;`);
    return k;
  }).filter(Boolean);
  // add-area compositions sit higher so the shorter sheet leaves the circle / polygon in view
  if(body.includes('>5 mi</div>')){
    const sw={'top:36%':'top:20%','top:28%':'top:14%','top:44%':'top:30%','top:24%':'top:10%'};
    kids=kids.map(k=>k.replace(/top:(36|28|44|24)%/g,m=>sw[m]).split('width:236px; height:236px;').join('width:180px; height:180px;').replace('translate(-50%, -134px)','translate(-50%, -106px)').replace('box-shadow:var(--shadow-marker);">5 mi','box-shadow:var(--shadow-marker); white-space:nowrap;">5 mi')
      // tighter sheet so the CTA clears the cap without scrolling
      .replace('<div style="height:16px;"></div>','<div style="height:10px;"></div>').replace('border-radius:var(--radius-lg); padding:16px; margin-bottom:12px;','border-radius:var(--radius-lg); padding:12px 14px; margin-bottom:10px;').replace('margin:10px 0 14px; line-height:1.4;','margin:8px 0 10px; line-height:1.4;'));
  }
  if(body.includes('Tap to add corners')){
    const sw={'top:30%':'top:18%','top:40%':'top:26%','top:52%':'top:30%'};
    kids=kids.map(k=>k.replace('viewBox="0 0 390 844" preserveAspectRatio="none"','viewBox="0 0 390 1400" preserveAspectRatio="none"').replace(/top:(30|40|52)%/g,m=>sw[m]));
  }
  const rs=railStack(rail);
  if(rs) kids.push(rs);
  return frameOpen(false)+'\n          '+`<div ${rootAttrs}>`+ind+kids.join(ind)+'\n          </div>\n        '+frameClose(kb);
}

function chip(href,label,on){
  return on?`<span style="font-family:var(--font-mono); font-size:11px; letter-spacing:0.04em; font-weight:600; color:var(--surface-card); background:var(--text-primary); padding:5px 11px; border-radius:var(--radius-pill); white-space:nowrap;">${label}</span>`
           :`<a href="${href}" style="font-family:var(--font-mono); font-size:11px; letter-spacing:0.04em; text-decoration:none; color:var(--text-secondary); padding:5px 11px; border-radius:var(--radius-pill); white-space:nowrap;">${label}</a>`;
}
function switcher(page,active,auto=true){
  return `<span style="${auto?'margin-left:auto; ':''}display:inline-flex; align-items:center; gap:2px; padding:2px; background:var(--surface-card); border:1px solid var(--border); border-radius:var(--radius-pill);">${chip('Mobile'+page+'.dc.html','Phone',active==='Mobile')}${chip('Fold'+page+'.dc.html','Foldable',active==='Fold')}${chip('Tablet'+page+'.dc.html','Tablet',active==='Tablet')}${chip('Duo'+page+'.dc.html','Duo',active==='Duo')}</span>`;
}
function convertFile(src,page){
  const ctx={warn:[],sheets:0,moved:0};
  let n=0;
  let s=src.replace(/^        <x-import component="IOSDevice"([^>]*)>\n([\s\S]*?)\n        <\/x-import>/gm,(m,a,inner)=>{ n++; return transformBlock(a,inner,page,ctx)||m; });
  ctx.count=n;
  s=s.replace(/— Mobile/g,'— '+F.label);
  s=s.replace(/Mobile · /g,F.label+' · ');
  s=s.replace(/href="Mobile(\w+)\.dc\.html"/g,(m,p)=>`href="${F.key}${p}.dc.html"`);
  s=s.replace(/<span style="margin-left:auto; display:inline-flex; align-items:center; gap:2px; padding:2px;[\s\S]*?>(?:Tablet|Duo)<\/(?:a|span)><\/span>/,()=>switcher(page,F.key));
  s=s.replace('<a href="Moderation.dc.html" style="margin-left:auto; ',()=>switcher(page,F.key)+'<a href="Moderation.dc.html" style="');
  s=s.replace(/>iOS · /g,()=>`>${F.label} · ${F.sub} · `);
  s=s.replace(/ · iOS</g,()=>` · ${F.label}<`);
  s=s.replace(/max-width:1500px; margin:0 auto;/,()=>`max-width:${F.maxW}px; margin:0 auto;`);
  s=s.replace(/&quot;\$preview&quot;:\{&quot;width&quot;:\d+,&quot;height&quot;:\d+\}/,()=>`&quot;$preview&quot;:{&quot;width&quot;:${F.pw},&quot;height&quot;:${F.ph}}`);
  s=s.replace('page name="Mobile · ','page name="Duo · ');
  // expose the sheet props: wrap the page's renderVals
  if((s.match(/\n  renderVals\(\) \{/g)||[]).length!==1) ctx.warn.push('renderVals nomatch');
  s=s.replace('\n  renderVals() {',`\n  renderVals() { return { ...this.renderValsBase(), duoSheet: ${SHEET_PROPS} }; }\n  renderValsBase() {`);
  return {s,ctx};
}
function convertIndex(src){
  let s=src.replace(/href="Mobile(\w+)\.dc\.html"/g,(m,p)=>`href="${F.key}${p}.dc.html"`);
  s=s.replace('— Mobile</span>',()=>'— '+F.label+'</span>');
  s=s.replace(/· iOS</g,()=>'· '+F.label+'<');
  s=s.replace(/<p style="font-size:15px; color:var\(--text-secondary\); margin:0 0 18px; max-width:70ch;">[^<]*<\/p>/,()=>`<p style="font-size:15px; color:var(--text-secondary); margin:0 0 18px; max-width:70ch;">${F.blurb}</p>`);
  s=s.replace(/<span style="display:inline-flex; align-items:center; gap:2px; padding:2px;[\s\S]*?>(?:Tablet|Duo)<\/(?:a|span)><\/span>/,()=>switcher('App',F.key,false));
  s=s.replace('page name="Mobile app screens"',()=>`page name="${F.label} app screens"`);
  s=s.replace(/Screens keep their original numbering \(01–23\) across the split pages\./,()=>`Same screens and numbering as the phone set, re-laid for the ${F.sub} pt display with its right-hand rail.`);
  return s;
}
const report=[];
for(const page of PAGES){
  const src=await readFile(`Mobile${page}.dc.html`);
  const {s,ctx}=convertFile(src,page);
  await saveFile(`${F.key}${page}.dc.html`,s);
  report.push(`${F.key}${page}: ${ctx.count} screens, ${ctx.sheets} sheets inset, ${ctx.moved} controls → rail; warn=${ctx.warn.join(' | ')||'none'}`);
}
await saveFile(`${F.key}App.dc.html`,convertIndex(await readFile('MobileApp.dc.html')));
log(report.join('\n'));
