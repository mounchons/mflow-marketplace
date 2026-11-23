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
/* The title card: a presentation slide in the app's colours (--c-* set by card() from the theme), large and calm. */
.__t-card { position: fixed; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 150px 9vw 90px;
  background: linear-gradient(135deg, var(--c-a, #2453b3) 0%, var(--c-b, #0f2a63) 100%); color: var(--c-ink, #fff);
  font-family: ${FONT}; animation: __t-fade 400ms ease both; transition: opacity 350ms ease; }
.__t-card::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(70% 90% at 88% 12%, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 60%); }
.__t-card .__t-body { position: relative; z-index: 1; max-width: 1500px; }
.__t-card .__t-brand { position: absolute; z-index: 1; top: 64px; left: 9vw; display: flex; align-items: center; gap: 20px;
  font-size: 30px; font-weight: 600; letter-spacing: .01em; animation: __t-rise2 500ms 100ms ease both; }
.__t-card .__t-logo { display: flex; align-items: center; background: #fff; border-radius: 16px; padding: 10px 16px;
  box-shadow: 0 6px 20px rgba(0,0,0,.18); }
.__t-card .__t-logo img { display: block; height: 52px; width: auto; max-width: 320px; }
.__t-card .__t-bar { width: 112px; height: 10px; border-radius: 5px; background: var(--c-accent, #fff); margin-bottom: 40px;
  animation: __t-grow 600ms 150ms cubic-bezier(.2,.8,.2,1) both; transform-origin: left; }
.__t-card h1 { margin: 0; font-size: 84px; font-weight: 700; line-height: 1.22; letter-spacing: -.005em; text-wrap: balance;
  text-shadow: 0 2px 18px rgba(0,0,0,.18); animation: __t-rise2 500ms 200ms ease both; }
.__t-card h1.long { font-size: 68px; }
.__t-card p { margin: 28px 0 0; font-size: 40px; font-weight: 500; line-height: 1.5; opacity: .92; max-width: 1350px;
  text-wrap: pretty; animation: __t-rise2 500ms 350ms ease both; }
.__t-card .__t-steps { list-style: none; margin: 44px 0 0; padding: 0; display: grid; gap: 22px; }
.__t-card .__t-steps.many { gap: 14px; }
.__t-card .__t-steps li { display: flex; align-items: center; gap: 26px; font-size: 42px; font-weight: 600; line-height: 1.35;
  animation: __t-rise2 450ms ease both; }
.__t-card .__t-steps.many li { font-size: 34px; }
.__t-card .__t-steps b { flex: none; display: grid; place-items: center; width: 66px; height: 66px; border-radius: 50%;
  background: var(--c-accent, #fff); color: var(--c-on-accent, #0f2a63); font-size: 34px; font-weight: 700; }
.__t-card .__t-steps.many b { width: 54px; height: 54px; font-size: 28px; }
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
  /**
   * The card's colours from a theme: a gradient from the primary to its dark end, the text white unless the brand is
   * so light that dark text reads better, and the primary darkened step by step until white text has 4.5:1 on it.
   */
  function cardLook(t) {
    let a = hexOk(t.primary) ? rgbOf(t.primary) : [36, 83, 179];
    // a light brand (yellow, pastel) keeps its light end and takes dark text; a deep one runs down to a dark shade
    const light = contrast(INK, a) >= 7;
    let b = hexOk(t.dark) ? rgbOf(t.dark) : (hexOk(t.primary) ? shade(a, light ? 0.16 : 0.55) : [15, 42, 99]);
    if (lum(b) > lum(a)) [a, b] = [b, a];
    let ink = WHITE;
    if (contrast(WHITE, a) < 4.5) {
      if (contrast(INK, a) >= 7 && contrast(INK, b) >= 4.5) ink = INK;
      else {
        for (let i = 0; i < 14 && contrast(WHITE, a) < 4.5; i++) a = shade(a, 0.07);
        for (let i = 0; i < 14 && contrast(WHITE, b) < 4.5; i++) b = shade(b, 0.07);
      }
    }
    const accent = hexOk(t.accent) && contrast(rgbOf(t.accent), b) >= 3 ? rgbOf(t.accent) : ink;
    const onAccent = contrast(WHITE, accent) >= contrast(INK, accent) ? WHITE : (ink === INK ? WHITE : b);
    const font = typeof t.font === 'string' && /^[\w\s\-'.]{1,60}$/.test(t.font.trim()) ? t.font.trim() : null;
    const logo = typeof t.logo === 'string' && (/^data:image\/(png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(t.logo)
      || /^\/(?!\/)[^\s"'<>]*$/.test(t.logo)) ? t.logo : null;
    const name = typeof t.name === 'string' ? t.name.trim().slice(0, 60) : '';
    return { a: hexOf(a), b: hexOf(b), ink: hexOf(ink), accent: hexOf(accent), onAccent: hexOf(onAccent), font, logo, name };
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
    // A full-screen title card (opening, section, summary) over whatever page is behind it, as a presentation slide in
    // the app's colours: `theme` { primary, dark, accent, font, logo, name } (any of them may be missing). A subtitle of
    // steps ("a → b → c") becomes a numbered list.
    card(title, subtitle, theme) {
      const t = theme || {};
      const look = cardLook(t);
      const c = add(el('div', '__t-card'));
      c.style.setProperty('--c-a', look.a);
      c.style.setProperty('--c-b', look.b);
      c.style.setProperty('--c-ink', look.ink);
      c.style.setProperty('--c-accent', look.accent);
      c.style.setProperty('--c-on-accent', look.onAccent);
      if (look.font) c.style.fontFamily = `"${look.font}", ${FONT}`;
      if (look.logo || look.name) {
        const brand = c.appendChild(el('div', '__t-brand'));
        if (look.logo) { const tile = brand.appendChild(el('span', '__t-logo')); const img = el('img'); img.src = look.logo; img.alt = ''; tile.appendChild(img); }
        if (look.name) { const n = el('span'); n.textContent = look.name; brand.appendChild(n); }
      }
      const body = c.appendChild(el('div', '__t-body'));
      body.appendChild(el('div', '__t-bar'));
      const h = el('h1'); h.textContent = title || '';
      if ((title || '').length > 34) h.className = 'long';
      body.appendChild(h);
      const steps = (subtitle || '').split(/\s*→\s*/).map((s) => s.trim()).filter(Boolean);
      if (steps.length >= 2) {
        const ol = body.appendChild(el('ol', '__t-steps' + (steps.length > 5 ? ' many' : '')));
        steps.forEach((s, i) => {
          const li = el('li'); li.style.animationDelay = `${350 + i * 120}ms`;
          const n = el('b'); n.textContent = String(i + 1); li.appendChild(n);
          const w = el('span'); w.textContent = s; li.appendChild(w);
          ol.appendChild(li);
        });
      } else if (subtitle) { const p = el('p'); p.textContent = subtitle; body.appendChild(p); }
      if (cursor) cursor.style.display = 'none';
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
      if (cursor) cursor.style.display = '';
    },
  };
})();
