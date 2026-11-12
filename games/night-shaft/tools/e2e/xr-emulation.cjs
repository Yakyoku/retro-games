const { chromium } = require('playwright');
const fs = require('fs');
const { serveDist } = require('../pw-serve.cjs');
const IWER = fs.readFileSync(process.env.IWER || (__dirname + '/iwer/node_modules/iwer/build/iwer.min.js'), 'utf8');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const o = await serveDist(ctx, require('path').join(__dirname, '../../../../dist'));
  await ctx.addInitScript(IWER + ';window.__dev = new IWER.XRDevice(IWER.metaQuest3); window.__dev.installRuntime({ forceInstall: true });');
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(o + '/?debug=1');
  await pg.waitForTimeout(1500);
  const R = {};
  R.vrButtonEnabled = await pg.evaluate(() => !document.querySelector('#btn-vr').disabled);
  await pg.selectOption('#sel-stage', '1').catch(()=>{});
  await pg.evaluate(() => { const s = document.querySelector('#sel-stage'); s.querySelector('option[value="1"]').disabled = false; s.value = '1'; });
  await pg.click('#btn-vr');
  await pg.waitForTimeout(2500);
  const st = () => pg.evaluate(() => { const n = window.__ns, g = n.game, p = g && g.player; return { mode: n.mode, state: n.state, x: p && +p.x.toFixed(2), y: p && p.y, z: p && +p.z.toFixed(2), crouch: p && p.crouch, docs: g && g.docsGot, rot: +n.dolly.rotation.y.toFixed(3), fb: document.querySelector('#debug').textContent.split('\n')[1] }; });
  R.entered = await st();
  await pg.screenshot({ path: out + '/xr-1.png' });
  const dev = (code) => pg.evaluate(code);
  const press = async (hand, id, ms = 320) => { await dev(`__dev.controllers.${hand}.updateButtonValue('${id}', 1)`); await pg.waitForTimeout(ms); await dev(`__dev.controllers.${hand}.updateButtonValue('${id}', 0)`); await pg.waitForTimeout(320); };
  // 敵を正面 4m に置き、右手を前（+x）へ向けて撃つ
  await dev(`(() => { const g = window.__ns.game; g.opts.invincible = true; const p = g.player; const e = g.addEnemy(p.x + 4, p.y, 0, 'patrol'); e.turnT = 999; e.dir = -1; window.__target = e; })()`);
  await dev(`(() => { const c = __dev.controllers.right; const d = window.__ns.dolly; d.updateMatrixWorld(true); })()`);
  // コントローラーをリグ基準で +x 方向（ワールド）へ向ける: リグの回転を打ち消す向きを設定
  const aimAt = (hand, pitch, px) => dev(`(() => { const rot = window.__ns.dolly.rotation.y; const a = -Math.PI/2 - rot; const p = ${pitch};
    const qy=[0,Math.sin(a/2),0,Math.cos(a/2)], qx=[Math.sin(p/2),0,0,Math.cos(p/2)];
    const q=[qy[3]*qx[0]+qy[0]*qx[3]+qy[1]*qx[2]-qy[2]*qx[1], qy[3]*qx[1]-qy[0]*qx[2]+qy[1]*qx[3]+qy[2]*qx[0], qy[3]*qx[2]+qy[0]*qx[1]-qy[1]*qx[0]+qy[2]*qx[3], qy[3]*qx[3]-qy[0]*qx[0]-qy[1]*qx[1]-qy[2]*qx[2]];
    const c = __dev.controllers.${hand}; c.position.set(${px}, 1.3, -0.2); c.quaternion.set(q[0],q[1],q[2],q[3]); })()`);
  await aimAt('right', 0, 0.15);
  await pg.waitForTimeout(300);
  for (let i = 0; i < 4; i++) await press('right', 'trigger', 100);
  await pg.waitForTimeout(600);
  R.enemyAfterShots = await dev(`({ alive: window.__target.alive, cause: window.__target.cause, score: window.__ns.game.score, shotsLogged: window.__ns.audio.playLog.filter(l => l[1]==='sfx:shot').length, px: window.__ns.game.player.x, ex: window.__target.x })`);
  // A でしゃがみ切替
  await press('right', 'a-button'); R.crouchAfterA = (await st()).crouch; await press('right', 'a-button');
  // スナップターン
  const r0 = (await st()).rot; await dev(`__dev.controllers.right.updateAxes('thumbstick', 1, 0)`); await pg.waitForTimeout(200); await dev(`__dev.controllers.right.updateAxes('thumbstick', 0, 0)`); await pg.waitForTimeout(200);
  R.snapTurnDeg = +(((await st()).rot - r0) * 180 / Math.PI).toFixed(1);
  await dev(`__dev.controllers.right.updateAxes('thumbstick', -1, 0)`); await pg.waitForTimeout(200); await dev(`__dev.controllers.right.updateAxes('thumbstick', 0, 0)`); await pg.waitForTimeout(200);
  // テレポート: 左手を前下へ向け、スティックを倒して戻す
  const x0 = (await st()).x;
  await aimAt('left', -0.45, -0.15);
  await dev(`__dev.controllers.left.updateAxes('thumbstick', 0, -1)`); await pg.waitForTimeout(400);
  await pg.screenshot({ path: out + '/xr-2-teleport-aim.png' });
  R.teleportAim = await dev(`({ ok: !!(document && true) })`);
  await dev(`__dev.controllers.left.updateAxes('thumbstick', 0, 0)`); await pg.waitForTimeout(500);
  R.teleportDx = +((await st()).x - x0).toFixed(2);
  // B で一時停止 → VR 内メニュー → B で戻る
  await press('right', 'b-button'); R.afterB = (await st()).state;
  R.menuVisible = await dev(`window.__ns.scene.children.some(o => o.geometry && o.geometry.parameters && o.geometry.parameters.width === 1.3 && o.visible)`);
  await pg.screenshot({ path: out + '/xr-3-menu.png' });
  await press('right', 'b-button'); R.afterB2 = (await st()).state;
  // かご: プレイヤーをかごへ入れ、右スティック下で下降
  await dev(`(() => { const g = window.__ns.game; const c = g.cars.find(c => Math.abs(c.y - g.player.y) < 0.01); window.__car = c; })()`);
  R.carFound = await dev(`!!window.__car`);
  if (R.carFound) {
    await dev(`window.__ns.teleportTo(window.__car.x, 0)`);
    await pg.waitForTimeout(400);
    const y0 = (await st()).y;
    await dev(`__dev.controllers.right.updateAxes('thumbstick', 0, 1)`); await pg.waitForTimeout(1500); await dev(`__dev.controllers.right.updateAxes('thumbstick', 0, 0)`); await pg.waitForTimeout(2500);
    const s2 = await st();
    R.carRide = { y0, y1: s2.y, floorsDown: (y0 - s2.y) / 3, state: s2.state, insideCar: await dev(`window.__ns.game.player.support && window.__ns.game.player.support.kind`) };
  }
  // セッションの見え方が変わったら一時停止
  await dev(`__dev.updateVisibilityState('visible-blurred')`); await pg.waitForTimeout(300); R.blurPause = (await st()).state; await dev(`__dev.updateVisibilityState('visible')`); await pg.waitForTimeout(200);
  // 終了 → 再入場
  await dev(`window.__ns.renderer.xr.getSession().end()`); await pg.waitForTimeout(800); R.afterEnd = await st();
  R.topVisible = await dev(`getComputedStyle(document.querySelector('#top')).display !== 'none'`);
  await pg.click('#btn-vr'); await pg.waitForTimeout(2000); R.reenter = await st();
  R.errors = errs;
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})();
