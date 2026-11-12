const { chromium, devices } = require('playwright');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const res = {};
  for (const [name, opts, url] of [
    ['2d-desktop', { viewport: { width: 1920, height: 1080 } }, 'https://night-shaft-2d.netlify.app/'],
    ['2d-iphone', { ...devices['iPhone 13'] }, 'https://night-shaft-2d.netlify.app/'],
    ['2d-iphone-land', { ...devices['iPhone 13 landscape'] }, 'https://night-shaft-2d.netlify.app/'],
    ['2d-ipad', { ...devices['iPad Pro 11'] }, 'https://night-shaft-2d.netlify.app/'],
    ['vr-top', { viewport: { width: 1440, height: 900 } }, 'https://night-shaft-quest3.netlify.app/'],
  ]) {
    const ctx = await b.newContext(opts); const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    pg.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
    await pg.goto(url, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(1500);
    const notice = await pg.evaluate(() => { const el = [...document.querySelectorAll('b')].find(e => e.textContent.includes('Claude Codeのクラウドセッションで制作しました')); if (!el) return null; const r = el.getBoundingClientRect(); return { text: el.textContent, visible: r.width > 0 && r.top >= 0 && r.bottom <= innerHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, fs: getComputedStyle(el).fontSize }; });
    await pg.screenshot({ path: `${out}/live-${name}.png` });
    if (name.startsWith('2d')) {
      await pg.mouse.click(10, 10);
      await pg.evaluate(() => window.__ns.startRun(1, 'normal'));
      await pg.waitForTimeout(1500);
      if (name === '2d-iphone-land' || name === '2d-ipad' || name === '2d-iphone') await pg.evaluate(() => window.__ns.input.setDevice('touch'));
      await pg.waitForTimeout(600);
      await pg.screenshot({ path: `${out}/live-${name}-play.png` });
      res[name + '-audio'] = await pg.evaluate(() => ({ ctx: window.__ns.audio.ctx && window.__ns.audio.ctx.state, log: window.__ns.audio.playLog.slice(-4) }));
    }
    res[name] = { notice, errs };
    await ctx.close();
  }
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
