// 月影の魔城 — HUD・メニュー・字幕の描画（Canvas 2D。2D 版は画面の上に重ね、3D/VR 版は板に貼る）
// すべて実際の画素数で描くので、4K でも文字がにじまない。座標の基準は 1920×1080（s 倍して描く）。
import { CREDIT, REFERENCE, TITLE } from './app.js';
import { WEAPONS, BOSSES, DIFFICULTY } from './config.js';

const FONT = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","Noto Serif CJK JP",serif';
const SANS = '"Hiragino Sans","Yu Gothic UI","Meiryo","Noto Sans JP","Noto Sans CJK JP",system-ui,sans-serif';
const C = { ink: '#f2ead8', dim: '#b9b2a2', gold: '#f3c86a', red: '#ff6a4d', blue: '#8fc8ff', panel: 'rgba(10,12,24,0.86)', line: 'rgba(243,200,106,0.55)' };

export class UI {
  constructor() { this.hits = []; this.hover = -1; }
  // rect: { x, y, w, h } 描く範囲（デバイス画素）。safe: { l, r, t, b } セーフエリア（デバイス画素）
  draw(ctx, app, rect, opt = {}) {
    const s = Math.min(rect.w / 1920, rect.h / 1080);
    this.s = s; this.rect = rect; this.hits = [];
    ctx.save();
    ctx.translate(rect.x, rect.y);
    ctx.textBaseline = 'middle';
    const g = app.g;
    if (g && (app.screen === 'play' || app.screen === 'paused' || app.screen === 'gameover' || app.screen === 'settings' && g)) this.hud(ctx, app, rect, s, opt);
    if (g && app.screen === 'play') this.banners(ctx, app, rect, s);
    if (app.screen === 'title') this.title(ctx, app, rect, s, opt);
    if (app.screen === 'ending') this.ending(ctx, app, rect, s);
    if (app.menu && app.screen !== 'play') this.menu(ctx, app, rect, s, opt);
    if (app.toast) this.toast(ctx, app, rect, s);
    if (app.debug && opt.debugText) { ctx.font = `${14 * s}px ui-monospace,monospace`; ctx.fillStyle = '#9f9'; ctx.textAlign = 'left'; opt.debugText.split('\n').forEach((l, i) => ctx.fillText(l, 20 * s, rect.h - (120 - i * 20) * s)); }
    ctx.restore();
  }
  text(ctx, str, x, y, size, color = C.ink, align = 'left', font = SANS, weight = 600, shadow = true) {
    ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align;
    if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(str, x + size * 0.06, y + size * 0.07); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  hud(ctx, app, rect, s, opt) {
    const g = app.g, p = g.player, pad = (opt.safe ? opt.safe.l : 0) + 34 * s, top = (opt.safe ? opt.safe.t : 0) + 40 * s;
    const W = rect.w;
    // 上の帯（読みやすさのための薄い影）
    const grd = ctx.createLinearGradient(0, 0, 0, 120 * s); grd.addColorStop(0, 'rgba(0,0,8,0.55)'); grd.addColorStop(1, 'rgba(0,0,8,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, 120 * s);
    this.text(ctx, 'SCORE', pad, top, 22 * s, C.dim); this.text(ctx, String(g.score).padStart(7, '0'), pad + 92 * s, top, 34 * s, C.ink, 'left', 'ui-monospace,Consolas,monospace', 700);
    this.text(ctx, 'HI', pad, top + 38 * s, 20 * s, C.dim); this.text(ctx, String(Math.max(g.hi, g.score)).padStart(7, '0'), pad + 92 * s, top + 38 * s, 26 * s, C.gold, 'left', 'ui-monospace,Consolas,monospace', 700);
    // 中央: ステージと時間
    const tm = Math.max(0, Math.ceil(g.time)), mm = Math.floor(tm / 60), ss = String(tm % 60).padStart(2, '0');
    const warn = tm <= 30 && g.mode === 'play' && (app.t * 2) % 1 < 0.5;
    this.text(ctx, `STAGE ${g.stageIndex + 1}${g.loop > 1 ? '・2周目' : ''}　${g.def.name}`, W / 2, top - 4 * s, 22 * s, C.dim, 'center');
    this.text(ctx, `TIME ${mm}:${ss}`, W / 2, top + 32 * s, 36 * s, warn ? C.red : C.ink, 'center', 'ui-monospace,Consolas,monospace', 700);
    // 右: 残機・鎧・武器
    const rx = W - (opt.safe ? opt.safe.r : 0) - 34 * s - (opt.reserveRight || 0);
    for (let i = 0; i < g.lives; i++) this.helm(ctx, rx - i * 34 * s - 14 * s, top - 2 * s, 13 * s, true);
    this.text(ctx, `×${g.lives}`, rx - g.lives * 34 * s - 6 * s, top, 22 * s, C.dim, 'right');
    // 鎧
    const ax = rx - 160 * s, ay = top + 40 * s;
    this.armorIcon(ctx, ax, ay, 15 * s, p.armor, p.armorT);
    this.text(ctx, p.armor ? '鎧' : '鎧なし', ax + 24 * s, ay, 22 * s, p.armor ? C.blue : C.red);
    this.weaponIcon(ctx, rx - 18 * s, ay, 18 * s, g.weapon);
    this.text(ctx, WEAPONS[g.weapon].name, rx - 46 * s, ay, 22 * s, C.gold, 'right');
    // ボス
    if (g.boss && (g.bossState === 'fight' || g.bossState === 'intro')) {
      const b = g.boss, bw = 720 * s, bx = W / 2 - bw / 2, by = rect.h - 64 * s - (opt.safe ? opt.safe.b : 0) - (opt.reserveBottom || 0);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 6 * s, by - 34 * s, bw + 12 * s, 58 * s);
      this.text(ctx, BOSSES[b.type].name, bx, by - 16 * s, 22 * s, C.ink);
      const k = Math.max(0, b.hp / b.max);
      ctx.fillStyle = '#2a0c10'; ctx.fillRect(bx, by, bw, 14 * s);
      const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0); hg.addColorStop(0, '#ff5a3c'); hg.addColorStop(1, '#ffb347');
      ctx.fillStyle = hg; ctx.fillRect(bx, by, bw * k, 14 * s);
      ctx.strokeStyle = C.line; ctx.lineWidth = 2 * s; ctx.strokeRect(bx, by, bw, 14 * s);
      const weak = ['stun', 'landed', 'onLand', 'perch', 'recover', 'tired'].includes(b.st);
      if (weak) this.text(ctx, '隙あり', bx + bw, by - 16 * s, 22 * s, C.gold, 'right');
    }
  }
  helm(ctx, x, y, r, on) {
    ctx.save(); ctx.translate(x, y);
    const gr = ctx.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, '#e8f2ff'); gr.addColorStop(1, '#5d7590');
    ctx.fillStyle = on ? gr : '#444';
    ctx.beginPath(); ctx.moveTo(-r, r * 0.8); ctx.quadraticCurveTo(-r * 1.05, -r, 0, -r); ctx.quadraticCurveTo(r * 1.05, -r, r, r * 0.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#10141c'; ctx.fillRect(-r * 0.7, -r * 0.05, r * 1.4, r * 0.22);
    ctx.fillStyle = '#d23a2a'; ctx.beginPath(); ctx.ellipse(0, -r * 1.05, r * 0.25, r * 0.5, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  armorIcon(ctx, x, y, r, on, t) {
    ctx.save(); ctx.translate(x, y);
    const k = on && t < 0 ? 1 + Math.sin(-t * 30) * 0.15 : 1; ctx.scale(k, k);
    ctx.fillStyle = on ? '#a9c4e6' : '#5a2a2a';
    ctx.beginPath(); ctx.moveTo(-r, -r * 0.7); ctx.lineTo(r, -r * 0.7); ctx.lineTo(r * 0.8, r * 0.4); ctx.quadraticCurveTo(0, r * 1.2, -r * 0.8, r * 0.4); ctx.closePath(); ctx.fill();
    if (!on) { ctx.strokeStyle = '#ff6a4d'; ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.6); ctx.lineTo(0.1 * r, 0); ctx.lineTo(-r * 0.2, r * 0.6); ctx.stroke(); }
    ctx.restore();
  }
  weaponIcon(ctx, x, y, r, w) {
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';
    if (w === 'lance') { ctx.strokeStyle = '#d7e3ef'; ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r * 0.6, 0); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 0.5, -r * 0.3); ctx.lineTo(r * 0.5, r * 0.3); ctx.fill(); }
    if (w === 'dagger') { ctx.fillStyle = '#e8eef5'; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.1, -r * 0.25); ctx.lineTo(-r * 0.1, r * 0.25); ctx.fill(); ctx.fillStyle = '#c49a3a'; ctx.fillRect(-r * 0.25, -r * 0.4, r * 0.15, r * 0.8); ctx.fillRect(-r * 0.8, -r * 0.1, r * 0.6, r * 0.2); }
    if (w === 'axe') { ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.moveTo(-r * 0.2, r); ctx.lineTo(r * 0.1, -r * 0.9); ctx.stroke(); ctx.fillStyle = '#cfd8e2'; ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.quadraticCurveTo(r * 1.1, -r * 0.6, r * 0.9, r * 0.1); ctx.lineTo(0, -r * 0.2); ctx.fill(); }
    if (w === 'torch') { ctx.fillStyle = '#6b4320'; ctx.fillRect(-r * 0.12, -r * 0.1, r * 0.24, r * 1.1); const gr = ctx.createRadialGradient(0, -r * 0.4, 0, 0, -r * 0.4, r * 0.8); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#ff8a2a'); gr.addColorStop(1, 'rgba(255,60,20,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, -r * 0.4, r * 0.8, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  banners(ctx, app, rect, s) {
    const g = app.g, W = rect.w, H = rect.h;
    const card = (l1, l2, a = 1) => {
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(4,6,16,0.72)'; ctx.fillRect(0, H / 2 - 90 * s, W, 180 * s);
      ctx.strokeStyle = C.line; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(0, H / 2 - 90 * s); ctx.lineTo(W, H / 2 - 90 * s); ctx.moveTo(0, H / 2 + 90 * s); ctx.lineTo(W, H / 2 + 90 * s); ctx.stroke();
      this.text(ctx, l1, W / 2, H / 2 - 28 * s, 34 * s, C.gold, 'center', FONT, 700);
      this.text(ctx, l2, W / 2, H / 2 + 30 * s, 56 * s, C.ink, 'center', FONT, 700);
      ctx.restore();
    };
    if (g.mode === 'ready') card(`STAGE ${g.stageIndex + 1}${g.loop > 1 ? '（2周目）' : ''}`, g.cp >= 0 ? `${g.def.name}　—　中間地点から` : g.def.name, Math.min(1, g.modeT * 3));
    if (g.mode === 'bossIntro') card('— 守護者 —', BOSSES[g.boss.type].name, Math.min(1, (1.8 - g.modeT) * 3, g.modeT * 3));
    if (g.mode === 'clear') {
      const t = g.tally;
      card('STAGE CLEAR', `残り時間 ${t.time} 秒 × 10 ＝ ${t.bonus} 点`);
    }
    if (g.mode === 'dying' && g.player.cause === 'time') card('', '時間切れ');
  }
  title(ctx, app, rect, s, opt) {
    const W = rect.w, H = rect.h;
    const y0 = H * 0.2;
    ctx.save();
    ctx.shadowColor = 'rgba(150,190,255,0.55)'; ctx.shadowBlur = 40 * s;
    const gr = ctx.createLinearGradient(0, y0 - 80 * s, 0, y0 + 80 * s); gr.addColorStop(0, '#f6f0ff'); gr.addColorStop(0.55, '#b9c9ef'); gr.addColorStop(1, '#6f7fb0');
    ctx.font = `700 ${150 * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = gr; ctx.fillText(TITLE, W / 2, y0);
    ctx.restore();
    this.text(ctx, app.variant === '2d' ? '2D 版　横スクロール・アクション' : '3D / VR 版　ジオラマ・アクション', W / 2, y0 + 108 * s, 30 * s, C.gold, 'center', FONT, 600);
    // 制作注記（開始前に見える位置。小さすぎず、操作ボタンに重ならない）
    const fy = H - 92 * s - (opt.reserveBottom || 0);
    ctx.fillStyle = 'rgba(4,6,14,0.7)'; ctx.fillRect(W / 2 - 700 * s, fy - 34 * s, 1400 * s, 92 * s);
    this.text(ctx, CREDIT, W / 2, fy - 6 * s, 30 * s, C.ink, 'center');
    this.text(ctx, REFERENCE, W / 2, fy + 32 * s, 24 * s, C.dim, 'center');
    const hi = app.save.hi[app.diff];
    this.text(ctx, `HI SCORE ${String(hi).padStart(7, '0')}（${DIFFICULTY[app.diff].label}）`, W / 2, y0 + 160 * s, 26 * s, C.dim, 'center', 'ui-monospace,Consolas,monospace', 600);
    if (!app.started) this.text(ctx, 'クリック・タップ・いずれかのボタンで音が鳴ります', W / 2, fy - 100 * s, 20 * s, C.dim, 'center');
    if (app.saveStatus === 'corrupt') this.text(ctx, '保存データが壊れていたため初期化しました', W / 2, fy - 104 * s, 20 * s, C.red, 'center');
  }
  ending(ctx, app, rect, s) {
    const W = rect.w, H = rect.h, g = app.g;
    const lines = ['魔城の主は月影とともに崩れ落ち、', '夜明けの光が墓地の丘を照らした。', '騎士は錆びた兜を脱ぎ、帰り道についた。', '', `最終得点 ${g.score}　（${DIFFICULTY[app.diff].label}${g.loop > 1 ? '・2周目' : ''}）`, '', CREDIT];
    lines.forEach((l, i) => this.text(ctx, l, W / 2, H * 0.16 + i * 52 * s, (i === 6 ? 26 : 34) * s, i === 4 ? C.gold : C.ink, 'center', FONT, 600));
  }
  menu(ctx, app, rect, s, opt) {
    const mn = app.menu, W = rect.w, H = rect.h;
    const items = mn.items;
    const lh = 64 * s, infoH = 46 * s;
    const hTotal = items.reduce((a, it) => a + (it.info ? infoH : lh), 0) + 110 * s;
    const pw = Math.min(W - 40 * s, 1240 * s);
    const isTitle = app.screen === 'title';
    let y = isTitle ? H * 0.43 : Math.max(30 * s, H / 2 - hTotal / 2);
    const x = W / 2 - pw / 2;
    const maxH = (isTitle ? H * 0.43 : H) - 2 * 30 * s;
    ctx.fillStyle = C.panel; ctx.strokeStyle = C.line; ctx.lineWidth = 2 * s;
    const ph = Math.min(hTotal, isTitle ? H * 0.47 - 60 * s - (opt.reserveBottom || 0) : H - 60 * s);
    if (!isTitle) { roundRect(ctx, x, y, pw, ph, 18 * s); ctx.fill(); ctx.stroke(); this.text(ctx, mn.title, W / 2, y + 46 * s, 40 * s, C.gold, 'center', FONT, 700); y += 96 * s; }
    void maxH;
    // 選択中の項目が見えるようにずらす
    let off = 0; let acc = 0;
    for (let i = 0; i < mn.sel; i++) acc += items[i].info ? infoH : lh;
    const visH = ph - (isTitle ? 0 : 110 * s);
    if (acc + lh > visH) off = acc + lh - visH;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y - 6 * s, pw, visH + 6 * s); ctx.clip();
    let yy = y - off;
    items.forEach((it, i) => {
      const h = it.info ? infoH : lh;
      const label = typeof it.label === 'function' ? it.label() : it.label;
      if (yy + h > y - 10 * s && yy < y + visH + 10 * s) {
        if (it.info) { this.text(ctx, label, x + 40 * s, yy + h / 2, 22 * s, C.dim, 'left', SANS, 500, false); }
        else {
          const sel = i === mn.sel;
          if (sel) { ctx.fillStyle = 'rgba(243,200,106,0.16)'; roundRect(ctx, x + 18 * s, yy + 4 * s, pw - 36 * s, h - 8 * s, 10 * s); ctx.fill(); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(x + 36 * s, yy + h / 2 - 12 * s); ctx.lineTo(x + 54 * s, yy + h / 2); ctx.lineTo(x + 36 * s, yy + h / 2 + 12 * s); ctx.fill(); }
          this.text(ctx, label, isTitle ? W / 2 : x + 70 * s, yy + h / 2, 30 * s, it.disabled ? '#6d6a63' : sel ? '#fff8e6' : C.ink, isTitle ? 'center' : 'left', SANS, sel ? 700 : 500);
          if (it.adj && sel) this.text(ctx, '◀ ▶', x + pw - 40 * s, yy + h / 2, 24 * s, C.gold, 'right');
          if (!it.disabled) this.hits.push({ i, x: rect.x + x, y: rect.y + yy, w: pw, h, adj: !!it.adj });
        }
      }
      yy += h;
    });
    ctx.restore();
    const L = app.input.labels();
    this.text(ctx, `選ぶ ↑↓　決定 ${L.ok}　値を変える ←→　戻る ${L.back}`, W / 2, (isTitle ? H - 162 * s - (opt.reserveBottom || 0) : y + visH + 30 * s), 20 * s, C.dim, 'center');
  }
  toast(ctx, app, rect, s) {
    const W = rect.w;
    ctx.save(); ctx.globalAlpha = Math.min(1, app.toast.t * 3);
    ctx.font = `600 ${26 * s}px ${SANS}`; const w = ctx.measureText(app.toast.msg).width + 60 * s;
    ctx.fillStyle = 'rgba(10,10,20,0.9)'; roundRect(ctx, W / 2 - w / 2, 140 * s, w, 56 * s, 28 * s); ctx.fill();
    this.text(ctx, app.toast.msg, W / 2, 168 * s, 26 * s, C.ink, 'center');
    ctx.restore();
  }
  // ポインターの位置（デバイス画素）→ 項目と左右
  pick(px, py) {
    for (const h of this.hits) if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) {
      let side = 0; if (h.adj) { if (px < h.x + h.w * 0.28) side = -1; else if (px > h.x + h.w * 0.72) side = 1; }
      return { i: h.i, side };
    }
    return null;
  }
}
export function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
