// ツイン・ガーデン — 赤と青をつなぐライン（杭に掛かる折れ線）
//
// ラインは「赤の端 → 掛かっている杭の列 → 青の端」の折れ線。見た目のロープ物理ではなく、この列そのものが判定の根拠。
// - 掛かる: 動いた端と、その隣の点（最初の杭または相手の端）を結ぶ線分が、1 tick の間に杭を掃いたら（三角形の内部に入ったら）掛かる
// - 外れる: 端・杭・次の点がまっすぐ（折れ角 180°）を越えたら外れる。外れるのは常に端に一番近い杭（＝最後に掛かった杭）から
// - 杭ごとに「赤→青の順で見た曲がる向き」(turn = ±1) を覚える。赤・青どちらの端からでも同じ規則で外せる
import { cross } from './geom.js';

const MAX_WRAP_PER_STEP = 8;

export class Rope {
  constructor(pegs) {
    this.pegs = pegs;      // [{x,y}]（盤面の杭。動かない）
    this.anchors = [];     // [{peg, turn}]（赤→青の順）
  }
  reset() { this.anchors.length = 0; }

  /** 折れ線の点列（赤 → 杭 … → 青） */
  points(red, blue, out = []) {
    out.length = 0;
    out.push({ x: red.x, y: red.y });
    for (const a of this.anchors) out.push({ x: this.pegs[a.peg].x, y: this.pegs[a.peg].y });
    out.push({ x: blue.x, y: blue.y });
    return out;
  }

  /** 赤の端が r0→r1 に動いた（青は blue に居る） */
  moveRed(r0, r1, blue) { frontStep(this.anchors, this.pegs, r0, r1, blue); }

  /** 青の端が b0→b1 に動いた（赤は red に居る）。列を裏返して同じ処理を使う（turn の符号も反転） */
  moveBlue(b0, b1, red) {
    const a = this.anchors;
    flip(a);
    frontStep(a, this.pegs, b0, b1, red);
    flip(a);
  }

  snapshot() { return this.anchors.map((a) => a.peg * 2 + (a.turn > 0 ? 1 : 0)); }
}

function flip(a) { a.reverse(); for (const x of a) x.turn = -x.turn; }

// 列の先頭（anchors[0]）側の端 e が e0→e1 に動いたときの処理。far は列の反対側の端
function frontStep(anchors, pegs, e0, e1, far) {
  // ① 外れる（最後に掛かった杭から順に）。外れた杭は、同じ tick のうちに掛け直さない
  let freed = 0;
  while (anchors.length) {
    const q = pegs[anchors[0].peg];
    const n = anchors.length > 1 ? pegs[anchors[1].peg] : far;
    const t = cross(q.x - e1.x, q.y - e1.y, n.x - q.x, n.y - q.y);
    const dot = (q.x - e1.x) * (n.x - q.x) + (q.y - e1.y) * (n.y - q.y);
    if (t * anchors[0].turn < 0 && dot > 0) { freed |= 1 << (anchors.shift().peg & 31); continue; }
    break;
  }
  // ② 掛かる（掃いた三角形の中で、隣の点から見て最初に当たる杭から）
  let from = e0;
  for (let it = 0; it < MAX_WRAP_PER_STEP; it++) {
    const A = anchors.length ? pegs[anchors[0].peg] : far;
    const skip = anchors.length ? anchors[0].peg : -1;
    let best = -1, bestAng = Infinity;
    const fx = from.x - A.x, fy = from.y - A.y;
    for (let k = 0; k < pegs.length; k++) {
      if (k === skip || (freed & (1 << (k & 31)))) continue;
      const q = pegs[k];
      if (Math.abs(q.x - A.x) < 1e-9 && Math.abs(q.y - A.y) < 1e-9) continue;
      if (!swept(q, A, from, e1)) continue;
      const qx = q.x - A.x, qy = q.y - A.y;
      const ang = Math.abs(Math.atan2(cross(fx, fy, qx, qy), fx * qx + fy * qy));
      if (ang < bestAng - 1e-12) { bestAng = ang; best = k; }
    }
    if (best < 0) break;
    const q = pegs[best];
    const turn = cross(q.x - e1.x, q.y - e1.y, A.x - q.x, A.y - q.y);
    if (Math.abs(turn) < 1e-12) break;
    anchors.unshift({ peg: best, turn: turn > 0 ? 1 : -1 });
    // 残りの掃き: 直線 A→q の延長と from→e1 の交点から e1 まで
    const c0 = cross(q.x - A.x, q.y - A.y, from.x - A.x, from.y - A.y);
    const c1 = cross(q.x - A.x, q.y - A.y, e1.x - from.x, e1.y - from.y);
    let s = Math.abs(c1) < 1e-12 ? 1 : -c0 / c1;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    from = { x: from.x + s * (e1.x - from.x), y: from.y + s * (e1.y - from.y) };
  }
}

// 線分 A–from が A–e1 へ動いたとき、杭 q を掃いたか。掃き始めの辺（A–from 上）は含み、掃き終わりの辺（A–e1 上）は含まない半開区間。
// こうすると、ちょうど線の上に杭が来た tick と次の tick のどちらでも取りこぼさず、二重にも数えない。
function swept(q, A, from, e1) {
  const o = cross(from.x - A.x, from.y - A.y, e1.x - A.x, e1.y - A.y);
  if (Math.abs(o) < 1e-12) return false;
  const s = o > 0 ? 1 : -1;
  const d1 = cross(from.x - A.x, from.y - A.y, q.x - A.x, q.y - A.y) * s;  // A–from（含む）
  const d2 = cross(e1.x - from.x, e1.y - from.y, q.x - from.x, q.y - from.y) * s;
  const d3 = cross(A.x - e1.x, A.y - e1.y, q.x - e1.x, q.y - e1.y) * s;     // A–e1（含まない）
  return d1 >= -1e-12 && d2 > 1e-12 && d3 > 1e-12;
}
