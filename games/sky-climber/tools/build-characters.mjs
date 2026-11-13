// Sky Climber VR — キャラクターのモデル生成（オフライン）。
// 体を「滑らかに結合した距離場（SDF）」で定義し、Surface Nets で 1 枚の連続した表面を取り出す。
// 頂点は距離場の勾配で表面へ吸着させ、法線も勾配から取る（継ぎ目のない滑らかな曲面）。
// スキンウェイトは各部品（骨に属する）までの距離から滑らかに配分する → 肘・膝・肩・首が自然に曲がる。
// 出力: src/render/models/<名前>.json（骨格・グループ・付属物の位置）と <名前>.bin（頂点データ）
// 使い方: node tools/build-characters.mjs   （数十秒かかる）
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'render', 'models');
mkdirSync(OUT, { recursive: true });

// ---------- ベクトルと距離関数 ----------
const v = (x, y, z) => [x, y, z];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => mul(a, 1 / (len(a) || 1));
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rotX(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]]; }
function rotY(p, a) { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; }
function rotZ(p, a) { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]; }

// 太さの変わるカプセル（iq の round cone）
function roundCone(a, b, r1, r2) {
  const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const f = (p) => {
    const pa = sub(p, a), y = dot(pa, ba), z = y - l2;
    const xv = sub(mul(pa, l2), mul(ba, y)), x2 = dot(xv, xv), y2 = y * y * l2, z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  };
  const r = Math.max(r1, r2);
  return { f, min: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r], max: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r], axis: [a, b] };
}
// 楕円体（回転つき: rot = [rx, ry, rz]）
function ellipsoid(c, r, rot = [0, 0, 0]) {
  const f = (p) => {
    let q = sub(p, c);
    if (rot[2]) q = rotZ(q, -rot[2]); if (rot[1]) q = rotY(q, -rot[1]); if (rot[0]) q = rotX(q, -rot[0]);
    const k0 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]), k1 = Math.hypot(q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2]));
    return k1 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
  };
  const m = Math.max(...r);
  return { f, min: sub(c, [m, m, m]), max: add(c, [m, m, m]), center: c };
}
// 輪（はちまき）: 中心 c、主半径 R、太さ t、X 軸まわりの傾き tilt
function torus(c, R, t, tilt = 0, sy = 1) {
  const f = (p) => { let q = sub(p, c); q = rotX(q, -tilt); q = [q[0], q[1] / sy, q[2]]; const qx = Math.hypot(q[0], q[2]) - R; return Math.hypot(qx, q[1]) - t; };
  const m = R + t; return { f, min: sub(c, [m, m, m]), max: add(c, [m, m, m]), center: c };
}
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// ---------- 部品の集合 → 距離場 ----------
// part = { s: 形状, bone: 骨の番号, group: 'skin'|'hair'|'cloth'|'shoe'|'glove'|'beak'..., color: [r,g,b] か (p)=>[r,g,b], k: 結合の滑らかさ, sub: true なら削る }
function makeField(parts) {
  const pad = 0.04;
  for (const p of parts) { p.lo = sub(p.s.min, [pad, pad, pad]); p.hi = add(p.s.max, [pad, pad, pad]); p.k = p.k ?? 0.02; }
  const field = (p) => {
    let d = 1;
    for (const q of parts) {
      if (p[0] < q.lo[0] || p[1] < q.lo[1] || p[2] < q.lo[2] || p[0] > q.hi[0] || p[1] > q.hi[1] || p[2] > q.hi[2]) continue;
      const di = q.s.f(p);
      d = q.sub ? Math.max(d, -di + (q.k ? 0 : 0)) : smin(d, di, q.k);
    }
    return d;
  };
  const each = (p) => { const out = []; for (const q of parts) { if (q.sub) continue; if (p[0] < q.lo[0] || p[1] < q.lo[1] || p[2] < q.lo[2] || p[0] > q.hi[0] || p[1] > q.hi[1] || p[2] > q.hi[2]) continue; out.push([q, q.s.f(p)]); } return out; };
  return { field, each };
}

// ---------- Surface Nets ----------
function surfaceNets(field, bmin, bmax, h) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const id = (x, y, z) => (z * ny + y) * nx + x;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) F[id(x, y, z)] = field([bmin[0] + x * h, bmin[1] + y * h, bmin[2] + z * h]);
  const cid = (x, y, z) => (z * (ny - 1) + y) * (nx - 1) + x;
  const cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const val = C.map((c) => F[id(x + c[0], y + c[1], z + c[2])]);
    let inside = 0; for (const s of val) if (s < 0) inside++;
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      const va = val[a], vb = val[b]; if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    cell[cid(x, y, z)] = pos.length;
    pos.push([bmin[0] + (x + sx / n) * h, bmin[1] + (y + sy / n) * h, bmin[2] + (z + sz / n) * h]);
  }
  const tri = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) tri.push(a, b, c, a, c, d); else tri.push(a, c, b, a, d, c); };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const s0 = F[id(x, y, z)] < 0;
    if (x < nx - 1 && s0 !== (F[id(x + 1, y, z)] < 0)) quad(cell[cid(x, y - 1, z - 1)], cell[cid(x, y, z - 1)], cell[cid(x, y, z)], cell[cid(x, y - 1, z)], s0);
    if (y < ny - 1 && s0 !== (F[id(x, y + 1, z)] < 0)) quad(cell[cid(x - 1, y, z - 1)], cell[cid(x - 1, y, z)], cell[cid(x, y, z)], cell[cid(x, y, z - 1)], s0);
    if (z < nz - 1 && s0 !== (F[id(x, y, z + 1)] < 0)) quad(cell[cid(x - 1, y - 1, z)], cell[cid(x, y - 1, z)], cell[cid(x, y, z)], cell[cid(x - 1, y, z)], s0);
  }
  return { pos, tri };
}
const grad = (field, p, e = 0.0007) => norm([field([p[0] + e, p[1], p[2]]) - field([p[0] - e, p[1], p[2]]), field([p[0], p[1] + e, p[2]]) - field([p[0], p[1] - e, p[2]]), field([p[0], p[1], p[2] + e]) - field([p[0], p[1], p[2] - e])]);

// ---------- 追加の距離関数 ----------
// 平たい帯の輪（ベルト・ハーネス）: 中心 c、楕円の半径 rx/rz、帯の半分の高さ hh、厚み th
function belt(c, rx, rz, hh, th, tiltX = 0) {
  const f = (p) => { let q = sub(p, c); if (tiltX) q = rotX(q, -tiltX); const k = Math.hypot(q[0] / rx, q[2] / rz); const dr = (k - 1) * Math.min(rx, rz); const dx = Math.abs(dr) - th, dy = Math.abs(q[1]) - hh; return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - 0.004; };
  const m = Math.max(rx, rz) + th + 0.01; return { f, min: sub(c, [m, m, m]), max: add(c, [m, m, m]), center: c };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (p, c, s) => Math.exp(-(dot(sub(p, c), sub(p, c))) / (2 * s * s));

// ---------- モデルを作って書き出す ----------
// 素材ごとに別の閉じた表面（層）を作って重ねる。頂点ごとに: 位置・法線・色・UV・骨 4 本・重み・焼き込みの陰（AO）。
// post(p, group) で結合姿勢の補正（口を閉じる等）、morphs = { 名前: (p, group) => 変位 | null } で表情の変形を作る
function build(name, { layers, bones, sigma = 0.018, extra = {}, post = null, morphs = {} }) {
  const t0 = Date.now();
  const allParts = layers.flatMap((l) => l.parts);
  const all = makeField(allParts);
  const P = [], Nn = [], Co = [], Uv = [], SI = [], SW = [], AO = [], GR = [], index = [], gInfo = [];
  for (const L of layers) {
    const { field, each } = makeField(L.parts);
    const { pos, tri } = surfaceNets(field, L.bmin, L.bmax, L.h);
    const base = P.length;
    for (let i = 0; i < pos.length; i++) {
      let p = pos[i];
      for (let k = 0; k < 2; k++) { const d = field(p), g = grad(field, p); p = sub(p, mul(g, d)); }
      const nrm = grad(field, p);
      const own = each(p).sort((a, b) => a[1] - b[1]);
      const near = own[0] ? own[0][0] : L.parts[0];
      // 焼き込みの陰: 法線方向に少し離れた点が、全体の距離場でどれだけ「物に近いか」
      let occ = 0; for (const [d, w] of [[0.012, 0.5], [0.03, 0.3], [0.07, 0.2]]) { const q = add(p, mul(nrm, d)); occ += w * Math.max(0, Math.min(1, (d - all.field(q)) / d)); }
      AO.push(Math.max(0.25, 1 - occ * (L.ao ?? 0.9)));
      Nn.push(nrm); Co.push(typeof near.color === 'function' ? near.color(p, nrm) : near.color); GR.push(L.group);
      const list = all.each(p), dmin = Math.min(...list.map((x) => x[1])), acc = new Map();
      for (const [q, d] of list) { if (q.noWeight) continue; const w = Math.exp(-Math.max(0, d - dmin) / (q.sigma ?? sigma)); acc.set(q.bone, (acc.get(q.bone) || 0) + w); }
      if (!acc.size) acc.set(near.bone, 1);
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s2, x) => s2 + x[1], 0);
      const ii = [0, 0, 0, 0], ww = [0, 0, 0, 0]; top.forEach(([b, w], k) => { ii[k] = b; ww[k] = Math.round(w / sum * 255); });
      ww[0] += 255 - ww.reduce((a, b) => a + b, 0); SI.push(ii); SW.push(ww);
      if (near.s.axis) { const [a, b] = near.s.axis, ax = norm(sub(b, a)), pa = sub(p, a), along = dot(pa, ax), rad = sub(pa, mul(ax, along)); const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const u0 = norm(cross(ax, ref)), w0 = cross(ax, u0);
        Uv.push([Math.atan2(dot(rad, w0), dot(rad, u0)) / (2 * Math.PI) * 4, along * 8]); }
      else { const c0 = near.s.center || p, d0 = norm(sub(p, c0)); Uv.push([Math.atan2(d0[0], d0[2]) / (2 * Math.PI) * 6, d0[1] * 3]); }
      P.push(post ? post(p, L.group) : p);
    }
    const start = index.length;
    for (const t of tri) index.push(base + t);
    gInfo.push({ name: L.group, start, count: tri.length });
    console.log(`  ${name}/${L.group}: 頂点 ${pos.length}・三角形 ${tri.length / 3}`);
  }
  const n = P.length, big = n > 65535;
  const fP = new Float32Array(n * 3), fN = new Int8Array(n * 4), fC = new Uint8Array(n * 4), fU = new Float32Array(n * 2), fSI = new Uint8Array(n * 4), fSW = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    fP.set(P[i], i * 3); fN.set([Math.round(Nn[i][0] * 127), Math.round(Nn[i][1] * 127), Math.round(Nn[i][2] * 127), 0], i * 4);
    fC.set([Math.round(Co[i][0] * 255), Math.round(Co[i][1] * 255), Math.round(Co[i][2] * 255), Math.round(AO[i] * 255)], i * 4); fU.set(Uv[i], i * 2); fSI.set(SI[i], i * 4); fSW.set(SW[i], i * 4);
  }
  const I = big ? new Uint32Array(index) : new Uint16Array(index);
  const bufs = { position: fP, normal: fN, color: fC, uv: fU, skinIndex: fSI, skinWeight: fSW, index: I };
  // 表情の変形（疎: 動く頂点の番号と変位だけ）
  const morphInfo = [];
  for (const [mn, fn] of Object.entries(morphs)) {
    const idx = [], del = [];
    for (let i = 0; i < n; i++) { const d = fn(P[i], GR[i]); if (d && (Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2])) > 2e-5) { idx.push(i); del.push(d[0], d[1], d[2]); } }
    bufs['mi_' + mn] = new Uint32Array(idx); bufs['md_' + mn] = new Float32Array(del); morphInfo.push({ name: mn, count: idx.length });
  }
  const layout = {}; let off = 0;
  for (const [k, b] of Object.entries(bufs)) { layout[k] = { offset: off, length: b.length, type: b.constructor.name }; off += b.byteLength; off = (off + 3) & ~3; }
  const bin = Buffer.alloc(off); for (const [k, b] of Object.entries(bufs)) Buffer.from(b.buffer, b.byteOffset, b.byteLength).copy(bin, layout[k].offset);
  writeFileSync(join(OUT, name + '.bin'), bin);
  writeFileSync(join(OUT, name + '.json'), JSON.stringify({ name, generator: 'tools/build-characters.mjs（Claude Code で制作）', vertices: n, triangles: index.length / 3, bones, groups: gInfo, morphs: morphInfo, layout, ...extra }, null, 1));
  console.log(`${name}: 頂点 ${n}・三角形 ${index.length / 3}・${(off / 1024).toFixed(0)}KB・${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// =========================================================
// 頭（写実寄り）。基準は「顔が -z を向き、頭の付け根（首の上端）が原点」。tf で各モデルの座標へ移す。
// o: { w 顔の幅の倍率, jaw あごの張り, nose 鼻の大きさ, age しわ・たるみ(0-1), eye 目の大きさ, hair: 'short'|'bald'|'perm', mustache, band }
// 戻り値: 目の中心・口などの位置と、表情の変形の関数
// =========================================================
function makeHead(o, tf, bone, L) {
  const w = o.w ?? 1, jw = o.jaw ?? 1, nz = o.nose ?? 1, age = o.age ?? 0, es = o.eye ?? 1;
  const SK = o.skin, P = (layer, s, color, k, extra = {}) => L[layer].push({ s, bone, group: layer, color: color ?? SK, k, ...extra });
  const T = tf, E = (c, r, rot) => ellipsoid(T(c), r, rot), RC = (a, b, r1, r2) => roundCone(T(a), T(b), r1, r2);
  // 頭蓋・顔・あご
  P('skin', E([0, 0.122, 0.014], [0.077 * w, 0.096, 0.097]), null, 0.03);
  P('skin', E([0, 0.08, -0.03], [0.063 * w, 0.085, 0.072]), null, 0.03);
  P('skin', E([0, 0.022, -0.03], [0.048 * w * jw, 0.04, 0.054]), null, 0.035);
  P('skin', E([0, -0.002, -0.056], [0.031 * jw, 0.021, 0.026]), null, 0.03);                       // おとがい
  for (const s of [-1, 1]) {
    P('skin', E([s * 0.047 * w, 0.082, -0.058], [0.023, 0.019, 0.022]), null, 0.03);               // ほお骨
    P('skin', E([s * 0.044 * w * jw, 0.034, -0.008], [0.013, 0.024, 0.028]), null, 0.03);              // えら
    P('skin', E([s * 0.03, 0.123, -0.083], [0.026, 0.0105, 0.016], [0, 0, s * 0.12]), null, 0.016); // 眉の骨
    P('skin', E([s * 0.012 * nz, 0.066, -0.097], [0.0095 * nz, 0.008 * nz, 0.0095 * nz]), null, 0.01); // 小鼻
    // 耳: 外輪と、内側のくぼみ
    P('skin', E([s * 0.0775 * w, 0.092, 0.014], [0.0075, 0.031, 0.019], [0.25, -s * 0.35, 0]), null, 0.006);
    P('skin', E([s * 0.079 * w, 0.058, 0.009], [0.006, 0.011, 0.009]), null, 0.008);               // 耳たぶ
    if (age > 0.3) P('skin', E([s * 0.036, 0.03, -0.062], [0.02, 0.024, 0.018]), null, 0.03);       // ほおのたるみ
  }
  P('skin', RC([0, 0.118, -0.089], [0, 0.074, -0.104 - 0.004 * nz], 0.0085, 0.0115 * nz), null, 0.014);   // 鼻筋〜鼻先
  P('skin', E([0, 0.067, -0.107 - 0.004 * nz], [0.0115 * nz, 0.0095 * nz, 0.0105 * nz]), null, 0.008);
  P('skin', E([0, 0.0445, -0.093], [0.0225, 0.0068, 0.0115]), null, 0.007);                        // 上くちびる
  P('skin', E([0, 0.0305, -0.091], [0.0205, 0.008, 0.0115]), null, 0.007);                         // 下くちびる
  P('skin', E([0, 0.058, -0.094], [0.016, 0.012, 0.01]), null, 0.012);                             // 人中のふくらみ
  // 削る: 口（開けた形で作り、あとで閉じる）・眼窩・耳のくぼみ
  const MY = 0.0378;
  P('skin', E([0, MY, -0.09], [0.0215, 0.0036, 0.02]), null, 0, { sub: true });
  const eyeC = [-1, 1].map((s) => [s * 0.0318, 0.103, -0.0705]);
  const ER = 0.0128 * es;
  for (const s of [-1, 1]) {
    P('skin', E([s * 0.0318, 0.103, -0.089], [0.0168 * es, 0.0086 * es, 0.0155], [0, 0, s * 0.1]), null, 0, { sub: true });
    P('skin', E([s * 0.0835 * w, 0.094, 0.008], [0.0045, 0.016, 0.009], [0.25, -s * 0.35, 0]), null, 0, { sub: true });
  }
  // 髪
  const HC = o.hairColor;
  if (o.hair === 'short') {
    // 頭皮に沿う短い髪（横と後ろ）＋上と前のボリューム（後ろへ流す）
    P('hair', E([0, 0.134, 0.022], [0.081 * w, 0.094, 0.097]), HC, 0.012);
    P('hair', E([0, 0.182, -0.008], [0.06, 0.03, 0.074], [-0.15, 0, 0]), HC, 0.03);
    P('hair', E([0.012, 0.186, -0.052], [0.048, 0.022, 0.036], [-0.45, 0, 0.12]), HC, 0.025);            // 前髪の立ち上がり
    P('hair', E([-0.03, 0.18, -0.03], [0.035, 0.022, 0.055], [-0.25, 0.2, -0.2]), HC, 0.025);
    P('hair', E([0.036, 0.178, -0.02], [0.03, 0.02, 0.055], [-0.2, -0.2, 0.25]), HC, 0.025);
    P('hair', E([0, 0.16, 0.085], [0.06, 0.05, 0.035]), HC, 0.03);                                   // つむじ〜後頭部
    P('hair', E([0, 0.07, 0.085], [0.05, 0.04, 0.022]), HC, 0.025);                                  // えり足
    for (const s of [-1, 1]) P('hair', E([s * 0.073 * w, 0.118, 0.004], [0.012, 0.03, 0.03]), HC, 0.014); // もみあげ
  } else if (o.hair === 'perm') {
    P('hair', E([0, 0.14, 0.02], [0.083 * w, 0.092, 0.098]), HC, 0.012);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, e = rnd() * 1.25 - 0.1; const r = 0.094; const c = [Math.cos(a) * Math.cos(e) * r * 0.92 * w, 0.135 + Math.sin(e) * r, 0.02 + Math.sin(a) * Math.cos(e) * r];
      if (c[2] < -0.045 && c[1] < 0.17) continue; P('hair', E(c, [0.02, 0.02, 0.02]), HC, 0.012); }
  } else if (o.hair === 'bald') {
    for (const s of [-1, 1]) P('hair', E([s * 0.072 * w, 0.105, 0.03], [0.012, 0.034, 0.055]), HC, 0.012);
    P('hair', E([0, 0.085, 0.092], [0.055, 0.035, 0.016]), HC, 0.014);
  }
  // 眉（毛の束）・口ひげ
  const BC = o.browColor ?? HC;
  for (const s of [-1, 1]) { P('hair', RC([s * 0.014, 0.1265, -0.0965], [s * 0.034, 0.1305, -0.091], 0.0066 * (o.brow ?? 1), 0.006 * (o.brow ?? 1)), BC, 0.006); P('hair', RC([s * 0.034, 0.1305, -0.091], [s * 0.05, 0.125, -0.079], 0.006 * (o.brow ?? 1), 0.0042), BC, 0.006); }
  if (o.mustache) P('hair', E([0, 0.054, -0.101], [0.027, 0.0085, 0.009]), BC, 0.006);
  if (o.band) { P('band', belt(T([0, 0.15, 0.016]), 0.0825 * w, 0.1, 0.0115, 0.0028, -0.16), o.band, 0.002); P('band', E([0, 0.146, 0.098], [0.016, 0.014, 0.012]), o.band, 0.006); }
  // ---- 結合姿勢の補正と、表情の変形（頭の基準座標で計算） ----
  const inv = o.inv; // モデル座標 → 頭の基準座標
  const fwd = (v) => sub(T(add([0, 0, 0], v)), T([0, 0, 0])); // 向きの変換
  const closeMouth = (pm) => { // 開けて作った口を閉じる（上下のくちびるを寄せる）
    const p = inv(pm); if (Math.abs(p[0]) > 0.034 || p[2] > -0.045 || p[1] < MY - 0.04 || p[1] > MY + 0.025) return pm;
    const wx = 1 - smooth(0.02, 0.033, Math.abs(p[0]));
    let dy = 0; if (p[1] < MY) dy = 0.0044 * smooth(MY - 0.03, MY - 0.003, p[1]); else dy = -0.0024 * (1 - smooth(MY + 0.003, MY + 0.02, p[1]));
    return add(pm, fwd([0, dy * wx, 0]));
  };
  const hinge = [0, 0.07, 0.005];
  const jawW = (p) => { if (p[1] > MY + 0.0005 || p[2] > 0.03) return 0; const front = 1 - smooth(-0.05, 0.02, p[2]); const up = 1 - smooth(MY - 0.012, MY + 0.0005, p[1]) * (Math.abs(p[0]) < 0.024 && p[2] < -0.07 ? 0 : 1); const side = 1 - smooth(0.03, 0.062, Math.abs(p[0])) * smooth(MY - 0.03, MY, p[1]); return front * Math.min(1, up + (p[1] < MY ? 1 : 0) * (Math.abs(p[0]) < 0.024 ? 1 : 0)) * side; };
  const blink = (s) => (pm, g) => {
    if (g !== 'skin') return null; const p = inv(pm), c = eyeC[s < 0 ? 0 : 1]; const dx = p[0] - c[0], dy = p[1] - c[1];
    if (Math.abs(dx) > 0.024 || dy < -0.012 || dy > 0.03 || p[2] > c[2] + 0.004) return null;
    const rim = 0.0086 * es; const wx = 1 - smooth(0.012 * es, 0.019 * es, Math.abs(dx));
    let wv, ty;
    if (dy >= -0.001) { wv = 1 - smooth(rim, rim + 0.014, dy); ty = c[1] - 0.0052 * es + Math.max(0, dy - rim) * 0.35; }  // 上まぶたが下りる
    else { wv = 0.55 * (1 - smooth(0.0, 0.011, -dy)); ty = c[1] - 0.0052 * es - Math.max(0, -dy - rim) * 0.5; }           // 下まぶたが少し上がる
    const wgt = wx * wv; if (wgt < 0.01) return null;
    const ny = p[1] + (ty - p[1]) * wgt; const ddy = ny - c[1]; const R = ER + 0.0014; const zs = c[2] - Math.sqrt(Math.max(0, R * R - dx * dx - ddy * ddy));
    const nzv = p[2] + (Math.min(p[2], zs) - p[2]) * Math.min(1, wgt * 1.5);
    return fwd([0, ny - p[1], nzv - p[2]]);
  };
  const morphs = {
    blinkL: blink(-1), blinkR: blink(1),
    jaw: (pm, g) => { if (g !== 'skin' && g !== 'hair') return null; const p = inv(pm); const wj = jawW(p); if (wj < 0.01) return null; const q = add(hinge, rotX(sub(p, hinge), -0.26)); return fwd(mul(sub(q, p), wj)); },
    smile: (pm, g) => { if (g !== 'skin' && g !== 'hair') return null; const p = inv(pm); if (p[2] > -0.02) return null; let d = [0, 0, 0];
      for (const s of [-1, 1]) { const a = gauss(p, [s * 0.023, MY, -0.086], 0.0125); d = add(d, mul([s * 0.009, 0.013, 0.005], a)); const b = gauss(p, [s * 0.042, 0.07, -0.07], 0.02); d = add(d, mul([s * 0.0015, 0.005, -0.002], b)); }
      return fwd(d); },
    browUp: (pm, g) => { if (g !== 'skin' && g !== 'hair') return null; const p = inv(pm); if (p[2] > -0.04 || p[1] < 0.105) return null; let a = 0; for (const s of [-1, 1]) a += gauss(p, [s * 0.03, 0.13, -0.088], 0.017); return fwd([0, 0.0055 * a, 0]); },
    browDown: (pm, g) => { if (g !== 'skin' && g !== 'hair') return null; const p = inv(pm); if (p[2] > -0.04 || p[1] < 0.105) return null; let d = [0, 0, 0]; for (const s of [-1, 1]) { const a = gauss(p, [s * 0.017, 0.127, -0.092], 0.013); d = add(d, mul([-s * 0.002, -0.0042, -0.001], a)); } return fwd(d); },
  };
  return { eyeC: eyeC.map(T), eyeR: ER, mouth: T([0, MY, -0.092]), mouthIn: T([0, MY, -0.078]), closeMouth, morphs, nose: T([0, 0.067, -0.11]) };
}

const RED = hex(0xc8281f), CHAR = hex(0x2d3138), YEL = hex(0xf2b61c), WHITE = hex(0xf2f0ea), HAIR = hex(0x231813), BLK = hex(0x1c1d20);

// =========================================================
// 主人公「ソラ」（第 3 版・写実寄り）: 身長 1.77m・約 7.3 頭身。A ポーズ・壁（-z）を向く・足は y=0
// 層: skin / hair / band / jacket / harness / pants / shoe / bag
// =========================================================
function climber() {
  const B = {}; const bones = [];
  const bone = (name, parent, pos) => { B[name] = bones.length; bones.push({ name, parent: parent == null ? -1 : B[parent], pos }); };
  const HP = [0, 1.535, 0.0];
  bone('hips', null, [0, 0.95, 0]); bone('spine', 'hips', [0, 1.07, 0]); bone('chest', 'spine', [0, 1.23, 0]); bone('neck', 'chest', [0, 1.455, 0.005]); bone('head', 'neck', HP);
  bone('bag', 'hips', [0, 1.0, 0.105]);
  const ANG = 0.62;
  const arm = (s, S) => {
    const sh = [s * 0.186, 1.425, 0.0], dir = norm([s * Math.sin(ANG), -Math.cos(ANG), 0]);
    const el = add(sh, mul(dir, 0.285)), wr = add(el, mul(dir, 0.252));
    bone('clav' + S, 'chest', [s * 0.045, 1.425, 0]); bone('upper' + S, 'clav' + S, sh); bone('fore' + S, 'upper' + S, el); bone('hand' + S, 'fore' + S, wr);
    return { sh, el, wr, dir };
  };
  const leg = (s, S) => {
    const h0 = [s * 0.092, 0.93, 0], kn = [s * 0.098, 0.508, -0.012], an = [s * 0.102, 0.088, 0.004];
    bone('thigh' + S, 'hips', h0); bone('shin' + S, 'thigh' + S, kn); bone('foot' + S, 'shin' + S, an); bone('toe' + S, 'foot' + S, [s * 0.102, 0.03, -0.115]);
    return { hp: h0, kn, an };
  };
  const AL = arm(-1, 'L'), AR = arm(1, 'R'), LL = leg(-1, 'L'), LR = leg(1, 'R');
  const L = { skin: [], hair: [], band: [], jacket: [], harness: [], pants: [], shoe: [], bag: [] };
  const P = (layer, s, bn, color, k, extra = {}) => L[layer].push({ s, bone: B[bn], group: layer, color, k, ...extra });
  const SKIN = hex(0xe2a77f);
  // ---- 頭と首 ----
  const tfH = (p) => add(HP, p), invH = (p) => sub(p, HP);
  const head = makeHead({ skin: SKIN, hair: 'short', hairColor: HAIR, band: YEL, inv: invH, eye: 1.06, w: 0.97, jaw: 1.0, nose: 0.95 }, tfH, B.head, L);
  P('skin', roundCone([0, 1.4, 0.012], [0, 1.555, 0.008], 0.052, 0.047), 'neck', SKIN, 0.025);
  for (const s of [-1, 1]) P('skin', roundCone([s * 0.012, 1.41, -0.03], [s * 0.05, 1.53, 0.012], 0.014, 0.012), 'neck', SKIN, 0.02); // 胸鎖乳突筋
  P('skin', ellipsoid([0, 1.475, -0.048], [0.011, 0.012, 0.008]), 'neck', SKIN, 0.012);                                               // のどぼとけ
  // ---- 上着（体の起伏: 胸・広背・僧帽・三角筋・上腕二頭/三頭・前腕） ----
  P('jacket', ellipsoid([0, 1.3, -0.004], [0.156, 0.148, 0.1]), 'chest', RED, 0.05);
  for (const s of [-1, 1]) {
    P('jacket', ellipsoid([s * 0.074, 1.335, -0.062], [0.07, 0.056, 0.034]), 'chest', RED, 0.04);    // 胸
    P('jacket', ellipsoid([s * 0.09, 1.265, 0.046], [0.086, 0.135, 0.062]), 'chest', RED, 0.05);       // 広背
    P('jacket', ellipsoid([s * 0.078, 1.452, 0.014], [0.062, 0.028, 0.048], [0, 0, -s * 0.36]), 'chest', RED, 0.035); // 僧帽
  }
  P('jacket', ellipsoid([0, 1.115, 0.0], [0.136, 0.132, 0.097]), 'spine', RED, 0.06);
  P('jacket', ellipsoid([0, 1.0, 0.002], [0.146, 0.056, 0.108]), 'hips', RED, 0.03);
  P('jacket', roundCone([-0.145, 1.42, 0.004], [0.145, 1.42, 0.004], 0.05, 0.05), 'chest', RED, 0.045);
  P('jacket', torus([0, 1.478, 0.004], 0.06, 0.013, 0.2, 2.6), 'neck', RED, 0.012);                    // 立ち襟
  for (const [A, s, S] of [[AL, -1, 'L'], [AR, 1, 'R']]) {
    const at = (t, off = [0, 0, 0]) => add(lerp3(A.sh, A.wr, t), off), rz = s * ANG;
    P('jacket', ellipsoid(add(A.sh, [s * 0.014, -0.012, 0.002]), [0.054, 0.066, 0.056], [0, 0, rz]), 'upper' + S, RED, 0.035); // 三角筋
    P('jacket', roundCone(A.sh, A.el, 0.048, 0.041), 'upper' + S, RED, 0.03);
    P('jacket', ellipsoid(add(lerp3(A.sh, A.el, 0.5), [0, 0, -0.016]), [0.04, 0.085, 0.04], [0, 0, rz]), 'upper' + S, RED, 0.03);  // 二頭
    P('jacket', ellipsoid(add(lerp3(A.sh, A.el, 0.45), [0, 0, 0.02]), [0.038, 0.09, 0.036], [0, 0, rz]), 'upper' + S, RED, 0.03);  // 三頭
    P('jacket', roundCone(A.el, A.wr, 0.042, 0.033), 'fore' + S, RED, 0.03);
    P('jacket', ellipsoid(add(lerp3(A.el, A.wr, 0.28), [s * 0.004, 0, -0.004]), [0.041, 0.085, 0.039], [0, 0, rz]), 'fore' + S, RED, 0.03); // 前腕の張り
    P('jacket', roundCone(sub(A.wr, mul(A.dir, 0.035)), sub(A.wr, mul(A.dir, 0.004)), 0.0365, 0.0355), 'fore' + S, RED, 0.008);    // 袖口
  }
  // ---- ズボン（骨盤・尻・大腿四頭筋・ハムストリング・膝・ふくらはぎ） ----
  P('pants', ellipsoid([0, 0.965, 0.0], [0.142, 0.1, 0.106]), 'hips', CHAR, 0.05);
  for (const [G, s, S] of [[LL, -1, 'L'], [LR, 1, 'R']]) {
    P('pants', ellipsoid([s * 0.062, 0.925, 0.05], [0.078, 0.078, 0.068]), 'hips', CHAR, 0.045);       // 尻
    P('pants', roundCone(G.hp, G.kn, 0.079, 0.054), 'thigh' + S, CHAR, 0.04);
    P('pants', ellipsoid(add(lerp3(G.hp, G.kn, 0.45), [s * 0.006, 0, -0.022]), [0.058, 0.15, 0.052]), 'thigh' + S, CHAR, 0.04);  // 四頭筋
    P('pants', ellipsoid(add(lerp3(G.hp, G.kn, 0.5), [0, 0, 0.026]), [0.052, 0.14, 0.046]), 'thigh' + S, CHAR, 0.04);           // ハム
    P('pants', ellipsoid(add(G.kn, [0, 0.004, -0.03]), [0.036, 0.04, 0.03]), 'shin' + S, CHAR, 0.03);                             // 膝頭
    P('pants', roundCone(G.kn, G.an, 0.052, 0.04), 'shin' + S, CHAR, 0.03);
    P('pants', ellipsoid(add(lerp3(G.kn, G.an, 0.27), [0, 0, 0.026]), [0.047, 0.1, 0.046]), 'shin' + S, CHAR, 0.04);             // ふくらはぎ
    P('pants', roundCone(add(G.an, [0, 0.085, 0]), add(G.an, [0, 0.05, 0]), 0.047, 0.048), 'shin' + S, CHAR, 0.008);             // 裾
    // 靴（アプローチシューズ: 甲・つま先・かかと・厚い底・履き口）
    P('shoe', ellipsoid(add(G.an, [0, -0.03, -0.04]), [0.049, 0.046, 0.108]), 'foot' + S, WHITE, 0.03);
    P('shoe', ellipsoid(add(G.an, [0, -0.05, -0.118]), [0.047, 0.032, 0.058], [-0.22, 0, 0]), 'toe' + S, WHITE, 0.025);
    P('shoe', ellipsoid(add(G.an, [0, -0.03, 0.036]), [0.04, 0.05, 0.04]), 'foot' + S, WHITE, 0.03);
    P('shoe', ellipsoid(add(G.an, [0, -0.071, -0.045]), [0.054, 0.0165, 0.132]), 'foot' + S, WHITE, 0.008);
    P('shoe', roundCone(add(G.an, [0, 0.04, 0.002]), add(G.an, [0, -0.005, 0.002]), 0.046, 0.05), 'foot' + S, WHITE, 0.012);
    // ハーネスの脚の輪
    P('harness', belt(add(lerp3(G.hp, G.kn, 0.2), [0, 0, 0.002]), 0.083, 0.08, 0.018, 0.004, 0), 'thigh' + S, BLK, 0.004);
  }
  // ---- ハーネス（腰のベルト・ビレイループ・ギアループ）とチョークバッグ ----
  P('harness', belt([0, 1.025, 0.001], 0.148, 0.108, 0.026, 0.005), 'hips', BLK, 0.004);
  P('harness', roundCone([0, 1.01, -0.11], [0, 0.9, -0.085], 0.011, 0.011), 'hips', YEL, 0.004);       // ビレイループ
  for (const s of [-1, 1]) { P('harness', torus([s * 0.135, 0.985, 0.03], 0.03, 0.0045, Math.PI / 2 - 0.2), 'hips', YEL, 0.003); P('harness', roundCone([s * 0.06, 0.995, -0.1], [s * 0.088, 0.88, -0.03], 0.008, 0.008), 'hips', BLK, 0.004); }
  P('bag', ellipsoid([0, 0.925, 0.135], [0.052, 0.07, 0.048]), 'bag', YEL, 0.02, { sigma: 0.004 });
  P('bag', torus([0, 0.985, 0.135], 0.045, 0.008, 0, 1), 'bag', BLK, 0.006, { sigma: 0.004 });
  const post = (p, g) => (g === 'skin' ? head.closeMouth(p) : p);
  build('climber', { bones, post, morphs: head.morphs, layers: [
    { group: 'skin', parts: L.skin, h: 0.0048, bmin: [-0.11, 1.36, -0.135], bmax: [0.11, 1.75, 0.13], ao: 1.0 },
    { group: 'hair', parts: L.hair, h: 0.006, bmin: [-0.12, 1.55, -0.13], bmax: [0.12, 1.8, 0.15] },
    { group: 'band', parts: L.band, h: 0.0046, bmin: [-0.11, 1.64, -0.12], bmax: [0.11, 1.74, 0.13] },
    { group: 'jacket', parts: L.jacket, h: 0.0108, bmin: [-0.58, 0.9, -0.17], bmax: [0.58, 1.56, 0.17] },
    { group: 'harness', parts: L.harness, h: 0.0062, bmin: [-0.2, 0.74, -0.15], bmax: [0.2, 1.08, 0.14] },
    { group: 'pants', parts: L.pants, h: 0.0125, bmin: [-0.24, 0.02, -0.17], bmax: [0.24, 1.09, 0.17] },
    { group: 'shoe', parts: L.shoe, h: 0.0072, bmin: [-0.2, -0.02, -0.24], bmax: [0.2, 0.16, 0.1] },
    { group: 'bag', parts: L.bag, h: 0.006, bmin: [-0.08, 0.83, 0.06], bmax: [0.08, 1.02, 0.21] },
  ], extra: {
    face: { eyeL: sub(head.eyeC[0], HP), eyeR: sub(head.eyeC[1], HP), eyeRadius: head.eyeR, mouth: sub(head.mouth, HP), mouthIn: sub(head.mouthIn, HP), bandTail: [0, 0.146, 0.105], front: -1 },
    detail: { armL: [AL.sh, AL.wr], armR: [AR.sh, AR.wr], head: HP, kneeL: LL.kn, kneeR: LR.kn, elbowL: AL.el, elbowR: AR.el },
  } });
}

// =========================================================
// 手袋（クライミンググローブ・実寸の手）: 手首が原点、指は +Y、掌は -Z、右手は親指が +X。層: glove / strap
// =========================================================
function glove(side) {
  const s = side === 'L' ? -1 : 1, bones = [], B = {};
  const bone = (name, parent, pos) => { B[name] = bones.length; bones.push({ name, parent: parent == null ? -1 : B[parent], pos }); };
  bone('wrist', null, [0, 0, 0]);
  const G = [], C = [], W = hex(0xeceae4);
  const P = (arr, sh, b, k) => arr.push({ s: sh, bone: B[b], group: arr === G ? 'glove' : 'strap', color: arr === G ? W : BLK, k });
  P(G, ellipsoid([0, 0.05, -0.001], [0.043, 0.05, 0.0165]), 'wrist', 0.014);                       // 手のひら
  P(G, ellipsoid([0.018 * s, 0.03, -0.012], [0.02, 0.028, 0.013]), 'wrist', 0.014);                // 母指球
  P(G, ellipsoid([-0.026 * s, 0.038, -0.009], [0.013, 0.03, 0.011]), 'wrist', 0.014);              // 小指球
  P(G, ellipsoid([0, 0.058, 0.008], [0.04, 0.04, 0.012]), 'wrist', 0.012);                         // 手の甲
  P(G, roundCone([0, -0.035, 0.0], [0, 0.012, 0.0], 0.031, 0.034), 'wrist', 0.014);                // 手首
  P(C, belt([0, -0.012, 0], 0.034, 0.03, 0.013, 0.0035, Math.PI / 2 * 0), 'wrist', 0.003);
  const defs = [['index', 0.0285 * s, 0.097, [0.04, 0.025, 0.021], 0.0098], ['middle', 0.0095 * s, 0.1, [0.044, 0.029, 0.022], 0.0102], ['ring', -0.0095 * s, 0.097, [0.04, 0.027, 0.021], 0.0096], ['pinky', -0.0275 * s, 0.089, [0.031, 0.02, 0.019], 0.0086]];
  for (const [nm, x, y0, Ls, r] of defs) {
    let p0 = [x, y0, 0.0]; bone(nm + '1', 'wrist', p0);
    P(G, ellipsoid(add(p0, [0, 0.0, 0.006]), [r * 1.15, r * 1.1, r * 0.95]), 'wrist', 0.006);       // こぶし（指の付け根）
    for (let k = 0; k < 3; k++) { const p1 = add(p0, [0, Ls[k], 0]); if (k < 2) bone(nm + (k + 2), nm + (k + 1), p1);
      P(G, roundCone(p0, p1, r * (1 - k * 0.07), r * (0.94 - k * 0.09)), nm + (k + 1), 0.005);
      if (k < 2) P(G, ellipsoid(p1, [r * 1.02, r * 0.8, r * 1.02]), nm + (k + 1), 0.004);             // 関節のふくらみ
      p0 = p1; }
  }
  const tb = [0.034 * s, 0.022, -0.012]; bone('thumb1', 'wrist', tb);
  const td = norm([0.62 * s, 0.7, -0.36]), t1 = add(tb, mul(td, 0.036)); bone('thumb2', 'thumb1', t1);
  const t2 = add(t1, mul(td, 0.03)); bone('thumb3', 'thumb2', t2); const t3 = add(t2, mul(td, 0.025));
  P(G, roundCone(tb, t1, 0.0135, 0.012), 'thumb1', 0.01); P(G, roundCone(t1, t2, 0.0118, 0.0108), 'thumb2', 0.005); P(G, roundCone(t2, t3, 0.0108, 0.009), 'thumb3', 0.005);
  build('glove' + side, { bones, sigma: 0.005, layers: [
    { group: 'glove', parts: G, h: 0.0034, bmin: [-0.07, -0.05, -0.06], bmax: [0.07, 0.21, 0.04] },
    { group: 'strap', parts: C, h: 0.004, bmin: [-0.05, -0.04, -0.05], bmax: [0.05, 0.02, 0.05] },
  ] });
}

// =========================================================
// 窓の住人（上半身）: 'oyaji' / 'obachan'。原点は腰、前（窓の外）は +z。層: skin / hair / cloth
// =========================================================
function resident(kind) {
  const B = {}, bones = [];
  const bone = (name, parent, pos) => { B[name] = bones.length; bones.push({ name, parent: parent == null ? -1 : B[parent], pos }); };
  const HP = [0, 0.5, 0.0];
  bone('root', null, [0, 0, 0]); bone('chest', 'root', [0, 0.24, 0]); bone('head', 'chest', HP);
  const L = { skin: [], hair: [], cloth: [], band: [] }, P = (layer, sh, b, color, k) => L[layer].push({ s: sh, bone: B[b], group: layer, color, k });
  const oy = kind === 'oyaji';
  const SK = oy ? hex(0xd9a078) : hex(0xe9b996), CL = oy ? hex(0xefece2) : hex(0xd9a3bd);
  const tfH = (p) => [HP[0] + p[0], HP[1] + p[1], HP[2] - p[2]], invH = (p) => [p[0] - HP[0], p[1] - HP[1], -(p[2] - HP[2])];
  const head = makeHead(oy ? { skin: SK, hair: 'bald', hairColor: hex(0x8f8a84), browColor: hex(0x4a4540), brow: 1.5, mustache: true, inv: invH, w: 1.06, jaw: 1.14, nose: 1.3, age: 0.8, eye: 0.95 }
    : { skin: SK, hair: 'perm', hairColor: hex(0x4a3526), brow: 0.9, inv: invH, w: 1.03, jaw: 1.06, nose: 1.05, age: 0.6, eye: 1.0 }, tfH, B.head, L);
  P('skin', roundCone([0, 0.39, 0.0], [0, 0.52, 0.0], 0.06, 0.054), 'head', SK, 0.03);
  // 胴（太め）
  P('cloth', ellipsoid([0, 0.2, 0.01], [0.185, 0.2, 0.155]), 'chest', CL, 0.05);
  P('cloth', ellipsoid([0, 0.12, 0.05], [0.17, 0.14, 0.14]), 'root', CL, 0.06);                      // 腹
  if (oy) { for (const s of [-1, 1]) P('cloth', roundCone([s * 0.085, 0.24, 0.0], [s * 0.092, 0.415, 0.0], 0.065, 0.045), 'chest', CL, 0.04); P('skin', roundCone([-0.165, 0.375, 0], [0.165, 0.375, 0], 0.068, 0.068), 'chest', SK, 0.05); P('skin', ellipsoid([0, 0.33, 0.07], [0.12, 0.07, 0.06]), 'chest', SK, 0.04); }
  else { P('cloth', roundCone([-0.17, 0.38, 0], [0.17, 0.38, 0], 0.074, 0.074), 'chest', CL, 0.05); P('band', ellipsoid([0, 0.16, 0.075], [0.16, 0.2, 0.135]), 'chest', hex(0xf7f5ef), 0.02); }
  for (const [s, S] of [[-1, 'L'], [1, 'R']]) {
    const sh = [s * 0.212, 0.375, 0], el = [s * 0.315, 0.15, 0.02], wr = [s * 0.36, -0.06, 0.05];
    bone('upper' + S, 'chest', sh); bone('fore' + S, 'upper' + S, el); bone('hand' + S, 'fore' + S, wr);
    P(oy ? 'skin' : 'cloth', roundCone(sh, el, 0.06, 0.048), 'upper' + S, oy ? SK : CL, 0.03);
    P('skin', roundCone(el, wr, 0.046, 0.034), 'fore' + S, SK, 0.03);
    P('skin', ellipsoid(add(wr, [0, -0.045, 0.0]), [0.04, 0.05, 0.022]), 'hand' + S, SK, 0.02);        // 手のひら
    for (let i = 0; i < 4; i++) P('skin', roundCone(add(wr, [s * (-0.027 + i * 0.018), -0.085, 0.004]), add(wr, [s * (-0.03 + i * 0.02), -0.118 + Math.abs(i - 1.5) * 0.008, 0.016]), 0.0095, 0.008), 'hand' + S, SK, 0.006);
    P('skin', roundCone(add(wr, [s * 0.034, -0.03, 0.008]), add(wr, [s * 0.062, -0.075, 0.022]), 0.012, 0.0095), 'hand' + S, SK, 0.008);
  }
  build('resident-' + kind, { bones, sigma: 0.011, post: (p, g) => (g === 'skin' ? head.closeMouth(p) : p), morphs: head.morphs, layers: [
    { group: 'skin', parts: L.skin, h: 0.0064, bmin: [-0.5, -0.3, -0.2], bmax: [0.5, 0.76, 0.2], ao: 1.0 },
    { group: 'hair', parts: L.hair, h: 0.0064, bmin: [-0.14, 0.5, -0.14], bmax: [0.14, 0.78, 0.14] },
    { group: 'cloth', parts: L.cloth, h: 0.013, bmin: [-0.46, -0.2, -0.2], bmax: [0.46, 0.56, 0.24] },
    ...(oy ? [] : [{ group: 'band', parts: L.band, h: 0.0115, bmin: [-0.22, -0.08, -0.1], bmax: [0.22, 0.42, 0.26] }]),
  ], extra: { face: { eyeL: sub(head.eyeC[0], HP), eyeR: sub(head.eyeC[1], HP), eyeRadius: head.eyeR, mouth: sub(head.mouth, HP), mouthIn: sub(head.mouthIn, HP), front: 1 } } });
}

// =========================================================
// 鳥（カモメ）: 前は +z。翼は 3 節（上腕・前腕・手）＋風切羽。層: body / beak
// =========================================================
function bird() {
  const B = {}, bones = [];
  const bone = (name, parent, pos) => { B[name] = bones.length; bones.push({ name, parent: parent == null ? -1 : B[parent], pos }); };
  bone('root', null, [0, 0, 0]); bone('neck', 'root', [0, 0.035, 0.13]); bone('head', 'neck', [0, 0.085, 0.2]); bone('tail', 'root', [0, 0.0, -0.17]);
  const L = { body: [], beak: [] }, P = (layer, sh, b, color, k, extra = {}) => L[layer].push({ s: sh, bone: B[b], group: layer, color, k, ...extra });
  const WH = hex(0xf4f4f2), BE = hex(0xeeb21a), FT = hex(0xe88a2a);
  P('body', ellipsoid([0, 0, 0.0], [0.085, 0.082, 0.2]), 'root', WH, 0.05);
  P('body', ellipsoid([0, -0.012, 0.06], [0.078, 0.07, 0.1]), 'root', WH, 0.05);                    // 胸
  P('body', roundCone([0, 0.03, 0.13], [0, 0.082, 0.2], 0.052, 0.042), 'neck', WH, 0.04);
  P('body', ellipsoid([0, 0.092, 0.215], [0.044, 0.042, 0.052]), 'head', WH, 0.03);
  P('beak', roundCone([0, 0.086, 0.255], [0, 0.078, 0.325], 0.014, 0.008), 'head', BE, 0.008);
  P('beak', ellipsoid([0, 0.07, 0.328], [0.0065, 0.011, 0.01], [0.5, 0, 0]), 'head', BE, 0.006);      // 先のかぎ
  for (let i = -1; i <= 1; i++) P('body', ellipsoid([i * 0.035, 0.0, -0.27 - (1 - Math.abs(i)) * 0.02], [0.03, 0.006, 0.09], [0, i * 0.25, 0]), 'tail', WH, 0.012);
  for (const s of [-1, 1]) P('beak', ellipsoid([s * 0.03, -0.075, -0.06], [0.012, 0.01, 0.035]), 'root', FT, 0.01);   // たたんだ足
  for (const [s, S] of [[-1, 'L'], [1, 'R']]) {
    bone('wing1' + S, 'root', [s * 0.07, 0.04, 0.05]); bone('wing2' + S, 'wing1' + S, [s * 0.27, 0.045, 0.06]); bone('wing3' + S, 'wing2' + S, [s * 0.5, 0.045, 0.02]);
    P('body', ellipsoid([s * 0.17, 0.042, 0.03], [0.115, 0.016, 0.085]), 'wing1' + S, WH, 0.025);
    P('body', ellipsoid([s * 0.385, 0.045, 0.015], [0.125, 0.012, 0.075], [0, s * 0.12, 0]), 'wing2' + S, WH, 0.02);
    for (let i = 0; i < 5; i++) { const a = s * (0.15 + i * 0.16); P('body', ellipsoid([s * (0.56 + i * 0.03), 0.045, -0.005 - i * 0.03], [0.1 - i * 0.008, 0.0045, 0.02], [0, -a, 0]), 'wing3' + S, WH, 0.006, { sigma: 0.01 }); } // 初列風切
    for (let i = 0; i < 4; i++) P('body', ellipsoid([s * (0.2 + i * 0.075), 0.04, -0.06], [0.04, 0.005, 0.05]), i < 2 ? 'wing1' + S : 'wing2' + S, WH, 0.008);                                                              // 次列風切
  }
  build('bird', { bones, sigma: 0.02, layers: [
    { group: 'body', parts: L.body, h: 0.0082, bmin: [-0.8, -0.13, -0.4], bmax: [0.8, 0.17, 0.3] },
    { group: 'beak', parts: L.beak, h: 0.0038, bmin: [-0.06, -0.1, -0.11], bmax: [0.06, 0.12, 0.36] },
  ], extra: { face: { eyeL: [-0.036, 0.012, 0.03], eyeR: [0.036, 0.012, 0.03], eyeRadius: 0.0085, front: 1 } } });
}

const only = process.argv[2];
if (!only || only === 'climber') climber();
if (!only || only === 'glove') { glove('L'); glove('R'); }
if (!only || only === 'resident') { resident('oyaji'); resident('obachan'); }
if (!only || only === 'bird') bird();
