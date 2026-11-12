// 月影の魔城 — 小さな MML コンパイラ（VOIDBLOOM のものを複製。psg トラックを追加）
//  t120 テンポ / @n 音色 / v0-15 音量 / p1 左 p2 右 p3 中央 / y0-9 エコー量 / D±n デチューン(cent) / M n ビブラート(cent)
//  o4 オクターブ（o4c = MIDI 60）/ > 上げ < 下げ / l8 既定の長さ / q1-8 ゲート / k±n 移調
//  c d e f g a b（+ # - で半音）長さ・付点・^長さ でタイ / r 休符 / L ループ位置 / [ ... ]n 繰り返し
//  PCM トラックの大文字: K キック S スネア H ハット O オープン T タム C クラッシュ Z ノイズ P 金属音 X 逆再生風
import { TPQ } from './synth.js';

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const DRUM = { K: 'kick', S: 'snare', H: 'hat', O: 'ohat', T: 'tom', C: 'crash', Z: 'noise', P: 'metal', X: 'swell' };

export function compileTrack(src, kind = 'fm', ch = 0) {
  const ev = [];
  let i = 0, tick = 0, oct = 4, len = TPQ, gate = 7, tr = 0, loopTick = -1;
  const num = () => { let m = /^-?\d+/.exec(src.slice(i)); if (!m) return null; i += m[0].length; return +m[0]; };
  const length = () => {
    let n = num(); let t = n ? (TPQ * 4) / n : len;
    let add = t; while (src[i] === '.') { i++; add /= 2; t += add; }
    while (src[i] === '^') { i++; let n2 = num(); let t2 = n2 ? (TPQ * 4) / n2 : len; let a2 = t2; while (src[i] === '.') { i++; a2 /= 2; t2 += a2; } t += t2; }
    return Math.round(t);
  };
  const stack = [];
  while (i < src.length) {
    const c = src[i++];
    if (' \n\t\r|'.includes(c)) continue;
    if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (NOTE[c] != null) {
      let n = NOTE[c];
      while (src[i] === '+' || src[i] === '#' || src[i] === '-') n += src[i++] === '-' ? -1 : 1;
      const L = length();
      const midi = (oct + 1) * 12 + n + tr;
      ev.push([tick, 'n', midi, L, gate >= 8 ? L - 1 : Math.max(1, Math.floor((L * gate) / 8))]);
      tick += L;
    } else if (DRUM[c]) {
      const L = length();
      ev.push([tick, 'n', DRUM[c], tr, 0]); tick += L;
    } else if (c === 'r') tick += length();
    else if (c === 'o') oct = num();
    else if (c === '>') oct++;
    else if (c === '<') oct--;
    else if (c === 'l') { const n = num(); let t = (TPQ * 4) / n, a = t; while (src[i] === '.') { i++; a /= 2; t += a; } len = t; }
    else if (c === 'q') gate = num();
    else if (c === 'k') tr = num();
    else if (c === 'L') loopTick = tick;
    else if ('@vpyDMt'.includes(c)) ev.push([tick, c, num()]);
    else if (c === '[') stack.push({ start: ev.length, startTick: tick, i });
    else if (c === ']') {
      const fr = stack.pop(); const n = num() ?? 2;
      const body = ev.slice(fr.start), span = tick - fr.startTick;
      for (let k = 1; k < n; k++) for (const e of body) ev.push([e[0] + span * k, ...e.slice(1)]);
      tick += span * (n - 1);
    } else throw new Error(`MML: 不明な文字 "${c}" (位置 ${i - 1}): …${src.slice(Math.max(0, i - 12), i + 12)}…`);
  }
  ev.sort((a, b) => a[0] - b[0]);
  const loopIdx = loopTick < 0 ? -1 : ev.findIndex((e) => e[0] >= loopTick);
  return { kind, ch, events: ev, endTick: tick, loopTick, loopIdx: loopTick >= 0 && loopIdx < 0 ? -1 : loopIdx };
}

// song: { tempo, fm: [mml...], pcm: [mml...] } → 再生器が読む形
export function compileSong(def) {
  const tracks = [];
  (def.fm || []).forEach((m, k) => m && tracks.push(compileTrack(m, 'fm', k)));
  (def.psg || []).forEach((m, k) => m && tracks.push(compileTrack(m, 'psg', k)));
  (def.pcm || []).forEach((m, k) => m && tracks.push(compileTrack(m, 'pcm', k)));
  return { id: def.id, title: def.title, tempo: def.tempo, echoBeats: def.echoBeats, echoFb: def.echoFb, tracks, loops: tracks.some((t) => t.loopTick >= 0) };
}
