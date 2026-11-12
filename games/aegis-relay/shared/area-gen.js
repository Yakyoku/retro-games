// AEGIS RELAY — エリアの組み立て（決定的。同じエリアは毎回同じ地形・同じ編隊 → 覚えて上達できる）
// 座標: wy = 「その点が盤面の上端に来るときのスクロール距離」。画面の y = scroll - wy。
// 周回で変わるのは速さ・射撃間隔・追加編隊だけ（sim.js 側の倍率）。地形と配置は変わらない。
import { FIELD } from './rules.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// エリアのレシピ（独自構成）。roster = 繰り返し出る編隊の順番、feat = 特別な仕掛けの距離
export const RECIPES = [
  { seed: 11, len: 2600, roster: ['scoutLine', 'scoutV', 'weaverPair', 'scoutLine', 'slicerL', 'gunnerTrio'], islands: 5,
    dock: [520], twin: [1450], chain: [{ at: 980, shape: 'row' }], sigil: [{ at: 1880, x: 168 }], turretRate: 0.5 },
  { seed: 23, len: 2700, roster: ['weaverPair', 'slicerR', 'scoutV', 'spinnerRing', 'gunnerTrio', 'slicerL'], islands: 6,
    dock: [700], twin: [1650], chain: [{ at: 1150, shape: 'diag' }], sigil: [{ at: 560, x: 62 }], turretRate: 0.6 },
  { seed: 37, len: 2800, roster: ['diverSquad', 'scoutV', 'gunnerTrio', 'weaverPair', 'spinnerRing', 'slicerR'], islands: 6,
    dock: [480, 1900], twin: [1300], chain: [{ at: 2050, shape: 'col' }], sigil: [{ at: 1500, x: 120 }], turretRate: 0.7 },
  { seed: 41, len: 2900, roster: ['gunnerTrio', 'slicerL', 'lancerSolo', 'diverSquad', 'scoutLine', 'spinnerRing'], islands: 7,
    dock: [800], twin: [1700, 2350], chain: [{ at: 1200, shape: 'row' }], sigil: [{ at: 2200, x: 44 }], turretRate: 0.8 },
  { seed: 53, len: 2900, roster: ['spinnerRing', 'weaverPair', 'diverSquad', 'slicerR', 'lancerSolo', 'scoutV'], islands: 7,
    dock: [650, 2000], twin: [1450], chain: [{ at: 900, shape: 'diag' }, { at: 2300, shape: 'row' }], sigil: [{ at: 1650, x: 196 }], turretRate: 0.8 },
  { seed: 67, len: 3000, roster: ['lancerSolo', 'gunnerTrio', 'spinnerRing', 'diverSquad', 'slicerL', 'weaverPair'], islands: 8,
    dock: [900], twin: [1600, 2450], chain: [{ at: 1250, shape: 'col' }], sigil: [{ at: 700, x: 150 }], turretRate: 0.9 },
  { seed: 71, len: 3100, roster: ['diverSquad', 'lancerSolo', 'slicerR', 'gunnerTrio', 'spinnerRing', 'slicerL'], islands: 8,
    dock: [600, 2100], twin: [1500], chain: [{ at: 1000, shape: 'row' }, { at: 2500, shape: 'diag' }], sigil: [{ at: 1800, x: 84 }], turretRate: 1.0 },
  { seed: 89, len: 3200, roster: ['lancerSolo', 'diverSquad', 'spinnerRing', 'gunnerTrio', 'lancerSolo', 'weaverPair'], islands: 9,
    dock: [700, 1900], twin: [1300, 2300], chain: [{ at: 1600, shape: 'col' }], sigil: [{ at: 2600, x: 120 }], turretRate: 1.0 },
];

// 島（浮遊大陸）の輪郭: wy0..wy1 の区間で、左右の縁を step ごとに持つ
function makeIsland(r, wy0, wy1, cx, hw) {
  const step = 14, left = [], right = [];
  const n = Math.max(2, Math.ceil((wy1 - wy0) / step));
  let jl = 0, jr = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, taper = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.45;
    jl = jl * 0.6 + (r() - 0.5) * 10; jr = jr * 0.6 + (r() - 0.5) * 10;
    const w = hw * (0.25 + 0.75 * taper);
    left.push(Math.max(-30, cx - w + jl));
    right.push(Math.min(FIELD.W + 30, cx + w + jr));
  }
  return { wy0, wy1, step, left, right, cx, hw, ruins: [] };
}

export function islandSpanAt(isl, wy) {
  if (wy < isl.wy0 || wy > isl.wy1) return null;
  const f = (wy - isl.wy0) / isl.step, i = Math.min(isl.left.length - 2, Math.floor(f)), t = f - i;
  return [isl.left[i] * (1 - t) + isl.left[i + 1] * t, isl.right[i] * (1 - t) + isl.right[i + 1] * t];
}

export function buildArea(index) {
  const R = RECIPES[index % RECIPES.length];
  const r = rng(R.seed * 7919);
  const islands = [], ground = [], waves = [];
  const coreWy = R.len - 120;

  // 島: 等間隔に近いが幅・中心はエリアごとに違う。最後の島はエリアコアを載せる大きな島
  const seg = (coreWy - 260) / R.islands;
  for (let i = 0; i < R.islands; i++) {
    const wy0 = 200 + i * seg + r() * 40, len = seg * (0.55 + r() * 0.3);
    const cx = 50 + r() * 140, hw = 50 + r() * 60;
    islands.push(makeIsland(r, wy0, wy0 + len, cx, hw));
  }
  islands.push(makeIsland(r, coreWy - 230, coreWy + 150, 120, 118));

  // 遺跡（壊れない飾り）: 低い彩度・光らない。壊せる標的と見分けるため輪郭線を持たない
  for (const isl of islands) {
    const count = Math.round((isl.wy1 - isl.wy0) / 40);
    for (let k = 0; k < count; k++) {
      const wy = isl.wy0 + 20 + r() * (isl.wy1 - isl.wy0 - 40), sp = islandSpanAt(isl, wy);
      if (!sp || sp[1] - sp[0] < 30) continue;
      const x = sp[0] + 10 + r() * (sp[1] - sp[0] - 20);
      isl.ruins.push({ x, wy, kind: ['pillar', 'slab', 'arch', 'ring'][Math.floor(r() * 4)], s: 0.7 + r() * 0.8, rot: r() * Math.PI });
    }
  }

  let gid = 0;
  const put = (type, x, wy, extra = {}) => ground.push({ gid: gid++, type, x, wy, ...extra });

  // 砲台・トーチカ: 島の上だけ
  for (const isl of islands.slice(0, -1)) {
    for (let wy = isl.wy0 + 40; wy < isl.wy1 - 30; wy += 70 + r() * 50) {
      if (r() > R.turretRate) continue;
      const sp = islandSpanAt(isl, wy); if (!sp || sp[1] - sp[0] < 40) continue;
      put(r() < 0.25 ? 'bunker' : 'turret', sp[0] + 18 + r() * (sp[1] - sp[0] - 36), wy);
    }
  }
  // 格納庫（支援機）
  for (const at of R.dock) put('dock', 70 + ((at * 13) % 100), at);
  // ラティス・パネル（連続破壊）。同じ chainId の 8 枚
  R.chain.forEach((c, ci) => {
    for (let k = 0; k < 8; k++) {
      let x, wy;
      if (c.shape === 'row') { x = 36 + k * 24; wy = c.at; }
      else if (c.shape === 'diag') { x = 40 + k * 22; wy = c.at + k * 18; }
      else { x = 120; wy = c.at + k * 22; }
      put('panel', x, wy, { chainId: ci, chainIdx: k });
    }
  });
  // 隠しシジル（見えない。撃ち込むと現れる）
  for (const s of R.sigil) put('sigil', s.x, s.at, { hidden: true });
  // エリアコア
  put('core', 120, coreWy);

  // 編隊: roster を順に回す。特別な仕掛けの前後は少し空ける
  const special = [...R.twin.map((at) => ({ at, t: 'twin' }))];
  let k = 0;
  for (let at = 140; at < coreWy - 220; at += 118 + ((k * 37) % 40)) {
    if (special.some((s) => Math.abs(s.at - at) < 110)) continue;
    const t = R.roster[k % R.roster.length];
    waves.push({ at, t, side: k % 2 ? 1 : -1, x: 60 + ((k * 53) % 120), k });
    k++;
  }
  for (const s of special) waves.push({ at: s.at, t: 'twin', side: 1, x: 120, k: -1 });
  waves.sort((a, b) => a.at - b.at);

  return { index, len: R.len, coreWy, islands, ground, waves };
}
