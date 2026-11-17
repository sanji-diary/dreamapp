// A child signs in on the upgraded preview database, looks at the mission list and does the verse mission
// (first with a mistake, then correctly). Prints drops and points before and after.
// usage: node tools/checks/kid-missions.cjs <card token> <width> <height>
const { chromium } = require('playwright');
const path = require('path');
const base = 'http://localhost:3000';
const [token = 'demo-2', width = '390', height = '844'] = process.argv.slice(2);
const out = path.join(__dirname, 'out', 'kid');
require('fs').mkdirSync(out, { recursive: true });
const VERSE = '여호와는 나의 목자시니 내게 부족함이 없으리로다';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 100)));
  const shot = (n) => p.screenshot({ path: path.join(out, `${width}-${n}.png`), fullPage: true });
  const fits = async (n) => {
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      let past = 0;
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('nextjs-portal')) continue;
        const q = el.getBoundingClientRect();
        if (q.width && q.height && (q.right > vw + 1 || q.left < -1)) past++;
      }
      return { vw, sw: document.documentElement.scrollWidth, past };
    });
    console.log(`  ${n}: page ${r.sw}/${r.vw}, past edge ${r.past}`);
  };
  await p.goto(`${base}/join/${token}`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  for (const d of '1234') await p.getByRole('button', { name: d, exact: true }).click();
  await p.waitForURL((u) => u.pathname === '/home' || u.pathname === '/welcome', { timeout: 30000 });
  console.log('signed in ->', new URL(p.url()).pathname);
  await p.goto(base + '/missions', { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  const head = async () => (await p.locator('main').innerText()).split('\n').filter(Boolean).slice(0, 4).join(' | ');
  console.log('missions:', await head());
  const rows = await p.locator('main a[href^="/missions/"]').evaluateAll((as) => as.map((a) => a.getAttribute('aria-label')));
  console.log('open missions:', rows.join(' / '));
  await shot('1-list'); await fits('list');
  const verse = p.locator('main a[href^="/missions/"]', { hasText: /./ }).filter({ has: p.locator('span') });
  const link = p.locator('a[aria-label*="말씀 쓰기"]').first();
  if (await link.count()) {
    await link.click();
    await p.waitForURL(/\/missions\/\d+/);
    await p.waitForTimeout(2000);
    const box = p.locator('textarea').first();
    await box.fill(VERSE.replace('목자시니', '목자이시니'));
    await p.waitForTimeout(600);
    await shot('2-verse-wrong'); await fits('verse with a mistake');
    console.log('  hint shown:', await p.getByText('여기부터 달라요').count() > 0, '| button disabled:', await p.locator('button', { hasText: /받기|다음|완료/ }).first().isDisabled().catch(() => 'n/a'));
    await box.fill(VERSE);
    await p.waitForTimeout(600);
    await shot('3-verse-right');
    await p.locator('button', { hasText: /받기|다음|완료/ }).first().click();
    await p.waitForURL(/\/missions\/done\//, { timeout: 30000 });
    await p.waitForTimeout(1500);
    console.log('done page:', (await p.locator('main').innerText()).split('\n').filter(Boolean).slice(0, 5).join(' | '));
    await shot('4-done'); await fits('done');
  } else console.log('no verse mission open for this child');
  await p.goto(base + '/missions', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  console.log('missions after:', await head());
  void verse;
  console.log('page errors:', errors.length, errors.join(' ; '));
  await b.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n')[0]); process.exit(1); });
