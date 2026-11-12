// 小さな MML 読み取り器（Node でも動く。AudioContext は使わない）。
// 記法: c d e f g a b（+ # で半音上・- で半音下）、r 休符、数字=音価（4=四分）、. 付点、^ 音価を足す（タイ）、
//       o 音域、> < 音域の上下、l 既定の音価、v 音量 0〜15、@ 波形番号、q 発音の長さ（8 分率 1〜8）、
//       [ ... ]n 繰り返し、| 小節線（位置が小節の頭でなければ誤りとして記録する）。
export const PPQ = 48;           // 四分音符 = 48 ティック
export const BAR = PPQ * 4;      // 4/4 拍子の 1 小節
const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function expandRepeats(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '[') {
      let depth = 1, j = i + 1;
      while (j < src.length && depth) { if (src[j] === '[') depth++; else if (src[j] === ']') depth--; j++; }
      if (depth) throw new Error('MML: ] が足りない');
      const inner = expandRepeats(src.slice(i + 1, j - 1));
      let k = j, num = '';
      while (k < src.length && /\d/.test(src[k])) num += src[k++];
      out += inner.repeat(num ? +num : 2);
      i = k;
    } else { out += c; i++; }
  }
  return out;
}

export function parseMML(source, init = {}) {
  const s = expandRepeats(source.toLowerCase());
  let i = 0, t = 0, oct = init.o ?? 4, len = init.l ?? 8, vol = init.v ?? 12, wave = init.w ?? 0, q = init.q ?? 7;
  const events = [], barErrors = [];
  const num = () => { let n = ''; while (i < s.length && /\d/.test(s[i])) n += s[i++]; return n === '' ? null : +n; };
  const length = () => {
    const n = num();
    let d = BAR / (n ?? len), add = d;
    while (s[i] === '.') { add /= 2; d += add; i++; }
    while (s[i] === '^') { i++; const m = num(); let e = BAR / (m ?? len), a2 = e; while (s[i] === '.') { a2 /= 2; e += a2; i++; } d += e; }
    if (!Number.isInteger(d)) throw new Error(`MML: 音価がティックで割り切れない (${d})`);
    return d;
  };
  while (i < s.length) {
    const c = s[i++];
    if (c in SEMI) {
      let semi = SEMI[c];
      while (s[i] === '+' || s[i] === '#' || s[i] === '-') semi += s[i++] === '-' ? -1 : 1;
      const d = length();
      const g = q >= 8 ? d : Math.max(1, Math.round((d * q) / 8));
      events.push({ t, d, g, n: 12 * (oct + 1) + semi, v: vol, w: wave });
      t += d;
    } else if (c === 'r') t += length();
    else if (c === 'o') oct = num() ?? oct;
    else if (c === '>') oct++;
    else if (c === '<') oct--;
    else if (c === 'l') len = num() ?? len;
    else if (c === 'v') vol = Math.max(0, Math.min(15, num() ?? vol));
    else if (c === '@') wave = num() ?? wave;
    else if (c === 'q') q = Math.max(1, Math.min(8, num() ?? q));
    else if (c === '|') { if (t % BAR) barErrors.push(t); }
    else if (!/\s/.test(c)) throw new Error(`MML: 知らない文字 "${c}" (位置 ${i - 1})`);
  }
  return { events, ticks: t, barErrors };
}

export const midiToHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

// MIDI 番号から MML（音域つき）を作る。アルペジオなどを関数で組み立てるときに使う。
const NAMES = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];
export const nm = (n, len = '') => `o${Math.floor(n / 12) - 1}${NAMES[((n % 12) + 12) % 12]}${len}`;
