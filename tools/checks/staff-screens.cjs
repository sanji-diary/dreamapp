// Opens the teacher screens at Galaxy Fold sizes (folded, unfolded), a normal phone and a desktop,
// as a homeroom teacher and as the admin, and reports anything cut off at the sides.
// usage: node tools/checks/staff-screens.cjs [pages...]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const base = 'http://localhost:3000';
const out = path.join(__dirname, 'out', 'staff');
fs.mkdirSync(out, { recursive: true });
const SIZES = [['f280', 280, 653], ['f344', 344, 882], ['p390', 390, 844], ['t768', 768, 884], ['t884', 884, 768], ['d1280', 1280, 800]];
const ROLES = [['homeroom', 1], ['admin', 0]];
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ['/staff', '/staff/children', '/staff/children/2', '/staff/more', '/staff/attendance', '/staff/approvals', '/staff/admin/missions'];
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  for (const [role, idx] of ROLES) {
    for (const [label, w, h] of SIZES) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 1000, isMobile: w < 1000 });
      const p = await ctx.newPage();
      p.setDefaultTimeout(90000);
      const errors = [];
      p.on('pageerror', (e) => errors.push(String(e).slice(0, 80)));
      await p.goto(base + '/staff/login', { waitUntil: 'load' });
      await p.waitForTimeout(2000);
      await Promise.all([p.waitForURL((u) => !u.pathname.endsWith('/login')), p.locator('form button').nth(idx).click()]);
      const report = async (name) => {
        const r = await p.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          let past = 0, stubs = 0;
          const samples = [];
          for (const el of document.querySelectorAll('body *')) {
            if (el.closest('nextjs-portal')) continue;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            if (r.right > vw + 1 || r.left < -1) {
              let clipped = false;
              for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                const o = getComputedStyle(a).overflowX;
                if (o !== 'visible') { clipped = true; break; }
              }
              if (!clipped) { past++; if (samples.length < 2) samples.push('past:' + el.tagName.toLowerCase() + ' "' + (el.innerText || '').trim().slice(0, 16) + '"'); }
            }
            // text cut with an ellipsis to almost nothing
            if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth < 60 && (el.innerText || '').trim().length > 2) {
              stubs++; if (samples.length < 3) samples.push('cut:"' + (el.innerText || '').trim().slice(0, 14) + '" in ' + el.clientWidth + 'px');
            }
          }
          return { vw, sw: document.documentElement.scrollWidth, past, stubs, samples };
        });
        const flag = r.sw > r.vw || r.past || r.stubs || errors.length;
        if (flag) bad++;
        console.log(`${flag ? 'CHECK' : 'ok   '} ${role} ${label} ${name}: page ${r.sw}/${r.vw}, past edge ${r.past}, cut text ${r.stubs}, errors ${errors.length} ${r.samples.join(' ')}`);
        errors.length = 0;
      };
      for (const url of PAGES) {
        const res = await p.goto(base + url, { waitUntil: 'load' });
        await p.waitForTimeout(1800);
        const name = url.replace(/^\/staff\/?/, '').replace(/\W+/g, '_') || 'home';
        await p.screenshot({ path: path.join(out, `${label}-${role}-${name}.png`) });
        await report(url + (res && res.status() !== 200 ? ' [' + res.status() + ']' : ''));
      }
      if (w < 1000) {
        await p.goto(base + '/staff', { waitUntil: 'load' });
        await p.waitForTimeout(1800);
        const plus = p.getByRole('button', { name: /바로 하기/ });
        if (await plus.count()) {
          await plus.first().click();
          await p.waitForTimeout(700);
          await p.screenshot({ path: path.join(out, `${label}-${role}-sheet.png`) });
          await report('+ sheet');
        } else console.log(`CHECK ${role} ${label}: no "+" button found`);
      }
      await ctx.close();
    }
  }
  console.log(bad ? `${bad} screens need a look` : 'all screens fit');
  await b.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n')[0]); process.exit(1); });
