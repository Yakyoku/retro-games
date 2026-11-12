// 月影の魔城 — タッチ操作。指で触れたときだけ表示（マウスでは出ない）。複数の指に対応（移動しながら跳ぶ・投げる）。
// 左: 触れた場所が中心になる方向の円（上下左右）。右: 「跳」「投」。右上: ポーズ。左利き設定で左右を入れ替える。
// 下端（ホームへ戻るスワイプ）と左端（戻るスワイプ）から離して置く。指が離れた・取り消された・画面を離れたら必ず解放。
export function installTouch(app, host) {
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="t-zone" data-z="stick"><div class="t-ring"><div class="t-knob"></div></div></div>
    <button class="t-btn t-jump" data-a="jump" aria-label="ジャンプ">跳</button>
    <button class="t-btn t-attack" data-a="attack" aria-label="攻撃">投</button>
    <button class="t-btn t-pause" data-a="pause" aria-label="ポーズ">II</button>`;
  host.appendChild(root);
  const st = document.createElement('style');
  // 大きさは画面の短い辺に合わせる（--u）。押していないときは半透明、スティックは触れた場所に小さく出る
  st.textContent = `
  #touch { position:fixed; inset:0; pointer-events:none; z-index:20; display:none; --u:clamp(46px, 11vmin, 76px); --lift:max(10vh, 40px); }
  #touch.on { display:block; }
  #touch .t-zone { position:absolute; left:calc(12px + env(safe-area-inset-left)); bottom:calc(var(--lift) + env(safe-area-inset-bottom)); width:min(40vw, 380px); height:min(56vh, 340px); pointer-events:auto; touch-action:none; }
  #touch .t-ring { position:absolute; width:calc(var(--u) * 1.45); height:calc(var(--u) * 1.45); transform:translate(-50%, -50%); left:calc(var(--u) * 1.0); top:calc(100% - var(--u) * 1.0); border-radius:50%;
    border:1.5px solid rgba(243,200,106,.28); background:radial-gradient(circle, rgba(10,12,24,.10), rgba(10,12,24,.22)); opacity:.45; transition:opacity .15s; }
  #touch .t-zone.active .t-ring { opacity:1; border-color:rgba(243,200,106,.55); }
  #touch .t-knob { position:absolute; left:50%; top:50%; width:calc(var(--u) * 0.62); height:calc(var(--u) * 0.62); margin:calc(var(--u) * -0.31) 0 0 calc(var(--u) * -0.31); border-radius:50%;
    background:radial-gradient(circle at 35% 30%, rgba(255,246,220,.9), rgba(200,160,80,.75)); box-shadow:0 2px 8px rgba(0,0,0,.4); }
  #touch .t-btn { position:absolute; pointer-events:auto; touch-action:none; border-radius:50%; border:1.5px solid rgba(243,200,106,.45); color:rgba(255,248,230,.92);
    font:700 calc(var(--u) * 0.36) "Hiragino Mincho ProN","Yu Mincho",serif; background:radial-gradient(circle at 35% 30%, rgba(90,80,140,.42), rgba(20,16,40,.42));
    -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent; transition:transform .06s, background .06s; }
  #touch .t-btn.down { background:radial-gradient(circle at 35% 30%, rgba(243,200,106,.85), rgba(120,80,20,.75)); color:#000; transform:scale(.92); }
  #touch .t-jump { width:var(--u); height:var(--u); right:calc(14px + env(safe-area-inset-right)); bottom:calc(var(--lift) + var(--u) * 0.55 + env(safe-area-inset-bottom)); }
  #touch .t-attack { width:calc(var(--u) * 1.08); height:calc(var(--u) * 1.08); right:calc(14px + var(--u) * 1.18 + env(safe-area-inset-right)); bottom:calc(var(--lift) + env(safe-area-inset-bottom)); }
  #touch .t-pause { width:calc(var(--u) * 0.58); height:calc(var(--u) * 0.58); right:calc(10px + env(safe-area-inset-right)); top:calc(10px + env(safe-area-inset-top)); font:700 calc(var(--u) * 0.2) system-ui; opacity:.75; }
  #touch.lefty .t-zone { left:auto; right:calc(12px + env(safe-area-inset-right)); }
  #touch.lefty .t-zone .t-ring { left:auto; right:calc(var(--u) * 0.0); }
  #touch.lefty .t-jump { right:auto; left:calc(14px + env(safe-area-inset-left)); }
  #touch.lefty .t-attack { right:auto; left:calc(14px + var(--u) * 1.18 + env(safe-area-inset-left)); }
  #touch.lefty .t-pause { right:auto; left:calc(10px + env(safe-area-inset-left)); }
  @media (max-height:500px) { #touch { --u:clamp(42px, 12.5vmin, 62px); --lift:max(6vh, 20px); } }`;
  document.head.appendChild(st);
  const state = { left: false, right: false, up: false, down: false, jump: false, attack: false, pause: false };
  const push = () => app.input.setTouch({ ...state });
  const zone = root.querySelector('.t-zone'), ring = root.querySelector('.t-ring'), knob = root.querySelector('.t-knob');
  let stickId = null, cx = 0, cy = 0;
  const show = (on) => { root.classList.toggle('on', on); app.touchVisible = on; };
  const setStick = (dx, dy) => {
    const r = ring.offsetWidth * 0.36, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / r);
    knob.style.transform = `translate(${(dx / d) * k * r}px, ${(dy / d) * k * r}px)`;
    const dead = Math.max(8, r * 0.28);
    state.left = dx < -dead && Math.abs(dx) > Math.abs(dy) * 0.5; state.right = dx > dead && Math.abs(dx) > Math.abs(dy) * 0.5;
    state.up = dy < -dead * 1.6 && Math.abs(dy) > Math.abs(dx) * 0.7; state.down = dy > dead * 1.6 && Math.abs(dy) > Math.abs(dx) * 0.7;
    push();
  };
  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return; stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
    const b = zone.getBoundingClientRect(); cx = e.clientX; cy = e.clientY;
    ring.style.left = `${cx - b.left}px`; ring.style.top = `${cy - b.top}px`; ring.style.right = 'auto'; zone.classList.add('active'); setStick(0, 0); app.unlock();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
    const lim = ring.offsetWidth * 0.6; if (d > lim) { cx += (dx / d) * (d - lim); cy += (dy / d) * (d - lim); dx = e.clientX - cx; dy = e.clientY - cy; } // 指が輪の外へ出たら中心が付いてくる
    setStick(dx, dy);
  });
  const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; state.left = state.right = state.up = state.down = false; knob.style.transform = ''; zone.classList.remove('active'); ring.style.left = ''; ring.style.top = ''; ring.style.right = ''; push(); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ev, endStick);
  for (const b of root.querySelectorAll('.t-btn')) {
    const a = b.dataset.a;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); state[a] = true; b.classList.add('down'); push(); app.unlock(); if (navigator.vibrate) navigator.vibrate(8); });
    const up = () => { state[a] = false; b.classList.remove('down'); push(); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
  }
  const releaseAll = () => { for (const k of Object.keys(state)) state[k] = false; stickId = null; knob.style.transform = ''; root.querySelectorAll('.down').forEach((x) => x.classList.remove('down')); push(); };
  addEventListener('blur', releaseAll); document.addEventListener('visibilitychange', releaseAll);
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') show(true); }, true);
  addEventListener('keydown', () => show(false)); addEventListener('gamepadconnected', () => show(false));
  const lefty = () => root.classList.toggle('lefty', !!app.save.controls.leftHanded);
  lefty();
  return { root, lefty, show, releaseAll, visible: () => root.classList.contains('on') };
}
