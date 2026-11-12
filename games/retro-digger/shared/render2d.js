// 2D の描画（Canvas 2D・ベクター）。画素を拡大せず、表示解像度（devicePixelRatio 込み）でそのまま描くので 4K でも輪郭が崩れない。
// 土の層は面ごと・大きさが変わったときだけ描き直し、掘削跡は増えた分だけ足す（毎フレーム全体を作り直さない）。
import { THEMES } from './stages.js';
import { inflateAmount, inflateRecovering } from './rules.js';
import { RULES } from './config.js';
import { PAL, drawHero, drawChaser, drawFire, drawRock, drawFlame } from './sprites2d.js';

const SPR = 1.28; // キャラクターの描画倍率（当たり判定は変えない）

export function createRenderer2D(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, S = 0, ox = 0, oy = 0, skyH = 0, dpr = 1;
  let dirt = null, rim = null, inner = null, stampN = 0, boardRef = null, themeRef = null;
  const sparks = [];

  function layout(g) {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    W = Math.round(cw * dpr); H = Math.round(ch * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const b = g.board;
    // 盤（14 × 16 セル）＋ 上に空 1.6 セル。縦長の画面ではそのまま、横長では中央
    const rowsTotal = b.rows + 1.6;
    const reserveTop = 0.0;
    S = Math.floor(Math.min(W / (b.cols + 0.4), (H * (1 - reserveTop)) / (rowsTotal + 0.3)));
    skyH = 1.6 * S;
    ox = Math.round((W - b.cols * S) / 2); oy = Math.round((H - (rowsTotal * S)) / 2);
    buildDirt(g); rebuildTunnels(g);
  }
  const X = (x) => ox + (x + 0.5) * S;
  const Y = (y) => oy + skyH + (y + 0.5) * S;

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---- 土の層（地層 4 段＋粒・小石・層ごとの模様） ----
  function buildDirt(g) {
    const b = g.board, th = THEMES[b.theme];
    themeRef = th;
    const w = b.cols * S, h = (b.rows - 1) * S; // 1 行目から下
    dirt = mk(w, h);
    const c = dirt.getContext('2d');
    const bands = th.bands;
    const bh = h / 4;
    let seed = 99 + g.stageIndex * 31;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 4; i++) {
      const y0 = i * bh;
      const grd = c.createLinearGradient(0, y0, 0, y0 + bh);
      grd.addColorStop(0, shade(bands[i], 0.08)); grd.addColorStop(1, shade(bands[i], -0.06));
      c.fillStyle = grd; c.fillRect(0, y0, w, bh + 1);
      // 層の境目: 波打つ線
      if (i > 0) {
        c.fillStyle = shade(bands[i], -0.25);
        c.beginPath(); c.moveTo(0, y0);
        for (let x = 0; x <= w; x += S / 4) c.lineTo(x, y0 + Math.sin(x / S * 1.7 + i) * S * 0.08);
        c.lineTo(w, y0 + S * 0.12); c.lineTo(0, y0 + S * 0.12); c.fill();
      }
      // 粒（表示面積に合わせた密度。4K でも粗く見えない）
      const n = Math.floor((w * bh) / (S * S) * 26);
      for (let k = 0; k < n; k++) {
        const x = rnd() * w, y = y0 + rnd() * bh, r = (0.02 + rnd() * 0.05) * S;
        c.fillStyle = rnd() < 0.5 ? shade(bands[i], 0.18) : shade(bands[i], -0.2);
        c.globalAlpha = 0.55; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
      // 層ごとの模様（小石・結晶・溶岩の筋）
      const m = Math.floor(w / S * 1.2);
      for (let k = 0; k < m; k++) {
        const x = rnd() * w, y = y0 + rnd() * bh;
        if (th.id === 'soil') pebble(c, x, y, (0.1 + rnd() * 0.12) * S, shade(bands[i], -0.3), shade(bands[i], 0.25));
        else if (th.id === 'crystal') crystal(c, x, y, (0.12 + rnd() * 0.16) * S, rnd(), i);
        else lavaVein(c, x, y, S, rnd);
      }
    }
  }
  function pebble(c, x, y, r, dark, light) {
    c.fillStyle = dark; c.beginPath(); c.ellipse(x, y, r, r * 0.72, 0.3, 0, 7); c.fill();
    c.fillStyle = light; c.globalAlpha = 0.7; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.25, r * 0.35, r * 0.22, 0.3, 0, 7); c.fill(); c.globalAlpha = 1;
  }
  function crystal(c, x, y, r, a, band) {
    const cols = ['#bff6ff', '#9fd8ff', '#d6b8ff', '#ffc8f0'];
    c.save(); c.translate(x, y); c.rotate(a * 6.28);
    c.fillStyle = cols[band % 4]; c.globalAlpha = 0.85;
    c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.45, 0); c.lineTo(0, r * 0.7); c.lineTo(-r * 0.45, 0); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.15, -r * 0.1); c.lineTo(-r * 0.1, 0); c.closePath(); c.fill();
    c.restore(); c.globalAlpha = 1;
  }
  function lavaVein(c, x, y, S, rnd) {
    c.strokeStyle = '#ff7a2a'; c.globalAlpha = 0.35; c.lineWidth = S * 0.035; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y);
    for (let i = 0; i < 4; i++) { x += (rnd() - 0.3) * S * 0.4; y += (rnd() - 0.5) * S * 0.3; c.lineTo(x, y); }
    c.stroke(); c.globalAlpha = 1;
  }

  // ---- 掘削跡（縁と内側の 2 層） ----
  function rebuildTunnels(g) {
    const b = g.board;
    const w = b.cols * S, h = (b.rows - 0.5) * S;
    rim = mk(w, h); inner = mk(w, h); stampN = 0; boardRef = b;
    addStamps(g);
  }
  function addStamps(g) {
    const b = g.board;
    if (b !== boardRef) { rebuildTunnels(g); return; }
    const rc = rim.getContext('2d'), ic = inner.getContext('2d');
    const th = themeRef;
    rc.fillStyle = shade(th.bands[3], -0.45);
    const tw = 0.86 * S, rw = 0.98 * S;
    for (; stampN < b.stamps.length; stampN++) {
      const [x, y] = b.stamps[stampN];
      const cx = (x + 0.5) * S, cy = (y + 0.5 - 0.5) * S; // inner/rim の原点は 1 行目の上端の半セル上
      rr(rc, cx - rw / 2, cy - rw / 2, rw, rw, rw * 0.42); rc.fill();
      ic.fillStyle = th.tunnel; rr(ic, cx - tw / 2, cy - tw / 2, tw, tw, tw * 0.4); ic.fill();
    }
  }

  // ---- 1 フレーム ----
  function draw(g, alpha, t) {
    if (!dirt || g.board !== boardRef) layout(g);
    addStamps(g);
    const b = g.board, th = themeRef;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0a10'); bg.addColorStop(0.5, shade(th.bands[3], -0.78)); bg.addColorStop(1, '#060405');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 空と地表
    const sg = ctx.createLinearGradient(0, oy, 0, oy + skyH + S);
    sg.addColorStop(0, th.sky[0]); sg.addColorStop(1, th.sky[1]);
    ctx.fillStyle = sg; ctx.fillRect(ox, oy, b.cols * S, skyH + S);
    drawSkyDeco(th, t);
    // 地表の草・地面の線
    ctx.fillStyle = th.id === 'volcano' ? '#5a2a1a' : th.id === 'crystal' ? '#3e5ab0' : '#5fae3a';
    ctx.fillRect(ox, oy + skyH + S * 0.92, b.cols * S, S * 0.12);
    // 土
    ctx.drawImage(dirt, ox, oy + skyH + S);
    ctx.drawImage(rim, ox, oy + skyH + S * 0.5);
    ctx.drawImage(inner, ox, oy + skyH + S * 0.5);
    // 枠
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = Math.max(1, S * 0.03);
    ctx.strokeRect(ox, oy, b.cols * S, skyH + b.rows * S);

    const L = (a, b2) => a + (b2 - a) * alpha;
    // 岩
    for (const rk of g.rocks) {
      if (rk.state === 'gone') continue;
      const y = L(rk.py, rk.y);
      let wob = 0;
      if (rk.state === 'loose') wob = Math.sin(t * 40) * S * 0.05 * Math.min(1, rk.t * 3);
      const crumble = rk.state === 'landed' ? rk.t / 0.9 : 0;
      drawRock(ctx, X(rk.c) + wob, Y(y), S, th.id, crumble, t);
      if (rk.state === 'loose') { // 砂がこぼれる・警告
        for (let i = 0; i < 3; i++) {
          const ph = (t * 2.2 + i * 0.33) % 1;
          ctx.fillStyle = th.bands[0]; ctx.globalAlpha = 1 - ph;
          ctx.beginPath(); ctx.arc(X(rk.c) + (i - 1) * S * 0.2, Y(y) + S * (0.45 + ph * 0.6), S * 0.04, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 18);
        warnMark(X(rk.c), Y(y) - S * 0.75, S * 0.32);
        ctx.globalAlpha = 1;
      }
    }
    // チュートリアルの目印
    if (g.tut && !g.tut.done) {
      const tg = (g.tutTargets || [])[g.tut.step];
      if (tg) {
        const k = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.strokeStyle = `rgba(255,211,90,${0.5 + 0.5 * k})`; ctx.lineWidth = S * 0.08;
        ctx.beginPath(); ctx.arc(X(tg[0]), Y(tg[1]), S * (0.32 + 0.08 * k), 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(255,211,90,0.25)'; ctx.fill();
      }
    }
    // 炎
    for (const f of g.fires) drawFlame(ctx, X(f.x), Y(f.y), f.dir === 'left' ? -1 : 1, f.reach, S, t);
    // 敵
    const P = g.player;
    for (const e of g.enemies) {
      const x = X(L(e.px, e.x)), y = Y(L(e.py, e.y));
      const amt = inflateAmount(e.inf, g.diff.pumpsToPop);
      const recovering = inflateRecovering(e.inf);
      const lookX = Math.sign(P.x - e.x), lookY = Math.sign(P.y - e.y);
      const st = { state: e.state, t: e.t, anim: e.anim, face: e.face, amt, recovering, look: [lookX, lookY], wake: e.state === 'wait' ? e.wake - e.t : 0 };
      if (e.state === 'pop' && e.t > 0.5) continue;
      if (e.type === 'chaser') drawChaser(ctx, x, y, S * SPR, st, t); else drawFire(ctx, x, y, S * SPR, st, t);
    }
    // ホース（主人公 → 先端／敵）
    const px = X(L(P.px, P.x)), py = Y(L(P.py, P.y));
    if (g.pump.state !== 'idle' && !P.dead) {
      let tx, ty;
      if (g.pump.state === 'attached' && g.pump.target) { tx = X(g.pump.target.x); ty = Y(g.pump.target.y); }
      else { const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[P.face]; tx = px + d[0] * g.pump.len * S; ty = py + d[1] * g.pump.len * S; }
      hose(px, py, tx, ty, g.pump.state === 'attached', t, g.pump.cool);
    }
    // 主人公
    const hst = { face: P.face, moving: P.moving, walk: P.walk, dead: P.dead, deadT: g.phase === 'miss' ? g.phaseT : 0, cause: P.cause,
      pumping: g.pump.state === 'attached' ? 1 - g.pump.cool / RULES.pumpInterval : -1, shooting: g.pump.state === 'shoot',
      guard: P.guard, digging: P.digT > 0 && P.moving };
    if (!(P.guard > 0 && Math.floor(t * 12) % 2)) drawHero(ctx, px, py, S * SPR, hst, t);
    // 破裂などの効果
    for (const f of g.fx) {
      const k = f.t / f.life;
      if (f.kind === 'pop') burst(X(f.x), Y(f.y), S, k, f.type);
      if (f.kind === 'dust') { ctx.fillStyle = th.bands[1]; ctx.globalAlpha = 1 - k; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI; ctx.beginPath(); ctx.arc(X(f.x) + Math.cos(a) * S * (0.3 + k * 0.6), Y(f.y) - Math.sin(a) * S * k * 0.4, S * 0.09 * (1 - k * 0.5), 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
    }
    // 掘るときの粉じん
    if (hst.digging && !P.dead) {
      if (sparks.length < 40 && Math.random() < 0.6) sparks.push({ x: px + (Math.random() - 0.5) * S * 0.5, y: py + (Math.random() - 0.3) * S * 0.4, vx: (Math.random() - 0.5) * S * 2, vy: -Math.random() * S * 2, t: 0 });
    }
    for (const s of sparks) { s.t += 1 / 60; s.x += s.vx / 60; s.y += s.vy / 60; s.vy += S * 6 / 60; }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t > 0.45) sparks.splice(i, 1);
    ctx.fillStyle = th.bands[0];
    for (const s of sparks) { ctx.globalAlpha = 1 - s.t / 0.45; ctx.fillRect(s.x, s.y, S * 0.06, S * 0.06); }
    ctx.globalAlpha = 1;
    // 得点の表示
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of g.popups) {
      const k = p.t / 1.2;
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
      ctx.font = `800 ${Math.round(S * (p.big ? 0.62 : 0.44))}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
      ctx.lineWidth = S * 0.1; ctx.strokeStyle = '#1a0d05'; ctx.strokeText(p.text, X(p.x), Y(p.y) - S * (0.4 + k * 0.7));
      ctx.fillStyle = p.big ? '#ffe66b' : '#fff'; ctx.fillText(p.text, X(p.x), Y(p.y) - S * (0.4 + k * 0.7));
    }
    ctx.globalAlpha = 1;
    // 開始前の待機（敵の目が点滅）＝ drawChaser 内。ステージ名
    if (g.phase === 'ready') banner(b.name, `STAGE ${g.stageIndex + 1}`);
  }
  function banner(main, sub) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cx = ox + boardRef.cols * S / 2, cy = oy + skyH + boardRef.rows * S * 0.42;
    ctx.fillStyle = 'rgba(8,6,12,0.72)'; rr(ctx, cx - S * 5, cy - S * 1.3, S * 10, S * 2.6, S * 0.5); ctx.fill();
    ctx.fillStyle = '#ffd35a'; ctx.font = `800 ${Math.round(S * 0.5)}px ui-monospace, Consolas, monospace`; ctx.fillText(sub, cx, cy - S * 0.55);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(S * 0.75)}px system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif`; ctx.fillText(main, cx, cy + S * 0.35);
  }
  function drawSkyDeco(th, t) {
    // 地表の小物: 遠くの丘・雲（地表を歩く敵や主人公の背景）
    const b = boardRef; const base = oy + skyH + S * 0.92;
    ctx.fillStyle = th.id === 'volcano' ? 'rgba(60,20,20,0.6)' : th.id === 'crystal' ? 'rgba(30,40,110,0.55)' : 'rgba(40,110,60,0.45)';
    ctx.beginPath(); ctx.moveTo(ox, base);
    for (let i = 0; i <= 28; i++) { const x = ox + i / 28 * b.cols * S; ctx.lineTo(x, base - S * (0.5 + 0.35 * Math.sin(i * 0.9) + 0.2 * Math.sin(i * 2.3))); }
    ctx.lineTo(ox + b.cols * S, base); ctx.fill();
    if (th.id === 'volcano') { ctx.fillStyle = '#ff9a4a'; ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 2); ctx.beginPath(); ctx.arc(ox + b.cols * S * 0.8, base - S * 1.0, S * 0.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 3; i++) { const x = ox + ((i * 0.37 + t * 0.012) % 1) * b.cols * S, y = oy + S * (0.35 + i * 0.25); cloud(x, y, S * (0.35 + i * 0.08)); }
  }
  function cloud(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.arc(x + r, y + r * 0.2, r * 0.8, 0, 7); ctx.arc(x - r, y + r * 0.25, r * 0.7, 0, 7); ctx.fill(); }
  function warnMark(x, y, r) {
    ctx.fillStyle = '#ffd35a'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a1500'; ctx.font = `900 ${Math.round(r * 1.2)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, y + r * 0.2);
  }
  function hose(x1, y1, x2, y2, attached, t, cool) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2a2a33'; ctx.lineWidth = S * 0.16; line(x1, y1, x2, y2);
    ctx.strokeStyle = attached ? '#ff6b4a' : '#e8e2d0'; ctx.lineWidth = S * 0.09; line(x1, y1, x2, y2);
    if (attached) { // 送気の玉がホースを流れる
      const k = 1 - Math.max(0, cool) / RULES.pumpInterval;
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, S * 0.11, 0, 7); ctx.fill();
    }
    // 先端（ノズル）
    ctx.fillStyle = '#c9ced8'; ctx.beginPath(); ctx.arc(x2, y2, S * 0.12, 0, 7); ctx.fill();
  }
  function line(a, b2, c, d) { ctx.beginPath(); ctx.moveTo(a, b2); ctx.lineTo(c, d); ctx.stroke(); }
  function burst(x, y, S, k, type) {
    const col = type === 'fire' ? '#ffb347' : '#7dffd0';
    ctx.globalAlpha = 1 - k;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 6.283 + 0.3; const d = S * (0.3 + k * 1.1);
      ctx.fillStyle = i % 2 ? col : '#fff';
      star(x + Math.cos(a) * d, y + Math.sin(a) * d, S * 0.13 * (1 - k * 0.6));
    }
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(S * 0.55)}px system-ui, "Hiragino Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (k < 0.6) ctx.fillText('ポン！', x, y - S * 0.1);
    ctx.globalAlpha = 1;
  }
  function star(x, y, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 - 1.57; const rr2 = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } ctx.closePath(); ctx.fill(); }

  return { draw, layout, get cell() { return S; }, boardRect: () => ({ x: ox / dpr, y: oy / dpr, w: (boardRef ? boardRef.cols * S : 0) / dpr, h: (boardRef ? (boardRef.rows + 1.6) * S : 0) / dpr }) };
}

export function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
export { PAL };
