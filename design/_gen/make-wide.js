// Generator: derives Fold*/Tablet* galleries from the Mobile* pages. Run via run_script (see _gen/README).
const PAGES = ['Explore','Navigate','Scorecard','Contribute','Settings','Areas'];
const FORMS = [
  // P = pane column width; inset = pane gutter from the screen edge; pad = pane body side padding (keeps content ≈ phone width)
  { key:'Fold', label:'Foldable', W:800, H:844, P:400, inset:10, pad:12, bezel:10, radius:30, ri:22, hinge:true, pw:1700, ph:1100, maxW:1700, sub:'unfolded 800 × 844', blurb:'Unfolded foldable. The phone\'s bottom sheet becomes a left pane that stops at the hinge; the map keeps the right half. Same screens, same controls and numbering as the phone set.' },
  { key:'Tablet', label:'Tablet', W:1194, H:834, P:430, inset:12, pad:16, bezel:16, radius:34, ri:20, hinge:false, pw:1500, ph:1000, maxW:1500, sub:'landscape 1194 × 834', blurb:'Tablet and desktop windows. The phone\'s bottom sheet becomes a floating left pane and the map fills the rest; active navigation goes edge-to-edge. Same screens, same controls and numbering as the phone set — the menu lives behind the search bar\'s hamburger, as on the phone.' },
];
const SVG = (inner, size=20, sw=2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;">${inner}</svg>`;
const ICON = {
  menu: '<path d="M4 12h16"></path><path d="M4 6h16"></path><path d="M4 18h16"></path>',
  close: '<path d="M18 6 6 18"></path><path d="M6 6l12 12"></path>',
  back: '<path d="m15 18-6-6 6-6"></path>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"></path><path d="M15 5.764V20"></path><path d="M9 3.236v15"></path>',
  route: '<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>',
  score: '<path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path>',
  hot: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>',
  edits: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path>',
  help: '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
  settings: '<line x1="4" x2="4" y1="21" y2="14"></line><line x1="4" x2="4" y1="10" y2="3"></line><line x1="12" x2="12" y1="21" y2="12"></line><line x1="12" x2="12" y1="8" y2="3"></line><line x1="20" x2="20" y1="21" y2="16"></line><line x1="20" x2="20" y1="12" y2="3"></line><line x1="2" x2="6" y1="14" y2="14"></line><line x1="10" x2="14" y1="8" y2="8"></line><line x1="18" x2="22" y1="16" y2="16"></line>',
};
const STATUS = `<div style="position:absolute; top:0; left:0; right:0; height:44px; z-index:50; display:flex; align-items:center; justify-content:space-between; padding:0 24px; pointer-events:none; font-size:14px; font-weight:600;"><span style="font-variant-numeric:tabular-nums;">9:41</span><span style="display:inline-flex; align-items:center; gap:7px;"><svg width="18" height="12" viewBox="0 0 19 12" fill="currentColor" style="display:block;"><rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7"></rect><rect x="4.8" y="5" width="3.2" height="7" rx="0.7"></rect><rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7"></rect><rect x="14.4" y="0" width="3.2" height="12" rx="0.7"></rect></svg><svg width="16" height="12" viewBox="0 0 17 12" fill="currentColor" style="display:block;"><path d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z"></path><path d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z"></path><circle cx="8.5" cy="10.5" r="1.5"></circle></svg><svg width="27" height="13" viewBox="0 0 27 13" style="display:block;"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" stroke-opacity="0.35" fill="none"></rect><rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor"></rect><path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill="currentColor" fill-opacity="0.4"></path></svg></span></div>`;
const HOME = `<div aria-hidden="true" style="position:absolute; left:50%; bottom:8px; transform:translateX(-50%); width:120px; height:5px; border-radius:3px; background:var(--text-primary); opacity:0.3; z-index:60; pointer-events:none;"></div>`;
const HINGE = `<div aria-hidden="true" style="position:absolute; left:50%; top:0; bottom:0; width:3px; transform:translateX(-50%); background:linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.12) 50%, rgba(0,0,0,0) 100%); z-index:45; pointer-events:none;"></div>`;
// no navigation rail on either form: the menu stays behind the search bar's hamburger / page-header hamburger, exactly as on the phone
function frameOpen(F,dark){
  const b=F.bezel;
  return `<div style="position:relative; flex:0 0 auto; width:${F.W+2*b}px; height:${F.H+2*b}px; padding:${b}px; border-radius:${F.radius}px; background:#0b0d10; box-shadow:0 30px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.16);"><div style="position:relative; width:${F.W}px; height:${F.H}px; border-radius:${F.ri}px; overflow:hidden; background:var(--surface-page); color:${dark?'#fff':'var(--text-primary)'}; font-family:var(--font-ui);">${STATUS}${F.hinge?HINGE:''}<div style="position:absolute; inset:0;">`;
}
const frameClose = () => `</div>${HOME}</div></div>`;
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
const MK=(v,l,t,extra='')=>`<div style="position:absolute; left:${l}%; top:${t}%; transform:translate(-50%,-50%); z-index:4;"><x-import component-from-global-scope="DesignSystem_c71fad.MapMarker" variant="${v}" ${extra} hint-size="40px,40px"></x-import></div>`;
const STAGE_MARKERS={
  Explore: MK('user',50,57,'heading="30"')+MK('camera',34,33,'heading="130"')+MK('cluster',22,24,'count="9"')+MK('alpr',56,44),
  Scorecard: MK('user',56,56,'heading="30"')+MK('camera',50,26,'heading="200"')+MK('alpr',30,40),
  Contribute: MK('camera',50,50,'heading="250" selected="{{ true }}"')+MK('camera',70,30,'heading="95"')+MK('user',38,72,'heading="0"'),
  Settings: MK('user',50,57,'heading="30"'),
  Navigate: MK('user',50,60,'heading="0"'),
  Areas: MK('user',56,58,'heading="30"')+MK('alpr',38,34)+MK('alpr',64,46),
};
const MAPBG=`<div style="position:absolute; inset:0; overflow:hidden;"><dc-import name="SchematicMap" style="position:absolute; inset:0;" hint-size="100%,100%"></dc-import></div>`;
// 28 Area feed: the map is right there, so it shows the watched area and its changes (same drawing as 28b)
const AREA_PLUS=(l,t,bg,g)=>`<div style="position:absolute; left:${l}%; top:${t}%; transform:translate(-50%, -30px); z-index:5; width:20px; height:20px; border-radius:50%; background:${bg}; color:#fff; display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); font-size:13px; font-weight:700; line-height:1; box-shadow:var(--shadow-marker);">${g}</div>`;
const AREA_STAGE=`<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%; display:block; z-index:2; pointer-events:none; overflow:visible;"><path d="M16 18 L50 12 L84 20 L90 40 L78 56 L44 62 L18 54 L10 36 Z" fill="color-mix(in oklab, var(--brand) 10%, transparent)" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path></svg>`
  +[[30,24],[60,21],[74,38],[48,46]].map(([l,t])=>MK('alpr',l,t)+AREA_PLUS(l,t,'var(--alert-500)','+')).join('')
  +MK('alpr',32,50).replace('z-index:4;','z-index:4; opacity:0.45;')+AREA_PLUS(32,50,'var(--brand)','−');
// full-bleed map behind everything; markers/routes live in a stage that starts right of the pane column
const stage=(P,markers)=>`${MAPBG}<div style="position:absolute; left:${P}px; top:0; right:0; bottom:0; overflow:hidden;">${markers||''}</div>`;
// the pane is a floating card: sized to its content, capped so long content scrolls inside
const PANEL=(F,bg='var(--surface-sheet)')=>`position:absolute; left:${F.inset}px; top:56px; width:${F.P-2*F.inset}px; max-height:calc(100% - 84px); z-index:10; background:${bg}; border:1px solid var(--border-glass); border-radius:var(--radius-xl); box-shadow:var(--shadow-float); color:var(--text-primary); display:flex; flex-direction:column; overflow:hidden;`;
// scroll bodies: vertical only — full-bleed dividers / negative margins must not grow a horizontal scrollbar inside the card
const SCROLL_Y='overflow-x:hidden; overflow-y:auto; scrollbar-width:none;'; // touch devices show no persistent scrollbar
// page headers were padded for the status bar; inside the card that padding goes
const pageKids=kids=>kids.map(k=>k.replace(/padding:(54|58|60|66)px (\d+px \d+px)/,'padding:14px $2').replace('padding:60px 24px 24px','padding:28px 24px 24px').replace('padding:10px 16px 30px; border-top:1px solid var(--border);','padding:10px 16px 14px; border-top:1px solid var(--border);').split('flex:1; overflow:auto;').join('flex:1; min-height:0; '+SCROLL_Y).replace('flex:1; display:flex; flex-direction:column; padding:28px 22px 0;','flex:1; min-height:0; '+SCROLL_Y+' display:flex; flex-direction:column; padding:20px 22px 0;'));
// first-launch full-screen pages (no map underneath on the phone) become one centered card over a dimmed map
const centeredCard=(kids,F)=>{
  const k2=kids.map(k=>k==='<div style="flex:1;"></div>'?'<div style="height:24px;"></div>':k);
  return [MAPBG,`<div style="position:absolute; inset:0; background:rgba(11,14,18,0.28);"></div>`,
    `<div style="position:absolute; inset:0; z-index:10; display:flex; align-items:center; justify-content:center; padding:40px;"><div style="width:100%; max-width:480px; max-height:100%; ${SCROLL_Y} background:var(--surface-card); border-radius:var(--radius-2xl); box-shadow:var(--shadow-sheet); padding:34px 28px 28px; display:flex; flex-direction:column;">`,...k2,`</div></div>`];
};
const TITLE=t=>`<div style="font-family:var(--font-display); font-size:var(--fs-h3); font-weight:var(--fw-bold); letter-spacing:var(--ls-heading);">${t}</div>`;
const SUB=s=>s?`<div style="font-size:var(--fs-body-sm); color:var(--text-secondary); margin-top:2px;">${s}</div>`:'';
const IBTN=(label,icon)=>`<x-import component-from-global-scope="DesignSystem_c71fad.IconButton" label="${label}" variant="plain" size="md" hint-size="40px,40px">${SVG(ICON[icon])}</x-import>`;
// one dismiss per pane: a back chevron for sub-steps, a close for details — none when the body already carries Cancel / Keep editing
function sheetPanel(F,title,sub,body,back,noClose){
  const close=!back&&!noClose;
  const head=`<div style="flex:0 0 auto; display:flex; align-items:flex-start; gap:8px; padding:${back?'12px 12px 8px 8px':close?'14px 10px 8px 16px':'14px 16px 8px 16px'};">${back?IBTN('Back','back'):''}<div style="flex:1; min-width:0; padding-top:${back?'8px':'4px'};">${TITLE(title)}${SUB(sub)}</div>${close?IBTN('Close','close'):''}</div>`;
  return `<div style="${PANEL(F)}">${head}<div style="flex:1; min-height:0; ${SCROLL_Y} padding:10px ${F.pad}px 24px;">\n${body}\n</div></div>`;
}
const modal=(title,sub,body,F)=>`<div style="position:absolute; ${F&&F.hinge?`left:${F.P}px; right:0; top:0; bottom:0;`:'inset:0;'} z-index:10; display:flex; align-items:center; justify-content:center; padding:32px;"><div style="width:100%; max-width:420px; background:var(--surface-sheet); border-radius:var(--radius-2xl); box-shadow:var(--shadow-sheet); padding:22px 20px; color:var(--text-primary);"><div style="margin-bottom:14px;">${TITLE(title)}${SUB(sub)}</div>\n${body}\n</div></div>`;

function transformBlock(attrs,inner,page,F,ctx){
  const P=F.P;
  const kb=/keyboard="\{\{ true \}\}"/.test(attrs);
  const rm=inner.match(/^\s*<div ([^>]*)>\n([\s\S]*)\n\s*<\/div>\s*$/);
  if(!rm){ ctx.warn.push('root nomatch '+page); return null; }
  const rootAttrs=rm[1], body=rm[2];
  const label=(rootAttrs.match(/\sdata-screen-label="[^"]*"/)||[''])[0];
  const isPage=/background:var\(--surface-page\);(?: font-family:var\(--font-ui\);)? display:flex; flex-direction:column/.test(rootAttrs);
  const isOverlayPage=/background:var\(--surface-page\); overflow:hidden/.test(rootAttrs);
  const isNav=/NavBanner/.test(body);
  const isNoLoc=/Works with or without your location/.test(body)||/Buy us a coffee/.test(body);
  const isLock=/Monday, October 13/.test(body);
  const isDirections=/Get directions<\/x-import>/.test(body)&&!isNav;
  let kids=splitChildren(body).filter(k=>!k.startsWith('<!--'));
  let out=[]; let hasPanel=false;
  const ROOT=`<div style="position:relative; width:100%; height:100%; overflow:hidden; font-family:var(--font-ui);"${label}>`;
  const markers=/Show all 5 on the map/.test(body)?AREA_STAGE:(STAGE_MARKERS[page]||'');
  const KB=kb?`<div style="position:absolute; left:0; right:0; bottom:0; z-index:40;"><x-import component="IOSKeyboard" from="./ios-frame.jsx" dark="{{ isDark }}" hint-size="100%,300px"></x-import></div>`:'';
  const ind='\n            ';
  if(isLock){
    // system lock screen: keep the phone's own chrome (dark, system font); notifications become a centered stack instead of edge-to-edge
    const k2=kids.map(k=>k.replace('position:absolute; left:12px; right:12px; top:300px; z-index:2;',`position:absolute; left:50%; transform:translateX(-50%); width:${Math.min(F.W-24,560)}px; top:${F.hinge?300:250}px; z-index:2;`));
    return frameOpen(F,true)+'\n          '+`<div ${rootAttrs}>`+ind+k2.join(ind)+'\n          </div>\n        '+frameClose();
  }
  if(isNoLoc){
    out=centeredCard(kids,F);
  } else if(isPage){
    out=[stage(P,markers),`<div style="${PANEL(F,'var(--surface-page)')}">`,...pageKids(kids),`</div>`]; if(KB) out.push(KB); hasPanel=true;
  } else if(isOverlayPage){
    kids=pageKids(kids).map(k=>{
      if(k.startsWith('<div style="position:absolute; inset:0; display:flex; flex-direction:column;">')) return k.replace('position:absolute; inset:0; display:flex; flex-direction:column;',PANEL(F,'var(--surface-page)'));
      if(/^<div style="position:absolute; inset:0; z-index:6; background:rgba/.test(k)) return k.replace('z-index:6;','z-index:12;');
      if(/^<div style="position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; align-items:center; justify-content:center;/.test(k)) return k.replace('position:absolute; inset:0; z-index:10;', F.hinge?`position:absolute; left:${P}px; right:0; top:0; bottom:0; z-index:13;`:'position:absolute; inset:0; z-index:13;').replace('<div style="width:100%; background:var(--surface-card); border-radius:var(--radius-lg);','<div style="width:100%; max-width:420px; background:var(--surface-card); border-radius:var(--radius-lg);');
      return k;
    });
    out=[stage(P,markers),...kids]; hasPanel=true;
  } else {
    const isDim=k=>/^<div style="position:absolute; inset:0;[^"]*background:rgba/.test(k);
    const isMapLayer=k=>k.startsWith('<dc-import name="SchematicMap"')||k.startsWith('<svg viewBox="0 0 100 100"')||k.startsWith('<svg viewBox="0 0 390 844"')||/^<div style="position:absolute; left:(\d+(\.\d+)?%|\{\{)/.test(k)||k.startsWith('<sc-for')||isDim(k);
    let layer=kids.filter(isMapLayer), ctrls=kids.filter(k=>!isMapLayer(k));
    // phone-sized overlay drawings (drawn-area polygon) keep their proportions and center in the map stage
    layer=layer.map(k=>k.startsWith('<svg viewBox="0 0 390 844" preserveAspectRatio="none"')?k.replace('preserveAspectRatio="none"','preserveAspectRatio="xMidYMid meet"'):k);
    let panelHtml=null, extra=[];
    const si=ctrls.findIndex(k=>k.startsWith('<div style="position:absolute; left:0; right:0; bottom:0; z-index:10;">')&&k.includes('DesignSystem_c71fad.BottomSheet'));
    if(si>=0){
      const k=ctrls[si];
      const m=k.match(/<x-import component-from-global-scope="DesignSystem_c71fad\.BottomSheet"([^>]*)>\n([\s\S]*)\n\s*<\/x-import>\s*<\/div>$/);
      if(!m){ ctx.warn.push('sheet nomatch '+page+' '+k.slice(0,120)); }
      else{
        const a=m[1], sb=m[2];
        const title=(a.match(/title="([^"]*)"/)||[,''])[1], sub=(a.match(/subtitle="([^"]*)"/)||[,''])[1];
        // confirmations ("…?") carry Cancel; the staged-changes tray carries Keep editing — neither needs a header ×
        const noClose=/\?$/.test(title)||/>Keep editing<\/x-import>/.test(sb);
        // the phone's floating glass Back button (left:12 top:60) means this sheet is a sub-step: the pane gets a back chevron instead of a close
        const hadBack=ctrls.some(k=>k&&/^<div style="position:absolute; left:12px; top:60px; z-index:10;"><x-import component-from-global-scope="DesignSystem_c71fad\.IconButton" label="Back"/.test(k));
        if(/\?$/.test(title) && !F.hinge){ panelHtml=modal(title,sub,sb,F); hasPanel=false; }
        else{ panelHtml=sheetPanel(F,title,sub,sb,hadBack||/Choose your route/.test(title),noClose); hasPanel=true; }
        ctrls[si]=null; ctx.sheets=(ctx.sheets||0)+1;
      }
    }
    if(isNav){
      hasPanel=true;
      const bi=ctrls.findIndex(k=>k&&k.startsWith('<div style="position:absolute; left:0; right:0; bottom:0; z-index:10;'));
      if(bi<0){ ctx.warn.push('nav bottom nomatch '+page); }
      else{
        const k=ctrls[bi]; ctrls[bi]=null;
        // no search bar mid-drive, so the pane header carries the one menu button: [menu · ETA · End/Resume]
        const navHead=row=>`<div style="flex:0 0 auto; padding:16px 16px 16px; display:flex; align-items:center; gap:12px;">${IBTN('Open menu','menu')}${row}</div>`;
        if(/^<div style="[^"]*height:\{\{ sheetH \}\}px/.test(k)){
          let s=k.replace(/^<div style="[^"]*">/,`<div style="${PANEL(F)}">`);
          s=s.replace(/<div onPointerDown="[^"]*" onPointerMove="[^"]*" onPointerUp="[^"]*" onPointerCancel="[^"]*" style="[^"]*">/,'<div style="flex:0 0 auto;">');
          s=s.replace(/<div style="display:flex; justify-content:center; padding:8px 0 4px;"><span aria-hidden="true" style="[^"]*"><\/span><\/div>\s*/,'');
          s=s.replace('padding:4px 16px 24px; display:flex; align-items:center; gap:12px;','padding:16px 16px 16px; display:flex; align-items:center; gap:12px;');
          s=s.replace(/(padding:16px 16px 16px; display:flex; align-items:center; gap:12px;">)(\s*)/,(m,a,ws)=>a+ws+IBTN('Open menu','menu')+ws);
          panelHtml=s;
        } else if(/^<div style="[^"]*background:var\(--surface-sheet\); border-top-left-radius/.test(k)){
          panelHtml=`<div style="${PANEL(F)}">${navHead(innerOf(k))}${ctx.steps||''}</div>`;
        } else {
          const sub=splitChildren(innerOf(k)).filter(x=>!x.startsWith('<!--'));
          const alerts=sub.filter(x=>x.startsWith('<div style="position:relative; overflow:hidden; margin:0 12px;'));
          const eta=sub.find(x=>/^<div style="[^"]*border-top-left-radius:var\(--radius-sheet\)/.test(x));
          if(!eta) ctx.warn.push('eta nomatch '+page);
          if(!alerts.length) ctx.warn.push('alerts nomatch '+page);
          panelHtml=`<div style="${PANEL(F)}">${navHead(innerOf(eta||''))}${ctx.steps||''}</div>`;
          extra.push(`<div style="position:absolute; left:${P+12}px; right:12px; bottom:28px; z-index:10; display:flex; flex-direction:column; gap:12px;">${alerts.map(a=>a.replace('margin:0 12px; ','')).join('')}</div>`);
        }
      }
    }
    // the maneuver glyph already sits in the NavBanner over the map; drop its duplicate from the pane header
    if(isNav && panelHtml){
      panelHtml=panelHtml.replace(/<span aria-hidden="true" style="flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; width:46px; height:46px; border-radius:var\(--radius-sm\); background:var\(--brand-soft\); color:var\(--text-brand\);">[\s\S]*?<\/svg><\/span>\s*/,'');
    }
    // ETA headline row is narrower in the pane than on the phone: let "4.1 mi" wrap instead of clipping
    if(panelHtml) panelHtml=panelHtml.split('display:flex; align-items:baseline; gap:10px; white-space:nowrap; overflow:hidden;').join('display:flex; align-items:baseline; gap:4px 10px; flex-wrap:wrap;');
    if(isDirections){
      hasPanel=true;
      const ti=ctrls.findIndex(k=>k&&k.startsWith('<div style="position:absolute; top:56px; left:12px; right:12px; z-index:10;">'));
      const bi=ctrls.findIndex(k=>k&&/^<div style="position:absolute; left:12px; right:12px; bottom:46px; z-index:10;">/.test(k));
      if(ti<0||bi<0) ctx.warn.push('directions nomatch '+page);
      else{ panelHtml=`<div style="${PANEL(F)} padding:14px; gap:12px; ${SCROLL_Y}">${innerOf(innerOf(ctrls[ti]))}<div>${innerOf(ctrls[bi])}</div></div>`; ctrls[ti]=null; ctrls[bi]=null; }
    }
    ctrls=ctrls.filter(Boolean);
    if(hasPanel){ layer=layer.filter(k=>!isDim(k)&&!k.startsWith('<dc-import name="SchematicMap"')); out.push(MAPBG,`<div style="position:absolute; left:${P}px; top:0; right:0; bottom:0; overflow:hidden;">`,...layer,`</div>`); }
    else out.push(...layer);
    ctrls=ctrls.map(k=>{
      // right-edge control stacks: the search bar no longer spans the width, so align them with its top edge
      if(/^<div style="position: ?absolute; right: ?12px; top: ?122px;/.test(k)) k=k.replace(/top: ?122px;/,'top:60px;');
      if(/^<div style="position:absolute; right:70px; top:354px;/.test(k)) k=k.replace('top:354px;','top:292px;');
      // while a pane or dialog is up, the "Editing · n changes" bar is status only — its × (close editor) would sit right next to the pane's own dismiss
      if(panelHtml && k.includes('label="Close editor"')) k=k.replace(/<x-import component-from-global-scope="DesignSystem_c71fad\.IconButton" label="Close editor"[^>]*>[\s\S]*?<\/x-import>\s*/,'').replace('padding:7px 8px 7px 6px;','padding:7px 8px 7px 14px; min-height:54px;');
      if(hasPanel){
        if(/^<div style="position:absolute; top:\d+px; left:12px; right:12px; z-index:10;/.test(k)) return k.replace('left:12px; right:12px;',`left:${P+12}px; right:12px;`);
        // draw-mode hint bar: the phone's × was dropped (the pane has one), so the bar runs to the edge and the undo/clear stack sits beside it on the same row
        if(/^<div style="position:absolute; left:16px; right:68px; top:60px; z-index:10;/.test(k)) return k.replace('left:16px; right:68px; top:60px;',`left:${P+12}px; right:124px; top:60px;`).replace('<span style="font-size:13.5px; font-weight:var(--fw-semibold);">Tap to add corners · drag to move</span>','<span style="font-size:13.5px; font-weight:var(--fw-semibold); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Tap to add corners · drag to move</span>');
        if(/^<div style="position:absolute; right:12px; top:116px; z-index:10; display:flex; flex-direction:column; gap:12px;">\s*<x-import[^>]*label="Undo last corner"/.test(k)) return k.replace('right:12px; top:116px; z-index:10; display:flex; flex-direction:column; gap:12px;','right:12px; top:60px; z-index:10; display:flex; flex-direction:row; gap:12px;');
        if(/^<div class="daf-slb" style="position:absolute; left:12px;/.test(k)) return k.replace('left:12px;',`left:${P+12}px;`);
        if(/^<div style="position:absolute; (right|left):12px; top:60px; z-index:10;"><x-import component-from-global-scope="DesignSystem_c71fad\.IconButton" label="(Close|Back)"/.test(k)) return null;
      } else {
        if(/^<div style="position:absolute; top:\d+px; left:12px; right:12px; z-index:10;/.test(k)) return k.replace('left:12px; right:12px;',`left:${F.inset}px; width:${P-2*F.inset}px;`);
        if(/^<div style="position:absolute; left:12px; right:12px; bottom:\d+px; z-index:10;/.test(k)) return k.replace(/left:12px; right:12px; bottom:\d+px;/,`left:${F.inset}px; width:${P-2*F.inset}px; bottom:28px;`);
      }
      return k;
    }).filter(Boolean);
    out.push(...ctrls);
    if(panelHtml) out.push(panelHtml);
    out.push(...extra);
  }
  return frameOpen(F,false)+'\n          '+ROOT+ind+out.join(ind)+'\n          </div>\n        '+frameClose();
}
function chip(href,label,on){
  return on?`<span style="font-family:var(--font-mono); font-size:11px; letter-spacing:0.04em; font-weight:600; color:var(--surface-card); background:var(--text-primary); padding:5px 11px; border-radius:var(--radius-pill); white-space:nowrap;">${label}</span>`
           :`<a href="${href}" style="font-family:var(--font-mono); font-size:11px; letter-spacing:0.04em; text-decoration:none; color:var(--text-secondary); padding:5px 11px; border-radius:var(--radius-pill); white-space:nowrap;">${label}</a>`;
}
function switcher(page,active,auto=true){
  return `<span style="${auto?'margin-left:auto; ':''}display:inline-flex; align-items:center; gap:2px; padding:2px; background:var(--surface-card); border:1px solid var(--border); border-radius:var(--radius-pill);">${chip('Mobile'+page+'.dc.html','Phone',active==='Mobile')}${chip('Fold'+page+'.dc.html','Foldable',active==='Fold')}${chip('Tablet'+page+'.dc.html','Tablet',active==='Tablet')}</span>`;
}
function convertFile(src,page,F){
  const ctx={warn:[],steps:null};
  const sm=src.match(/<div class="daf-steps"[\s\S]*?<\/sc-for>\s*<\/div>/); if(sm) ctx.steps=sm[0];
  let n=0;
  let s=src.replace(/^        <x-import component="IOSDevice"([^>]*)>\n([\s\S]*?)\n        <\/x-import>/gm,(m,a,inner)=>{ n++; return transformBlock(a,inner,page,F,ctx)||m; });
  ctx.count=n;
  s=s.replace(/— Mobile/g,'— '+F.label);
  s=s.replace(/Mobile · /g,F.label+' · ');
  s=s.replace(/href="Mobile(\w+)\.dc\.html"/g,(m,p)=>`href="${F.key}${p}.dc.html"`);
  s=s.replace(/<span style="margin-left:auto; display:inline-flex; align-items:center; gap:2px; padding:2px;.*?<\/span><\/span>/m,()=>switcher(page,F.key));
  // the Areas gallery has no device switcher of its own: slot one in ahead of the moderator link
  s=s.replace('<a href="Moderation.dc.html" style="margin-left:auto; ',()=>switcher(page,F.key)+'<a href="Moderation.dc.html" style="');
  s=s.replace(/>iOS · /g,()=>`>${F.label} · ${F.sub} · `);
  s=s.replace(/ · iOS</g,()=>` · ${F.label}<`);
  s=s.replace(/max-width:1500px; margin:0 auto;/,()=>`max-width:${F.maxW}px; margin:0 auto;`);
  s=s.replace(/&quot;\$preview&quot;:\{&quot;width&quot;:\d+,&quot;height&quot;:\d+\}/,()=>`&quot;$preview&quot;:{&quot;width&quot;:${F.pw},&quot;height&quot;:${F.ph}}`);
  s=s.replace('— drag the sheet for steps','— steps stay open in the left pane');
  // Hotlist is a top-level drawer destination shown as a pane with no search bar: give its header the one menu button
  s=s.replace(/(<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:14px;">\s*)<div style="min-width:0;">(\s*<div style="[^"]*">Hotlist<\/div>)/,(m,a,b)=>a+IBTN('Open menu','menu')+'<div style="flex:1; min-width:0;">'+b);
  // the press-and-hold hint pill must stay on one line
  s=s.split('<span style="display:inline-flex; align-items:center; gap:7px; margin-top:16px; padding:7px 12px;').join('<span style="display:inline-flex; align-items:center; gap:7px; margin-top:16px; padding:7px 12px; white-space:nowrap;');
  // tabular captions that must not wrap in the slightly narrower pane
  s=s.split('<span style="font-family:var(--font-mono); font-size:var(--fs-caption); color:var(--text-tertiary);">').join('<span style="font-family:var(--font-mono); font-size:var(--fs-caption); color:var(--text-tertiary); white-space:nowrap;">');
  return {s,ctx};
}
function convertIndex(src,F){
  let s=src.replace(/href="Mobile(\w+)\.dc\.html"/g,(m,p)=>`href="${F.key}${p}.dc.html"`);
  s=s.replace('— Mobile</span>',()=>'— '+F.label+'</span>');
  s=s.replace(/· iOS</g,()=>'· '+F.label+'<');
  s=s.replace(/<p style="font-size:15px; color:var\(--text-secondary\); margin:0 0 18px; max-width:70ch;">[^<]*<\/p>/,()=>`<p style="font-size:15px; color:var(--text-secondary); margin:0 0 18px; max-width:70ch;">${F.blurb}</p>`);
  s=s.replace(/<span style="display:inline-flex; align-items:center; gap:2px; padding:2px;.*?<\/span><\/span>/,()=>switcher('App',F.key,false));
  s=s.replace('page name="Mobile app screens"',()=>`page name="${F.label} app screens"`);
  s=s.replace(/Screens keep their original numbering \(01–23\) across the split pages\./,()=>`Same screens and numbering as the phone set, re-laid for a ${F.sub} display.`);
  return s;
}
const report=[];
for(const F of FORMS){
  for(const page of PAGES){
    const src=await readFile(`Mobile${page}.dc.html`);
    const {s,ctx}=convertFile(src,page,F);
    await saveFile(`${F.key}${page}.dc.html`,s);
    report.push(`${F.key}${page}: ${ctx.count} screens, ${ctx.sheets||0} sheets→panes; warn=${ctx.warn.join(' | ')||'none'}`);
  }
  const idx=await readFile('MobileApp.dc.html');
  await saveFile(`${F.key}App.dc.html`,convertIndex(idx,F));
}
log(report.join('\n'));
