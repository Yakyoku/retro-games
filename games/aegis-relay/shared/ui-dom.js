// AEGIS RELAY — HTML の HUD・メニュー・帯（2D 版と 3D 版の通常画面で共通）
// 文字は DOM で描くので 4K でもにじまない。盤面の大きさ（--u = 盤面の高さ / 320）に合わせて拡大する。
import { HOWTO } from './app.js';
import { store } from './store.js';
import { AREAS, FIELD, TUNING } from './rules.js';

// 盤面（3:4）を画面に置く。横長なら左右が HUD、縦長なら上に HUD の帯
export function computeLayout(w, h) {
  const portrait = w / h < 0.95;
  let fh, fw, fx, fy, hud;
  if (!portrait) {
    fh = h; fw = fh * FIELD.W / FIELD.H;
    if (fw > w * 0.7) { fw = w * 0.7; fh = fw * FIELD.H / FIELD.W; }
    fx = (w - fw) / 2; fy = (h - fh) / 2; hud = 'side';
  } else {
    const top = Math.min(84, h * 0.1);
    fw = w; fh = fw * FIELD.H / FIELD.W;
    if (fh > h - top) { fh = h - top; fw = fh * FIELD.W / FIELD.H; }
    fx = (w - fw) / 2; fy = Math.max(top, (h - fh) / 2 + top / 2); if (fy + fh > h) fy = h - fh; hud = h - fh >= 56 ? 'top' : 'overlay';
  }
  return { w, h, fx, fy, fw, fh, portrait, hud, u: fh / FIELD.H };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => String(Math.floor(n)).padStart(7, ' ');

export function createDomUI(root, app, opts = {}) {
  root.innerHTML = `
    <div class="hud left"></div><div class="hud right"></div><div class="hud top"></div>
    <div class="banner" style="opacity:0"><div class="t"></div><div class="s"></div></div>
    <div class="menu"></div>
    <div class="foot">MADE WITH CLAUDE</div>`;
  const L = root.querySelector('.hud.left'), R = root.querySelector('.hud.right'), TOP = root.querySelector('.hud.top');
  const banner = root.querySelector('.banner'), menuEl = root.querySelector('.menu');
  let layout = null, lastHud = '';

  function place(lay) {
    layout = lay;
    document.documentElement.style.setProperty('--u', lay.u + 'px');
    document.documentElement.style.setProperty('--ui', app.settings.uiScale);
    const side = lay.hud === 'side';
    L.style.display = R.style.display = side ? 'flex' : 'none';
    TOP.style.display = side ? 'none' : 'flex';
    if (side) {
      const sw = lay.fx;
      Object.assign(L.style, { left: '0', top: lay.fy + 'px', width: sw + 'px', alignItems: 'flex-end' });
      Object.assign(R.style, { left: lay.fx + lay.fw + 'px', top: lay.fy + 'px', width: sw + 'px', alignItems: 'flex-start' });
    } else Object.assign(TOP.style, { left: lay.fx + 'px', top: (lay.hud === 'top' ? Math.max(0, lay.fy - 60) : lay.fy) + 'px', width: lay.fw + 'px' });
    Object.assign(menuEl.style, { left: lay.fx + 'px', top: lay.fy + 'px', width: lay.fw + 'px', height: lay.fh + 'px' });
    Object.assign(banner.style, { left: lay.fx + lay.fw / 2 + 'px', top: lay.fy + lay.fh * 0.4 + 'px' });
    lastHud = '';
  }

  function hud() {
    const g = app.game;
    const showHud = g && (app.screen === 'play' || app.screen === 'pause' || app.screen === 'settings');
    const mode = app.mode || (app.settings.autofire ? 'assist' : 'standard');
    const best = Math.max(store.best(mode), g ? g.score : 0);
    if (!showHud) { const k = 'none' + best; if (k !== lastHud) { lastHud = k; L.innerHTML = R.innerHTML = TOP.innerHTML = ''; } return; }
    const p = g.player;
    const chain = Object.values(g.chains).find((c) => c.state === 'run');
    const twin = Object.values(g.twins).find((t) => !t.resolved);
    const bonus = chain ? `ラティス ${chain.count}/8` : twin ? 'ジェミニ接近 — 合体前に両方を' : g.partner ? '支援機 ARC に触れて合体' : '';
    const key = [g.score, best, g.lives, g.area, g.loop, p.docked, bonus, mode, g.flags.tainted].join('|');
    if (key === lastHud) return; lastHud = key;
    const lives = '<i></i>'.repeat(Math.max(0, Math.min(TUNING.maxLives, g.lives - (p.alive ? 1 : 0))));
    const tag = mode === 'assist' ? '<span class="tag">補助: 自動連射（別枠の記録）</span>' : '';
    const dbg = g.flags.tainted ? '<span class="tag" style="border-color:#ff4fa8;color:#ff4fa8">記録しない（デバッグ）</span>' : '';
    if (layout.hud === 'side') {
      L.innerHTML = `<div class="card"><div class="lab">SCORE</div><div class="val">${fmt(g.score)}</div></div>
        <div class="card"><div class="lab">HI-SCORE</div><div class="val small">${fmt(best)}</div></div>
        <div class="card"><div class="lab">AREA</div><div class="val small">${g.area + 1} / ${AREAS.length}　<span style="color:var(--dim)">LOOP ${g.loop + 1}</span></div><div class="lab" style="margin-top:4px">${esc(AREAS[g.area].jp)}</div></div>`;
      R.innerHTML = `<div class="card"><div class="lab">SHIPS</div><div class="lives">${lives || '<span class="lab">—</span>'}</div></div>
        <div class="card"><div class="lab">RELAY</div><div class="val small relay ${p.docked ? '' : 'off'}">${p.docked ? '合体中 ×3' : '単機'}</div></div>
        <div class="card"><div class="lab">BONUS</div><div class="bonus">${esc(bonus) || '—'}</div></div>${tag}${dbg}`;
    } else {
      TOP.innerHTML = `<div class="card"><div class="lab">SCORE</div><div class="val">${fmt(g.score)}</div></div>
        <div class="card"><div class="lab">HI</div><div class="val">${fmt(best)}</div></div>
        <div class="card"><div class="lab">AREA ${g.area + 1}・LOOP ${g.loop + 1}</div><div class="lives">${lives}</div></div>
        <div class="card"><div class="lab">RELAY</div><div class="val relay ${p.docked ? '' : 'off'}">${p.docked ? '×3' : '—'}</div></div>${tag}${dbg}`;
    }
  }

  function menu() {
    const m = app.menu, s = app.screen;
    menuEl.className = 'menu' + (s === 'settings' ? ' settings' : '');
    if (!m || s === 'play') { menuEl.innerHTML = ''; return; }
    let head = '';
    if (s === 'title') {
      head = `<div class="logo">AEGIS RELAY</div><div class="logo-kana">イージス・リレー</div>
        <div class="note">1980 年代の縦スクロールシューティングに影響を受けた<b>非公式のオリジナル作品</b>です。<br>名称・機体・ステージ・曲・効果音はすべて新しく作ったもので、既存作品とは関係ありません。</div>`;
    } else if (s === 'howto') {
      head = `<h2>${esc(m.title)}　<span style="color:var(--dim);font-size:.6em">${app.howtoPage + 1} / ${HOWTO.length}</span></h2><div class="page">${HOWTO[app.howtoPage].lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
    } else if (s === 'records') {
      const rows = (mode) => { const l = store.hiList(mode); return l.length ? l.map((r, i) => `<tr><td>${i + 1}</td><td>${r.score}</td><td>AREA ${r.area}・LOOP ${r.loop}</td><td>${esc(r.date || '')}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center">まだ記録がありません</td></tr>'; };
      head = `<h2>記録</h2><table><tr><th colspan="4" style="text-align:left">補助なし</th></tr>${rows('standard')}<tr><th colspan="4" style="text-align:left">補助: 自動連射</th></tr>${rows('assist')}</table>
        ${store.writable ? '' : '<div class="warn">この環境では保存できません（記録は今回だけ）</div>'}`;
    } else if (s === 'result') {
      const r = app.result;
      head = `<h2>GAME OVER</h2><div class="big">${r.score}</div>
        <div class="hint">AREA ${r.area + 1}・LOOP ${r.loop + 1}　｜　撃破 ${r.stats.kills}　合体 ${r.stats.docks}　ラティス ${r.stats.chainsFull}　ジェミニ ${r.stats.twinBreaks}　シジル ${r.stats.sigils}</div>
        <div class="hint">${r.tainted ? 'デバッグ機能を使ったので記録しません' : r.rank === 0 ? '★ ハイスコア更新！' : r.rank > 0 ? `${r.rank + 1} 位に記録しました` : '記録の 10 位までに入りませんでした'}　（${r.mode === 'assist' ? '補助: 自動連射' : '補助なし'}）</div>`;
    } else if (m.title) head = `<h2>${esc(m.title)}</h2>`;
    const items = m.items.map((it, i) => {
      const v = it.get ? `<span class="v"><span class="arr" data-i="${i}" data-d="-1">◀</span>${esc(it.get())}<span class="arr" data-i="${i}" data-d="1">▶</span></span>` : '';
      return `<li class="${i === m.idx ? 'sel' : ''} ${v ? '' : 'center'}" data-i="${i}"><span>${esc(it.label)}</span>${v}</li>`;
    }).join('');
    const hint = s === 'title' ? `<div class="hint">${opts.titleHint || '↑↓ で選び Enter / Z / A ボタンで決定'}</div>` : '';
    menuEl.innerHTML = head + `<ul>${items}</ul>` + hint;
    const sel = menuEl.querySelector('li.sel'); if (sel && s === 'settings') sel.scrollIntoView({ block: 'nearest' });
  }
  menuEl.addEventListener('pointerup', (e) => {
    const a = e.target.closest('.arr'); if (a) { app.adjust(+a.dataset.i, +a.dataset.d); return; }
    const li = e.target.closest('li'); if (li) app.select(+li.dataset.i);
  });
  menuEl.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const li = e.target.closest('li'); if (li) app.hover(+li.dataset.i); });

  function bannerUpdate() {
    const f = app.flash;
    if (!f || app.screen !== 'play') { banner.style.opacity = 0; return; }
    banner.querySelector('.t').textContent = f.text; banner.querySelector('.s').textContent = f.sub || '';
    banner.style.opacity = f.t < 10 ? f.t / 10 : f.t > f.ticks - 20 ? Math.max(0, (f.ticks - f.t) / 20) : 1;
  }
  return { place, frame() { hud(); bannerUpdate(); }, menu, get layout() { return layout; } };
}
