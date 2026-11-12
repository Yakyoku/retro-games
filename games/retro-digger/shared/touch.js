// タッチ操作: 左に方向パッド、右に大きなポンプボタン、右上に一時停止。移動と攻撃を同時に押せる（マルチタッチ）。
// 指で触れたときだけ表示する（body.touching）。
export function installTouch(input, { onPause } = {}) {
  const root = document.createElement('div'); root.className = 'touch';
  root.innerHTML = '<div class="pad"><i class="arr u"></i><i class="arr d"></i><i class="arr l"></i><i class="arr r"></i></div>' +
    '<div class="fire">ポンプ</div><div class="pause" aria-label="一時停止">II</div>';
  document.body.appendChild(root);
  const pad = root.querySelector('.pad'), fire = root.querySelector('.fire'), pause = root.querySelector('.pause');
  const arrows = { up: pad.querySelector('.u'), down: pad.querySelector('.d'), left: pad.querySelector('.l'), right: pad.querySelector('.r') };
  let padId = null, fireId = null;
  addEventListener('touchstart', () => document.body.classList.add('touching'), { passive: true, capture: true });
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') document.body.classList.remove('touching'); }, true);

  function dirFrom(e) {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.12) return null; // 中心付近は無入力
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }
  function showDir(d) { for (const k in arrows) arrows[k].classList.toggle('on', k === d); }
  pad.addEventListener('pointerdown', (e) => { padId = e.pointerId; pad.setPointerCapture(e.pointerId); const d = dirFrom(e); input.setTouchDir(d); showDir(d); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId !== padId) return; const d = dirFrom(e); input.setTouchDir(d); showDir(d); });
  const padEnd = (e) => { if (e.pointerId !== padId) return; padId = null; input.setTouchDir(null); showDir(null); };
  pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd); pad.addEventListener('lostpointercapture', padEnd);
  fire.addEventListener('pointerdown', (e) => { fireId = e.pointerId; fire.setPointerCapture(e.pointerId); input.setTouchPump(true); fire.classList.add('on'); e.preventDefault(); });
  const fireEnd = (e) => { if (e.pointerId !== fireId) return; fireId = null; input.setTouchPump(false); fire.classList.remove('on'); };
  fire.addEventListener('pointerup', fireEnd); fire.addEventListener('pointercancel', fireEnd); fire.addEventListener('lostpointercapture', fireEnd);
  pause.addEventListener('pointerdown', (e) => { e.preventDefault(); onPause && onPause(); });
  return {
    reset() { padId = fireId = null; input.setTouchDir(null); input.setTouchPump(false); showDir(null); fire.classList.remove('on'); },
    show(v) { root.style.visibility = v ? 'visible' : 'hidden'; },
  };
}
