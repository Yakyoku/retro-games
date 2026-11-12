// AEGIS RELAY — 簡易 MML（曲の楽譜を文字で書く）→ 音符列
// 命令: t<BPM> o<オクターブ> l<既定の長さ> v<音量0-15> @<波形0-3> q<ゲート1-8> < >（オクターブ上下）
//       c d e f g a b（+ / # でシャープ、- でフラット、続けて長さ、. で付点） r（休符） L（ここからループ） & （次の音とつなぐ）
// 音符: { t: 拍（4 分音符 = 1）, dur: 拍, midi, vol, duty, gate }
const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function parseMML(src) {
  const out = []; let pos = 0, oct = 4, len = 4, vol = 12, duty = 1, gate = 7, tempo = 140, loopAt = null, tie = false;
  const s = src.replace(/\|/g, ' ');
  let i = 0;
  const num = () => { let m = /^\d+/.exec(s.slice(i)); if (!m) return null; i += m[0].length; return +m[0]; };
  const length = () => {
    const n = num(); let beats = 4 / (n || len);
    let add = beats / 2; while (s[i] === '.') { beats += add; add /= 2; i++; }
    return beats;
  };
  while (i < s.length) {
    const raw = s[i++];
    if (raw === 'L') { loopAt = pos; continue; }
    const c = raw.toLowerCase();
    if (c === ' ' || c === '\n' || c === '\t') continue;
    if (c === 't') tempo = num();
    else if (c === 'o') oct = num();
    else if (c === 'l') len = num();
    else if (c === 'v') vol = num();
    else if (c === '@') duty = num();
    else if (c === 'q') gate = num();
    else if (c === '<') oct--;
    else if (c === '>') oct++;
    else if (c === '&') tie = true;
    else if (c === 'r') { pos += length(); }
    else if (c in NOTE) {
      let semi = NOTE[c];
      while (s[i] === '+' || s[i] === '#' || s[i] === '-') { semi += s[i] === '-' ? -1 : 1; i++; }
      const d = length();
      const midi = 12 * (oct + 1) + semi;
      const prev = out[out.length - 1];
      if (tie && prev && prev.midi === midi && Math.abs(prev.t + prev.dur - pos) < 1e-6) { prev.dur += d; }
      else out.push({ t: pos, dur: d, midi, vol, duty, gate });
      tie = false; pos += d;
    } else throw new Error(`MML: 不明な文字 "${c}" (${i})`);
  }
  return { notes: out, length: pos, loopAt, tempo };
}

// 和音の並びから伴奏（ベース・内声）を作る。chords: ['Em','Am',['C','B'],...]（配列は 1 小節を半分ずつ）
const ROOT = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function chordTones(name) {
  const m = /^([A-G][#b]?)(m?)(7?)$/.exec(name); if (!m) throw new Error('chord ' + name);
  const r = ROOT[m[1]], minor = m[2] === 'm';
  return { root: r, third: r + (minor ? 3 : 4), fifth: r + 7, sev: m[3] ? r + 10 : null };
}
const NAMES = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];
const nm = (semi, oct) => { const o = oct + Math.floor(semi / 12); return { n: NAMES[((semi % 12) + 12) % 12], o }; };
function abs(semi, oct, l) { const { n, o } = nm(semi, oct); return `o${o} ${n}${l}`; }

export function bassFrom(chords, style = 'octave') {
  let out = '';
  for (const bar of chords) {
    const parts = Array.isArray(bar) ? bar : [bar];
    const per = 8 / parts.length;
    for (const ch of parts) {
      const c = chordTones(ch);
      for (let k = 0; k < per; k++) {
        if (style === 'octave') out += abs(c.root, k % 2 ? 3 : 2, 8) + ' ';
        else if (style === 'walk') out += abs([c.root, c.root, c.fifth, c.root + 12][k % 4], 2, 8) + ' ';
        else out += abs(k % 4 === 3 ? c.fifth : c.root, 2, 8) + ' ';
      }
    }
  }
  return out;
}
export function padFrom(chords, oct = 4, style = 'pulse') {
  let out = '';
  for (const bar of chords) {
    const parts = Array.isArray(bar) ? bar : [bar];
    const per = 4 / parts.length; // 4 分音符の数
    for (const ch of parts) {
      const c = chordTones(ch);
      for (let k = 0; k < per; k++) {
        if (style === 'pulse') out += abs(k % 2 ? c.fifth : c.third, oct, 8) + ' r8 ';
        else out += abs([c.third, c.fifth, c.root + 12, c.fifth][k % 4], oct, 4) + ' ';
      }
    }
  }
  return out;
}
