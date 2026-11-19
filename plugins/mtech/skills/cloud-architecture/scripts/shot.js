// Screenshots for checking and exporting diagrams (needs Playwright + Chromium).
//
//   node shot.js page <page.html> <out-prefix>      → <prefix>-light.png, <prefix>-dark.png (the <figure>),
//                                                     <prefix>-page.png (full page), <prefix>-phone.png (400 px)
//                                                     and prints page scrollWidth (must equal viewport width)
//   node shot.js svg <file.svg> <out.png> <w> <h> [scale]   → PNG of a standalone SVG (scale 2 for documents)
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('npm i playwright  (or run where Playwright is installed)'); process.exit(1); }
const [, , mode, src, out, w, h, scale] = process.argv;
const url = 'file://' + path.resolve(src);
(async () => {
  const b = await chromium.launch();
  if (mode === 'svg') {
    const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(scale || 2) });
    await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1200);
    await p.screenshot({ path: out, clip: { x: 0, y: 0, width: +w, height: +h } });
    console.log('png', out);
  } else {
    for (const [scheme, width, tag] of [['light', 1600, 'light'], ['dark', 1600, 'dark'], ['light', 400, 'phone']]) {
      const p = await b.newPage({ viewport: { width, height: 1000 }, colorScheme: scheme, deviceScaleFactor: 1 });
      await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1000);
      const fig = await p.$('figure');
      if (fig && tag !== 'phone') await fig.screenshot({ path: `${out}-${tag}.png` });
      if (tag !== 'dark') await p.screenshot({ path: `${out}-${tag === 'light' ? 'page' : 'phone'}.png`, fullPage: true });
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      console.log(tag, 'viewport', width, 'scrollWidth', sw, sw > width ? '← horizontal overflow' : 'ok');
      await p.close();
    }
  }
  await b.close();
})();
