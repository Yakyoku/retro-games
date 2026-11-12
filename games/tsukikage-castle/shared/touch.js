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
  st.textContent = `
  #touch { position:fixed; inset:0; pointer-events:none; z-index:20; display:none; --lift:max(18vh, 72px); }
  #touch.on { display:block; }
  #touch .t-zone { position:absolute; left:calc(16px + env(safe-area-inset-left)); bottom:calc(var(--lift) + env(safe-area-inset-bottom)); width:min(42vw, 420px); height:min(52vh, 360px); pointer-events:auto; touch-action:none; }
  #touch .t-ring { position:absolute; width:150px; height:150px; margin:-75px 0 0 -75px; left:50%; top:60%; border-radius:50%; border:2px solid rgba(243,200,106,.45); background:rgba(10,12,24,.25); }
  #touch .t-knob { position:absolute; left:50%; top:50%; width:64px; height:64px; margin:-32px 0 0 -32px; border-radius:50%; background:radial-gradient(circle at 35% 35%, #fff6dc, #c8a050); opacity:.85; }
  #touch .t-btn { position:absolute; pointer-events:auto; touch-action:none; border-radius:50%; border:2px solid rgba(243,200,106,.6); color:#fff8e6; font:700 30px "Hiragino Mincho ProN","Yu Mincho",serif;
    background:radial-gradient(circle at 35% 30%, rgba(90,80,140,.75), rgba(20,16,40,.75)); -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent; }
  #touch .t-btn.down { background:radial-gradient(circle at 35% 30%, rgba(243,200,106,.9), rgba(120,80,20,.85)); color:#000; }
  #touch .t-jump { width:96px; height:96px; right:calc(24px + env(safe-area-inset-right)); bottom:calc(var(--lift) + env(safe-area-inset-bottom)); }
  #touch .t-attack { width:104px; height:104px; right:calc(140px + env(safe-area-inset-right)); bottom:calc(var(--lift) - 26px + env(safe-area-inset-bottom)); }
  #touch .t-pause { width:56px; height:56px; right:calc(18px + env(safe-area-inset-right)); top:calc(96px + env(safe-area-inset-top)); font:700 18px system-ui; }
  #touch.lefty .t-zone { left:auto; right:calc(16px + env(safe-area-inset-right)); }
  #touch.lefty .t-jump { right:auto; left:calc(24px + env(safe-area-inset-left)); }
  #touch.lefty .t-attack { right:auto; left:calc(140px + env(safe-area-inset-left)); }
  @media (max-height:420px) { #touch .t-jump { width:80px; height:80px; } #touch .t-attack { width:88px; height:88px; right:calc(120px + env(safe-area-inset-right)); } #touch.lefty .t-attack { left:calc(120px + env(safe-area-inset-left)); } #touch { --lift:max(14vh, 56px); } }`;
  document.head.appendChild(st);
  const state = { left: false, right: false, up: false, down: false, jump: false, attack: false, pause: false };
  const push = () => app.input.setTouch({ ...state });
  const zone = root.querySelector('.t-zone'), ring = root.querySelector('.t-ring'), knob = root.querySelector('.t-knob');
  let stickId = null, cx = 0, cy = 0;
  const show = (on) => { root.classList.toggle('on', on); app.touchVisible = on; };
  const setStick = (dx, dy) => {
    const r = 60, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / r);
    knob.style.transform = `translate(${(dx / d) * k * r}px, ${(dy / d) * k * r}px)`;
    const dead = 14;
    state.left = dx < -dead && Math.abs(dx) > Math.abs(dy) * 0.5; state.right = dx > dead && Math.abs(dx) > Math.abs(dy) * 0.5;
    state.up = dy < -dead * 1.6 && Math.abs(dy) > Math.abs(dx) * 0.7; state.down = dy > dead * 1.6 && Math.abs(dy) > Math.abs(dx) * 0.7;
    push();
  };
  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return; stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
    const b = zone.getBoundingClientRect(); cx = e.clientX; cy = e.clientY;
    ring.style.left = `${cx - b.left}px`; ring.style.top = `${cy - b.top}px`; setStick(0, 0); app.unlock();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
    if (d > 80) { cx += (dx / d) * (d - 80); cy += (dy / d) * (d - 80); dx = e.clientX - cx; dy = e.clientY - cy; } // 指が輪の外へ出たら中心が付いてくる
    setStick(dx, dy);
  });
  const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; state.left = state.right = state.up = state.down = false; knob.style.transform = ''; push(); };
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
