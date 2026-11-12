// 2D のキャラクター（ベクターで描く。単位は 1 セル = S）。造形はすべてこの作品のオリジナル。
//   主人公「ポンプ隊員」: 黄色いヘルメット＋ヘッドランプ、大きな目、緑のつなぎ、背中の赤い空気タンク、手元のノズルとホース
//   追跡型「プクモ」: ミント色の丸い体、頭に双葉の触角、大きな目と頬。通り抜け中は砂の輪郭と目と触角だけ
//   火炎型「ボイラン」: 朱色のずんぐりした釜の体、頭に煙突、眠たげなまぶた、横に広い口。溜めると煙突が吹き、頬と口が光る
export const PAL = {
  helmet: '#ffcf2e', helmetDark: '#d89a10', lamp: '#fffbe0', skin: '#ffd9b0', suit: '#2fa86a', suitDark: '#1f7a4c',
  boot: '#6b3a1f', glove: '#8a4a26', tank: '#e0503a', tankDark: '#9e2a1e', metal: '#c9ced8', ink: '#1a1020',
  chaser: '#5fe0b5', chaserDark: '#2fae86', leaf: '#3fcf6a', blush: '#ff8fb0',
  fire: '#ff7a3a', fireDark: '#c2441e', chimney: '#5a4a48', ember: '#ffd35a',
};
const TAU = Math.PI * 2;

function orient(ctx, x, y, face) {
  ctx.translate(x, y);
  if (face === 'left') ctx.scale(-1, 1);
  else if (face === 'up') ctx.rotate(-Math.PI / 2);
  else if (face === 'down') ctx.rotate(Math.PI / 2);
}
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function outline(ctx, S) { ctx.lineWidth = S * 0.035; ctx.strokeStyle = PAL.ink; ctx.stroke(); }

// ---------------- 主人公 ----------------
export function drawHero(ctx, x, y, S, st, t) {
  ctx.save();
  orient(ctx, x, y, st.face);
  ctx.scale(S, S);
  const u = 1 / S; // 線の太さを S に合わせるため、以下は単位 1 = 1 セル
  if (st.dead) { heroDeath(ctx, st, t); ctx.restore(); return; }
  const ph = st.moving ? st.walk * 9 : 0;
  const bob = st.moving ? Math.abs(Math.sin(ph)) * -0.035 : Math.sin(t * 2.4) * 0.008;
  let sq = 1;
  if (st.pumping >= 0) sq = 1 - 0.08 * Math.max(0, Math.sin(st.pumping * Math.PI)); // 送気のたびに体が縮む
  ctx.translate(0, bob);
  ctx.scale(1 / sq * 0.98 + 0.02, sq);
  const lw = 0.035;
  ctx.lineWidth = lw; ctx.strokeStyle = PAL.ink; ctx.lineJoin = 'round';
  // 足
  const l1 = Math.sin(ph) * 0.09, l2 = -l1;
  ctx.fillStyle = PAL.boot;
  ell(ctx, -0.1 + l1, 0.33, 0.11, 0.07); ctx.fill(); ctx.stroke();
  ell(ctx, 0.1 + l2, 0.33, 0.11, 0.07); ctx.fill(); ctx.stroke();
  // 空気タンク（背中）
  ctx.fillStyle = PAL.tank; rrect(ctx, -0.42, -0.12, 0.2, 0.4, 0.08); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; rrect(ctx, -0.39, -0.08, 0.05, 0.28, 0.025); ctx.fill();
  ctx.fillStyle = PAL.metal; rrect(ctx, -0.36, -0.18, 0.08, 0.07, 0.02); ctx.fill(); ctx.stroke();
  // 胴（つなぎ）
  ctx.fillStyle = PAL.suit; rrect(ctx, -0.24, -0.06, 0.46, 0.38, 0.14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PAL.suitDark; rrect(ctx, -0.24, 0.17, 0.46, 0.06, 0.02); ctx.fill(); // ベルト
  ctx.fillStyle = PAL.helmet; rrect(ctx, -0.03, 0.17, 0.07, 0.06, 0.015); ctx.fill(); // バックル
  // ホース（タンク → 手元のノズル）
  ctx.strokeStyle = '#2a2a33'; ctx.lineWidth = 0.06; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-0.32, -0.16); ctx.bezierCurveTo(-0.2, -0.36, 0.1, 0.32, 0.3, 0.08); ctx.stroke();
  ctx.strokeStyle = PAL.metal; ctx.lineWidth = 0.025; ctx.stroke();
  ctx.lineWidth = lw; ctx.strokeStyle = PAL.ink;
  // 手とノズル（発射中は前へ突き出す）
  const push = st.shooting ? 0.06 : st.pumping >= 0 ? 0.03 * Math.sin(st.pumping * Math.PI) : 0;
  const armY = st.digging ? Math.sin(t * 30) * 0.04 : 0;
  ctx.fillStyle = PAL.metal; rrect(ctx, 0.24 + push, 0.03 + armY, 0.2, 0.08, 0.03); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7d8592'; rrect(ctx, 0.4 + push, 0.01 + armY, 0.06, 0.12, 0.02); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PAL.glove; circ(ctx, 0.24 + push, 0.08 + armY, 0.08); ctx.fill(); ctx.stroke();
  // 頭
  ctx.fillStyle = PAL.skin; circ(ctx, 0.04, -0.24, 0.2); ctx.fill(); ctx.stroke();
  // 目（大きく、進行方向を見る）
  const blink = (Math.floor(t * 0.7) % 5 === 0 && (t * 0.7) % 1 < 0.12) ? 0.2 : 1;
  ctx.fillStyle = PAL.ink; ell(ctx, 0.13, -0.22, 0.045, 0.07 * blink); ctx.fill();
  ctx.fillStyle = '#fff'; circ(ctx, 0.145, -0.25, 0.017); ctx.fill();
  ctx.fillStyle = '#ff9a8a'; ell(ctx, 0.06, -0.14, 0.045, 0.025); ctx.fill(); // 頬
  // 鼻と口
  ctx.fillStyle = '#f2b68a'; circ(ctx, 0.22, -0.18, 0.035); ctx.fill();
  // ヘルメット
  ctx.fillStyle = PAL.helmet;
  ctx.beginPath(); ctx.arc(0.02, -0.28, 0.23, Math.PI * 1.02, Math.PI * 2.02); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PAL.helmetDark; rrect(ctx, -0.22, -0.3, 0.5, 0.06, 0.03); ctx.fill(); ctx.stroke(); // つば
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ell(ctx, -0.04, -0.42, 0.08, 0.035, -0.3); ctx.fill();
  // ヘッドランプ
  ctx.fillStyle = '#555'; rrect(ctx, 0.12, -0.44, 0.1, 0.09, 0.02); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PAL.lamp; circ(ctx, 0.2, -0.395, 0.04); ctx.fill();
  const glow = ctx.createRadialGradient(0.22, -0.395, 0.01, 0.22, -0.395, 0.35);
  glow.addColorStop(0, 'rgba(255,250,210,0.45)'); glow.addColorStop(1, 'rgba(255,250,210,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.moveTo(0.22, -0.4); ctx.lineTo(0.62, -0.62); ctx.lineTo(0.62, -0.16); ctx.closePath(); ctx.fill();
  ctx.restore();
  void u;
}
function heroDeath(ctx, st, t) {
  const k = st.deadT;
  if (st.cause === 'rock') { // ぺしゃんこ
    ctx.scale(1.35, 0.32); ctx.translate(0, 0.9);
  } else if (k < 0.7) {
    ctx.rotate(Math.sin(k * 40) * 0.25);
  } else {
    const s = Math.max(0.2, 1 - (k - 0.7) * 0.6); ctx.scale(s, s); ctx.rotate((k - 0.7) * 9);
  }
  ctx.lineWidth = 0.035; ctx.strokeStyle = PAL.ink;
  ctx.fillStyle = PAL.suit; rrect(ctx, -0.24, -0.06, 0.46, 0.38, 0.14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PAL.skin; circ(ctx, 0.04, -0.24, 0.2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PAL.helmet; ctx.beginPath(); ctx.arc(0.02, -0.28, 0.23, Math.PI, TAU); ctx.closePath(); ctx.fill(); ctx.stroke();
  // ×の目
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.03;
  for (const ex of [0.0, 0.13]) { ctx.beginPath(); ctx.moveTo(ex - 0.03, -0.27); ctx.lineTo(ex + 0.03, -0.2); ctx.moveTo(ex + 0.03, -0.27); ctx.lineTo(ex - 0.03, -0.2); ctx.stroke(); }
  // 頭の上の星
  if (st.cause !== 'rock' && k > 0.3) for (let i = 0; i < 3; i++) {
    const a = t * 5 + i * 2.1; ctx.fillStyle = PAL.ember;
    circ(ctx, Math.cos(a) * 0.3, -0.55 + Math.sin(a) * 0.08, 0.05); ctx.fill();
  }
}

// ---------------- 追跡型「プクモ」 ----------------
export function drawChaser(ctx, x, y, S, st, t) {
  if (st.state === 'pop') return;
  ctx.save(); ctx.translate(x, y); ctx.scale(S, S);
  ctx.lineJoin = 'round';
  const flip = st.face === 'left' ? -1 : 1;
  if (st.state === 'crushed') { flat(ctx, PAL.chaser); ctx.restore(); return; }
  const ghost = st.state === 'ghost';
  const warn = st.state === 'ghostWarn';
  const amt = st.amt;
  const r0 = 0.38;
  const r = r0 * (1 + amt * 0.95);
  const wob = amt > 0 ? Math.sin(t * (st.recovering ? 26 : 9)) * 0.03 * (st.recovering ? 2 : 1) : 0;
  const hop = !amt && !ghost && st.state !== 'wait' ? Math.abs(Math.sin(st.anim * 8)) * -0.05 : 0;
  ctx.translate(0, hop);
  if (ghost || warn) {
    const a = ghost ? 0.85 : 0.5 + 0.5 * Math.sin(t * 30);
    // 砂の輪郭（波打つ）
    ctx.setLineDash([0.06, 0.05]); ctx.lineWidth = 0.04; ctx.strokeStyle = `rgba(255,225,160,${a})`;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const an = i / 24 * TAU; const rr2 = r0 * (1 + 0.08 * Math.sin(an * 5 + t * 8)); ctx.lineTo(Math.cos(an) * rr2, Math.sin(an) * rr2); }
    ctx.stroke(); ctx.setLineDash([]);
    if (warn) { ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 30); body(); ctx.globalAlpha = 1; }
    eyes(0.65); antennae(0.85);
    if (warn) { ctx.fillStyle = '#ffd35a'; ctx.beginPath(); ctx.moveTo(0.42 * flip, -0.62); ctx.lineTo(0.56 * flip, -0.36); ctx.lineTo(0.28 * flip, -0.36); ctx.closePath(); ctx.fill(); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.025; ctx.stroke(); }
    ctx.restore(); return;
  }
  body(); antennae(1); eyes(1);
  ctx.restore();

  function body() {
    // 手足（膨らむと外へ開き、小さくなる）
    ctx.fillStyle = PAL.chaserDark; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.035;
    const fs = 1 - amt * 0.5, spread = r * 0.75;
    const step = st.state === 'wait' || amt ? 0 : Math.sin(st.anim * 8) * 0.06;
    ell(ctx, -spread * 0.55 + step, r * 0.92, 0.1 * fs, 0.07 * fs); ctx.fill(); ctx.stroke();
    ell(ctx, spread * 0.55 - step, r * 0.92, 0.1 * fs, 0.07 * fs); ctx.fill(); ctx.stroke();
    if (amt > 0) { ell(ctx, -r * 1.02, 0, 0.07 * fs, 0.05 * fs); ctx.fill(); ctx.stroke(); ell(ctx, r * 1.02, 0, 0.07 * fs, 0.05 * fs); ctx.fill(); ctx.stroke(); }
    // 胴（膨らむほど横にも縦にも張り、収縮前はぷるぷる）
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
    const tint = st.recovering && Math.floor(t * 10) % 2 ? '#a8ffe4' : PAL.chaser;
    g.addColorStop(0, '#d8fff0'); g.addColorStop(0.35, tint); g.addColorStop(1, PAL.chaserDark);
    ctx.fillStyle = g;
    ell(ctx, 0, 0, r * (1 + wob), r * (1 - wob) * (amt ? 1 : 0.94)); ctx.fill(); ctx.stroke();
    // 頬（膨らむほど赤く大きく）
    ctx.fillStyle = PAL.blush; ctx.globalAlpha = 0.55 + amt * 0.4;
    ell(ctx, (r * 0.45) * flip, r * 0.22, 0.07 + amt * 0.07, 0.04 + amt * 0.04); ctx.fill();
    ell(ctx, (-r * 0.25) * flip, r * 0.25, 0.06 + amt * 0.06, 0.035 + amt * 0.035); ctx.fill();
    ctx.globalAlpha = 1;
    // 口（通常は笑顔、膨らむと「お」の口）
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.03;
    if (amt > 0) { ctx.fillStyle = '#5a1a2a'; ell(ctx, r * 0.18 * flip, r * 0.42, 0.04 + amt * 0.03, 0.05 + amt * 0.04); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0.1 * flip, 0.12, 0.08, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
  }
  function antennae(alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.03;
    const sway = Math.sin(t * 3 + st.anim) * 0.08;
    for (const s of [-1, 1]) {
      const bx = s * 0.1, by = -r * 0.92, tx = bx + s * 0.1 + sway, ty = by - 0.18;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx, ty, tx, ty); ctx.stroke();
      ctx.fillStyle = PAL.leaf; ell(ctx, tx + s * 0.05, ty - 0.02, 0.08, 0.04, s * 0.5); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function eyes(alpha) {
    ctx.globalAlpha = alpha;
    const ex = 0.16, ey = -r * 0.25, er = 0.11 + amt * 0.05;
    const blinkWait = st.state === 'wait' && Math.floor(t * 4) % 2 === 0;
    for (const s of [-1, 1]) {
      const cx = s * ex + 0.06 * flip;
      ctx.fillStyle = '#fff'; ell(ctx, cx, ey, er * 0.85, blinkWait ? 0.02 : er); ctx.fill(); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.03; ctx.stroke();
      if (!blinkWait) {
        const pr = amt > 0.5 ? 0.03 : 0.05; // 膨らむと目が丸く見開かれ、瞳が小さくなる
        ctx.fillStyle = PAL.ink; circ(ctx, cx + st.look[0] * 0.035, ey + st.look[1] * 0.035, pr); ctx.fill();
        ctx.fillStyle = '#fff'; circ(ctx, cx + st.look[0] * 0.035 + 0.015, ey + st.look[1] * 0.035 - 0.02, 0.014); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------- 火炎型「ボイラン」 ----------------
export function drawFire(ctx, x, y, S, st, t) {
  if (st.state === 'pop') return;
  ctx.save(); ctx.translate(x, y); ctx.scale(S, S); ctx.lineJoin = 'round';
  if (st.state === 'crushed') { flat(ctx, PAL.fire); ctx.restore(); return; }
  const flip = st.face === 'left' ? -1 : st.face === 'right' ? 1 : 1;
  const amt = st.amt;
  const charging = st.state === 'charge', breathing = st.state === 'breath';
  const ghost = st.state === 'ghost', warn = st.state === 'ghostWarn';
  const w = 0.44 * (1 + amt * 0.85), h = 0.34 * (1 + amt * 1.0);
  const shake = charging ? Math.sin(t * 60) * 0.02 : 0;
  const waddle = !amt && st.state === 'walk' ? Math.sin(st.anim * 7) * 0.06 : 0;
  ctx.translate(shake, 0); ctx.rotate(waddle * 0.5);
  ctx.scale(flip, 1);
  if (ghost || warn) {
    ctx.setLineDash([0.06, 0.05]); ctx.lineWidth = 0.04; ctx.strokeStyle = `rgba(255,200,140,${ghost ? 0.85 : 0.5 + 0.5 * Math.sin(t * 30)})`;
    ell(ctx, 0, 0.04, 0.44, 0.34); ctx.stroke(); ctx.setLineDash([]);
    eyesF(0.7); ctx.restore(); return;
  }
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.035;
  // 足
  const fs = 1 - amt * 0.5;
  ctx.fillStyle = PAL.fireDark;
  ell(ctx, -0.2 * (1 + amt), h * 0.95 + 0.04, 0.1 * fs, 0.06 * fs); ctx.fill(); ctx.stroke();
  ell(ctx, 0.18 * (1 + amt), h * 0.95 + 0.04, 0.1 * fs, 0.06 * fs); ctx.fill(); ctx.stroke();
  // 煙突（頭の上）。溜め中は煙が速く出る
  const cy = -h - 0.06;
  ctx.fillStyle = PAL.chimney; rrect(ctx, -0.17, cy - 0.12, 0.13, 0.2, 0.03); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a2e2c'; rrect(ctx, -0.2, cy - 0.15, 0.19, 0.06, 0.02); ctx.fill(); ctx.stroke();
  const puffRate = charging ? 6 : breathing ? 4 : 1.2;
  for (let i = 0; i < 3; i++) {
    const k = (t * puffRate * 0.5 + i / 3) % 1;
    ctx.fillStyle = charging ? `rgba(255,200,120,${0.7 * (1 - k)})` : `rgba(220,210,200,${0.55 * (1 - k)})`;
    circ(ctx, -0.11 - k * 0.12, cy - 0.18 - k * 0.35, 0.05 + k * 0.07); ctx.fill();
  }
  // 胴（釜）
  const g = ctx.createRadialGradient(-w * 0.3, -h * 0.4, 0.02, 0, 0, w * 1.2);
  g.addColorStop(0, '#ffd0a0'); g.addColorStop(0.4, st.recovering && Math.floor(t * 10) % 2 ? '#ffb080' : PAL.fire); g.addColorStop(1, PAL.fireDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w, -h * 0.35); ctx.quadraticCurveTo(-w, -h, -w * 0.4, -h); ctx.lineTo(w * 0.4, -h); ctx.quadraticCurveTo(w, -h, w, -h * 0.35);
  ctx.quadraticCurveTo(w * 1.08, h * 0.9, 0, h); ctx.quadraticCurveTo(-w * 1.08, h * 0.9, -w, -h * 0.35); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // 帯（釜のふち）
  ctx.strokeStyle = PAL.fireDark; ctx.lineWidth = 0.05;
  ctx.beginPath(); ctx.moveTo(-w * 0.95, -h * 0.25); ctx.quadraticCurveTo(0, -h * 0.05, w * 0.95, -h * 0.25); ctx.stroke();
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.035;
  // 腕
  ctx.fillStyle = PAL.fireDark;
  ell(ctx, -w - 0.03, h * 0.15, 0.07 * fs, 0.09 * fs, 0.4); ctx.fill(); ctx.stroke();
  // 頬（溜め中は黄色く光る）
  ctx.fillStyle = charging || breathing ? PAL.ember : '#ff9a7a'; ctx.globalAlpha = charging ? 0.6 + 0.4 * Math.sin(t * 30) : 0.6;
  ell(ctx, w * 0.45, h * 0.35, 0.08 + amt * 0.06, 0.05 + amt * 0.04); ctx.fill(); ctx.globalAlpha = 1;
  eyesF(1);
  // 口（横に広い。溜め・噴射で開いて光る）
  const open = breathing ? 0.12 : charging ? 0.04 + 0.05 * Math.min(1, st.t * 2) : amt ? 0.06 : 0.015;
  ctx.fillStyle = charging || breathing ? '#ffef9a' : '#4a1408';
  rrect(ctx, w * 0.25, h * 0.45 - open / 2, w * 0.7, open + 0.02, 0.02); ctx.fill(); ctx.stroke();
  ctx.restore();

  function eyesF(alpha) {
    ctx.globalAlpha = alpha;
    const ey = -h * 0.45;
    for (const ex of [w * 0.15, w * 0.62]) {
      ctx.fillStyle = '#fff'; ell(ctx, ex, ey, 0.085 + amt * 0.04, 0.09 + amt * 0.05); ctx.fill(); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.03; ctx.stroke();
      ctx.fillStyle = PAL.ink; circ(ctx, ex + 0.025, ey + 0.015, amt > 0.5 ? 0.025 : 0.04); ctx.fill();
      // 眠たげなまぶた（溜め中は持ち上がって目がすわる）
      if (!amt) {
        ctx.fillStyle = PAL.fireDark;
        const lid = charging ? 0.02 : 0.055;
        ctx.beginPath(); ctx.ellipse(ex, ey - 0.09 + lid, 0.095, 0.06, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function flat(ctx, col) {
  ctx.fillStyle = col; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.035;
  ell(ctx, 0, 0.32, 0.5, 0.1); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.025;
  for (const ex of [-0.12, 0.12]) { ctx.beginPath(); ctx.moveTo(ex - 0.03, 0.29); ctx.lineTo(ex + 0.03, 0.35); ctx.moveTo(ex + 0.03, 0.29); ctx.lineTo(ex - 0.03, 0.35); ctx.stroke(); }
}

// ---------------- 岩 ----------------
export function drawRock(ctx, x, y, S, theme, crumble, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(S, S);
  if (crumble > 0) { // 崩れる: いくつかの破片に割れて沈む
    ctx.globalAlpha = 1 - crumble;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU; const d = crumble * 0.35;
      ctx.save(); ctx.translate(Math.cos(a) * d, 0.1 + Math.abs(Math.sin(a)) * d * 0.5); ctx.rotate(a + crumble * 2);
      rockBody(theme, 0.18); ctx.restore();
    }
    ctx.restore(); return;
  }
  rockBody(theme, 0.44);
  ctx.restore();
  function rockBody(th, r) {
    const base = th === 'crystal' ? '#6b6f8f' : th === 'volcano' ? '#3a2f33' : '#8d8478';
    const lite = th === 'crystal' ? '#b9c3ef' : th === 'volcano' ? '#6a5a60' : '#c9c0b0';
    ctx.lineWidth = 0.035; ctx.strokeStyle = PAL.ink;
    ctx.beginPath();
    const pts = [[-1, -0.55], [-0.45, -0.95], [0.4, -0.9], [0.95, -0.4], [1, 0.45], [0.55, 0.92], [-0.5, 0.95], [-0.98, 0.4]];
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * r, py * r) : ctx.moveTo(px * r, py * r)));
    ctx.closePath();
    const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, lite); g.addColorStop(1, base);
    ctx.fillStyle = g; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, -r * 0.35, -r * 0.45, r * 0.3, r * 0.15, -0.5); ctx.fill();
    if (th === 'crystal') { ctx.fillStyle = '#9ff4ff'; ctx.beginPath(); ctx.moveTo(r * 0.1, r * 0.1); ctx.lineTo(r * 0.35, -r * 0.35); ctx.lineTo(r * 0.55, r * 0.2); ctx.lineTo(r * 0.3, r * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    if (th === 'volcano') { ctx.strokeStyle = `rgba(255,${140 + 60 * Math.sin(t * 3)},60,0.9)`; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.1); ctx.lineTo(-r * 0.1, r * 0.25); ctx.lineTo(r * 0.2, -r * 0.05); ctx.lineTo(r * 0.5, r * 0.3); ctx.stroke(); }
    if (th === 'soil') { ctx.strokeStyle = 'rgba(40,30,20,0.5)'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.6); ctx.lineTo(r * 0.05, -r * 0.1); ctx.lineTo(r * 0.4, r * 0.2); ctx.stroke(); }
  }
}

// ---------------- 炎 ----------------
export function drawFlame(ctx, x, y, dir, reach, S, t) {
  if (reach <= 0.05) return;
  ctx.save(); ctx.translate(x + dir * S * 0.42, y + S * 0.1); ctx.scale(dir * S, S);
  const L = reach;
  const layers = [['rgba(255,90,30,0.9)', 0.3], ['rgba(255,170,40,0.95)', 0.21], ['rgba(255,245,180,1)', 0.1]];
  for (const [col, w] of layers) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -w * 0.4);
    const n = 10;
    for (let i = 1; i <= n; i++) { const k = i / n; ctx.lineTo(k * L, -w * (0.4 + k * 0.8) - Math.sin(t * 40 + k * 9) * 0.04); }
    ctx.quadraticCurveTo(L + 0.2, 0, L, w * 1.2);
    for (let i = n; i >= 1; i--) { const k = i / n; ctx.lineTo(k * L, w * (0.4 + k * 0.8) + Math.sin(t * 37 + k * 7) * 0.04); }
    ctx.lineTo(0, w * 0.4); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
