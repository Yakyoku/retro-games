// ツイン・ガーデン — 曲（すべてこの作品のための自作。既存曲の旋律・編曲は使っていない）
// 簡易 MML: o 音域 / l 既定の長さ / < > 音域の上下 / c〜b 音名（+ # で半音上、- で半音下）/ 数字で長さ / . 付点 / r 休符
// 打楽器トラック（wave: 'drum'）は k（キック）s（スネア）h（ハット）r（休み）。
// 繰り返す曲は、全トラックの長さが同じ小節数になることを tests/audio.test.js で確かめる。

export const SONGS = {
  title: { bpm: 116, loop: true, tracks: [
    { wave: 'p25', vol: 0.20, mml: 'o5 l8 e4 g >c< b4 a4 | g4 e c d4 e4 | f4 a >c< b4 g4 | a2 g4 r4 | e4 g >c< b4 a4 | g4 >c d e4 d4< | a4 f a g4 d4 | c2. r4' },
    { wave: 'p12', vol: 0.09, mml: 'o4 l8 r4 c e g4 e4 | r4 c e g4 c4 | r4 c f a4 f4 | r4 d g b4 g4 | r4 c e g4 e4 | r4 e g >c4< g4 | r4 c f d4 f4 | e2. r4' },
    { wave: 'tri', vol: 0.30, mml: 'o3 l4 c g c g | a e a e | f >c< f >c< | g d g d | c g c g | a e a e | f g f g | c g c r' },
    { wave: 'drum', vol: 0.22, mml: 'l8 k h s h k h s h | k h s h k h s h | k h s h k h s h | k h s h k k s h | k h s h k h s h | k h s h k h s h | k h s h k h s h | k h s h k r s s' },
  ] },
  meadow: { bpm: 132, loop: true, tracks: [
    { wave: 'p25', vol: 0.19, mml: 'o5 l8 c f a f >c4< a4 | b- g e g >c4< r4 | a f c f a4 g4 | f2 e4 r4 | c f a f >c4< a4 | b-4 >d c< b-4 g4 | a b- a g f4 e4 | f2. r4' },
    { wave: 'p50', vol: 0.07, mml: 'o4 l4 a >c< a >c< | g e g e | a f a f | a g e g | a >c< a >c< | d f d f | c e c e | a2. r4' },
    { wave: 'tri', vol: 0.30, mml: 'o3 l4 f >c< f >c< | c g c g | f >c< f >c< | c g c g | f >c< f >c< | b- >f< b- >f< | c g c g | f >c< f r' },
    { wave: 'drum', vol: 0.22, mml: 'l8 k h s h k k s h | k h s h k k s h | k h s h k k s h | k h s h k h s s | k h s h k k s h | k h s h k k s h | k h s h k k s h | k h s h k r s r' },
  ] },
  dusk: { bpm: 112, loop: true, tracks: [
    { wave: 'p25', vol: 0.18, mml: 'o5 l8 d4 f a g4 f4 | e4 c e d2 | a4 >c< b a4 g4 | f g a f e4 r4 | d4 f a >d4< b4 | >c4< a f g4 e4 | f e d e f4 a4 | d2. r4' },
    { wave: 'p12', vol: 0.08, mml: 'o4 l8 r a r a r a r a | r g r g r g r g | r e r e r e r e | r c r c r c r c | r a r a r a r a | r f r f r f r f | r d r d r g r g | r f r f a4 r4' },
    { wave: 'tri', vol: 0.32, mml: 'o2 l4 d a d a | c g c g | a >e< a >e< | f >c< c g | d a d a | f >c< f >c< | g >d< g >d< | d a d r' },
    { wave: 'drum', vol: 0.20, mml: 'l8 k4 h h s4 h h | k4 h h s4 h h | k4 h h s4 h h | k4 h h s h s s | k4 h h s4 h h | k4 h h s4 h h | k4 h h s4 h h | k4 h h s4 r r' },
  ] },
  moon: { bpm: 104, loop: true, tracks: [
    { wave: 'p25', vol: 0.17, mml: 'o5 l8 a4 >c e d4 c4< | b4 g b a2 | f4 a >c< b4 a4 | g a b g e4 r4 | a4 >c e a4 g4< | f4 e d e4 c4 | d c < b > c d4 e4 | a2. r4' },
    { wave: 'p12', vol: 0.07, mml: 'o5 l4 e e e e | d d c c | c c d d | e e e r | e e e e | a a g g | f f g# g# | e2. r4' },
    { wave: 'tri', vol: 0.32, mml: 'o2 l4 a >e< a >e< | g >d< e b | f >c< f >c< | e b e b | a >e< a >e< | d a d a | e b e b | a >e< a r' },
    { wave: 'drum', vol: 0.18, mml: 'l8 k r h h s h k h | k r h h s h k h | k r h h s h k h | k r h h s h s s | k r h h s h k h | k r h h s h k h | k r h h s h k h | k r h h s r r r' },
  ] },
  bonus: { bpm: 152, loop: true, tracks: [
    { wave: 'p25', vol: 0.18, mml: 'o5 l8 c e g >c< g e c e | d f a >d< a f d f | e g b >e< b g e g | f a >c f< c4 r4' },
    { wave: 'tri', vol: 0.30, mml: 'o3 l4 c g c g | d a d a | e b e b | f >c< g r' },
    { wave: 'drum', vol: 0.22, mml: 'l8 k h s h k h s h | k h s h k h s h | k h s h k h s h | k h s h k k s s' },
  ] },
  power: { bpm: 168, loop: true, tracks: [
    { wave: 'p12', vol: 0.15, mml: 'o6 l16 c e g e c e g e d f a f d f a f | e g b g e g b g f a >c< a g b >d< b' },
    { wave: 'tri', vol: 0.30, mml: 'o3 l8 c c g g c c g g | e e b b g g d d' },
    { wave: 'drum', vol: 0.22, mml: 'l8 k h k h s h k h | k h k h s h s s' },
  ] },
  // ジングル（繰り返さない）
  start: { bpm: 140, loop: false, tracks: [
    { wave: 'p25', vol: 0.22, mml: 'o5 l8 c e g >c4< r g >c2' },
    { wave: 'tri', vol: 0.3, mml: 'o3 l8 c4 e4 g4 r >c2' },
  ] },
  clear: { bpm: 150, loop: false, tracks: [
    { wave: 'p25', vol: 0.22, mml: 'o5 l8 g >c e g4 e g2' },
    { wave: 'p12', vol: 0.1, mml: 'o5 l8 e g >c e4 c e2' },
    { wave: 'tri', vol: 0.3, mml: 'o3 l4 c g >c2.' },
  ] },
  miss: { bpm: 120, loop: false, tracks: [
    { wave: 'p25', vol: 0.2, mml: 'o5 l8 e d- c < b- a2' },
    { wave: 'tri', vol: 0.3, mml: 'o3 l8 a g f e d2' },
  ] },
  gameover: { bpm: 90, loop: false, tracks: [
    { wave: 'p25', vol: 0.2, mml: 'o5 l4 a e c < a2 r4 a8 b8 >c2.' },
    { wave: 'tri', vol: 0.3, mml: 'o3 l4 a e c < a2 r4 f4 e2.' },
  ] },
  bonusEnd: { bpm: 150, loop: false, tracks: [
    { wave: 'p25', vol: 0.22, mml: 'o5 l8 e g >c e c4 g4 >c2' },
    { wave: 'tri', vol: 0.3, mml: 'o3 l4 c e g >c2' },
  ] },
  ending: { bpm: 104, loop: false, tracks: [
    { wave: 'p25', vol: 0.2, mml: 'o5 l8 c e g >c< b4 g4 | a4 f a g2 | e4 g >c e d4 c4 | < b > c d < b > c2 | c e g >c< b4 >d4 | c1' },
    { wave: 'p12', vol: 0.08, mml: 'o4 l4 e g e g | f a e g | c e g e | d f g f | e g g b | >c1' },
    { wave: 'tri', vol: 0.3, mml: 'o3 l4 c g c g | f >c< c g | a e a e | g d g d | c g g d | c1' },
  ] },
};

export const STAGE_SONG = { meadow: 'meadow', dusk: 'dusk', moon: 'moon' };

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** MML を [{ t（拍）, d（拍）, midi | drum }] と全長（拍）に変える */
export function parseMML(src, isDrum) {
  let o = 4, l = 4, t = 0;
  const out = [];
  const re = /\s*(?:\|)?\s*([a-gr]|[ksh]|o|l|<|>)([+#-]?)(\d*)(\.?)/gy;
  const s = src.replace(/\|/g, ' ');
  let m;
  re.lastIndex = 0;
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    re.lastIndex = i;
    m = re.exec(s);
    if (!m) throw new Error(`MML を読めない: "${s.slice(i, i + 12)}"`);
    i = re.lastIndex;
    const [, c, acc, num, dot] = m;
    if (c === 'o') { o = +num; continue; }
    if (c === 'l') { l = +num; continue; }
    if (c === '<') { o--; continue; }
    if (c === '>') { o++; continue; }
    let d = 4 / (num ? +num : l);
    if (dot) d *= 1.5;
    if (c === 'r') { t += d; continue; }
    if (isDrum) { if ('ksh'.includes(c)) out.push({ t, d, drum: c }); t += d; continue; }
    let n = NOTE[c] + (acc === '+' || acc === '#' ? 1 : acc === '-' ? -1 : 0);
    out.push({ t, d, midi: 12 * (o + 1) + n });
    t += d;
  }
  return { notes: out, length: t };
}
