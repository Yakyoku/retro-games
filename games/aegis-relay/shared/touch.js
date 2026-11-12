// AEGIS RELAY — タッチ操作（iPad / スマホ）。指（pointerType=touch）で触れたときだけ出る
// 左: 触れた所が中心になる浮きスティック（移動）、右下: 射撃（押している間連射）、その左: 自動連射の切り替え、右上: ポーズ
// 複数の指を同時に扱う（移動しながら撃てる）。指が離れた・画面外へ出た・キャンセルされたら必ず離した扱い。
export function installTouch(root, input, app) {
  const el = document.createElement('div');
  el.className = 'touch';
  el.innerHTML = `<div class="zone"><div class="stick" style="display:none"><div class="knob"></div></div></div>
    <div class="btn auto">自動<br>連射</div><div class="btn fire">FIRE</div><div class="btn pause">II</div>`;
  root.appendChild(el);
  const zone = el.querySelector('.zone'), stick = el.querySelector('.stick'), knob = el.querySelector('.knob');
  const fire = el.querySelector('.fire'), auto = el.querySelector('.auto'), pauseB = el.querySelector('.pause');
  let stickId = null, cx = 0, cy = 0, fireIds = new Set();
  const R = 54;

  const show = (on) => { el.classList.toggle('on', on); };
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { show(app.screen === 'play'); input.device = 'touch'; } }, true);
  addEventListener('keydown', () => show(false));

  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault(); stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
    const r = zone.getBoundingClientRect(); cx = e.clientX - r.left; cy = e.clientY - r.top;
    Object.assign(stick.style, { display: 'block', left: cx + 'px', top: cy + 'px' }); knob.style.transform = '';
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    const r = zone.getBoundingClientRect(); let dx = e.clientX - r.left - cx, dy = e.clientY - r.top - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { cx += (dx / d) * (d - R); cy += (dy / d) * (d - R); dx = (dx / d) * R; dy = (dy / d) * R; Object.assign(stick.style, { left: cx + 'px', top: cy + 'px' }); }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, d / R), dead = 0.12;
    const k = m < dead ? 0 : (m - dead) / (1 - dead) / m;
    input.ext.mx = (dx / R) * k; input.ext.my = (dy / R) * k;
  });
  const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; input.ext.mx = input.ext.my = 0; stick.style.display = 'none'; };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(t, endStick);

  fire.addEventListener('pointerdown', (e) => { e.preventDefault(); fire.setPointerCapture(e.pointerId); fireIds.add(e.pointerId); input.ext.fire = true; fire.classList.add('down'); });
  const endFire = (e) => { fireIds.delete(e.pointerId); if (!fireIds.size) { input.ext.fire = false; fire.classList.remove('down'); } };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) fire.addEventListener(t, endFire);
  auto.addEventListener('pointerup', () => { app.game && (app.game.flags.autofire = !app.game.flags.autofire); if (app.game?.flags.autofire) app.mode = 'assist'; sync(); });
  pauseB.addEventListener('pointerup', () => app.pause('user'));
  function sync() { auto.classList.toggle('on', !!app.game?.flags.autofire); }
  const reset = () => { stickId = null; fireIds.clear(); input.ext.mx = input.ext.my = 0; input.ext.fire = false; stick.style.display = 'none'; fire.classList.remove('down'); };
  addEventListener('blur', reset); document.addEventListener('visibilitychange', reset);
  return { update() { if (app.screen !== 'play') { el.classList.remove('on'); reset(); } else if (input.device === 'touch') el.classList.add('on'); sync(); } };
}
