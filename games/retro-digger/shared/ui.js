// HTML のメニュー（2D と通常 3D で共通）。マウス・タッチ・キーボード・ゲームパッドだけで全画面を操作できる。
// 項目: { label, sub?, action?, kind?: 'button'|'choice'|'slider'|'toggle', get?, set?, options?, min?, max?, step?, disabled? }
export const CREDIT = 'このゲームはClaude Codeのクラウドセッションで制作しました。';

export function createMenu(root, { onSound } = {}) {
  const el = document.createElement('div');
  el.className = 'menu-layer'; el.hidden = true;
  root.appendChild(el);
  let cur = null, focus = 0, items = [], btns = [];
  const snd = (n) => onSound && onSound(n);

  function show(screen) {
    cur = screen; items = screen.items || []; focus = Math.max(0, items.findIndex((i) => !i.disabled));
    if (screen.focus != null) focus = screen.focus;
    render(); el.hidden = false;
  }
  function hide() { el.hidden = true; cur = null; }
  function render() {
    const s = cur;
    el.innerHTML = '';
    const panel = document.createElement('div'); panel.className = 'menu-panel' + (s.wide ? ' wide' : '');
    if (s.kicker) { const k = document.createElement('div'); k.className = 'menu-kicker'; k.textContent = s.kicker; panel.appendChild(k); }
    if (s.title) { const h = document.createElement('h2'); h.className = 'menu-title'; h.textContent = s.title; panel.appendChild(h); }
    if (s.text) { const p = document.createElement('div'); p.className = 'menu-text'; if (s.html) p.innerHTML = s.text; else p.textContent = s.text; panel.appendChild(p); }
    const list = document.createElement('div'); list.className = 'menu-list';
    btns = items.map((it, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'menu-item' + (it.kind ? ' k-' + it.kind : '');
      b.disabled = !!it.disabled;
      const l = document.createElement('span'); l.className = 'mi-label'; l.textContent = it.label; b.appendChild(l);
      if (it.kind && it.kind !== 'button') { const v = document.createElement('span'); v.className = 'mi-value'; b.appendChild(v); }
      if (it.sub) { const u = document.createElement('span'); u.className = 'mi-sub'; u.textContent = it.sub; b.appendChild(u); }
      b.addEventListener('click', (e) => {
        focus = i; mark();
        if (it.kind === 'slider') { const r = b.getBoundingClientRect(); const k = (e.clientX - r.left) / r.width; if (e.detail) setSlider(it, k > 0.5 ? 1 : -1); return; }
        activate(it, 1);
      });
      b.addEventListener('mouseenter', () => { if (focus !== i && !it.disabled) { focus = i; mark(); } });
      list.appendChild(b);
      return b;
    });
    panel.appendChild(list);
    if (s.foot) { const f = document.createElement('div'); f.className = 'menu-foot'; f.textContent = s.foot; panel.appendChild(f); }
    if (s.credit) { const c = document.createElement('div'); c.className = 'menu-credit'; c.textContent = CREDIT; panel.appendChild(c); }
    el.appendChild(panel);
    mark();
  }
  function valueText(it) {
    if (it.kind === 'toggle') return it.get() ? 'オン' : 'オフ';
    if (it.kind === 'choice') { const v = it.get(); const o = it.options.find((o) => o.value === v); return o ? o.label : String(v); }
    if (it.kind === 'slider') return Math.round(it.get() * 100) + '%';
    return '';
  }
  function mark() {
    btns.forEach((b, i) => {
      b.classList.toggle('focus', i === focus);
      const it = items[i]; const v = b.querySelector('.mi-value'); if (v) v.textContent = valueText(it);
      if (it.kind === 'slider') b.style.setProperty('--fill', Math.round(it.get() * 100) + '%');
    });
    const b = btns[focus]; if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
  }
  function setSlider(it, d) {
    const step = it.step || 0.1; const v = Math.max(it.min ?? 0, Math.min(it.max ?? 1, Math.round((it.get() + d * step) * 100) / 100));
    it.set(v); snd('ui-move'); mark();
  }
  function activate(it, d) {
    if (!it || it.disabled) return;
    if (it.kind === 'toggle') { it.set(!it.get()); snd('ui-select'); mark(); return; }
    if (it.kind === 'choice') {
      const o = it.options; let k = o.findIndex((x) => x.value === it.get()); k = (k + d + o.length) % o.length;
      it.set(o[k].value); snd('ui-move'); mark(); return;
    }
    if (it.kind === 'slider') { setSlider(it, d); return; }
    snd(it.back ? 'ui-back' : 'ui-select');
    if (it.action) it.action();
  }
  function move(d) {
    if (!items.length) return;
    let k = focus;
    for (let n = 0; n < items.length; n++) { k = (k + d + items.length) % items.length; if (!items[k].disabled) break; }
    if (k !== focus) { focus = k; snd('ui-move'); mark(); }
  }
  // 入力（input.read() の結果）で操作
  function handle(inp) {
    if (!cur) return false;
    const p = inp.pressed;
    if (p.has('up')) move(-1);
    if (p.has('down')) move(1);
    const it = items[focus];
    if (p.has('left') && it && it.kind && it.kind !== 'button') activate(it, -1);
    if (p.has('right') && it && it.kind && it.kind !== 'button') activate(it, 1);
    if (p.has('confirm') || (p.has('pump') && inp.device !== 'keyboard')) activate(it, 1);
    else if (p.has('pump') && inp.device === 'keyboard') activate(it, 1);
    if ((p.has('back') || p.has('pause')) && cur && cur.onBack) { snd('ui-back'); cur.onBack(); }
    return true;
  }
  return { show, hide, handle, refresh: mark, get open() { return !!cur; }, get screen() { return cur; } };
}
