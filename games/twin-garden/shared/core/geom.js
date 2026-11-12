// ツイン・ガーデン — 幾何の基本（描画・機器に依存しない）
// 座標は盤面の論理単位（横 24 × 縦 18）。y は下向き（2D 画面と同じ）。3D では x→X、y→Z に写す。
// 許容誤差はすべて「盤面の対角線（30 単位）」に対する相対値から作る（GAME_DESIGN.md「囲み判定」）。

export const EPS = 1e-9;

export function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

/** 多角形の符号付き面積（点の並び [{x,y}...]、閉じていない形で渡す） */
export function signedArea(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}
export function area(poly) { return Math.abs(signedArea(poly)); }

/**
 * 2 線分 p1-p2 と p3-p4 の「真の交差」。端点に触れるだけ・重なるだけ（平行）は交差としない。
 * 戻り値: null または { x, y, t, u }（t は p1→p2、u は p3→p4 の内分比）
 */
export function properIntersect(p1, p2, p3, p4, tol = 1e-7) {
  const rx = p2.x - p1.x, ry = p2.y - p1.y;
  const sx = p4.x - p3.x, sy = p4.y - p3.y;
  const den = cross(rx, ry, sx, sy);
  const lr = Math.hypot(rx, ry), ls = Math.hypot(sx, sy);
  if (lr < EPS || ls < EPS) return null;
  if (Math.abs(den) < 1e-9 * lr * ls) return null; // 平行・重なり → 不成立
  const qx = p3.x - p1.x, qy = p3.y - p1.y;
  const t = cross(qx, qy, sx, sy) / den;
  const u = cross(qx, qy, rx, ry) / den;
  if (t <= tol || t >= 1 - tol || u <= tol || u >= 1 - tol) return null;
  return { x: p1.x + t * rx, y: p1.y + t * ry, t, u };
}

/** 点 p と線分 a-b の最短距離の 2 乗と、最近点 */
export function closestOnSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 < EPS ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + t * dx, y = a.y + t * dy;
  return { x, y, t, d2: dist2(p.x, p.y, x, y) };
}

/** 点が多角形の内部（偶奇規則）、または境界から tol 以内なら true */
export function pointInPoly(p, poly, tol = 0) {
  const n = poly.length;
  if (tol > 0) {
    const t2 = tol * tol;
    for (let i = 0; i < n; i++) if (closestOnSeg(p, poly[i], poly[(i + 1) % n]).d2 <= t2) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** 点 q が三角形 a,b,c の厳密な内部にあるか（境界上は false） */
export function strictlyInTriangle(q, a, b, c, tol = 1e-9) {
  const d1 = cross(b.x - a.x, b.y - a.y, q.x - a.x, q.y - a.y);
  const d2 = cross(c.x - b.x, c.y - b.y, q.x - b.x, q.y - b.y);
  const d3 = cross(a.x - c.x, a.y - c.y, q.x - c.x, q.y - c.y);
  return (d1 > tol && d2 > tol && d3 > tol) || (d1 < -tol && d2 < -tol && d3 < -tol);
}

/**
 * 2 つの点が同じ 1 tick の間に動いたときの最短距離（掃引判定）。
 * 自機 a0→a1 と敵 b0→b1 を等速とみなし、相対運動の最近点を求める。高速でもすり抜けない。
 */
export function sweptMinDist(a0, a1, b0, b1) {
  const px = a0.x - b0.x, py = a0.y - b0.y;
  const vx = (a1.x - a0.x) - (b1.x - b0.x), vy = (a1.y - a0.y) - (b1.y - b0.y);
  const vv = vx * vx + vy * vy;
  let t = vv < EPS ? 0 : -(px * vx + py * vy) / vv;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px + vx * t, py + vy * t);
}
