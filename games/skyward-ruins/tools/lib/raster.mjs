// 小さなラスタ描画ライブラリ（PNG 書き出し付き）。ドット絵スプライトとタイルの生成に使う。依存なし。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function hex(c) { const n = parseInt(c.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; }

export class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  get(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0]; const i = (y * this.w + x) * 4; return [...this.d.slice(i, i + 4)]; }
  set(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 4; const col = typeof c === 'string' ? hex(c) : c; this.d[i] = col[0]; this.d[i + 1] = col[1]; this.d[i + 2] = col[2]; this.d[i + 3] = col[3] ?? 255; }
  alpha(x, y) { return this.get(x, y)[3]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  // 多角形塗り（px 中心で内外判定）。shade(x,y) が色を返す場合は面ごとの陰影に使う
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity; for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) for (let x = 0; x < this.w; x++) {
      const px = x + 0.5, py = y + 0.5; let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
    }
  }
  circle(cx, cy, r, c) { for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r) this.set(x, y, typeof c === 'function' ? c(x, y, dx, dy) : c); } }
  ring(cx, cy, r0, r1, c) { for (let y = Math.floor(cy - r1 - 1); y <= cy + r1 + 1; y++) for (let x = Math.floor(cx - r1 - 1); x <= cx + r1 + 1; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = dx * dx + dy * dy; if (d <= r1 * r1 && d >= r0 * r0) this.set(x, y, typeof c === 'function' ? c(x, y, dx, dy) : c); } }
  line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1; for (let i = 0; i <= n; i++) { const t = i / n; this.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c); } }
  // 不透明部分の外側に 1px の輪郭を付ける（地表の上でも形が読めるように）
  outline(c = '#14161c') {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y)) continue;
      if (this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }
  mirrorX() { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w / 2; x++) this.set(this.w - 1 - x, y, this.get(x, y)); return this; }
  rotated(angle) { // 最近傍で回転（アニメーション用）
    const o = new Canvas(this.w, this.h), cx = this.w / 2, cy = this.h / 2, cs = Math.cos(-angle), sn = Math.sin(-angle);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; const sx = Math.floor(cx + dx * cs - dy * sn), sy = Math.floor(cy + dx * sn + dy * cs); const p = this.get(sx, sy); if (p[3]) o.set(x, y, p); }
    return o;
  }
  scaled(k) { const o = new Canvas(this.w * k, this.h * k); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, this.get(Math.floor(x / k), Math.floor(y / k))); return o; }
  blit(src, ox, oy) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const p = src.get(x, y); if (p[3]) this.set(ox + x, oy + y, p); } }
  png() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) { raw[y * (this.w * 4 + 1)] = 0; Buffer.from(this.d.buffer, y * this.w * 4, this.w * 4).copy(raw, y * (this.w * 4 + 1) + 1); }
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  }
  save(path) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, this.png()); }
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// 4×4 ベイヤー行列による段階的な陰影（当時風の限られた色数で金属の面を表す）
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function ramp(colors, t, x, y) { // t: 0(暗)..1(明)
  const n = colors.length - 1; const v = Math.max(0, Math.min(0.999, t)) * n; const i = Math.floor(v); const f = v - i;
  const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  return colors[Math.min(n, f > th ? i + 1 : i)];
}
