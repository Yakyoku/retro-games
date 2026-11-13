// AEGIS RELAY 2D — 浮遊大陸の地表の素材（8 テーマ）。高さ h(x, wy) と、色・光沢・発光を返す関数の組
// ・座標は世界座標（x, wy）なので、帯（ストリップ）の境目でも模様がつながる
// ・ここは「焼くとき」だけ呼ばれる（毎フレームではない）
import { hexRgb, mix3, fbm, smooth, clamp, hash2 } from './util.js';

const n = (x, y, s, o) => fbm(x * s + o, y * s + o * 0.37);
// 起伏の基本（なだらかな丘＋細かい凹凸）
const hills = (x, y, sd) => n(x, y, 2.6, sd) * 2.4 + n(x, y, 8, sd + 50) * 0.7;

// out = { r,g,b（0..255 の地色）, ks（光沢の強さ）, kp（光沢の鋭さ）, e（発光 0..1）, flat（水面など: 陰影を弱める） }
export function makeMaterial(theme, th, seed) {
  const land = hexRgb(th.land), hi = hexRgb(th.landHi), side = hexRgb(th.side), glow = hexRgb(th.glow), sd = seed * 3.7;
  const dark = mix3(land, side, 0.6);
  switch (theme) {
    case 'ash': return { // 灰の浅瀬: クレーター（地形側で加える）と砂紋
      em: null, grain: 1,
      h(x, y) { const a = hills(x, y, sd), rp = smooth(0.42, 0.6, n(x, y, 1.6, sd + 9)); return a + Math.sin(y * 1.25 + x * 0.42 + n(x, y, 2.2, 31) * 15) * 0.16 * rp; },
      col(x, y, h, o) { const t = clamp((h - 0.6) / 2.6) * 0.7 + n(x, y, 12, 5) * 0.3, pt = smooth(0.4, 0.62, n(x, y, 1.9, sd + 77)); const c = mix3(mix3(dark, [58, 54, 70], pt * 0.6), mix3(hi, [150, 142, 150], pt * 0.5), t * 0.9); o.r = c[0]; o.g = c[1]; o.b = c[2]; o.ks = 0.05; o.kp = 8; o.e = 0; o.flat = 0; },
    };
    case 'ice': return { // 霜の環礁: なめらかな氷、圧力の尾根、霜、強い反射
      em: null, grain: 0.45,
      h(x, y) { const rd = 1 - Math.abs(n(x, y, 3.2, sd + 20) - 0.5) * 2; return hills(x, y, sd) * 0.45 + rd * rd * rd * rd * 1.5; },
      col(x, y, h, o) { const f = smooth(0.52, 0.7, n(x, y, 11, 77)), t = clamp(h / 2.2) * 0.5 + f * 0.3, deep = smooth(0.55, 0.3, n(x, y, 2.2, sd + 140));
        const c = mix3(mix3([70, 122, 158], [36, 86, 128], deep), [226, 244, 252], t); o.r = c[0]; o.g = c[1]; o.b = c[2]; o.ks = 0.5 - f * 0.3; o.kp = 26; o.e = 0; o.flat = 0; },
    };
    case 'ember': { // 燠の段丘: 焦げた岩と、光る溶岩の筋
      const vein = (x, y) => Math.abs(n(x, y, 2.4, sd + 300) - 0.5);
      return { em: [255, 120, 40], emA: 0.55, grain: 1,
        h(x, y) { const v = vein(x, y); return hills(x, y, sd) * 1.25 + Math.floor(n(x, y, 1.3, sd + 70) * 4) * 0.45 - (1 - smooth(0, 0.05, v)) * 0.9; },
        col(x, y, h, o) { const v = vein(x, y), lava = 1 - smooth(0.008, 0.026, v), t = n(x, y, 9, 13) * 0.6 + clamp(h / 3.4) * 0.4;
          const c = mix3([34, 20, 18], mix3(land, hi, 0.3), t), hot = 1 - smooth(0.02, 0.1, v);
          o.r = c[0] + 70 * hot + 215 * lava; o.g = c[1] + 16 * hot + 130 * lava; o.b = c[2] + 50 * lava * lava; o.ks = 0.12; o.kp = 14; o.e = 1 - smooth(0, 0.06, v); o.flat = lava; },
      };
    }
    case 'mech': { // 歯車の残骸: 金属板の継ぎ目
      const P = 13;
      const cell = (x, y) => { const cx = Math.floor(x / P), cy = Math.floor(y / P), big = hash2(cx >> 1, cy >> 1) < 0.3; return big ? [cx >> 1, cy >> 1, P * 2] : hash2(cx, cy + 9) < 0.35 ? [Math.floor(x / (P / 2)) + 500, Math.floor(y / (P / 2)) + 500, P / 2] : [cx + 100, cy + 100, P]; };
      const gap = (x, y, c) => { const fx = x / c[2] - Math.floor(x / c[2]), fy = y / c[2] - Math.floor(y / c[2]); return Math.min(fx, 1 - fx, fy, 1 - fy) * c[2]; };
      return { em: null, grain: 0.5,
        h(x, y) { const c = cell(x, y), g = gap(x, y, c); return 1 + hash2(c[0], c[1]) * 1.1 - (1 - smooth(0.1, 0.45, g)) * 0.7 + n(x, y, 10, 3) * 0.12; },
        col(x, y, h, o) { const c = cell(x, y), g = gap(x, y, c), hh = hash2(c[0] + 7, c[1] + 3), gr = n(x, y, 5, sd + 8), rust = smooth(0.6, 0.8, gr) * (hh > 0.6 ? 1 : 0.25);
          let m = mix3(dark, hi, 0.25 + hh * 0.5); m = mix3(m, [112, 78, 58], rust * 0.5); const k = (0.72 + 0.28 * smooth(0.1, 0.5, g)) * (0.88 + gr * 0.24);
          o.r = m[0] * k; o.g = m[1] * k; o.b = m[2] * k; o.ks = 0.4 * (1 - rust); o.kp = 18; o.e = 0; o.flat = 0; },
      };
    }
    case 'moss': { // 苔の穹窿: 苔と草、低いところに水
      const WL = 0.98;
      const base = (x, y) => n(x, y, 2.1, sd) * 2.4;
      return { em: null, grain: 0.8, water: (x, y, ed) => ed > 9 && base(x, y) < WL - 0.06,
        h(x, y, ed) { const b = base(x, y); return ed > 7 && b < WL ? WL * 1.3 : b * 1.3 + n(x, y, 8, sd + 50) * 0.8; },
        col(x, y, h, o, ed) { const b = base(x, y);
          if (ed > 7 && b < WL) { const dp = clamp((WL - b) * 3.2), c = mix3([70, 150, 140], [14, 52, 70], dp), foam = 1 - smooth(0, 0.035, WL - b); o.r = c[0] + 90 * foam; o.g = c[1] + 90 * foam; o.b = c[2] + 80 * foam; o.ks = 0.9; o.kp = 40; o.e = 0; o.flat = 1; return; }
          const t = n(x, y, 10, 21), rock = smooth(1.75, 2.1, b) , c = mix3(mix3([34, 62, 34], mix3(land, hi, 0.6), t), [120, 122, 104], rock * 0.8), wet = 1 - smooth(0, 0.14, b - WL);
          o.r = c[0] * (1 - wet * 0.35); o.g = c[1] * (1 - wet * 0.25); o.b = c[2] * (1 - wet * 0.2); o.ks = 0.05 + wet * 0.2; o.kp = 10; o.e = 0; o.flat = 0; },
      };
    }
    case 'gold': { // 黄金の身廊: 石畳（れんが積み）
      const T = 11, Q = Math.SQRT1_2; // ひし形（45°回した正方形）の敷石。ところどころ 4 つ割り
      const tile = (x, y) => { let u = (x + y) * Q / T, v = (x - y) * Q / T, cu = Math.floor(u), cv = Math.floor(v), sz = T; if (hash2(cu + 40, cv + 7) < 0.3) { u *= 2; v *= 2; cu = Math.floor(u) + 900; cv = Math.floor(v) + 900; sz = T / 2; u -= Math.floor(u); v -= Math.floor(v); } else { u -= cu; v -= cv; } return [cu, cv, Math.min(u, 1 - u, v, 1 - v) * sz]; };
      return { em: null, grain: 0.7,
        h(x, y) { const t = tile(x, y); return 1.2 + hash2(t[0], t[1]) * 0.35 - (1 - smooth(0.08, 0.5, t[2])) * 0.55 + n(x, y, 3, sd) * 0.5; },
        col(x, y, h, o) { const t = tile(x, y), hh = hash2(t[0] + 3, t[1] + 11), w = n(x, y, 7, sd + 5), c = mix3(mix3(dark, land, 0.6), hi, 0.2 + hh * 0.45 + w * 0.2), k = 0.74 + 0.26 * smooth(0.08, 0.5, t[2]);
          o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.ks = 0.22 + hh * 0.2; o.kp = 22; o.e = 0; o.flat = 0; },
      };
    }
    case 'obsid': { // 黒曜の砦: 段になったガラス質の岩と、紫に光る脈
      const vein = (x, y) => Math.abs(n(x, y, 3, sd + 500) - 0.5);
      return { em: [176, 110, 255], emA: 0.8, grain: 0.3,
        h(x, y) { const b = n(x, y, 2.2, sd) * 4.2, q = Math.floor(b * 1.6) / 1.6; return q + (b - q) * 0.25 + n(x, y, 9, 4) * 0.2; },
        col(x, y, h, o) { const v = vein(x, y), ve = 1 - smooth(0.006, 0.024, v), t = n(x, y, 6, 9) * 0.5 + clamp(h / 4) * 0.5, c = mix3([20, 16, 30], mix3(land, hi, 0.45), t * 0.8);
          o.r = c[0] + 150 * ve; o.g = c[1] + 80 * ve; o.b = c[2] + 215 * ve; o.ks = 0.95; o.kp = 46; o.e = 1 - smooth(0, 0.06, v); o.flat = ve * 0.7; },
      };
    }
    default: { // 天頂の玉座: 白い大理石の大きな板と、ゆるい石目
      const T = 26;
      const gap = (x, y) => { const fx = x / T - Math.floor(x / T), fy = y / T - Math.floor(y / T); return Math.min(fx, 1 - fx, fy, 1 - fy) * T; };
      return { em: null, grain: 0.25,
        h(x, y) { return 1.4 + hills(x, y, sd) * 0.3 - (1 - smooth(0.1, 0.5, gap(x, y))) * 0.5; },
        col(x, y, h, o) { const w = n(x, y, 2.4, sd + 3), vn = 1 - smooth(0, 0.09, Math.abs(Math.sin(x * 0.13 + y * 0.07 + w * 11))), v2 = 1 - smooth(0, 0.05, Math.abs(Math.sin(x * 0.05 - y * 0.16 + w * 17 + 2)));
          const hh = hash2(Math.floor(x / T), Math.floor(y / T)), c = mix3(mix3(land, hi, 0.55 + hh * 0.3 + w * 0.15), [96, 92, 150], Math.max(vn * 0.55, v2 * 0.4)), k = 0.8 + 0.2 * smooth(0.1, 0.5, gap(x, y));
          o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.ks = 0.5; o.kp = 30; o.e = 0; o.flat = 0; },
      };
    }
  }
}
