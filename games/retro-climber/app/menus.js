// 鉄骨レスキュー — メニューの部品。1 つの「メニューの中身」（題・本文・項目）を DOM に描き、同じ中身を VR の板にも渡す。
// 項目: { label, value?: () => string, act?: () => void, lr?: (d) => void, disabled?: bool, primary?: bool, note?: string }
export class MenuView {
  constructor(ul, onSound) {
    this.ul = ul; this.items = []; this.sel = 0; this.onSound = onSound || (() => {});
    this.lastKey = '';
  }
  set(items, sel = 0) {
    this.items = items; this.sel = Math.max(0, Math.min(items.length - 1, sel));
    while (this.items[this.sel] && this.items[this.sel].disabled && this.sel < this.items.length - 1) this.sel++;
    this.render(true);
  }
  render(force = false) {
    const key = this.items.map((it, i) => `${it.label}|${it.value ? it.value() : ''}|${i === this.sel}|${it.disabled}`).join('§');
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    this.ul.textContent = '';
    this.items.forEach((it, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'menuitem');
      if (i === this.sel) li.classList.add('sel');
      if (it.disabled) li.classList.add('dis');
      if (it.primary) li.classList.add('primary');
      const l = document.createElement('span'); l.textContent = it.label;
      if (it.note) { const n = document.createElement('small'); n.textContent = '　' + it.note; l.appendChild(n); }
      li.appendChild(l);
      if (it.value) {
        const v = document.createElement('span'); v.className = 'v';
        if (it.lr) { const a = document.createElement('span'); a.className = 'lr'; a.textContent = '◀'; a.dataset.d = '-1'; v.appendChild(a); }
        v.appendChild(document.createTextNode(it.value()));
        if (it.lr) { const a = document.createElement('span'); a.className = 'lr'; a.textContent = '▶'; a.dataset.d = '1'; v.appendChild(a); }
        li.appendChild(v);
      }
      li.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && this.sel !== i && !it.disabled) { this.sel = i; this.render(); } });
      li.addEventListener('click', (e) => {
        if (it.disabled) return;
        this.sel = i;
        const d = e.target && e.target.dataset && e.target.dataset.d;
        if (d && it.lr) { it.lr(+d); this.onSound('menuMove'); this.render(true); return; }
        if (it.act) { this.onSound('menuOk'); it.act(); }
        else if (it.lr) { it.lr(1); this.onSound('menuMove'); this.render(true); }
      });
      this.ul.appendChild(li);
    });
  }
  move(d) {
    if (!this.items.length) return;
    let i = this.sel;
    for (let k = 0; k < this.items.length; k++) { i = (i + d + this.items.length) % this.items.length; if (!this.items[i].disabled) break; }
    if (i !== this.sel) { this.sel = i; this.onSound('menuMove'); this.render(); }
  }
  lr(d) { const it = this.items[this.sel]; if (it && it.lr && !it.disabled) { it.lr(d); this.onSound('menuMove'); this.render(true); } }
  confirm() { const it = this.items[this.sel]; if (it && !it.disabled) { if (it.act) { this.onSound('menuOk'); it.act(); } else if (it.lr) { it.lr(1); this.onSound('menuMove'); this.render(true); } } }
  // VR の板から: i 番目を選んで決定
  pick(i, d = 0) { const it = this.items[i]; if (!it || it.disabled) return; this.sel = i; if (d && it.lr) { it.lr(d); this.onSound('menuMove'); this.render(true); return; } this.confirm(); }
}

export const bar = (n) => '■'.repeat(n) + '□'.repeat(10 - n);
