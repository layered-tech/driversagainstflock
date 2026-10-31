/* Claude Design (Omelette) page shim for a migrated project: the first script of every migrated page, which is a same-origin
 * document framed (directly or through another project page) by the shell, index.html. It stands in for the bridge Omelette
 * injected at serve time (omelette repo packages/embedded/bridge.ts) and for the looser sandbox Omelette granted
 * (allow-modals, allow-downloads, allow-popups). Every API mirrors what Omelette itself does when no host answers; where a
 * Frame capability can back it (sample, downloads) the call is routed to the shell's runtime; nothing here throws.
 * README.md "What the shim provides" is the table of behaviours. Safe to load twice and before the DOM exists. */
(function () {
  /* Frame splices <base href="/_f/{ver}/"> into served pages for some orgs; this page's relative references must resolve from its own folder */
  var unbase = function () { try { var b = document.querySelectorAll('base[href]'); for (var i = 0; i < b.length; i += 1) if (/^\/_f\/[^/]+\/$/.test(b[i].getAttribute('href') || '')) b[i].remove(); } catch (e) {} };
  unbase();
  if (window.__omeletteShim) return;
  document.addEventListener('DOMContentLoaded', unbase);
  window.__omeletteShim = 1;

  /* @babel/standalone 7 gives a script that names no plugins three of its own. Its object rest plugin puts a top-level `const _excluded` in the script, and a later script that declares that name too stops (GAPS.md "Babel scripts").
   * Naming any plugin drops all three, so a script whose presets are all ones that keep that const is given the names of the other two. On document, not window: document hears DOMContentLoaded first, and Babel listens on window. */
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var plugins = window.Babel && /^7\./.test(window.Babel.version) && window.Babel.availablePlugins; /* Babel 8 gives a script no plugins of its own, and Babel 6 cannot parse object rest without its plugin */
      if (!plugins) return;
      /* only what this Babel has, because it stops a script that names a plugin it lacks. Before Babel 7.22 the class properties plugin was called proposal-class-properties */
      var kept = [plugins['transform-class-properties'] ? 'transform-class-properties' : 'proposal-class-properties', 'transform-flow-strip-types'].filter(function (p) { return plugins[p]; }).join(',');
      var plain = function (preset) { return /^(react|flow|typescript|es2016|es2017|)$/.test(preset.trim()); };
      for (var s = document.querySelectorAll('script[data-presets]:not([data-plugins])'), i = 0; kept && i < s.length; i += 1) {
        /* type and presets are read as Babel reads them. Any other preset spares the script: env and es2015 turn the const into a var, es2015's transforms need the object rest plugin, and a preset the page registered may hold them */
        if (/^text\/(babel|jsx)$/.test(s[i].type.split(';')[0]) && s[i].getAttribute('data-presets').split(',').every(plain)) s[i].setAttribute('data-plugins', kept);
      }
    } catch (e) {}
  });

  var said = {};
  var info = function (key, msg) { if (said[key]) return; said[key] = 1; try { console.info('[claude design shim] ' + msg); } catch (e) {} };
  var fail = function (message, code) { var err = new Error(message); err.code = code || 'unavailable'; err.__omShim = 1; return err; };
  /* an await nobody catches stays quiet: our own rejections become one console.info instead of an "Uncaught (in promise)" */
  window.addEventListener('unhandledrejection', function (e) { try { if (e.reason && e.reason.__omShim) { e.preventDefault(); info('rej:' + e.reason.message, e.reason.message); } } catch (err) {} });

  /* ── page iframes: Frame serves a project's own .html inert (no script) when a page frames it by URL; route same-origin
   * page iframes through the type's runner, as the canvas did for this page, so they boot the same way: the shim first, and
   * the type's React + dc-runtime (in Omelette mode) where the page names its own ./support.js ── */
  var shimSrc = document.currentScript && document.currentScript.src, runner = null, typeDir = null;
  var opaqueHere = window.origin === 'null'; /* true at an opaque origin, as in Frame's thumbnail renderer; read once, before any script of the page can replace window.origin */
  var editor = window.__omEditor === 1; /* set by the Migrated Design editor ahead of this script (src/compat/runner.ts buildCompatDoc): its bridge follows and owns link clicks */
  try { if (shimSrc) { runner = new URL('run.html', shimSrc); typeDir = new URL('.', shimSrc); typeDir = typeDir.origin === location.origin ? typeDir.pathname : typeDir.href; } } catch (e) { runner = typeDir = null; }
  /* ds/runner-mode.ts docModeOf, its identifier list and RUNNER_PAGE_OF restated, because this file cannot import: which copy of the runner page gives a framed
   * page the rendering mode (quirks, limited-quirks, no-quirks) its own text has at its own address. omelette.test.ts holds the two equal, identifier by identifier. */
  var RUNNER_PAGES = ['run.html', 'run-limited.html', 'run-quirks.html'], LIMITED_QUIRKS_IDS = ['-//w3c//dtd xhtml 1.0 frameset//', '-//w3c//dtd xhtml 1.0 transitional//', '-//w3c//dtd html 4.01 frameset//', '-//w3c//dtd html 4.01 transitional//'];
  var isQuirks = function (d) { return !d.doctype || d.compatMode === 'BackCompat'; };
  var runnerPageOf = function (text) {
    try {
      var d = new DOMParser().parseFromString(text.slice(0, 8192), 'text/html'), id, i;
      if (isQuirks(d) && text.length > 8192) d = new DOMParser().parseFromString(text, 'text/html');
      if (isQuirks(d)) return RUNNER_PAGES[2];
      id = ((d.doctype && d.doctype.publicId) || '').toLowerCase();
      for (i = 0; i < LIMITED_QUIRKS_IDS.length; i += 1) if (id.indexOf(LIMITED_QUIRKS_IDS[i]) === 0) return RUNNER_PAGES[1];
    } catch (e) {}
    return RUNNER_PAGES[0];
  };
  var isRunnerPath = function (pathname) { for (var i = 0; i < RUNNER_PAGES.length; i += 1) if (pathname === new URL(RUNNER_PAGES[i], runner).pathname) return true; return false; };
  var parkedDocs = {}, parkSeq = 0;
  if (!window.__designCompat) window.__designCompat = { take: function (token) { var p = parkedDocs[token]; delete parkedDocs[token]; return p; } };
  /* What a framed page boots on: the type's React pair and support.js from this shim's own folder (build.ts COMPAT_DIR), in
   * Omelette mode — what the canvas gave this page (src/compat/runner.ts buildCompatDoc) less the editor's bridge and font companions —
   * so every migrated page runs the one runtime a type release can update, never the copy pinned in the project at export. */
  var RUNTIME_MODE_OMELETTE = "window.__dcRuntimeMode = 'omelette';"; /* = preview.ts RUNTIME_MODE_OMELETTE, read once by dc-runtime at boot */
  var runtimeStack = runner === null ? '' : ['<script>' + RUNTIME_MODE_OMELETTE + '<\/script>'].concat(['react.production.min.js', 'react-dom.production.min.js', 'support.js'].map(function (f) { return '<script src="' + typeDir + f + '"><\/script>'; })).join('\n');
  var ATTR = /([^\s"'=<>\/\x60]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  var decodeEntities = function (s) { /* the five named references and numeric ones (preview.ts decodeEntities) */
    return s.replace(/&(amp|lt|gt|quot|apos|#[0-9]{1,7}|#x[0-9a-f]{1,6});/gi, function (m, e) {
      var cp = e.charAt(0) !== '#' ? -1 : e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp < 0 ? ENTITY[e.toLowerCase()] || m : cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    });
  };
  var attrOf = function (tag, name) { /* one attribute of an open tag, by walking its attribute list (preview.ts attrOf) */
    var s = tag.search(/[\s\/>]/), m = null;
    if (s < 0) return null;
    for (ATTR.lastIndex = s; (m = ATTR.exec(tag)); ) if (m[1].toLowerCase() === name) return decodeEntities(m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '');
    return null;
  };
  var selfClosed = false; /* set by tagEnd: the tag ended '/>' with the '/' outside any attribute value */
  var tagEnd = function (s, j) { /* just past the '>' closing an open tag whose attributes start at j, or -1: a '>' inside a quoted value does not close (preview.ts tagEnd) */
    selfClosed = false;
    for (var n = s.length, c = ''; j < n; ) {
      c = s.charAt(j);
      if (c === '>') return j + 1;
      selfClosed = c === '/';
      if (c !== '=') { j += 1; continue; }
      selfClosed = false;
      for (j += 1; j < n && s.charCodeAt(j) <= 32; ) j += 1;
      c = s.charAt(j);
      if (c === '"' || c === "'") { j = s.indexOf(c, j + 1); if (j < 0) return -1; j += 1; }
      else while (j < n && s.charCodeAt(j) > 32 && s.charAt(j) !== '>') j += 1;
    }
    return -1;
  };
  /* The page with `stack` where its first real <script src="./support.js"></script> was (the src exactly "support.js",
   * "./support.js" or "/support.js" once read as an address, its close within the next 64 characters); with none of those and a
   * `pagePath`, where its first tag that namesProjectRuntime accepts was; else at <head> start, else in a head of its own: the rule
   * the canvas applies to a migrated project's page (preview.ts placeRuntime; omelette.test.ts holds the two to the same answers).
   * One walk in document order, as the HTML tokenizer walks — over comments, declarations, other tags' quoted attributes and
   * raw-text bodies (outside <svg>/<math>, where no element is raw text) — so markup written inside a string, a comment or
   * a srcdoc attribute is never taken for the tag. */
  var RAW_TEXT = /^(script|style|textarea|title|xmp|iframe|noembed|noframes|noscript)$/, COMMENT_CLOSE = /--!?>/g;
  var isRuntimeSrc = function (src) { return src !== null && /^(?:\.\/|\/)?support\.js$/.test(src.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '')); }; /* the value as the URL parser reads it: tab/LF/CR dropped, C0/space trimmed (preview.ts isRuntimeSrc) */
  /* compat/runtime-tag.ts restated, because this file cannot import: a script tag also counts as the page's runtime tag when its src, resolved from the page's folder,
   * names a support.js inside the project, and no <base href> comes before it. runtime-tag.test.ts asks every row of both copies. */
  var namesProjectRuntime = function (pagePath, src) {
    var parents = ['a', 'b'], i = 0, root = '', u = null;
    for (i = 0; i < parents.length; i += 1) {
      root = 'https://project.invalid/' + parents[i] + '/project/';
      try { u = new URL(src, root + pagePath.split('/').map(encodeURIComponent).join('/')); } catch (e) { return false; }
      if (u.href.indexOf(root) !== 0 || u.search !== '' || u.hash !== '' || !/(?:^|\/)support\.js$/.test(u.href.slice(root.length))) return false;
    }
    return true;
  };
  var projectPathOf = function (u) { /* a page's path inside the project, or null: the project's files sit in project/ beside the type's folder (host/store-layout.ts INSTANCE_FILE_PREFIX) */
    try {
      var root = new URL('../../project/', runner);
      return u.origin === root.origin && u.pathname.indexOf(root.pathname) === 0 ? u.pathname.slice(root.pathname.length) : null;
    } catch (e) { return null; }
  };
  var BREAKOUT = /^(b|big|blockquote|body|br|center|code|dd|div|dl|dt|em|embed|h[1-6]|head|hr|i|img|li|listing|menu|meta|nobr|ol|p|pre|ruby|s|small|span|strong|strike|sub|sup|table|tt|u|ul|var|font)$/; /* start tags that end foreign content */
  var commentEnd = function (html, lt) { /* just past the comment opened at lt: '-->' or '--!>' closes it; '<!-->' and '<!--->' close at once */
    var m = null;
    if (html.charAt(lt + 4) === '>') return lt + 5;
    if (html.substr(lt + 4, 2) === '->') return lt + 6;
    COMMENT_CLOSE.lastIndex = lt + 4;
    return (m = COMMENT_CLOSE.exec(html)) ? m.index + m[0].length : html.length;
  };
  var closeAfter = function (html, p) { /* just past the '</script>' that follows p within 64 characters, only whitespace and comments between, or -1 */
    for (var end = p + 64, m = null; p < end; ) {
      if (html.substr(p, 4) === '<!--') { p = commentEnd(html, p); continue; }
      if (/\s/.test(html.charAt(p))) { p += 1; continue; }
      return (m = /^<\/script\s*>/i.exec(html.slice(p, end))) ? p + m[0].length : -1;
    }
    return -1;
  };
  /* ASCII A to Z only, as the HTML tokenizer folds tag names ('İ'.toLowerCase() is 'i' and a dot). Tags are read in place: folding a copy of the page first costs most of a second on 17 MiB of base64 */
  var low = function (ch) { return ch >= 'A' && ch <= 'Z' ? String.fromCharCode(ch.charCodeAt(0) + 32) : ch; };
  var placeRuntime = function (html, stack, pagePath) {
    var n = html.length, i = 0, head = -1, at = -1, to = -1, altAt = -1, altTo = -1, svg = 0, math = 0, based = false, src = null, byPath = false;
    while (at < 0) {
      var lt = html.indexOf('<', i), c = low(html.charAt(lt + 1)), closing = c === '/' && /[A-Za-z]/.test(html.charAt(lt + 2)), a = 0, e = 0, name = '', m = null, close = null;
      if (lt < 0) break;
      if (html.substr(lt, 4) === '<!--') { i = commentEnd(html, lt); continue; }
      if (c === '!' || c === '?') { e = html.indexOf('>', lt + 2); if (e < 0) break; i = e + 1; continue; } /* <!doctype>, <![CDATA[, <?xml: to the first '>' */
      if (!closing && !/[a-z]/.test(c)) { i = lt + 1; continue; } /* a bare '<' in text */
      for (a = e = lt + (closing ? 2 : 1); e < n && /[A-Za-z0-9-]/.test(html.charAt(e)); ) e += 1;
      name = html.slice(a, e).toLowerCase();
      i = tagEnd(html, e);
      if (i < 0) break;
      if (name === 'svg' && (closing || !selfClosed)) svg = Math.max(0, svg + (closing ? -1 : 1));
      else if (name === 'math' && (closing || !selfClosed)) math = Math.max(0, math + (closing ? -1 : 1));
      else if (!closing && svg + math > 0 && BREAKOUT.test(name)) svg = math = 0;
      if (!closing && name === 'base' && attrOf(html.slice(lt, i), 'href') !== null) based = true;
      if (!closing && name === 'script') { /* the page's runtime tag, if its close follows; one by path only stands by (altAt) while the walk looks for one by spelling */
        src = attrOf(html.slice(lt, i), 'src');
        byPath = !isRuntimeSrc(src) && src !== null && typeof pagePath === 'string' && altAt < 0 && !based && namesProjectRuntime(pagePath, src);
        if (isRuntimeSrc(src) || byPath) m = lt;
      }
      if (closing || svg + math > 0 || !RAW_TEXT.test(name)) { /* an ordinary tag: nothing to skip */
        if (!closing && name === 'head' && head < 0) head = i;
        if (m !== null && (to = closeAfter(html, i)) >= 0) { if (byPath) { altAt = lt; altTo = to; } else at = lt; }
        continue;
      }
      for (close = new RegExp('</' + name, 'gi'), e = i; ; e += 2) { close.lastIndex = e; e = close.test(html) ? close.lastIndex - 2 - name.length : -1; if (e < 0) { e = n; break; } if (/^[\t-\r \/>]?$/.test(html.charAt(e + 2 + name.length))) break; } /* a raw-text body runs to '</name' + whitespace, '/' or '>'; no u flag, as scanAllTags in host/preview.ts */
      if (m !== null && (m = /^<\/script\s*>/i.exec(html.slice(e, i + 64)))) { if (byPath) { altAt = lt; altTo = e + m[0].length; } else { at = lt; to = e + m[0].length; } }
      i = e;
    }
    if (at < 0 && altAt >= 0) { at = altAt; to = altTo; }
    if (at >= 0) return html.slice(0, at) + stack + html.slice(to);
    if (head >= 0) return html.slice(0, head) + '\n' + stack + html.slice(head);
    return '<!doctype html><html><head>' + stack + '</head><body>' + html + '</body></html>';
  };
  var pageOf = function (el) { /* the project page an iframe names, or null: srcdoc, sandboxed-without-script, cross-origin and non-page frames load as they are */
    var sb = el.getAttribute('sandbox'), u = null;
    if (!runner || el.hasAttribute('srcdoc') || !el.getAttribute('src') || (sb !== null && !(/allow-scripts/.test(sb) && /allow-same-origin/.test(sb)))) return null;
    try { u = new URL(el.getAttribute('src'), document.baseURI); } catch (e) { return null; }
    if (u.origin !== location.origin || isRunnerPath(u.pathname) || !/\.html?$|\/$/i.test(u.pathname)) return null;
    /* keep the browser's one-level self-framing limit, which the runner's URL would otherwise hide */
    for (var w = window, seen = 0; w; w = w.parent !== w ? w.parent : null) { try { if (w.location.pathname === u.pathname && ++seen > 1) return null; } catch (e) { break; } }
    return u;
  };
  var reroute = function (el) {
    var gen = el.__omGen = (el.__omGen || 0) + 1, u = pageOf(el); /* any src change retires an earlier page fetch still in flight */
    /* at an opaque origin the runner page, framed here, could not take its document from this window: the frame is left to load its own src */
    if (!u || opaqueHere) return;
    fetch(u.href, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw fail('HTTP ' + r.status); return r.text(); }).then(function (html) {
      if (el.__omGen !== gen || !el.contentWindow) return;
      var raw = html.replace(/<!-- frame-runtime -->[\s\S]*?<!-- \/frame-runtime -->/, '');
      html = placeRuntime(raw, runtimeStack, projectPathOf(u));
      var tag = '<script src="' + shimSrc + '"><\/script>', m = /^\s*<!doctype[^>]*>/i.exec(html), token = 'p' + String(++parkSeq);
      delete parkedDocs[el.__omParked];
      el.__omParked = token;
      parkedDocs[token] = { url: u.pathname + u.search + u.hash, html: m ? html.slice(0, m[0].length) + tag + html.slice(m[0].length) : tag + html, source: raw };
      /* not el.src: no history entry, and the author's src stays on the element so a re-inserted frame is routed afresh */
      el.contentWindow.location.replace(new URL(runnerPageOf(raw), runner).href + '#' + token);
    }).then(null, function (e) { info('ifr:' + u.pathname, 'framed page left as served (' + String((e && e.message) || e) + '): ' + u.pathname); });
  };
  if (runner && typeof MutationObserver === 'function') {
    new MutationObserver(function (recs) {
      var seen = [], visit = function (n) { if (n && n.nodeType === 1 && n.localName === 'iframe' && seen.indexOf(n) < 0) { seen.push(n); reroute(n); } };
      for (var i = 0; i < recs.length; i += 1) {
        if (recs[i].type === 'attributes') { visit(recs[i].target); continue; }
        for (var j = 0, add = recs[i].addedNodes; j < add.length; j += 1) {
          visit(add[j]);
          if (add[j].nodeType === 1 && add[j].querySelectorAll) for (var k = 0, q = add[j].querySelectorAll('iframe'); k < q.length; k += 1) visit(q[k]);
        }
      }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcdoc', 'sandbox'] });
    try { for (var fi = 0, fq = document.querySelectorAll('iframe'); fi < fq.length; fi += 1) reroute(fq[fi]); } catch (e) {}
  }

  /* the artifact document = the topmost same-origin ancestor whose runtime answers claude.use (above it: the viewer, another origin) */
  var host = null, preview = false; /* preview: this window, or a same-origin window above it, holds the file browser's preview of a page (src/compat/runner.ts buildCompatDoc sets the flag ahead of this script) */
  for (var w = window; ; ) {
    try { if (w.claude && typeof w.claude.use === 'function') host = w; } catch (e) {}
    try { if (w.__omPreview === 1) preview = true; } catch (e) {}
    var up = null;
    try { up = w.parent !== w && w.parent.document ? w.parent : null; } catch (e) { up = null; }
    if (!up) break;
    w = up;
  }
  /* under a viewer (something frames the artifact document) the sandbox refuses dialogs, downloads and popups, so they get
   * stand-ins below; served top-level they work natively and are left alone */
  var framed = true, topDoc = host || w;
  try { framed = topDoc.parent !== topDoc; } catch (e) {}
  var use = function (name) { try { return Promise.resolve(host ? host.claude.use(name) : null).then(function (ns) { return ns && ns.available !== false ? ns : null; }, function () { return null; }); } catch (e) { return Promise.resolve(null); } };

  /* ── window.claude.complete(promptOrBody) → answer text, served by the shell's sample capability ── */
  var blockText = function (c) {
    if (typeof c === 'string') return c;
    if (!Array.isArray(c)) return String(c == null ? '' : c);
    return c.map(function (b) { return b && typeof b === 'object' && typeof b.text === 'string' ? b.text : typeof b === 'string' ? b : ''; }).join('');
  };
  /* the shell's runtime type-checks options and tools against ITS realm's Object.prototype, so they cross as null-prototype
   * objects and the schema as the shell's own JSON */
  var bare = function (props) { var o = Object.create(null); for (var k in props) if (props[k] !== undefined) o[k] = props[k]; return o; };
  var serialise = function (v) { try { return JSON.stringify(v); } catch (e) { return JSON.stringify(String(v)); } };
  var asTool = function (t) { /* results go back as bridge.ts sent them: a string as is, anything else as JSON text; no handler is an error */
    var name = String(t && t.name), run = t && typeof t.run === 'function' ? t.run : function () { throw new Error('no handler for tool "' + name + '"'); }, schema;
    try { schema = t && t.input_schema ? ((host && host.JSON) || JSON).parse(JSON.stringify(t.input_schema)) : undefined; } catch (e) {}
    return bare({ name: name, description: String((t && t.description) || name), inputSchema: schema, execute: function (input, ctx) {
      return new Promise(function (resolve) { resolve(run(input, ctx)); }).then(function (out) { return typeof out === 'string' ? out : serialise(out) || ''; });
    } });
  };
  var toSample = function (body) {
    var options = bare({ modelTier: body && typeof body.model === 'string' && /sonnet|opus/i.test(body.model) ? 'default' : 'quick' }); /* Omelette's default model is Haiku */
    if (typeof body === 'string') { options.cache = false; return { input: body, options: options }; }
    if (body === null || typeof body !== 'object' || !Array.isArray(body.messages)) throw fail('claude.complete: pass a prompt string or {messages: [...]}', 'invalid_request');
    var turns = body.messages.map(function (m) { return { role: m && m.role === 'assistant' ? 'assistant' : 'user', content: blockText(m && m.content) }; })
      .filter(function (t) { return t.content.trim() !== ''; }); /* image-only or tool blocks carry no text sample could take */
    if (body.system) { /* sample has no system prompt: it leads the first user turn */
      if (turns[0] && turns[0].role === 'user') turns[0].content = blockText(body.system) + '\n\n' + turns[0].content;
      else turns.unshift({ role: 'user', content: blockText(body.system) });
    }
    if (Array.isArray(body.tools) && body.tools.length) options.tools = body.tools.map(asTool);
    else options.cache = false; /* Omelette never replayed an earlier answer */
    return { input: turns, options: options };
  };
  /* A call still open when its page is put away would run to its end on the viewer's usage, holding one of the view's places in Frame's queue.
   * One controller serves all of this page's calls: it is aborted only as the page goes for good, and no call is made after that.
   * It is made with the editor's window's AbortController, because the runtime refuses a signal from any other window. */
  var calls = null;
  var putAway = function (e) { if (!e.persisted) calls.abort(); };
  var complete = function (promptOrBody) {
    if (preview) return Promise.reject(fail('claude.complete: Claude is not available in the file browser\'s preview of a page; open the page to call Claude', 'unavailable')); /* nobody opened this page, so the shim makes no call for it */
    if (!calls && host && typeof host.AbortController === 'function') calls = new host.AbortController();
    if (calls) window.addEventListener('pagehide', putAway); /* at each call: document.open() drops a window's listeners, and adding one twice does nothing */
    return use('sample').then(function (sample) {
      if (typeof sample !== 'function') throw fail('claude.complete: Claude is not available in this view (the artifact needs the sample capability, inside a Claude viewer)', 'unavailable');
      if (calls && calls.signal.aborted) throw fail('claude.complete: the page closed or reloaded before the call was made', 'cancelled');
      var req = toSample(promptOrBody);
      if (calls) req.options.signal = calls.signal;
      return Promise.resolve(sample(req.input, req.options)).then(
        function (r) { return r && typeof r.text === 'string' ? r.text : String(r); },
        function (e) { throw fail('claude.complete: ' + String((e && e.message) || e), e && e.code); });
    });
  };
  var claude = window.claude && typeof window.claude === 'object' ? window.claude : (window.claude = {});
  try { if (typeof claude.complete !== 'function') Object.defineProperty(claude, 'complete', { value: complete, configurable: true, writable: true }); } catch (e) {}

  /* ── window.omelette.writeFile / answer: a state file is posted to the editor in Omelette's own __om_file message and saved into the project
   * (host/PageStateFiles.tsx answers it); with no editor it is kept in memory. data/<name>.json is kept in this viewer's browser ── */
  var FILE_MAX = 2 * 1024 * 1024, FILE_KEY = 'omelette.file:', FILE_TIMEOUT_MS = 15000, BY_HAND_MS = 10000, mem = {}, seen = {}, reads = {}, sending = {}, asked = {}, askSeq = 0, askBase = 'f' + Math.random().toString(36).slice(2) + '-'; /* askBase: an answer meant for the document this frame held before is not taken for one of ours */
  var STATE_NAME = /^\.?[\w-]+\.state\.json$/; /* copy of host/page-state-files.ts STATE_FILE_NAME: a bare name, saved beside this page */
  /* the sidecar's key: its URL with the version segment folded, so a republish (new /_f/{ver}/) keeps reading what this viewer wrote */
  var fileUrl = function (path) { try { var u = new URL(String(path), document.baseURI); u.hash = ''; u.search = ''; u.pathname = u.pathname.replace(/^\/_f\/[^/]+\//, '/_f/-/'); return u.origin === location.origin ? u.href : null; } catch (e) { return null; } };
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var pathOf = function (url) { try { return new URL(url).pathname; } catch (e) { return ''; } };
  var dataUrl = function (url) { return /\/data\/[^/]+\.json$/.test(pathOf(url)); };
  /* read side of the same allowlist, on the folded URL: …/<name>.state.json anywhere, or …/data/<name>.json */
  var sidecarUrl = function (url) { return dataUrl(url) || /\/[^/]+\.state\.json$/.test(pathOf(url)); };
  var stateBeside = function (url) { /* the name of a state file beside this page, else null */
    try { var cut = url.lastIndexOf('/') + 1, name = decodeURIComponent(url.slice(cut)); return url.slice(0, cut) === fileUrl('./') && STATE_NAME.test(name) ? name : null; } catch (e) { return null; }
  };
  var readStored = function (url) { if (has(mem, url)) return mem[url]; if (!dataUrl(url) || stateBeside(url)) return undefined; try { var v = window.localStorage.getItem(FILE_KEY + url); return v == null ? undefined : v; } catch (e) { return undefined; } };
  var allowedPath = function (path) { return typeof path === 'string' && (STATE_NAME.test(path) || (/^(\.\/)?data\/[^/]+\.json$/.test(path) && path.indexOf('..') < 0)); };
  /* when the person last touched this page: the editor rations the saves of a page that writes with nobody touching it */
  var nowMs = Date.now, touchedAt = -Infinity, touched = function () { touchedAt = nowMs(); };
  ['pointerdown', 'pointerup', 'keydown', 'drop', 'input', 'change'].forEach(function (t) { window.addEventListener(t, touched, true); });
  /* Resolves with the editor's answer, or null if nobody answers in FILE_TIMEOUT_MS; rejects with its refusal. Omelette's bridge gave a write 3 s: here an answer that comes too late leaves the frame an old mark, and its next write is refused.
   * seen[url]: the editor's mark for what this frame last read or wrote of the file. It goes back with each write, and the editor takes no write made without sight of what the file holds. */
  var askEditor = function (url, msg) {
    /* a read starts afresh: the old mark goes, and no answer to anything asked before it brings one back */
    if (msg.op === 'read') { delete seen[url]; reads[url] = (reads[url] || 0) + 1; }
    var nth = reads[url];
    return new Promise(function (resolve, reject) {
      var id = askBase + (askSeq += 1), drop = function () { clearTimeout(asked[id].t); delete asked[id]; };
      asked[id] = { resolve: resolve, reject: reject, drop: drop, t: setTimeout(function () { drop(); resolve(null); }, FILE_TIMEOUT_MS) };
      msg.__om_file = true; msg.id = id;
      try { window.parent.postMessage(msg, location.origin); } catch (e) { drop(); resolve(null); }
    }).then(function (d) { if (d && nth === reads[url]) seen[url] = d.seen; return d; });
  };
  var sendState = function (url, name, text, kept) { /* one write of a file at a time, so that each brings the mark the one before it was given */
    var byHand = nowMs() - touchedAt < BY_HAND_MS, go = function () { return askEditor(url, { op: 'write', path: name, content: text, byHand: byHand, kept: kept === true, seen: seen[url] }); };
    return (sending[url] = (sending[url] || Promise.resolve()).then(go, go));
  };
  window.addEventListener('message', function (e) {
    var d = e.data, p = d && d.__om_file_r === true && e.source === window.parent && e.origin === location.origin && has(asked, d.id) ? asked[d.id] : null;
    if (!p) return;
    p.drop();
    if (d.ok === true) p.resolve(d); else p.reject(fail(String(d.error || 'write failed'), d.error === 'content too large' ? 'too_large' : 'refused'));
  });
  /* TMP: remove once browsers that ran this shim's earlier version have handed over their localStorage copies. Returns the copy of a state file beside this page as { name, text }, else null */
  var keptCopy = function (url) {
    try { var name = stateBeside(url), text = name ? window.localStorage.getItem(FILE_KEY + url) : null; return text == null ? null : { name: name, text: text }; } catch (e) { return null; }
  };
  var writeFile = function (path, content) {
    return new Promise(function (resolve, reject) {
      var url = fileUrl(path), text = String(content);
      if (!allowedPath(path) || !url) return reject(fail('write failed: only <name>.state.json (letters, digits, _ or -, a dot in front allowed; no folder) and data/<name>.json can be written', 'refused'));
      var toEditor = editor && !opaqueHere && STATE_NAME.test(path); /* the editor measures what it is sent, and tells the person */
      if (!toEditor && text.length > FILE_MAX) return reject(fail('content too large', 'too_large'));
      if (toEditor) return resolve(sendState(url, path, text).then(function () {}));
      mem[url] = text;
      if (STATE_NAME.test(path)) return resolve(); /* no editor here (a page framed in another page, a preview): kept in memory while the page is open */
      try { window.localStorage.setItem(FILE_KEY + url, text); } catch (e) { info('ls', 'sidecar kept in memory only (browser storage unavailable or full)'); }
      info('wf', 'omelette.writeFile: saved in this browser for this viewer; the published project is unchanged');
      resolve();
    });
  };
  var omelette = window.omelette && typeof window.omelette === 'object' ? window.omelette : (window.omelette = {});
  if (typeof omelette.writeFile !== 'function') omelette.writeFile = writeFile;
  if (typeof omelette.answer !== 'function') omelette.answer = function () { info('ans', 'omelette.answer: there is no Claude Design conversation to answer here'); return Promise.resolve(false); };
  /* ── a page that stays open: this frame keeps the version folder it was built at, while Frame moves the editor's address on with each save and stops serving older folders,
   * so a file first asked for late fails. The editor is told, in ordinary Design's own message (host/preview.ts ADDRESS_REFUSED), and builds the frame again where it is by then.
   * TODO(coworker, 2026-10): goes with the host's half (host/Artboard.tsx, the same message) ── */
  var VER = /\/_f\/([^/]+)\//; /* the first one in a path: the version folder (the emulator serves it under a prefix) */
  var verOf = function (pathname) { var m = VER.exec(pathname); return m ? m[1] : null; };
  var editorVer = function () { try { return editor && !opaqueHere ? verOf(window.parent.location.pathname) : null; } catch (e) { return null; } };
  var gone = function (status) { return status === 403 || status === 404 || status === 410 || status === 415; }; /* 415: Frame's answer under a dropped version for a name that is no web file's */
  var builtVer = verOf(location.pathname), toldRefused = {}, probed = {}, REFUSED_MAX = 30;
  /* An address of this origin under the folder this frame was built at, once the editor has left that folder; else null. Not any old folder: an address
   * that names one outright (kept by the page, pasted in) fails in the next frame too, and would have it built again for ever */
  var left = function (address) {
    try {
      var now = address ? editorVer() : null, u = now === null || now === builtVer ? null : new URL(String(address), document.baseURI);
      return u !== null && u.origin === location.origin && verOf(u.pathname) === builtVer ? u : null;
    } catch (e) { return null; }
  };
  var once = function (seen, u) { /* an address once for each version the editor comes to (what it could not mend at one it may at the next), and no more than REFUSED_MAX addresses */
    var now = u === null ? null : editorVer(), known = u !== null && has(seen, u.pathname);
    if (u === null || (known ? seen[u.pathname] === now : Object.keys(seen).length >= REFUSED_MAX)) return false;
    seen[u.pathname] = now;
    return true;
  };
  var refused = function (address) { /* the editor finds out whether the file loads from where it is now */
    var u = left(address);
    if (once(toldRefused, u)) try { window.parent.postMessage({ __dc_address_refused: 1, u: u.href }, location.origin); } catch (e) {}
  };
  if (editor && !opaqueHere) {
    /* an element's error names no cause (a picture that cannot be decoded raises one too), so the address is asked for again, with the browser's own fetch: a page may have put its own in place */
    window.addEventListener('error', function (ev) {
      var t = ev.target, el = t && t !== window && typeof t.getAttribute === 'function', a = el ? t.getAttribute('src') : null;
      if (el && a === null) a = t.getAttribute('href');
      /* an empty address is read by a browser as the page's own */
      var u = !el || a === '' || (a !== null && a.charAt(0) === '#') ? null : left(t.currentSrc || t.src || (t.href && t.href.baseVal !== undefined ? t.href.baseVal : t.href));
      if (once(probed, u)) try { (nativeFetch || window.fetch).call(window, u.href, { cache: 'no-store' }).then(function (r) { if (r.body) r.body.cancel(); if (gone(r.status)) refused(u.href); }, function () {}); } catch (e) {}
    }, true);
    /* what no element raises an error for: a picture or a face that only CSS names, import(). Not every engine gives the status (Safari's does not) */
    try { new window.PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (gone(e.responseStatus)) refused(e.name); }); }).observe({ type: 'resource' }); } catch (e) {}
  }

  /* ── window.omelette.storage: the bridge's KV over the project's data/storage.json as it behaves with no editor host — the
   * exported file is read once (whatever project stamped it); set/delete hold while this page is open and report not persisted ── */
  if (!omelette.storage || typeof omelette.storage !== 'object') {
    var STORE_REASON = 'not saved here \u2014 a migrated project keeps storage changes only while this page is open';
    var storeUrl = function (version) { /* the project root: the first folder under the version root this script is served from */
      try { var ver = new URL('../../', shimSrc).pathname, p = location.pathname, i = p.indexOf('/', ver.length); if (p.indexOf(ver) === 0 && i > 0) return location.origin + p.slice(0, i + 1).replace(VER, '/_f/' + (version || verOf(p)) + '/') + 'data/storage.json'; } catch (e) {}
      return 'data/storage.json';
    };
    var storeP = null;
    var loadStore = function () { /* → Map; a missing, unreadable or malformed file reads as empty, never as an error (nothing here writes it back) */
      /* at the editor's version by now, or an old folder's refusal would read as an empty store; then at this frame's own, since a version just taken up can be refused for a while */
      var ask = function (version) { return (window.fetch || fetch)(storeUrl(version), { credentials: 'same-origin', cache: 'no-store' }); };
      if (!storeP) storeP = Promise.resolve().then(function () { return ask(editorVer()); }).then(null, function () { return null; })
        .then(function (r) { return (r && r.ok) || !left(location.href) ? r : ask(null); })
        .then(function (r) { return r && r.ok ? r.text() : ''; })
        .then(null, function () { return ''; })
        .then(function (text) {
          var m = new Map(), j = null, k;
          try { j = text ? JSON.parse(text) : null; } catch (e) { info('st:json', 'omelette.storage: data/storage.json is not valid JSON; read as empty'); }
          if (!j || typeof j !== 'object' || Array.isArray(j)) return m;
          if (!('data' in j)) { for (k in j) if (Object.prototype.hasOwnProperty.call(j, k) && k !== '_meta') m.set(k, j[k]); return m; }
          if (j.data && typeof j.data === 'object' && !Array.isArray(j.data)) for (k in j.data) if (Object.prototype.hasOwnProperty.call(j.data, k)) m.set(k, j.data[k]);
          return m;
        });
      return storeP;
    };
    var copy = function (v) { return v == null ? null : JSON.parse(JSON.stringify(v)); };
    var keyErr = function (op) { return Promise.reject(new TypeError('storage.' + op + ': key must be a string')); };
    var notSaved = function () { info('st', 'omelette.storage: ' + STORE_REASON); return { persisted: false, noHost: true, reason: STORE_REASON }; };
    omelette.storage = {
      get: function (key) { return typeof key !== 'string' ? keyErr('get') : loadStore().then(function (m) { return m.has(key) ? copy(m.get(key)) : null; }); },
      set: function (key, value) {
        var snap;
        if (typeof key !== 'string') return keyErr('set');
        try { snap = JSON.stringify(value); } catch (e) {}
        if (snap === undefined) return Promise.reject(new TypeError('storage.set: value must be JSON-serializable'));
        return loadStore().then(function (m) { m.set(key, JSON.parse(snap)); return notSaved(); });
      },
      delete: function (key) { return typeof key !== 'string' ? keyErr('delete') : loadStore().then(function (m) { m.delete(key); return notSaved(); }); },
      keys: function () { return loadStore().then(function (m) { return Array.from(m.keys()); }); }
    };
  }
  /* a later fetch of a written sidecar reads what this viewer wrote (design_canvas, image-slot and data-overlay all read their sidecars with fetch) */
  if (typeof window.fetch === 'function' && !window.fetch.__omShim) {
    var nativeFetch = window.fetch;
    var ownUrl = typeof window.__omPageSource === 'string' ? fileUrl(location.href) : null; /* read once, at install: a page that later changes its own path (pushState) still gets its own text at this address, and the file at its new address from the network */
    var shimFetch = function (input, init) {
      try {
        var method = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';
        var url = String(method).toUpperCase() === 'GET' ? fileUrl(input && typeof input === 'object' && input.url ? input.url : input) : null;
        /* a GET of this page's own address is answered with the text the page was written from (run.html sets __omPageSource), not the
         * served file, which can be older: dc-runtime's boot re-reads location.href and adopts the answer as the page's template */
        if (url != null && url === ownUrl) return Promise.resolve(new Response(window.__omPageSource, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
        var json = function (text) { return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } }); };
        /* A state file beside this page is read through the editor: this frame's own address can be a version Frame no longer serves, and a page takes a failed read for "no file yet".
         * If the editor cannot say, the network answers, and with no mark the editor takes no write of the file from this frame. */
        var name = editor && !opaqueHere && url != null ? stateBeside(url) : null, /* at an opaque origin (Frame's thumbnail renderer) no message reaches the editor */ me = this, args = arguments, served = function () { return nativeFetch.apply(me, args); };
        if (name) return askEditor(url, { op: 'read', path: name }).then(function (d) {
          if (!d) return served();
          if (typeof d.content === 'string') return json(d.content);
          var none = new Response('', { status: 404 }), kept = keptCopy(url);
          /* TMP: remove with keptCopy. The copy has no timestamp, so it is offered as a save only where the project has no such file. Taken, it leaves this browser */
          return !kept ? none : sendState(url, name, kept.text, true).then(function (taken) {
            if (!taken) return none;
            try { window.localStorage.removeItem(FILE_KEY + url); } catch (e) {}
            return json(kept.text);
          }, function () { return none; });
        }, served);
        /* only a sidecar path (the writeFile allowlist) is ever answered from this viewer's storage */
        var hit = url == null || !sidecarUrl(url) ? undefined : readStored(url);
        if (hit !== undefined) return Promise.resolve(json(hit));
      } catch (e) {}
      var isRead = /^(GET|HEAD)$/i.test(method);
      return nativeFetch.apply(this, arguments).then(function (r) { if (isRead && gone(r.status)) refused(r.url); return r; });
    };
    shimFetch.__omShim = 1;
    window.fetch = shimFetch;
  }

  if (!framed) return;
  /* ── dialogs and print: the sandbox already drops the dialogs (confirm → false, prompt → null per the HTML spec); do the same without console noise. print() opens
   * nothing either, but acts as a print dialog that opened and closed ── */
  var toast = function (msg) {
    var go = function () {
      try {
        var tray = document.getElementById('__om-toasts');
        if (!tray) {
          tray = document.createElement('div');
          tray.id = '__om-toasts';
          tray.setAttribute('style', 'position:fixed;z-index:2147483647;left:50%;bottom:16px;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;align-items:center;max-width:min(92vw,480px);pointer-events:none');
          (document.body || document.documentElement).appendChild(tray);
        }
        var t = document.createElement('div');
        t.setAttribute('role', 'status');
        t.setAttribute('style', 'pointer-events:auto;cursor:pointer;box-sizing:border-box;max-width:100%;padding:10px 14px;border-radius:10px;background:rgba(31,31,30,.92);color:#fff;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.18);white-space:pre-wrap;word-break:break-word');
        t.textContent = String(msg).slice(0, 600);
        t.title = 'Dismiss';
        var gone = function () { if (t.parentNode) t.parentNode.removeChild(t); };
        t.onclick = gone;
        setTimeout(gone, 7000);
        tray.appendChild(t);
      } catch (e) {}
    };
    if (document.body || document.readyState !== 'loading') go(); else document.addEventListener('DOMContentLoaded', go);
  };
  window.alert = function (msg) { if (msg != null && String(msg) !== '') toast(msg); };
  window.confirm = function (msg) { info('confirm', 'confirm() cannot ask here; answered "Cancel" (false), as the artifact sandbox does — ' + String(msg == null ? '' : msg).slice(0, 80)); return false; };
  window.prompt = function () { info('prompt', 'prompt() cannot ask here; answered null, as the artifact sandbox does'); return null; };
  /* a print copy (what Claude Design's PDF export opens in a tab) forces every slide of a <deck-stage> visible and then calls print(); deck-stage
   * puts the current slide back on afterprint. No dialog can open here, so act as one that opened and closed — both events, in order — and such
   * a page ends where a browser tab leaves it rather than stuck on its last slide (Claude Design's own headless export dispatches beforeprint
   * itself for the same reason: omelette repo apps/web/src/pages/export/print-eval.ts). A print() called from one of those handlers is ignored,
   * as a browser ignores it while its print steps run. */
  var printing = false;
  window.print = function () {
    info('print', 'print() cannot open a print dialog inside an artifact; beforeprint and afterprint fire as for a dialog that opened and closed');
    if (printing) return;
    printing = true;
    var fire = function (type) { try { window.dispatchEvent(new Event(type)); } catch (e) {} };
    try { fire('beforeprint'); fire('afterprint'); } finally { printing = false; }
  };

  /* ── downloads: the sandbox has no allow-downloads; offer the file through the shell's downloads capability instead ── */
  var EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'text/plain': 'txt', 'text/csv': 'csv', 'text/html': 'html', 'text/markdown': 'md', 'application/json': 'json', 'application/pdf': 'pdf' };
  var blobs = {}, saves = Promise.resolve();
  var blocked = function () { try { window.parent.postMessage({ __frame_blocked: true, kind: 'download' }, location.origin); } catch (e) {} }; /* what Frame's runtime posts, so the viewer explains it */
  try {
    var create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = function (obj) { var u = create.apply(URL, arguments); try { if (obj instanceof Blob) blobs[u] = obj; } catch (e) {} return u; };
    URL.revokeObjectURL = function (u) { setTimeout(function () { delete blobs[u]; }, 0); return revoke.apply(URL, arguments); }; /* a same-tick revoke after click() still leaves us the bytes */
  } catch (e) {}
  /* data: is decoded here (connect-src 'self' refuses fetching it); blob: comes from the createObjectURL record; a project file is fetched */
  var pct = function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } }; /* the browser's own data: parser is this lenient about a stray % */
  var readUrl = function (href) {
    return new Promise(function (resolve) {
      if (blobs[href]) return resolve(blobs[href]);
      var m = /^data:([^,;]*)((?:;[^,]*)*),([\s\S]*)$/i.exec(href);
      if (!m) return resolve(window.fetch(href).then(function (r) { if (!r.ok) throw fail('HTTP ' + r.status); return r.blob(); }));
      var raw = /;base64/i.test(m[2]) ? atob(pct(m[3]).replace(/\s+/g, '')) : null, bytes = raw == null ? new TextEncoder().encode(pct(m[3])) : new Uint8Array(raw.length);
      if (raw != null) for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      resolve(new Blob([bytes], { type: m[1] || 'text/plain' }));
    });
  };
  var saveUrl = function (href, name) {
    Promise.all([readUrl(href), use('downloads')]).then(function (got) {
      var b = got[0], downloads = got[1], filename = String(name || '').trim(), type = (b.type || '').split(';')[0];
      if (!filename && !/^(blob|data):/.test(href)) try { filename = decodeURIComponent(new URL(href).pathname.split('/').pop() || ''); } catch (e) {}
      if (!filename) filename = 'download';
      if (!/\.[A-Za-z0-9]{1,8}$/.test(filename) && EXT[type]) filename += '.' + EXT[type];
      if (!downloads) { blocked(); info('dl-none:' + filename, 'download dropped: this artifact has no downloads capability here (' + filename + ')'); return null; }
      /* bytes as a typed array: the shell's runtime checks Blob against its own realm, which a Blob made in this page fails;
       * one offer at a time, since the viewer's prompt refuses a second undecided one */
      return b.arrayBuffer().then(function (ab) {
        saves = saves.then(function () { return downloads.save({ filename: filename, data: new Uint8Array(ab) }); })
          .then(null, function (e) { if (/unavailable|not_granted|capability_/.test(String(e && e.code))) blocked(); info('dl:' + (e && e.code) + ':' + filename, 'download not saved (' + String((e && e.code) || e) + '): ' + filename); });
        return saves;
      });
    }).then(null, function (e) { info('dl-read:' + href.slice(0, 40), 'download dropped: could not read ' + href.slice(0, 80) + ' (' + String((e && e.message) || e) + ')'); });
  };
  var anchorOf = function (e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    for (var i = 0; i < path.length; i += 1) if (path[i] && path[i].nodeType === 1 && /^a(rea)?$/.test(path[i].localName) && path[i].hasAttribute('href')) return path[i];
    return null;
  };
  var external = function (u) { return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== location.origin; };
  var projectRoot = typeof window.__omProjectRoot === 'string' ? window.__omProjectRoot : null; /* /_f/{ver}/project/, stamped by the editor's runner (src/compat/runner.ts buildCompatDoc) */
  var pageRel = function (u) { /* a same-origin .html other than this page, named by its project path (else relative to this page's folder); null otherwise */
    var dir = projectRoot !== null ? projectRoot : location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1), s;
    if (u.origin !== location.origin || !/\.html?$/i.test(u.pathname) || u.pathname === location.pathname || u.pathname.indexOf(dir) !== 0) return null;
    s = u.pathname.slice(dir.length);
    try { return decodeURIComponent(s); } catch (e) { return s; }
  };
  var onClick = function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.__omSeen) return;
    var a = anchorOf(e), u = null;
    if (!a) return;
    try { u = new URL(a.getAttribute('href'), document.baseURI); } catch (err) { return; }
    if (a.hasAttribute('download')) {
      if (external(u)) return; /* a cross-origin "download" only ever navigated; Frame's runtime hands it to the viewer */
      e.__omSeen = 1; /* one claim per event, even where realms share these prototypes (test DOMs) */
      /* under the editor its bridge cancels the click and reports the author's own preventDefault as defaultPrevented */
      if (editor && a.isConnected) { if (!a.isContentEditable) setTimeout(function () { if (!e.defaultPrevented) saveUrl(u.href, a.getAttribute('download')); }, 0); return; }
      /* claimed now (capture), so nothing further along retries a download the sandbox refuses; an author's own
       * preventDefault later in the dispatch still cancels the save */
      var vetoed = false, pd = e.preventDefault;
      try { e.preventDefault = function () { vetoed = true; return pd.call(e); }; } catch (err) {}
      pd.call(e);
      setTimeout(function () { if (!vetoed) saveUrl(u.href, a.getAttribute('download')); }, 0);
    }
  };
  window.addEventListener('click', onClick, true);
  /* _blank / _top / _parent / a named window, same origin: there is one window, so go there in it — decided after the author's own handlers */
  var frameNamed = function (name) { try { var els = document.querySelectorAll('iframe,frame'); for (var i = 0; i < els.length; i += 1) if (els[i].getAttribute('name') === name) return true; } catch (e) { return true; } return false; };
  window.addEventListener('click', function (e) {
    if (editor || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; /* the editor's bridge relays page links to its host */
    var a = anchorOf(e), href = a && (a.getAttribute('href') || '').trim(), u = null, base = null;
    try { base = document.querySelector('base[target]'); } catch (err) {}
    var target = String((a && a.getAttribute('target')) || (base && base.getAttribute('target')) || '').toLowerCase();
    if (!a || !href || href.charAt(0) === '#' || a.hasAttribute('download') || a.isContentEditable || target === '' || target === '_self') return;
    if (!/^_(blank|top|parent)$/.test(target) && frameNamed(target)) return; /* a name that is a live frame here loads there natively */
    try { u = new URL(href, document.baseURI); } catch (err) { return; }
    if (u.origin !== location.origin || !/\.html?$|\/$/i.test(u.pathname)) return; /* pages only; other files stay the browser's call */
    e.preventDefault();
    location.assign(u.href);
  });
  /* a detached <a download> (createElement → click(), FileSaver) has no path to window: meet it on the element. Wrapped on
   * HTMLElement / EventTarget, which Frame's own anchor patch still calls through, so load order does not matter. */
  var watch = function (el, type) {
    try { if (el instanceof HTMLAnchorElement && !el.isConnected && el.hasAttribute('download') && (type == null || type === 'click')) el.addEventListener('click', onClick, { once: true }); } catch (e) {}
  };
  try {
    var click = HTMLElement.prototype.click, dispatch = EventTarget.prototype.dispatchEvent;
    HTMLElement.prototype.click = function () { watch(this); return click.apply(this, arguments); };
    EventTarget.prototype.dispatchEvent = function (ev) { watch(this, ev && ev.type); return dispatch.apply(this, arguments); };
  } catch (e) {}

  /* ── windows: the native open first (orgs with allow-popups keep real popups); where the sandbox refuses, an external URL
   * goes to the viewer through the shell's __frame_nav relay (which needs the click that caused it), a blob is offered as
   * a download, a same-origin page opens in place ── */
  var nativeOpen = window.open;
  var nav = function (url) { try { window.parent.postMessage({ __frame_nav: true, url: url, newTab: true }, location.origin); } catch (e) {} };
  var toHost = function (m) { try { window.parent.postMessage(m, '*'); } catch (e) {} };
  /* under the editor a form that submits to a project page is handed over like a link (the artboard never navigates itself); a submit to this page is dropped */
  var formTarget = function (f, submitter) { /* where a submit would take THIS frame: null for dialog/external/other-target forms (the browser's), else the URL */
    var attr = function (n) { return (submitter && submitter.getAttribute('form' + n)) || (f && f.getAttribute && f.getAttribute(n)) || ''; }, u = null, t = String(attr('target'));
    if (String(attr('method')).toLowerCase() === 'dialog' || /^_blank$/i.test(t) || (t !== '' && !/^_(self|top|parent)$/i.test(t) && frameNamed(t))) return null;
    try { u = new URL(attr('action'), document.baseURI); } catch (e) { return null; }
    return u.origin === location.origin ? u : null;
  };
  var reroutedSubmit = function (u) { var rel = pageRel(u); if (rel !== null) toHost({ __om_open: rel }); else info('submit', 'form submit to this page dropped: a migrated page cannot reload itself here'); };
  if (editor) {
    /* claimed at capture (nothing later can let the frame navigate); the author's own preventDefault still reads as a veto and is honoured */
    window.addEventListener('submit', function (e) {
      var u = e.defaultPrevented ? null : formTarget(e.target, e.submitter), vetoed = false, pd = e.preventDefault;
      if (!u) return;
      try {
        e.preventDefault = function () { vetoed = true; return pd.call(e); };
        Object.defineProperty(e, 'defaultPrevented', { get: function () { return vetoed; }, configurable: true });
        Object.defineProperty(e, 'returnValue', { get: function () { return !vetoed; }, set: function (v) { if (v === false) vetoed = true; }, configurable: true });
      } catch (err) {}
      pd.call(e);
      setTimeout(function () { if (!vetoed) reroutedSubmit(u); }, 0);
    }, true);
    try { var formSubmit = HTMLFormElement.prototype.submit; HTMLFormElement.prototype.submit = function () { var u = formTarget(this, null); if (u) reroutedSubmit(u); else formSubmit.call(this); }; } catch (e) {}
  }
  window.open = function (url, target, features) {
    var opened = null, u = null, t = String(target == null ? '' : target).toLowerCase();
    try { u = new URL(String(url == null ? '' : url), document.baseURI); } catch (e) {}
    /* under the editor another project page opens as its artboard (its raw URL would load Frame's script-less copy), named as the bridge names links */
    var rel = editor && u && String(url == null ? '' : url) !== '' ? pageRel(u) : null;
    if (rel !== null) { toHost({ __om_open: rel }); return null; }
    try { opened = nativeOpen.apply(window, arguments); } catch (e) {}
    if (opened) return opened;
    var act = window.navigator && window.navigator.userActivation; /* with noopener a real popup also returns null — but it spends the click, a refused one does not */
    if (/noopener|noreferrer/i.test(String(features || '')) && act && !act.isActive) return null;
    if (u && (u.protocol === 'blob:' || u.protocol === 'data:')) saveUrl(u.href, '');
    else if (u && external(u)) (editor ? toHost({ __om_link: u.href }) : nav(u.href));
    else if (!editor && u && u.origin === location.origin && (t === '_self' || t === '_top' || t === '_parent')) location.assign(u.href); /* under the editor the artboard never navigates itself */
    else info('open', 'window.open: a second window is not available inside an artifact (' + String(url).slice(0, 80) + ')');
    return null;
  };
  /* nested project pages post to this page; hand their navigation / blocked / engagement signals on toward the shell */
  window.addEventListener('message', function (e) {
    var d = e.data, child = false, on = null;
    try { child = !!e.source && e.source !== window && e.source.parent === window; } catch (err) {}
    if (!child || e.origin !== location.origin || !d || typeof d !== 'object') return;
    if (d.__frame_nav === true && typeof d.url === 'string') on = { __frame_nav: true, url: d.url, newTab: d.newTab === true, rawHref: typeof d.rawHref === 'string' ? d.rawHref : undefined };
    else if (d.__frame_blocked === true && typeof d.kind === 'string') on = { __frame_blocked: true, kind: d.kind };
    else if (d.__frame_engaged === true && typeof d.kind === 'string') on = { __frame_engaged: true, kind: d.kind };
    if (on) try { window.parent.postMessage(on, location.origin); } catch (err) {}
  });
})();
