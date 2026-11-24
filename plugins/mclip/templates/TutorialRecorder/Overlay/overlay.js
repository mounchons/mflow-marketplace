// Tutorial overlay, injected into every document with AddInitScript. It draws in viewport coordinates and never takes a
// click (pointer-events: none everywhere). The recorder drives it through window.__tour.
//
// Zoom: a CSS transform on <html> (translate + scale, origin 0 0), so fixed elements (the shell, the kit's dialogs, which
// are plain fixed divs) zoom with the page instead of escaping it. The overlay root lives inside <html> too, so it gets
// the inverse transform and keeps drawing in screen pixels. Playwright clicks through transforms (it reads the element's
// transformed quads and hit-tests the point), so the page stays zoomed while the action runs.
(() => {
  if (window.__tour) return;

  const FONT = '"Noto Sans Thai", "Sarabun", "Leelawadee UI", "Tahoma", system-ui, sans-serif';
  const CSS = `
#__tour-root, #__tour-root * { pointer-events: none !important; box-sizing: border-box; }
#__tour-root { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 2147483647; transform-origin: 0 0;
  font-family: ${FONT}; transition: opacity 180ms ease; }
#__tour-root.hidden { opacity: 0; }
.__t-box { position: fixed; border: 4px solid #f97316; border-radius: 10px; box-shadow: 0 0 0 4px rgba(249,115,22,.25);
  animation: __t-pop 260ms cubic-bezier(.2,.9,.3,1.3) both; }
.__t-box.ok { border-color: #16a34a; box-shadow: 0 0 0 4px rgba(22,163,74,.25); }
.__t-badge { position: absolute; left: -16px; top: -16px; width: 32px; height: 32px; border-radius: 50%; background: #f97316;
  color: #fff; font: 700 17px/32px ${FONT}; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
.__t-spot { position: fixed; border-radius: 12px; box-shadow: 0 0 0 200vmax rgba(15,23,42,.55); transition: all 300ms ease;
  animation: __t-fade 300ms ease both; }
.__t-arrow { position: fixed; width: 86px; height: 86px; animation: __t-bob 900ms ease-in-out infinite alternate; }
.__t-cursor { position: fixed; left: 0; top: 0; width: 30px; height: 30px; transform: translate(-200px, -200px); }
.__t-cursor svg { position: relative; filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
/* A yellow halo with an orange rim around the tip, so the eye finds the cursor on any page; it swells while moving. */
.__t-halo { position: absolute; left: -19px; top: -20px; width: 48px; height: 48px; border-radius: 50%;
  background: radial-gradient(circle, rgba(250,204,21,.6) 0%, rgba(250,204,21,.38) 55%, rgba(250,204,21,.1) 100%);
  border: 3px solid rgba(249,115,22,.85); animation: __t-halo 1400ms ease-in-out infinite; transition: transform 160ms ease; }
.__t-cursor.moving .__t-halo { animation: none; transform: scale(1.25); }
/* A ghost of the arrow left behind every few frames while it moves: the cursor's shadow running after it. */
.__t-ghost { position: fixed; left: 0; top: 0; width: 30px; height: 30px; animation: __t-ghost 420ms ease-out forwards; }
.__t-ripple { position: fixed; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; border: 4px solid #f97316;
  background: rgba(250,204,21,.45); animation: __t-ripple 650ms ease-out forwards; }
.__t-ripple.late { background: none; border-color: #facc15; animation-delay: 140ms; opacity: 0; }
.__t-caption { position: fixed; left: 50%; bottom: 44px; transform: translateX(-50%); max-width: 78vw; padding: 16px 34px;
  border-radius: 14px; background: rgba(15,23,42,.82); color: #fff; font: 600 34px/1.45 ${FONT}; text-align: center;
  word-break: normal; overflow-wrap: anywhere; animation: __t-rise 260ms ease both; }
.__t-callout { position: fixed; max-width: 360px; padding: 12px 16px; border-radius: 12px; background: #1e3a8a; color: #fff;
  font: 500 19px/1.5 ${FONT}; word-break: normal; overflow-wrap: anywhere; box-shadow: 0 8px 24px rgba(0,0,0,.3);
  animation: __t-in 250ms ease both; }
.__t-callout.ok { background: #15803d; }
.__t-callout .__t-tail { position: absolute; width: 16px; height: 16px; background: inherit; transform: rotate(45deg); }
.__t-callout .__t-num { display: inline-block; margin-right: 6px; font-weight: 700; }
@keyframes __t-pop { from { opacity: 0; transform: scale(1.15); } to { opacity: 1; transform: scale(1); } }
@keyframes __t-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes __t-bob { from { translate: 0 0; } to { translate: 0 -12px; } }
@keyframes __t-ripple { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(4.5); } }
@keyframes __t-halo { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
@keyframes __t-ghost { from { opacity: .5; } to { opacity: 0; } }
@keyframes __t-rise { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
/* The title card: the app's own screen stays in view on the right; on the left a panel in its brand colour carries the
   words (--c-* set by card() from the theme). Opening: the lesson's number, its title, one line under it. Closing: the
   steps on a track. One movement: the panel wipes in, then the words. */
.__t-card { position: fixed; inset: 0; font-family: ${FONT}; transition: opacity 350ms ease; }
/* the live page, shrunk into the right side (see frameThePage): a window in a tinted backdrop */
.__t-card .__t-frame { position: absolute; border-radius: 18px; outline: 2px solid rgba(255,255,255,.7);
  box-shadow: 0 28px 70px rgba(0,0,0,.30), 0 0 0 200vmax var(--c-backdrop, #e8edf5); animation: __t-fade 300ms ease both; }
.__t-card .__t-panel { position: absolute; left: 0; top: 0; bottom: 0; width: 60%; display: flex; flex-direction: column;
  padding: 88px 104px 96px 112px; background: var(--c-panel, #0f2a63); color: var(--c-ink, #fff);
  box-shadow: 30px 0 90px rgba(0,0,0,.30); animation: __t-wipe 650ms cubic-bezier(.2,.8,.2,1) both; }
.__t-card .__t-seam { position: absolute; top: 0; bottom: 0; left: 60%; width: 12px; background: var(--c-accent, #f97316);
  animation: __t-fade 250ms 520ms ease both; }
.__t-card .__t-brand { display: flex; align-items: center; gap: 18px; min-height: 64px; font-size: 28px; font-weight: 600;
  color: var(--c-soft, rgba(255,255,255,.82)); animation: __t-fade 400ms 350ms ease both; }
.__t-card .__t-logo { display: flex; align-items: center; background: #fff; border-radius: 12px; padding: 8px 14px; }
.__t-card .__t-logo img { display: block; height: 48px; width: auto; max-width: 300px; }
.__t-card .__t-main { margin: auto 0; animation: __t-rise2 500ms 380ms ease both; }
.__t-card .__t-num { display: block; margin-bottom: 24px; font-size: 132px; font-weight: 700; line-height: 1;
  letter-spacing: -.03em; color: var(--c-accent, #f97316); font-variant-numeric: tabular-nums; }
.__t-card h1 { margin: 0; font-size: 84px; font-weight: 700; line-height: 1.18; letter-spacing: -.005em; text-wrap: balance; }
.__t-card h1.long { font-size: 68px; }
.__t-card h1.recap { font-size: 60px; margin-bottom: 40px; }
.__t-card p { margin: 34px 0 0; max-width: 22em; font-size: 36px; font-weight: 400; line-height: 1.5;
  color: var(--c-soft, rgba(255,255,255,.82)); text-wrap: pretty; }
.__t-card .__t-steps { position: relative; list-style: none; margin: 0; padding: 0; }
.__t-card .__t-steps::before { content: ""; position: absolute; left: 27px; top: 30px; bottom: 30px; width: 4px;
  border-radius: 2px; background: var(--c-accent, #f97316); opacity: .5; }
.__t-card .__t-steps li { position: relative; display: flex; align-items: center; gap: 30px; padding: 11px 0;
  font-size: 38px; font-weight: 600; line-height: 1.3; }
.__t-card .__t-steps b { position: relative; flex: none; display: grid; place-items: center; width: 58px; height: 58px;
  border-radius: 50%; border: 4px solid var(--c-accent, #f97316); background: var(--c-panel, #0f2a63);
  font-size: 27px; font-weight: 700; }
.__t-card .__t-steps.many li { padding: 7px 0; font-size: 32px; }
.__t-card .__t-steps.many::before { left: 23px; }
.__t-card .__t-steps.many b { width: 50px; height: 50px; font-size: 23px; }
/* A picture step (slide): the picture on the cards' backdrop with their accent along the top, whole and centred, room
   left below for the caption. */
.__t-slide { display: grid; place-items: center; background: var(--c-backdrop, #e8edf5); animation: __t-fade 350ms ease both; }
.__t-slide .__t-bar { position: absolute; left: 0; top: 0; right: 0; height: 10px; background: var(--c-accent, #2453b3); }
.__t-slide img { max-width: calc(100vw - 192px); max-height: calc(100vh - 210px); margin-bottom: 96px; object-fit: contain;
  border-radius: 18px; background: #fff; box-shadow: 0 24px 60px rgba(15,23,42,.18); }
@keyframes __t-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes __t-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes __t-rise2 { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes __t-in { from { opacity: 0; translate: var(--dx, 0) var(--dy, 0); } to { opacity: 1; translate: 0 0; } }
`;

  // The cursor: an orange arrow with a white rim (the halo and the ghosts are styled in CSS).
  const ARROW = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.6 L14.6 20.3 L11.6 13.6 L17.8 13.6 Z" fill="#f97316" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const zoom = { s: 1, tx: 0, ty: 0 };
  let root = null, cursor = null, cursorAt = { x: -100, y: -100 };
  const step = new Set(); // elements of the current step, removed by clearStep

  // ---- the title card's colours ------------------------------------------------------------------------------------
  const hexOf = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hexOk = (s) => (typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s) ? s : null);
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (x, y) => { const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
  const shade = (c, f) => c.map((v) => v * (1 - f));
  const WHITE = [255, 255, 255], INK = [15, 23, 42];
  const mix = (c, to, f) => c.map((v, i) => v + (to[i] - v) * f);
  /**
   * The card's colours from a theme (the same rules as clips.mjs cardColors, for the plan page's preview):
   * - panel: the brand's dark end (given, or the primary darkened), darkened until white text has 7:1 on it; a light
   *   brand (yellow, pastel) with no dark end keeps its own colour and takes dark text instead;
   * - accent (the lesson number, the seam, the steps' track): the primary, or the given accent, lifted toward the
   *   text's colour until it has 3:1 on the panel.
   */
  function cardLook(t) {
    const primary = hexOk(t.primary) ? rgbOf(t.primary) : [36, 83, 179];
    let panel, ink = WHITE;
    if (!hexOk(t.dark) && hexOk(t.primary) && contrast(INK, primary) >= 7) { panel = primary; ink = INK; }
    else {
      panel = hexOk(t.dark) ? rgbOf(t.dark) : (hexOk(t.primary) ? shade(primary, 0.6) : [15, 42, 99]);
      for (let i = 0; i < 20 && contrast(WHITE, panel) < 7; i++) panel = shade(panel, 0.08);
    }
    let accent = hexOk(t.accent) ? rgbOf(t.accent) : (ink === INK ? shade(primary, 0.7) : primary);
    for (let i = 0; i < 20 && contrast(accent, panel) < 3; i++) accent = mix(accent, ink, 0.12);
    const soft = ink === WHITE ? 'rgba(255,255,255,.84)' : 'rgba(15,23,42,.78)';
    const backdrop = hexOf(mix(panel, WHITE, 0.88)); // behind the framed page: the panel's colour, faint
    const font = typeof t.font === 'string' && /^[\w\s\-'.]{1,60}$/.test(t.font.trim()) ? t.font.trim() : null;
    const logo = typeof t.logo === 'string' && (/^data:image\/(png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(t.logo)
      || /^\/(?!\/)[^\s"'<>]*$/.test(t.logo)) ? t.logo : null;
    const name = typeof t.name === 'string' ? t.name.trim().slice(0, 60) : '';
    return { panel: hexOf(panel), ink: hexOf(ink), accent: hexOf(accent), soft, backdrop, font, logo, name };
  }

  // The page behind a title card, shrunk into the card's right side with the zoom's own transform (the overlay root
  // undoes it, so the card stays in screen pixels). Undone by clearStep, before the next step touches the page.
  let framed = null;
  function frameThePage() {
    const html = document.documentElement, W = vw(), H = vh(), m = Math.round(W * 0.03);
    const s = (W * 0.4 - 2 * m) / W, x = W * 0.6 + m, y = (H - H * s) / 2;
    if (!framed) framed = { zoom: { ...zoom }, t: html.style.transform, o: html.style.transformOrigin, tr: html.style.transition };
    html.style.transition = 'none';
    html.style.transformOrigin = '0 0';
    html.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    Object.assign(zoom, { s, tx: x, ty: y });
    counter();
    return { x, y, w: W * s, h: H * s };
  }
  function unframeThePage() {
    if (!framed) return;
    const html = document.documentElement;
    html.style.transform = framed.t; html.style.transformOrigin = framed.o; html.style.transition = framed.tr;
    Object.assign(zoom, framed.zoom);
    framed = null;
    counter();
  }

  function ensure() {
    if (root && root.isConnected) return root;
    if (!document.getElementById('__tour-style')) {
      const st = document.createElement('style');
      st.id = '__tour-style';
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    root = document.createElement('div');
    root.id = '__tour-root';
    root.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(root);
    cursor = el('div', '__t-cursor');
    cursor.innerHTML = '<div class="__t-halo"></div>' + ARROW;
    root.appendChild(cursor);
    place(cursor, cursorAt.x, cursorAt.y, 0);
    counter();
    return root;
  }

  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function add(e) { ensure().appendChild(e); step.add(e); return e; }

  // The overlay root undoes the page's zoom: page point p shows at t + s*p, the root maps its point q to (q - t) / s.
  function counter() {
    if (!root) return;
    root.style.transform = zoom.s === 1 ? 'none' : `translate(${-zoom.tx / zoom.s}px, ${-zoom.ty / zoom.s}px) scale(${1 / zoom.s})`;
  }

  function rectOf(selectorOrRect) {
    if (selectorOrRect && typeof selectorOrRect === 'object') return selectorOrRect;
    const e = document.querySelector(selectorOrRect);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  function place(e, x, y, ms) {
    e.style.transition = ms ? `transform ${ms}ms cubic-bezier(.4,0,.2,1)` : 'none';
    e.style.transform = `translate(${x}px, ${y}px)`;
  }

  // A ghost arrow lives outside the step: it removes itself once faded.
  function trail(x, y) {
    const d = el('div', '__t-ghost');
    d.innerHTML = ARROW;
    d.style.transform = `translate(${x}px, ${y}px)`;
    ensure().insertBefore(d, cursor);
    setTimeout(() => d.remove(), 460);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vw = () => window.innerWidth, vh = () => window.innerHeight;

  window.__tour = {
    // ---- zoom ------------------------------------------------------------------------------------------------------
    // rect is the target in screen pixels (as the recorder measured it, zoom included); scale 1 zooms out.
    async zoomTo(rect, scale, ms) {
      ensure();
      const html = document.documentElement;
      const s = Math.max(1, scale || 1);
      let tx = 0, ty = 0;
      if (s > 1 && rect) {
        // Back to page coordinates, then centre the target as far as the page still covers the screen.
        const cx = (rect.x + rect.width / 2 - zoom.tx) / zoom.s, cy = (rect.y + rect.height / 2 - zoom.ty) / zoom.s;
        tx = Math.min(0, Math.max(vw() - s * vw(), vw() / 2 - s * cx));
        ty = Math.min(0, Math.max(vh() - s * vh(), vh() / 2 - s * cy));
      }
      root.classList.add('hidden');
      html.style.transformOrigin = '0 0';
      html.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
      html.style.transform = s === 1 ? 'translate(0px, 0px) scale(1)' : `translate(${tx}px, ${ty}px) scale(${s})`;
      Object.assign(zoom, { s, tx, ty });
      counter();
      await sleep(ms + 40);
      if (s === 1) { html.style.transform = ''; html.style.transition = ''; html.style.transformOrigin = ''; }
      root.classList.remove('hidden');
      return { ...zoom };
    },
    zoomState() { return { ...zoom }; },

    // ---- cursor ----------------------------------------------------------------------------------------------------
    // Moves frame by frame (timers, not requestAnimationFrame, so a background tab cannot stall it), dropping a fading
    // dot behind the tip every ~30 ms so the path shows on screen.
    async moveCursor(x, y, ms) {
      ensure();
      cursor.style.display = '';
      const from = { ...cursorAt }, to = { x: x - 4, y: y - 2 };
      cursorAt = to;
      if (!ms || ms <= 0) { place(cursor, to.x, to.y, 0); return; }
      const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
      cursor.classList.add('moving');
      const t0 = performance.now();
      let lastDot = -Infinity;
      for (;;) {
        const now = performance.now();
        const k = Math.min(1, (now - t0) / ms), e = ease(k);
        const px = from.x + (to.x - from.x) * e, py = from.y + (to.y - from.y) * e;
        place(cursor, px, py, 0);
        if (k >= 1) break;
        if (now - lastDot >= 40) { lastDot = now; trail(px, py); }
        await sleep(16);
      }
      cursor.classList.remove('moving');
    },
    async ripple(x, y) {
      for (const cls of ['__t-ripple', '__t-ripple late']) {
        const r = add(el('div', cls));
        r.style.left = `${x}px`; r.style.top = `${y}px`;
      }
      await sleep(220);
    },
    hideCursor() { ensure(); cursor.style.display = 'none'; },

    // ---- highlights ------------------------------------------------------------------------------------------------
    highlight(kind, rect, opts = {}) {
      if (!rect || kind === 'none') return;
      const pad = 8;
      const r = { x: rect.x - pad, y: rect.y - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 };
      if (kind === 'spotlight') {
        const s = add(el('div', '__t-spot'));
        Object.assign(s.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      }
      if (kind === 'box' || kind === 'spotlight' || opts.badge) {
        const b = add(el('div', '__t-box' + (opts.ok ? ' ok' : '')));
        Object.assign(b.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        if (opts.badge) { const n = el('div', '__t-badge'); n.textContent = opts.badge; b.appendChild(n); }
      }
      if (kind === 'arrow') {
        // Points at the target from the side with more room (left or above).
        const a = add(el('div', '__t-arrow'));
        const fromLeft = r.x > 140;
        const ax = fromLeft ? r.x - 92 : r.x + r.w / 2 - 43, ay = fromLeft ? r.y + r.h / 2 - 43 : r.y - 92;
        Object.assign(a.style, { left: `${ax}px`, top: `${ay}px` });
        a.innerHTML = `<svg viewBox="0 0 100 100" width="86" height="86" style="transform: rotate(${fromLeft ? 0 : 90}deg)">
          <path d="M8 40 H62 V22 L94 50 L62 78 V60 H8 Z" fill="#f97316" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>`;
      }
    },

    // ---- captions --------------------------------------------------------------------------------------------------
    // A full-screen title card (opening, section, summary) over the page behind it, which stays in view on the right:
    // a panel in the app's colours (`theme` { primary, dark, accent, font, logo, name }, any may be missing) with the
    // lesson's number (`label`, "01") above its title on an opening card. A subtitle of steps ("a → b → c") becomes the
    // steps on a track, the closing card's recap.
    card(title, subtitle, theme, label) {
      const look = cardLook(theme || {});
      const c = add(el('div', '__t-card'));
      for (const [k, v] of [['--c-panel', look.panel], ['--c-ink', look.ink], ['--c-accent', look.accent], ['--c-soft', look.soft], ['--c-backdrop', look.backdrop]]) c.style.setProperty(k, v);
      if (look.font) c.style.fontFamily = `"${look.font}", ${FONT}`;
      const f = frameThePage();
      const frame = c.appendChild(el('div', '__t-frame'));
      Object.assign(frame.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
      const panel = c.appendChild(el('div', '__t-panel'));
      c.appendChild(el('div', '__t-seam'));
      const brand = panel.appendChild(el('div', '__t-brand'));
      if (look.logo) { const tile = brand.appendChild(el('span', '__t-logo')); const img = el('img'); img.src = look.logo; img.alt = ''; tile.appendChild(img); }
      if (look.name) { const n = el('span'); n.textContent = look.name; brand.appendChild(n); }
      const main = panel.appendChild(el('div', '__t-main'));
      const steps = (subtitle || '').split(/\s*→\s*/).map((s) => s.trim()).filter(Boolean);
      const recap = steps.length >= 2;
      if (!recap && typeof label === 'string' && /^\d{1,3}$/.test(label)) { const n = el('span', '__t-num'); n.textContent = label; main.appendChild(n); }
      const h = el('h1'); h.textContent = title || '';
      h.className = recap ? 'recap' : (title || '').length > 30 ? 'long' : '';
      main.appendChild(h);
      if (recap) {
        const ol = main.appendChild(el('ol', '__t-steps' + (steps.length > 5 ? ' many' : '')));
        steps.forEach((s, i) => {
          const li = el('li');
          const n = el('b'); n.textContent = String(i + 1); li.appendChild(n);
          const w = el('span'); w.textContent = s; li.appendChild(w);
          ol.appendChild(li);
        });
      } else if (subtitle) { const p = el('p'); p.textContent = subtitle; main.appendChild(p); }
      if (cursor) cursor.style.display = 'none';
    },

    // A picture step: `src` (a data: URI) full screen on the cards' backdrop; resolves once the picture is drawn, so the
    // step's time starts with the picture on screen, and fails when it cannot be (a broken file): never a blank slide.
    slide(src, theme) {
      const look = cardLook(theme || {});
      const c = add(el('div', '__t-card __t-slide'));
      c.style.setProperty('--c-backdrop', look.backdrop);
      c.style.setProperty('--c-accent', look.accent);
      c.appendChild(el('div', '__t-bar'));
      const img = el('img'); img.alt = ''; img.src = src;
      c.appendChild(img);
      if (cursor) cursor.style.display = 'none';
      return img.decode().catch(() => { throw new Error('the picture could not be drawn (a broken or unsupported file)'); });
    },

    // The colours and font the page shows: its background (a gradient's colours first), then a primary button's.
    pageTheme() {
      const rgb = (s) => {
        const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)/.exec(s || '');
        if (!m) return null;
        const a = m[4] === undefined ? 1 : parseFloat(m[4]) / (m[5] ? 100 : 1);
        return a < 0.5 ? null : [+m[1], +m[2], +m[3]];
      };
      const colourful = (c) => !!c && Math.max(...c) - Math.min(...c) > 40; // not white, black or grey
      const found = [];
      for (const e of [document.body, document.documentElement]) {
        if (!e) continue;
        const cs = getComputedStyle(e);
        for (const m of (cs.backgroundImage || '').match(/rgba?\([^)]*\)/g) || []) found.push(rgb(m));
        found.push(rgb(cs.backgroundColor));
      }
      const button = [...document.querySelectorAll('.btn-primary, button[type="submit"], input[type="submit"], button, .btn')]
        .find((b) => b.offsetWidth > 0 && colourful(rgb(getComputedStyle(b).backgroundColor)));
      if (button) found.push(rgb(getComputedStyle(button).backgroundColor));
      const cols = found.filter(colourful);
      const font = (getComputedStyle(document.body || document.documentElement).fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
      return { primary: cols[0] ? hexOf(cols[0]) : null, dark: cols[1] && hexOf(cols[1]) !== hexOf(cols[0]) ? hexOf(cols[1]) : null, font: font || null };
    },

    caption(text) {
      if (!text) return;
      const c = add(el('div', '__t-caption'));
      c.textContent = text;
    },

    // Callout bubble pointing at rect. placement: auto | top | bottom | left | right. Returns the side used and its box.
    callout(text, rect, placement, opts = {}) {
      if (!text) return null;
      const c = add(el('div', '__t-callout' + (opts.ok ? ' ok' : '')));
      if (opts.number) { const n = el('span', '__t-num'); n.textContent = opts.number; c.appendChild(n); }
      c.appendChild(document.createTextNode((opts.ok ? '✓ ' : '') + text));
      const tail = el('div', '__t-tail'); c.appendChild(tail);
      c.style.visibility = 'hidden';
      const w = c.offsetWidth, h = c.offsetHeight, gap = 18, m = 16, bottomReserve = opts.reserveBottom || 0;
      const t = rect || { x: vw() / 2, y: vh() / 2, width: 0, height: 0 };
      const room = { top: t.y - m, bottom: vh() - bottomReserve - (t.y + t.height) - m, left: t.x - m, right: vw() - (t.x + t.width) - m };
      const fits = { top: room.top >= h + gap, bottom: room.bottom >= h + gap, left: room.left >= w + gap, right: room.right >= w + gap };
      // A side asked for is kept only when the bubble fits there; otherwise auto picks one that fits.
      // No target (a sign-in, a summary): low in the middle, never over the page's own form.
      let side = !rect ? 'inside' : placement && placement !== 'auto' && fits[placement] ? placement : null;
      if (!side) side = ['bottom', 'top', 'right', 'left'].find((k) => fits[k]) || 'inside';
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      let x, y;
      if (side === 'inside') {
        // The target fills the screen (a whole page): the bubble sits low in the middle, without a tail.
        x = (vw() - w) / 2;
        y = vh() - bottomReserve - h - 48;
        tail.remove();
      } else if (side === 'top' || side === 'bottom') {
        x = clamp(t.x + t.width / 2 - w / 2, m, vw() - w - m);
        y = side === 'bottom' ? t.y + t.height + gap : t.y - h - gap;
      } else {
        y = clamp(t.y + t.height / 2 - h / 2, m, vh() - bottomReserve - h - m);
        x = side === 'right' ? t.x + t.width + gap : t.x - w - gap;
      }
      x = clamp(x, m, vw() - w - m); y = clamp(y, m, vh() - h - m);
      Object.assign(c.style, { left: `${x}px`, top: `${y}px` });
      // Tail on the side facing the target, slid toward the target's centre.
      if (side === 'inside') { /* no tail */ } else if (side === 'top' || side === 'bottom') {
        Object.assign(tail.style, { left: `${clamp(t.x + t.width / 2 - x - 8, 14, w - 30)}px`, [side === 'bottom' ? 'top' : 'bottom']: '-7px' });
      } else {
        Object.assign(tail.style, { top: `${clamp(t.y + t.height / 2 - y - 8, 12, h - 28)}px`, [side === 'right' ? 'left' : 'right']: '-7px' });
      }
      const d = { top: [0, '10px'], bottom: [0, '-10px'], left: ['10px', 0], right: ['-10px', 0], inside: [0, '10px'] }[side];
      c.style.setProperty('--dx', d[0]); c.style.setProperty('--dy', d[1]);
      c.style.visibility = '';
      return { side, x, y, width: w, height: h };
    },

    // Drops the boxes, arrows and spotlights that point at the target, keeping the caption and callout text. Called
    // right after the action: a click that opens a dialog or another page would otherwise leave them floating over it.
    clearMarks() {
      for (const e of [...step]) {
        if (e.matches('.__t-box, .__t-spot, .__t-arrow')) { e.remove(); step.delete(e); }
      }
    },

    clearStep() {
      for (const e of step) {
        // A card fades out instead of vanishing; the rest goes at once.
        if (e.classList.contains('__t-card')) { e.style.opacity = '0'; setTimeout(() => e.remove(), 400); } else e.remove();
      }
      step.clear();
      unframeThePage();
      if (cursor) cursor.style.display = '';
    },
  };
})();
