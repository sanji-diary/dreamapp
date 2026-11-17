// Opens the child's screens at Galaxy Fold sizes (folded cover and unfolded) and reports anything cut off at the sides.
// usage: node tools/checks/kid-screens.cjs [base] [pages...]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const base = process.argv[2] || 'http://localhost:3000';
const out = path.join(__dirname, 'out', 'kid-screens');
fs.mkdirSync(out, { recursive: true });
const SIZES = [
  ['fold-cover-old', 280, 653],
  ['fold-cover', 344, 882],
  ['phone', 390, 844],
  ['fold-open', 768, 884],
  ['fold-open-wide', 884, 768],
];
const PAGES = (process.argv.slice(3).length ? process.argv.slice(3) : ['/home', '/missions', '/feed', '/worship', '/me', '/harvest']);
(async () => {
  const b = await chromium.launch();
  for (const [label, w, h] of SIZES) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.setDefaultTimeout(60000);
    await p.goto(base + '/join/demo-1/card', { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(out, `${label}-login.png`) });
    const report = async (name) => {
      const r = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const wide = [];
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('nextjs-portal')) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // Something that sticks out past either side of the screen and is not just decoration clipped by its parent on purpose.
          if (r.right > vw + 1 || r.left < -1) {
            let clipped = false;
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const o = getComputedStyle(a).overflowX;
              if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') { clipped = true; break; }
            }
            const text = (el.innerText || '').trim().slice(0, 24);
            wide.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50), left: Math.round(r.left), right: Math.round(r.right), clipped, text });
          }
        }
        return { vw, scrollW: document.documentElement.scrollWidth, wide: wide.filter((x) => x.tag !== 'img' || !x.clipped).slice(0, 6), count: wide.length };
      });
      console.log(`${label} ${name}: page width ${r.scrollW}/${r.vw}${r.scrollW > r.vw ? '  <-- scrolls sideways' : ''}; elements past the edge: ${r.count}`, r.wide.filter((x) => x.text).slice(0, 3).map((x) => `${x.tag}[${x.left}..${x.right}]${x.clipped ? ' clipped' : ''} "${x.text.replace(/\n/g, ' ')}"`).join(' | '));
    };
    await report('/login');
    for (const d of '1234') {
      await p.getByRole('button', { name: d, exact: true }).click();
      await p.waitForTimeout(140);
    }
    await p.waitForURL((u) => !u.pathname.endsWith('/login'));
    for (const url of PAGES) {
      await p.goto(base + url, { waitUntil: 'load' });
      await p.waitForTimeout(2200);
      await p.screenshot({ path: path.join(out, `${label}-${url.replace(/\W+/g, '') || 'root'}.png`) });
      await report(url);
    }
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n')[0]); process.exit(1); });
