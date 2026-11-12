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

// ---------- モデルを作って書き出す ----------
// 素材ごとに別の閉じた表面（層）を作り、重ねる。境目は面どうしの交わりになるので、描画で画素単位にくっきり出る。
// 層: { group, parts, h, bmin, bmax }。スキンウェイトは全層の部品から計算する（重なった層が同じように曲がる）
function build(name, { layers, bones, sigma = 0.018, extra = {} }) {
  const t0 = Date.now();
  const allParts = layers.flatMap((l) => l.parts);
  const all = makeField(allParts);
  const P = [], Nn = [], Co = [], Uv = [], SI = [], SW = [], index = [], gInfo = [];
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
      P.push(p); Nn.push(nrm); Co.push(typeof near.color === 'function' ? near.color(p, nrm) : near.color);
      const list = all.each(p), dmin = Math.min(...list.map((x) => x[1])), acc = new Map();
      for (const [q, d] of list) { if (q.noWeight) continue; const w = Math.exp(-Math.max(0, d - dmin) / (q.sigma ?? sigma)); acc.set(q.bone, (acc.get(q.bone) || 0) + w); }
      if (!acc.size) acc.set(near.bone, 1);
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s2, x) => s2 + x[1], 0);
      const ii = [0, 0, 0, 0], ww = [0, 0, 0, 0]; top.forEach(([b, w], k) => { ii[k] = b; ww[k] = Math.round(w / sum * 255); });
      ww[0] += 255 - ww.reduce((a, b) => a + b, 0); SI.push(ii); SW.push(ww);
      if (near.s.axis) { const [a, b] = near.s.axis, ax = norm(sub(b, a)), pa = sub(p, a), along = dot(pa, ax), rad = sub(pa, mul(ax, along)); const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const u0 = norm(cross(ax, ref)), w0 = cross(ax, u0);
        Uv.push([Math.atan2(dot(rad, w0), dot(rad, u0)) / (2 * Math.PI) * 4, along * 8]); }
      else { const c0 = near.s.center || p, d0 = norm(sub(p, c0)); Uv.push([Math.atan2(d0[0], d0[2]) / (2 * Math.PI) * 6, d0[1] * 3]); }
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
    fC.set([Math.round(Co[i][0] * 255), Math.round(Co[i][1] * 255), Math.round(Co[i][2] * 255), 255], i * 4); fU.set(Uv[i], i * 2); fSI.set(SI[i], i * 4); fSW.set(SW[i], i * 4);
  }
  const I = big ? new Uint32Array(index) : new Uint16Array(index);
  const layout = {}; let off = 0; const bufs = { position: fP, normal: fN, color: fC, uv: fU, skinIndex: fSI, skinWeight: fSW, index: I };
  for (const [k, b] of Object.entries(bufs)) { layout[k] = { offset: off, length: b.length, type: b.constructor.name }; off += b.byteLength; off = (off + 3) & ~3; }
  const bin = Buffer.alloc(off); for (const [k, b] of Object.entries(bufs)) Buffer.from(b.buffer).copy(bin, layout[k].offset);
  writeFileSync(join(OUT, name + '.bin'), bin);
  writeFileSync(join(OUT, name + '.json'), JSON.stringify({ name, generator: 'tools/build-characters.mjs（Claude Code で制作）', vertices: n, triangles: index.length / 3, bones, groups: gInfo, layout, ...extra }, null, 1));
  console.log(`${name}: 頂点 ${n}・三角形 ${index.length / 3}・${(off / 1024).toFixed(0)}KB・${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const RED = hex(0xd8342c), NAVY = hex(0x263553), SKIN = hex(0xf2b48c), HAIR = hex(0x2a1d17), YEL = hex(0xf6c33a), WHITE = hex(0xf5f2ea);

// =========================================================
// 主人公「ソラ」: A ポーズ・壁（-z）を向く・足は y=0。頭は漫画的に 1.16 倍（頭身 約 5.8）
// 層: skin（顔・首・耳）/ hair / band（はちまき）/ jacket（上着）/ pants（ズボン）/ shoe（靴）
// 細部の色（上着の白線・ファスナー・裾、ベルト、靴底と赤い線、ほお紅とくちびる）は描画側で結合姿勢の座標から描く
// =========================================================
function climber() {
  const B = {}; const bones = [];
  const bone = (name, parent, pos) => { B[name] = bones.length; bones.push({ name, parent: parent == null ? -1 : B[parent], pos }); };
  const HP = [0, 1.55, 0], HK = 1.16;               // 頭の拡大の中心と倍率
  const hp = (p) => add(HP, mul(sub(p, HP), HK)), hr = (r) => (Array.isArray(r) ? r.map((x) => x * HK) : r * HK);
  bone('hips', null, [0, 0.93, 0]); bone('spine', 'hips', [0, 1.06, 0]); bone('chest', 'spine', [0, 1.24, 0]); bone('neck', 'chest', [0, 1.45, 0]); bone('head', 'neck', HP);
  const arm = (s, S) => {
    const sh = [s * 0.195, 1.405, 0.0], dir = norm([s * Math.sin(0.62), -Math.cos(0.62), 0]);
    const el = add(sh, mul(dir, 0.285)), wr = add(el, mul(dir, 0.26));
    bone('clav' + S, 'chest', [s * 0.05, 1.40, 0]); bone('upper' + S, 'clav' + S, sh); bone('fore' + S, 'upper' + S, el); bone('hand' + S, 'fore' + S, wr);
    return { sh, el, wr, dir };
  };
  const leg = (s, S) => {
    const h0 = [s * 0.097, 0.9, 0], kn = [s * 0.102, 0.495, -0.012], an = [s * 0.106, 0.09, 0];
    bone('thigh' + S, 'hips', h0); bone('shin' + S, 'thigh' + S, kn); bone('foot' + S, 'shin' + S, an); bone('toe' + S, 'foot' + S, [s * 0.106, 0.03, -0.12]);
    return { hp: h0, kn, an };
  };
  const AL = arm(-1, 'L'), AR = arm(1, 'R'), LL = leg(-1, 'L'), LR = leg(1, 'R');
  const mk = () => []; const L = { skin: mk(), hair: mk(), band: mk(), jacket: mk(), pants: mk(), shoe: mk() };
  const P = (layer, s, bone, color, k, extra = {}) => L[layer].push({ s, bone: B[bone], group: layer, color, k, ...extra });
  // 上着: 胸・腹・肩・襟・裾・袖（肩の丸み・上腕・肘・前腕・袖口）
  P('jacket', ellipsoid([0, 1.29, 0.0], [0.172, 0.168, 0.12]), 'chest', RED, 0.06);
  P('jacket', ellipsoid([0, 1.11, 0.0], [0.152, 0.135, 0.11]), 'spine', RED, 0.06);
  P('jacket', roundCone([-0.165, 1.385, 0.01], [0.165, 1.385, 0.01], 0.068, 0.068), 'chest', RED, 0.05);
  P('jacket', ellipsoid([0, 0.995, 0.0], [0.158, 0.05, 0.118]), 'hips', RED, 0.03);
  P('jacket', torus([0, 1.45, 0.0], 0.07, 0.026, 0.15), 'chest', RED, 0.03);
  for (const [A, s, S] of [[AL, -1, 'L'], [AR, 1, 'R']]) {
    P('jacket', ellipsoid(add(A.sh, [s * 0.012, 0.004, 0.0]), [0.07, 0.064, 0.066]), 'upper' + S, RED, 0.05);
    P('jacket', roundCone(A.sh, A.el, 0.058, 0.047), 'upper' + S, RED, 0.035);
    P('jacket', roundCone(A.el, A.wr, 0.048, 0.039), 'fore' + S, RED, 0.035);
    P('jacket', roundCone(sub(A.wr, mul(A.dir, 0.03)), sub(A.wr, mul(A.dir, 0.005)), 0.043, 0.042), 'fore' + S, RED, 0.015);
  }
  // ズボン（腰・もも・ひざ・すね・ふくらはぎ・すその折り返し）
  P('pants', ellipsoid([0, 0.94, 0.0], [0.15, 0.105, 0.112]), 'hips', NAVY, 0.05);
  for (const [G, s, S] of [[LL, -1, 'L'], [LR, 1, 'R']]) {
    P('pants', roundCone(G.hp, G.kn, 0.08, 0.057), 'thigh' + S, NAVY, 0.045);
    P('pants', roundCone(G.kn, G.an, 0.056, 0.043), 'shin' + S, NAVY, 0.035);
    P('pants', ellipsoid(add(lerp3(G.kn, G.an, 0.28), [0, 0, 0.022]), [0.05, 0.1, 0.048]), 'shin' + S, NAVY, 0.045);
    P('pants', roundCone(add(G.an, [0, 0.07, 0]), add(G.an, [0, 0.035, 0]), 0.052, 0.052), 'shin' + S, NAVY, 0.012);
    // 靴（甲・つま先の反り・底・足首）
    P('shoe', ellipsoid(add(G.an, [0, -0.035, -0.045]), [0.058, 0.05, 0.118]), 'foot' + S, WHITE, 0.03);
    P('shoe', ellipsoid(add(G.an, [0, -0.052, -0.125]), [0.052, 0.036, 0.062], [-0.25, 0, 0]), 'toe' + S, WHITE, 0.03);
    P('shoe', ellipsoid(add(G.an, [0, -0.074, -0.05]), [0.064, 0.016, 0.138]), 'foot' + S, WHITE, 0.012);
    P('shoe', roundCone(add(G.an, [0, 0.035, 0]), add(G.an, [0, -0.01, 0]), 0.052, 0.054), 'foot' + S, WHITE, 0.015);
  }
  // 肌（首・頭・あご・ほお・耳・鼻・眉の骨・くちびる）。頭まわりは拡大する
  P('skin', roundCone([0, 1.41, 0.0], [0, 1.57, -0.005], 0.06, 0.054), 'neck', SKIN, 0.035);
  P('skin', ellipsoid(hp([0, 1.665, 0.0]), hr([0.118, 0.13, 0.122])), 'head', SKIN, 0.04);
  P('skin', ellipsoid(hp([0, 1.6, -0.018]), hr([0.1, 0.075, 0.098])), 'head', SKIN, 0.05);
  for (const s of [-1, 1]) {
    P('skin', ellipsoid(hp([s * 0.06, 1.615, -0.07]), hr([0.048, 0.042, 0.045])), 'head', SKIN, 0.04);
    P('skin', ellipsoid(hp([s * 0.118, 1.655, 0.0]), hr([0.02, 0.034, 0.016]), [0, -s * 0.3, 0]), 'head', SKIN, 0.012);
    P('skin', ellipsoid(hp([s * 0.045, 1.705, -0.103]), hr([0.03, 0.012, 0.02]), [0, 0, s * 0.15]), 'head', SKIN, 0.015);
  }
  P('skin', ellipsoid(hp([0, 1.645, -0.124]), hr([0.021, 0.024, 0.026])), 'head', SKIN, 0.025);
  P('skin', ellipsoid(hp([0, 1.588, -0.105]), hr([0.035, 0.012, 0.02])), 'head', SKIN, 0.01);
  // 髪（頭の上半分を覆う帽子形＋房）
  P('hair', ellipsoid(hp([0, 1.712, 0.016]), hr([0.128, 0.113, 0.125])), 'head', HAIR, 0.02);
  const spike = (b0, t0, r) => P('hair', roundCone(hp(b0), hp(t0), hr(r), hr(0.006)), 'head', HAIR, 0.035);
  spike([0, 1.79, 0.0], [0.0, 1.875, 0.03], 0.035); spike([0.05, 1.78, 0.0], [0.1, 1.86, 0.02], 0.032); spike([-0.05, 1.78, 0.0], [-0.1, 1.86, 0.02], 0.032);
  spike([0, 1.77, 0.07], [0.0, 1.83, 0.16], 0.035); spike([0.06, 1.75, 0.07], [0.12, 1.8, 0.14], 0.03); spike([-0.06, 1.75, 0.07], [-0.12, 1.8, 0.14], 0.03);
  spike([0, 1.7, 0.1], [0.0, 1.69, 0.19], 0.032); spike([0.09, 1.7, 0.06], [0.16, 1.7, 0.1], 0.026); spike([-0.09, 1.7, 0.06], [-0.16, 1.7, 0.1], 0.026);
  spike([0.03, 1.79, -0.04], [0.06, 1.85, -0.1], 0.028); spike([-0.03, 1.79, -0.04], [-0.06, 1.85, -0.1], 0.028);
  for (const [x, tx] of [[-0.05, -0.07], [0, 0.0], [0.05, 0.075]]) spike([x, 1.765, -0.08], [tx, 1.715, -0.135], 0.028);
  // はちまき
  P('band', torus(hp([0, 1.735, 0.006]), 0.124 * HK, 0.016 * HK, -0.12, 1.4), 'head', YEL, 0.006);
  P('band', ellipsoid(hp([0, 1.725, 0.13]), hr([0.027, 0.023, 0.021])), 'head', YEL, 0.01);
  const box = (lo, hi) => ({ lo, hi });
  build('climber', { bones, layers: [
    { group: 'skin', parts: L.skin, h: 0.0088, bmin: [-0.2, 1.38, -0.22], bmax: [0.2, 1.86, 0.2] },
    { group: 'hair', parts: L.hair, h: 0.0098, bmin: [-0.24, 1.6, -0.22], bmax: [0.24, 2.0, 0.26] },
    { group: 'band', parts: L.band, h: 0.0078, bmin: [-0.19, 1.66, -0.19], bmax: [0.19, 1.82, 0.21] },
    { group: 'jacket', parts: L.jacket, h: 0.0125, bmin: [-0.6, 0.86, -0.2], bmax: [0.6, 1.56, 0.2] },
    { group: 'pants', parts: L.pants, h: 0.0145, bmin: [-0.25, 0.02, -0.18], bmax: [0.25, 1.1, 0.18] },
    { group: 'shoe', parts: L.shoe, h: 0.0095, bmin: [-0.22, -0.02, -0.25], bmax: [0.22, 0.17, 0.1] },
  ], extra: {
    face: { eyeL: sub(hp([-0.044, 1.678, -0.106]), HP), eyeR: sub(hp([0.044, 1.678, -0.106]), HP), mouth: sub(hp([0, 1.604, -0.121]), HP), bandTail: sub(hp([0, 1.725, 0.15]), HP), scale: HK },
    // 描画側の細部の色に使う結合姿勢の値
    detail: { armL: [AL.sh, AL.wr], armR: [AR.sh, AR.wr], cheekL: hp([-0.062, 1.612, -0.1]), cheekR: hp([0.062, 1.612, -0.1]), lip: hp([0, 1.588, -0.115]) },
  } });
}

// =========================================================
// 手袋（指 3 節 × 5 本）: 手首が原点、指は +Y、掌は -Z、右手は親指が +X。層: glove（白）/ cuff（黄色の袖口）
// =========================================================
function glove(side) {
  const s = side === 'L' ? -1 : 1, bones = [], B = {};
  const bone = (name, parent, pos) => { B[name] = bones.length; bones.push({ name, parent: parent == null ? -1 : B[parent], pos }); };
  bone('wrist', null, [0, 0, 0]);
  const G = [], C = [], W = hex(0xf8f6f0);
  const P = (arr, sh, b, k) => arr.push({ s: sh, bone: B[b], group: arr === G ? 'glove' : 'cuff', color: arr === G ? W : YEL, k });
  P(G, ellipsoid([0, 0.052, -0.002], [0.048, 0.054, 0.024]), 'wrist', 0.02);
  P(G, ellipsoid([0, 0.056, 0.006], [0.044, 0.046, 0.02]), 'wrist', 0.02);
  P(G, roundCone([0, -0.01, 0.0], [0, 0.02, 0.0], 0.034, 0.038), 'wrist', 0.02);
  P(C, roundCone([0, -0.04, 0.0], [0, 0.0, 0.0], 0.05, 0.041), 'wrist', 0.012);
  const defs = [['index', 0.031 * s, [0.035, 0.025, 0.021], 0.0118], ['middle', 0.011 * s, [0.04, 0.028, 0.022], 0.0125], ['ring', -0.01 * s, [0.037, 0.026, 0.021], 0.012], ['pinky', -0.029 * s, [0.03, 0.021, 0.018], 0.0105]];
  for (const [nm, x, Ls, r] of defs) {
    let p0 = [x, 0.096, -0.002]; bone(nm + '1', 'wrist', p0);
    for (let k = 0; k < 3; k++) { const p1 = add(p0, [0, Ls[k], 0]); if (k < 2) bone(nm + (k + 2), nm + (k + 1), p1); P(G, roundCone(p0, p1, r * (1 - k * 0.07), r * (0.93 - k * 0.1)), nm + (k + 1), 0.008); p0 = p1; }
  }
  const tb = [0.04 * s, 0.03, -0.008]; bone('thumb1', 'wrist', tb);
  const td = norm([0.55 * s, 0.75, -0.35]), t1 = add(tb, mul(td, 0.03)); bone('thumb2', 'thumb1', t1);
  const t2 = add(t1, mul(td, 0.026)); bone('thumb3', 'thumb2', t2); const t3 = add(t2, mul(td, 0.022));
  P(G, roundCone(tb, t1, 0.015, 0.0135), 'thumb1', 0.012); P(G, roundCone(t1, t2, 0.0135, 0.0125), 'thumb2', 0.006); P(G, roundCone(t2, t3, 0.0125, 0.0105), 'thumb3', 0.006);
  build('glove' + side, { bones, sigma: 0.006, layers: [
    { group: 'glove', parts: G, h: 0.0042, bmin: [-0.075, -0.03, -0.06], bmax: [0.075, 0.2, 0.05] },
    { group: 'cuff', parts: C, h: 0.0055, bmin: [-0.06, -0.06, -0.06], bmax: [0.06, 0.02, 0.06] },
  ] });
}

// =========================================================
// 窓の住人（上半身）: 'oyaji' / 'obachan'。原点は腰、前（窓の外）は +z。層: skin / hair / cloth
// =========================================================
function resident(kind) {
  const B = {}, bones = [];
  const bone = (name, parent, pos) => { B[name] = bones.length; bones.push({ name, parent: parent == null ? -1 : B[parent], pos }); };
  bone('root', null, [0, 0, 0]); bone('chest', 'root', [0, 0.25, 0]); bone('head', 'chest', [0, 0.52, 0.02]);
  const L = { skin: [], hair: [], cloth: [] }, P = (layer, sh, b, color, k) => L[layer].push({ s: sh, bone: B[b], group: layer, color, k });
  const SK = kind === 'oyaji' ? hex(0xe9b48c) : hex(0xf2c6a2), CL = kind === 'oyaji' ? hex(0xf4f1e8) : hex(0xf2d7e6);
  P('cloth', ellipsoid([0, 0.2, 0], [0.2, 0.2, 0.15]), 'chest', CL, 0.06);
  if (kind === 'oyaji') { for (const s of [-1, 1]) P('cloth', roundCone([s * 0.09, 0.22, 0.0], [s * 0.09, 0.42, 0.0], 0.06, 0.05), 'chest', CL, 0.05); P('skin', roundCone([-0.16, 0.37, 0], [0.16, 0.37, 0], 0.07, 0.07), 'chest', SK, 0.05); }
  else { P('cloth', roundCone([-0.17, 0.38, 0], [0.17, 0.38, 0], 0.075, 0.075), 'chest', CL, 0.05); P('cloth', ellipsoid([0, 0.22, 0.1], [0.165, 0.165, 0.065]), 'chest', hex(0xffffff), 0.02); }
  P('skin', roundCone([0, 0.4, 0.01], [0, 0.52, 0.02], 0.056, 0.05), 'head', SK, 0.03);
  P('skin', ellipsoid([0, 0.62, 0.02], [0.12, 0.13, 0.118]), 'head', SK, 0.04);
  P('skin', ellipsoid([0, 0.56, 0.035], [0.105, 0.075, 0.1]), 'head', SK, 0.05);
  P('skin', ellipsoid([0, 0.605, 0.145], [0.03, 0.028, 0.032]), 'head', hex(0xe8907a), 0.03);
  for (const s of [-1, 1]) { P('skin', ellipsoid([s * 0.12, 0.615, 0.02], [0.022, 0.036, 0.016]), 'head', SK, 0.012); P('skin', ellipsoid([s * 0.045, 0.655, 0.115], [0.03, 0.012, 0.02], [0, 0, s * 0.2]), 'head', SK, 0.015); }
  if (kind === 'oyaji') {
    for (const s of [-1, 1]) P('hair', ellipsoid([s * 0.108, 0.635, -0.01], [0.03, 0.047, 0.062]), 'head', hex(0x9a958f), 0.02);
    P('hair', ellipsoid([0, 0.582, 0.135], [0.06, 0.017, 0.026]), 'head', hex(0x4a4540), 0.015);
  } else {
    P('hair', ellipsoid([0, 0.668, -0.008], [0.133, 0.12, 0.128]), 'head', hex(0x5b4636), 0.02);
    P('hair', ellipsoid([0, 0.735, -0.09], [0.06, 0.055, 0.055]), 'head', hex(0x5b4636), 0.02);
    for (let i = 0; i < 6; i++) { const a = -1.1 + i * 0.44; P('cloth', roundCone([Math.sin(a) * 0.128 - 0.02, 0.735 - Math.abs(a) * 0.03, Math.cos(a) * 0.062 + 0.02], [Math.sin(a) * 0.128 + 0.02, 0.735 - Math.abs(a) * 0.03, Math.cos(a) * 0.062 + 0.02], 0.023, 0.023), 'head', hex(0xff8fc0), 0.004); }
  }
  for (const [s, S] of [[-1, 'L'], [1, 'R']]) {
    const sh = [s * 0.2, 0.38, 0], el = [s * 0.24, 0.14, 0.02], wr = [s * 0.25, -0.08, 0.06];
    bone('upper' + S, 'chest', sh); bone('fore' + S, 'upper' + S, el); bone('hand' + S, 'fore' + S, wr);
    P(kind === 'oyaji' ? 'skin' : 'cloth', roundCone(sh, el, 0.058, 0.048), 'upper' + S, kind === 'oyaji' ? SK : CL, 0.03);
    P('skin', roundCone(el, wr, 0.046, 0.04), 'fore' + S, SK, 0.03);
    P('skin', ellipsoid(add(wr, [0, -0.04, 0.0]), [0.046, 0.052, 0.038]), 'hand' + S, SK, 0.025);
  }
  build('resident-' + kind, { bones, layers: [
    { group: 'skin', parts: L.skin, h: 0.0125, bmin: [-0.36, -0.2, -0.2], bmax: [0.36, 0.8, 0.22] },
    { group: 'hair', parts: L.hair, h: 0.0095, bmin: [-0.2, 0.5, -0.2], bmax: [0.2, 0.82, 0.2] },
    { group: 'cloth', parts: L.cloth, h: 0.0145, bmin: [-0.36, -0.2, -0.2], bmax: [0.36, 0.8, 0.22] },
  ], extra: { face: { eyeL: [-0.045, 0.105, 0.104], eyeR: [0.045, 0.105, 0.104], mouth: [0, 0.035, 0.118] } } });
}

// =========================================================
// 鳥（カモメ風）: 前は +z。翼は 2 節。層: body / beak
// =========================================================
function bird() {
  const B = {}, bones = [];
  const bone = (name, parent, pos) => { B[name] = bones.length; bones.push({ name, parent: parent == null ? -1 : B[parent], pos }); };
  bone('root', null, [0, 0, 0]); bone('head', 'root', [0, 0.07, 0.17]); bone('tail', 'root', [0, 0.0, -0.18]);
  const L = { body: [], beak: [] }, P = (layer, sh, b, color, k) => L[layer].push({ s: sh, bone: B[b], group: layer, color, k });
  const WH = hex(0xf3f4f6), BE = hex(0xf6b21c);
  P('body', ellipsoid([0, 0, 0], [0.12, 0.11, 0.22]), 'root', WH, 0.05);
  P('body', ellipsoid([0, 0.09, 0.2], [0.085, 0.082, 0.088]), 'head', WH, 0.05);
  P('beak', roundCone([0, 0.075, 0.25], [0, 0.06, 0.36], 0.027, 0.008), 'head', BE, 0.012);
  P('body', roundCone([0, 0.0, -0.18], [0, 0.0, -0.32], 0.06, 0.02), 'tail', WH, 0.04);
  for (const [s, S] of [[-1, 'L'], [1, 'R']]) {
    bone('wing1' + S, 'root', [s * 0.09, 0.05, 0.02]); bone('wing2' + S, 'wing1' + S, [s * 0.36, 0.05, 0.0]);
    P('body', ellipsoid([s * 0.22, 0.05, 0.0], [0.15, 0.018, 0.1]), 'wing1' + S, WH, 0.03);
    P('body', ellipsoid([s * 0.48, 0.05, -0.02], [0.14, 0.012, 0.075], [0, s * 0.15, 0]), 'wing2' + S, WH, 0.02);
  }
  build('bird', { bones, sigma: 0.025, layers: [
    { group: 'body', parts: L.body, h: 0.0115, bmin: [-0.66, -0.15, -0.36], bmax: [0.66, 0.2, 0.32] },
    { group: 'beak', parts: L.beak, h: 0.0055, bmin: [-0.05, 0.02, 0.2], bmax: [0.05, 0.12, 0.4] },
  ], extra: { face: { eyeL: [-0.07, 0.04, 0.065], eyeR: [0.07, 0.04, 0.065] } } });
}

const only = process.argv[2];
if (!only || only === 'climber') climber();
if (!only || only === 'glove') { glove('L'); glove('R'); }
if (!only || only === 'resident') { resident('oyaji'); resident('obachan'); }
if (!only || only === 'bird') bird();
