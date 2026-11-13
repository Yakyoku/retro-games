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
    <div class="dim"></div>
    <div class="hud left"></div><div class="hud right"></div><div class="hud top"></div>
    <div class="banner" style="opacity:0"><div class="t"></div><div class="s"></div></div>
    <div class="menu"></div>
    <div class="fade"></div>
    <div class="foot">MADE WITH CLAUDE</div>`;
  const L = root.querySelector('.hud.left'), R = root.querySelector('.hud.right'), TOP = root.querySelector('.hud.top');
  const banner = root.querySelector('.banner'), menuEl = root.querySelector('.menu'), dimEl = root.querySelector('.dim'), fadeEl = root.querySelector('.fade');
  let layout = null, hudMode = '', H = null, shown = {}, dispScore = 0, lastT = 0, lastScreen = '';

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
    Object.assign(dimEl.style, { left: lay.fx + 'px', top: lay.fy + 'px', width: lay.fw + 'px', height: lay.fh + 'px' });
    hudMode = '';
  }

  const card = (id, lab, cls = 'val') => `<div class="card"><div class="lab" data-k="${id}Lab">${lab}</div><div class="${cls}" data-k="${id}"></div></div>`;
  function buildHud(mode) {
    hudMode = mode; shown = {}; L.innerHTML = R.innerHTML = TOP.innerHTML = '';
    if (mode === 'none') { H = null; return; }
    if (mode === 'side') {
      L.innerHTML = card('score', 'SCORE') + card('best', 'HI-SCORE', 'val small') + `<div class="card"><div class="lab">AREA</div><div class="val small" data-k="area"></div><div class="lab" data-k="areaName" style="margin-top:4px"></div></div>`;
      R.innerHTML = `<div class="card"><div class="lab">SHIPS</div><div class="lives" data-k="lives"></div></div>` + card('relay', 'RELAY', 'val small relay') + `<div class="card"><div class="lab">BONUS</div><div class="bonus" data-k="bonus"></div></div><div data-k="tags"></div>`;
    } else {
      TOP.innerHTML = card('score', 'SCORE') + card('best', 'HI') + `<div class="card"><div class="lab" data-k="area"></div><div class="lives" data-k="lives"></div></div>` + card('relay', 'RELAY', 'val relay') + `<div data-k="tags"></div>`;
    }
    H = {}; for (const el of root.querySelectorAll('[data-k]')) H[el.dataset.k] = el;
  }
  // 値が変わったときだけ書き換え、pop=true なら弾むアニメを付ける
  function put(k, v, pop, html) {
    const el = H[k]; if (!el || shown[k] === v) return;
    const first = shown[k] === undefined; shown[k] = v;
    if (html) el.innerHTML = v; else el.textContent = v;
    if (pop && !first) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }
  function hud() {
    const g = app.game, now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const showHud = g && (app.screen === 'play' || app.screen === 'pause' || app.screen === 'settings');
    const want = showHud ? (layout.hud === 'side' ? 'side' : 'top') : 'none';
    if (want !== hudMode) { buildHud(want); if (g) dispScore = g.score; }
    if (!showHud) return;
    const mode = app.mode || (app.settings.autofire ? 'assist' : 'standard');
    const p = g.player;
    // スコアは実際の値へ向かって数え上がる（0.25 秒ほどで追いつく）
    if (dispScore > g.score) dispScore = g.score;
    if (dispScore < g.score) dispScore = Math.min(g.score, dispScore + Math.max(10, (g.score - dispScore) * Math.min(1, dt * 10)));
    const sc = Math.floor(dispScore / 10) * 10 === g.score ? g.score : Math.floor(dispScore / 10) * 10;
    const best = Math.max(store.best(mode), sc);
    const chain = Object.values(g.chains).find((c) => c.state === 'run');
    const twin = Object.values(g.twins).find((t) => !t.resolved);
    const bonus = chain ? `ラティス ${chain.count}/8` : twin ? 'ジェミニ接近 — 合体前に両方を' : g.partner ? '支援機 ARC に触れて合体' : '—';
    const nLives = Math.max(0, Math.min(TUNING.maxLives, g.lives - (p.alive ? 1 : 0)));
    put('score', fmt(sc)); put('best', fmt(best));
    if (hudMode === 'side') { put('area', `${g.area + 1} / ${AREAS.length}　LOOP ${g.loop + 1}`, true); put('areaName', AREAS[g.area].jp); put('relay', p.docked ? '合体中 ×3' : '単機', true); put('bonus', bonus, true); }
    else { put('area', `AREA ${g.area + 1}・LOOP ${g.loop + 1}`); put('relay', p.docked ? '×3' : '—', true); }
    H.relay.classList.toggle('off', !p.docked);
    put('lives', nLives ? '<i></i>'.repeat(nLives) : '<span class="lab">—</span>', true, true);
    put('tags', (mode === 'assist' ? '<span class="tag">補助: 自動連射（別枠の記録）</span>' : '') + (g.flags.tainted ? '<span class="tag hot">記録しない（デバッグ）</span>' : ''), false, true);
  }

  function menu() {
    const m = app.menu, s = app.screen;
    const changed = s !== lastScreen, from = lastScreen; lastScreen = s;
    menuEl.className = 'menu' + (s === 'settings' ? ' settings' : '');
    dimEl.classList.toggle('on', !!app.game && (s === 'pause' || s === 'settings' || s === 'result'));
    if (changed && ((from === 'title' || from === 'howto' || from === 'result') && s === 'play' || s === 'result' || (s === 'title' && (from === 'pause' || from === 'result')))) {
      fadeEl.classList.remove('go'); void fadeEl.offsetWidth; fadeEl.classList.add('go');
    }
    if (!m || s === 'play') { menuEl.innerHTML = ''; return; }
    if (changed) { void menuEl.offsetWidth; menuEl.classList.add('enter'); }
    else if (from === s) menuEl.classList.add('still');
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
    if (shown._bt !== f.text) { shown._bt = f.text; banner.querySelector('.t').textContent = f.text; banner.querySelector('.s').textContent = f.sub || ''; }
    // 入り: 0.3 秒で広がりながら現れる（ease-out）、出: 0.35 秒で上へ抜ける
    const tin = Math.min(1, f.t / 18), tout = Math.max(0, Math.min(1, (f.ticks - f.t) / 21));
    const ein = 1 - (1 - tin) ** 3, eout = tout * tout * (3 - 2 * tout);
    banner.style.opacity = ein * eout;
    banner.style.transform = `translate(-50%, calc(-50% + ${(1 - ein) * 14 - (1 - eout) * 10}px)) scale(${0.92 + 0.08 * ein})`;
    banner.style.letterSpacing = (0.14 + (1 - ein) * 0.25) + 'em';
  }
  return { place, frame() { hud(); bannerUpdate(); }, menu, get layout() { return layout; } };
}
