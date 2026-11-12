// ORBITAL WINGS — 曲の記法（MML 風）を、拍の刻み（tick）単位のイベント列に変換する。
// 記法の説明は songs.js の先頭にある。ブラウザ API は使わない（Node でも動く）。

export const TPQ = 24;            // 4 分音符 = 24 tick
export const BAR_TICKS = TPQ * 4; // 4/4 拍子 1 小節 = 96 tick
export const DRUM_KEYS = 'kshoxtuj';

const NOTE_BASE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

// [ ... ]n の繰り返しを展開する（入れ子可、: は最後の回だけそこで抜ける）
export function expandRepeats(src) {
  let s = src;
  const re = /\[([^[\]]*)\](\d*)/;
  let m, guard = 0;
  while ((m = re.exec(s))) {
    if (++guard > 100000) throw new Error('繰り返しの展開が終わらない');
    const n = m[2] ? parseInt(m[2], 10) : 2;
    const body = m[1];
    const k = body.indexOf(':');
    let out = '';
    if (k >= 0) {
      const a = body.slice(0, k), b = body.slice(k + 1);
      for (let i = 0; i < n - 1; i++) out += a + ' ' + b + ' ';
      out += a;
    } else {
      for (let i = 0; i < n; i++) out += body + ' ';
    }
    s = s.slice(0, m.index) + ' ' + out + ' ' + s.slice(m.index + m[0].length);
  }
  if (/[[\]:]/.test(s)) throw new Error('繰り返しの括弧が対応していない');
  return s;
}

// 1 トラックを変換する。drum=true なら k s h o x t u j が打楽器になる
export function compileTrack(src, { drum = false, name = '?' } = {}) {
  const s = expandRepeats(src);
  let i = 0, oct = 4, defLen = TPQ, vol = 15, q = 8, inst = drum ? 'drum' : 'lead', tr = 0, arp = null, det = 0;
  const events = [];
  const errors = [];
  let tick = 0, loopIndex = -1, loopTick = -1, lastBar = 0, bars = 0;
  let minNote = 999, maxNote = -999;
  const err = (msg) => errors.push(`${name}: ${msg} (位置 ${i}, tick ${tick})`);
  const isDigit = (c) => c >= '0' && c <= '9';
  const readInt = () => {
    let sign = 1;
    if (s[i] === '-') { sign = -1; i++; } else if (s[i] === '+') i++;
    let st = i;
    while (i < s.length && isDigit(s[i])) i++;
    if (st === i) return null;
    return sign * parseInt(s.slice(st, i), 10);
  };
  const readLen = () => {
    let len;
    if (s[i] === '%') { i++; const v = readInt(); if (v == null || v <= 0) { err('% の後に tick 数がない'); return defLen; } len = v; }
    else if (isDigit(s[i])) {
      const st = i; while (i < s.length && isDigit(s[i])) i++;
      const n = parseInt(s.slice(st, i), 10);
      if (!(n > 0) || BAR_TICKS % n !== 0) { err(`音の長さ ${n} は割り切れない`); len = defLen; } else len = BAR_TICKS / n;
    } else len = defLen;
    let add = len;
    while (s[i] === '.') { i++; add = add / 2; if (add !== Math.floor(add)) err('付点が細かすぎる'); len += add; }
    return len;
  };
  const tie = () => {
    // c4^8^16 のように直前の音（休符）を延ばす
    while (true) {
      let j = i; while (s[j] === ' ' || s[j] === '\n' || s[j] === '\t') j++;
      if (s[j] !== '^') break;
      i = j + 1;
      const add = readLen();
      const last = events[events.length - 1];
      if (!last) { err('^ の前に音がない'); break; }
      last.len += add; tick += add;
    }
  };
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '|') {
      i++;
      const seg = tick - lastBar;
      if (seg !== 0 && seg !== BAR_TICKS) err(`小節の長さが ${seg} tick（${BAR_TICKS} であるべき）`);
      if (seg !== 0) bars++;
      lastBar = tick;
      continue;
    }
    if (c === 'L') { i++; loopIndex = events.length; loopTick = tick; continue; }
    if (c === 'l') { i++; defLen = readLen(); continue; }
    if (c === 'v') { i++; const v = readInt(); if (v == null || v < 0 || v > 15) err('v は 0〜15'); else vol = v; continue; }
    if (c === 'q') { i++; const v = readInt(); if (v == null || v < 1 || v > 8) err('q は 1〜8'); else q = v; continue; }
    if (c === '@') {
      i++; const st = i; while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) i++;
      inst = s.slice(st, i); if (!inst) err('@ の後に音色名がない'); continue;
    }
    if (c === 'r') { i++; const len = readLen(); events.push({ t: 'r', len }); tick += len; tie(); continue; }
    if (c === '^') { tie(); if (s[i] === '^') { err('^ の使い方'); i++; } continue; }
    if (drum) {
      if (DRUM_KEYS.includes(c)) {
        i++; const len = readLen();
        events.push({ t: 'd', d: c, len, vol });
        tick += len; tie(); continue;
      }
      err(`打楽器トラックで使えない文字 "${c}"`); i++; continue;
    }
    if (c === 'o') { i++; const v = readInt(); if (v == null || v < 0 || v > 8) err('o は 0〜8'); else oct = v; continue; }
    if (c === '<') { i++; oct--; continue; }
    if (c === '>') { i++; oct++; continue; }
    if (c === 'k') { i++; const v = readInt(); if (v == null) err('k の後に数がない'); else tr = v; continue; }
    if (c === 'D') { i++; const v = readInt(); if (v == null) err('D の後に数がない'); else det = v; continue; }
    if (c === 'X') {
      i++;
      const list = [];
      while (true) { const v = readInt(); if (v == null) break; list.push(v); if (s[i] === ',') i++; else break; }
      arp = list.length > 1 ? list : null;
      continue;
    }
    if (NOTE_BASE[c] !== undefined) {
      i++;
      let semi = NOTE_BASE[c];
      while (s[i] === '+' || s[i] === '#' || s[i] === '-') { semi += s[i] === '-' ? -1 : 1; i++; }
      const len = readLen();
      const m = 12 * (oct + 1) + semi + tr;
      if (m < minNote) minNote = m;
      if (m > maxNote) maxNote = m;
      const ev = { t: 'n', m, len, q, inst, vol, arp, det, leg: false };
      events.push(ev); tick += len;
      tie();
      if (s[i] === '&') { i++; ev.leg = true; }
      continue;
    }
    err(`知らない文字 "${c}"`); i++;
  }
  if (tick - lastBar !== 0 && tick - lastBar !== BAR_TICKS) err(`最後の小節が ${tick - lastBar} tick`);
  if (loopTick >= 0 && loopTick % BAR_TICKS !== 0) err(`ループ点が小節の頭にない（tick ${loopTick}）`);
  return { events, loopIndex, loopTick, totalTicks: tick, errors, drum, bars, minNote, maxNote };
}

// 曲のトラック名 → 音源のチャンネル
// A0 A1 A2 = PSG-A の 3 音（D は A2 を打楽器として使う）、W0 W1 = 波形メモリ音源の 2 音
export const TRACK_KEYS = ['A0', 'A1', 'A2', 'D', 'W0', 'W1'];

export function compileSong(id, song) {
  const tracks = {};
  const errors = [];
  if (song.tracks.A2 && song.tracks.D) errors.push(`${id}: A2 と D は同じチャンネルなので両方は書けない`);
  for (const key of Object.keys(song.tracks)) {
    if (!TRACK_KEYS.includes(key)) { errors.push(`${id}: 知らないトラック ${key}`); continue; }
    const t = compileTrack(song.tracks[key], { drum: key === 'D', name: `${id}.${key}` });
    tracks[key] = t;
    errors.push(...t.errors);
  }
  const list = Object.values(tracks);
  const totalTicks = list.length ? Math.max(...list.map((t) => t.totalTicks)) : 0;
  const loopTick = song.loop ? (list.find((t) => t.loopTick >= 0)?.loopTick ?? 0) : -1;
  const tpf = song.tempo * TPQ / 3600; // 1 フレーム（1/60 秒）あたりの tick
  const secPerTick = 60 / (song.tempo * TPQ);
  return {
    id, tempo: song.tempo, loop: !!song.loop, title: song.title || id,
    tracks, totalTicks, loopTick, tpf, errors,
    seconds: totalTicks * secPerTick,
    introSeconds: song.loop ? loopTick * secPerTick : 0,
    loopSeconds: song.loop ? (totalTicks - loopTick) * secPerTick : 0,
  };
}
