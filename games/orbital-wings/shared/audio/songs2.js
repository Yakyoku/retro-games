// ORBITAL WINGS — モダン音源の曲（全 14 曲の再編曲）
// 旋律は songs.js（レトロ音源）の自作曲をそのまま活かし、前奏・展開部（ブレイク）・和音の層・分散和音・低音・打楽器とフィルを足した。
// すべてこの作品のための書き下ろしで、既存のゲームの曲（旋律）は使っていない。
//
// ■ 書き方
//   song({ id, tempo, key, loop, patches, sections, loopAt }) が、節（section）の並びからトラックごとの MML を組み立てる。
//   節 = { bars: [和音名...], lead: [小節ごとの旋律], ctr: [対旋律], pad, arp, bass, dr, fill, crash, riser, k（移調）... }
//     和音名: 'A' 'C#m' 'Bb' 'G7' 'Bm7' 'Cdim' 'Daug' 'Bsus4' 'D/F#'。'F|G' は 1 小節を半分ずつ
//     pad・arp・bass・打楽器は、和音名と型（下の ARP・BASS・DR）から自動で書き出す
//   トラック: lead ctr pad arp bass dk ds dh fx ＋ 動的な層 l1 l1d（強さ 1）l2（強さ 2）dg dgd（'danger' = 残機が最後）
//   記法は mml.js（songs.js の先頭の説明＋和音 {ceg}・定位 P・フィルター F）。

const NAMES = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];
const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], aug: [0, 4, 8],
  sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus4': [0, 5, 7, 10], 5: [0, 7, 12] };
const nn = (m) => `o${Math.floor(m / 12) - 1}${NAMES[m % 12]}`;
const pcOf = (s) => PCS[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0);
export function parseChord(sym) {
  const [main, bass] = sym.split('/');
  const m = /^([A-G][#b]?)(.*)$/.exec(main);
  if (!m || !QUAL[m[2]]) throw new Error(`和音名が読めない: ${sym}`);
  const root = (pcOf(m[1]) + 12) % 12;
  return { sym, root, ints: QUAL[m[2]], bass: bass ? (pcOf(bass) + 12) % 12 : root };
}
const halves = (bar) => { const p = bar.split('|').map(parseChord); return p.length > 1 ? p : [p[0], p[0]]; };
// center の近くに寄せた和音（声部があまり動かない）
function voicing(ch, center) {
  const lo = center - 6;
  return [...new Set(ch.ints.map((i) => lo + (((ch.root + i - lo) % 12) + 12) % 12))].sort((a, b) => a - b);
}
// 根音から積んだ和音（base 以上で最初の根音から）
function rootPos(ch, base) { const r = base + (((ch.root - base) % 12) + 12) % 12; return ch.ints.map((i) => r + i); }
const chordMml = (ms) => `{${ms.map(nn).join(' ')}}`;

// ---- 分散和音の型（半小節ぶんの音の番号。-1 は休み。len = 音の長さ）
const ARP = {
  up16: { len: 16, p: [0, 1, 2, 3, 2, 1, 2, 3] },
  wide16: { len: 16, p: [0, 2, 1, 3, 2, 4, 3, 2] },
  harp16: { len: 16, p: [0, 1, 2, 3, 0, 1, 2, 3], root: true },
  mech16: { len: 16, p: [0, 3, 2, 0, 0, 3, 2, 0], root: true },
  gate16: { len: 16, p: [0, -1, 0, 2, -1, 0, 1, -1] },
  cell16: { len: 16, p: [0, 2, 3, 0, 2, 3, 0, 2], p2: [3, 0, 2, 3, 0, 2, 3, 2], root: true },
  pulse8: { len: 8, p: [0, 2, 1, 2] },
  off8: { len: 8, p: [-1, 1, -1, 2] },
  trip: { len: 12, p: [0, 1, 2, 0, 1, 2] },
  stab: { chord: ['8.', '8.', '8'] },
  hit8: { chord: ['r8', '8', 'r8', '8'] },
  hold: { chord: ['2'] },
};
function arpHalf(ch, style, center, second) {
  const s = ARP[style];
  if (s.chord) { const c = chordMml(voicing(ch, center)); return s.chord.map((l) => (l[0] === 'r' ? l : c + l)).join(' '); }
  const t = s.root ? rootPos(ch, center - 7) : voicing(ch, center);
  const pat = second && s.p2 ? s.p2 : s.p;
  return `l${s.len} ` + pat.map((k) => (k < 0 ? 'r' : nn(t[k % t.length] + 12 * Math.floor(k / t.length)))).join(' ');
}
// ---- 低音の型（半小節ぶん。r=根音 R=オクターブ上 F=5 度 -=休み）
const BASS = {
  oct8: [['r', 8], ['R', 8], ['r', 8], ['R', 8]],
  r8: [['r', 8], ['r', 8], ['r', 8], ['r', 8]],
  r16: [['r', 16], ['r', 16], ['R', 16], ['r', 16], ['r', 16], ['r', 16], ['R', 16], ['r', 16]],
  gallop: [['r', 16], ['r', 16], ['R', 8], ['r', 16], ['r', 16], ['R', 8]],
  synco: [['r', '8.'], ['r', '8.'], ['R', 8]],
  pump: [['-', 8], ['r', 8], ['-', 8], ['r', 8]],
  hold: [['r', 2]],
  pulse: [['r', 8], ['R', 16], ['r', 16], ['r', 8], ['R', 16], ['r', 16]],
  beat: [['r', 8], ['R', 8], ['-', 4]],
  ruin: [['r', '4.'], ['r', 8]], ruin2: [['R', 8], ['r', 8], ['r', 4]],
  walk: [['r', 8], ['r', 8], ['F', 8], ['R', 8]],
  mech: [['r', 8], ['r', 8], ['R', 8], ['r', 8]],
};
function bassHalf(ch, style, second) {
  const pat = BASS[second && BASS[style + '2'] ? style + '2' : style];
  let r = 24 + ch.bass; if (r < 28) r += 12;
  return pat.map(([k, l]) => (k === '-' ? `r${l}` : nn(k === 'r' ? r : k === 'R' ? r + 12 : r + 7) + l)).join(' ');
}
// ---- 打楽器の型: [キック・タムの段, スネア・クラップの段, ハット・シンバルの段]、各 16 ステップ。大文字は強く
const DR = {
  none: ['................', '................', '................'],
  hat: ['................', '................', 'h.h.h.h.h.h.h.h.'],
  hat4: ['................', '................', 'h...h...h...h...'],
  kick4: ['k...k...k...k...', '................', 'h.h.h.h.h.h.h.h.'],
  rock: ['K.....k.K.......', '....S.......S...', 'h.h.h.h.h.h.h.h.'],
  rock2: ['K.....k.K..k....', '....S.......S..s', 'h.h.h.h.h.h.h.o.'],
  drive: ['K..k..k.K..k....', '....S.......S...', 'H.hhH.hhH.hhH.hh'],
  four: ['K...K...K...K...', '....S.......S...', 'h.o.h.o.h.o.h.o.'],
  fourc: ['K...K...K...K...', '....C.......C...', '..o...o...o...o.'],
  half: ['K.........k.....', '........S.......', 'h...h...h...h.h.'],
  halfr: ['K.........k.....', '........J.......', 'y...y...y...y.y.'],
  gallop: ['K.kkK.kkK.kkK.kk', '....S.......S...', 'h...h...h...h...'],
  march: ['K...k...K...k...', '..s.S.ss..s.S.ss', 'h...h...h...h...'],
  synco: ['K..k..k...k..k..', '....S.......S...', 'h.h.h.h.h.h.h.h.'],
  tribal: ['K..u..k.K..u..t.', '....J.......J...', 'h.h.h.h.h.h.h.h.'],
  beat5: ['Kk......Kk......', '....j.......j...', '......h.......hh'],
  mech: ['K.k.K.k.K.k.K.k.', '....S.......S...', 'hhhhhhhhhhhhhhhh'],
  blast: ['K.k.K.kkK.k.K.kk', '....S..s....S..s', 'h.h.h.h.h.h.h.h.'],
  build: ['K...K...K...K...', 's...s...s.s.s.s.', '................'],
  build2: ['K...K...K.K.K.K.', 's.s.s.s.ssssSSSS', '................'],
  fillA: ['K.....k.K.......', '....S.....s.ssss', 'h.h.h.h.h.h.....'],
  fillB: ['K.....k.K...ttuu', '....S.....ss....', 'h.h.h.h.h.......'],
  fillC: ['K..k..k.....tuuU', '....S...ssss....', 'h.h.h.h.........'],
  roll: ['K.......K.......', 's.sss.sss.ssssss', '................'],
  roll2: ['K...K...K...K.K.', 'ssssssssSsSsSSSS', '................'],
  end: ['K...............', '................', 'X...............'],
};
function drumRow(row) {
  let out = '', rest = 0;
  const flush = () => { while (rest > 0) { const n = rest >= 4 ? 4 : rest >= 2 ? 2 : 1; out += n === 4 ? 'r4 ' : n === 2 ? 'r8 ' : 'r16 '; rest -= n; } };
  for (const c of row) {
    if (c === '.') { rest++; continue; }
    flush();
    const lo = c.toLowerCase();
    out += `v${c === lo ? 11 : 15} ${lo}16 `;
  }
  flush();
  return out.trim();
}

const TRACKS = ['lead', 'ctr', 'pad', 'arp', 'bass', 'dk', 'ds', 'dh', 'fx', 'l1', 'l1d', 'l2', 'dg', 'dgd'];
const DRUM_T = { dk: 0, ds: 1, dh: 2 };
const REST = 'r1';

export const MSONGS = {};

function song(d) {
  const P = { lead: 'lead_saw', ctr: 'bell', pad: 'pad_warm', arp: 'pluck', bass: 'bass_fm', l1: 'arp_sq', l2: 'stab', dg: 'tension', ...(d.patches || {}) };
  const V = { lead: 14, ctr: 12, pad: 11, arp: 11, bass: 14, l1: 12, l2: 14, dg: 13, ...(d.vol || {}) };
  const out = {}; for (const t of TRACKS) out[t] = [];
  d.sections.forEach((s, si) => {
    const nb = s.bars.length, k = s.k || 0;
    const kk = (t) => (k || si > 0 ? `k${k} ` : '') + t;
    const bars = s.bars.map(halves);
    const perBar = (fn) => bars.map((h, i) => fn(h, i)).join(' | ');
    const mark = si === d.loopAt ? 'L ' : '';
    const push = (t, str) => out[t].push(mark + str);
    // 旋律と対旋律
    const mel = (list, head) => (list ? kk(head + ' ' + list.join(' | ')) : Array(nb).fill(REST).join(' | '));
    if (s.lead && s.lead.length !== nb) throw new Error(`${d.id} 節 ${si}: 旋律 ${s.lead.length} 小節 ≠ 和音 ${nb} 小節`);
    if (s.ctr && s.ctr.length !== nb) throw new Error(`${d.id} 節 ${si}: 対旋律 ${s.ctr.length} 小節 ≠ ${nb}`);
    push('lead', mel(s.lead, `@${s.leadPatch || P.lead} v${s.leadVol || V.lead} q${s.leadQ || 7} ${s.leadHead || d.leadHead || 'o5 l8'}`));
    push('ctr', mel(s.ctr, `@${s.ctrPatch || P.ctr} v${s.ctrVol || V.ctr} q8 ${s.ctrHead || d.ctrHead || 'o4 l2'}`));
    // 和音の層
    const padC = s.padCenter || d.padCenter || 62;
    push('pad', s.pad === false ? Array(nb).fill(REST).join(' | ')
      : kk(`@${s.padPatch || P.pad} v${s.padVol || V.pad} q8 ` + perBar((h) => (h[0] === h[1] ? chordMml(voicing(h[0], padC)) + '1' : chordMml(voicing(h[0], padC)) + '2 ' + chordMml(voicing(h[1], padC)) + '2'))));
    // 分散和音
    const arpC = s.arpCenter || d.arpCenter || 67;
    push('arp', !s.arp ? Array(nb).fill(REST).join(' | ')
      : kk(`@${s.arpPatch || P.arp} v${s.arpVol || V.arp} q${s.arpQ || 6} ` + perBar((h) => arpHalf(h[0], s.arp, arpC, false) + ' ' + arpHalf(h[1], s.arp, arpC, true))));
    // 低音
    push('bass', !s.bass ? Array(nb).fill(REST).join(' | ')
      : kk(`@${s.bassPatch || P.bass} v${V.bass} q${s.bassQ || 7} ` + perBar((h, i) => { const st = Array.isArray(s.bass) ? s.bass[i % s.bass.length] : s.bass; return bassHalf(h[0], st, false) + ' ' + bassHalf(h[1], st, true); })));
    // 打楽器
    const names = bars.map((_, i) => {
      let nm = Array.isArray(s.dr) ? s.dr[i % s.dr.length] : s.dr || 'none';
      if (s.fill && i === nb - 1) nm = s.fill;
      if (s.fill4 && i % 4 === 3 && i !== nb - 1) nm = s.fill4;
      return nm;
    });
    for (const t of ['dk', 'ds', 'dh']) {
      push(t, names.map((nm, i) => {
        if (!DR[nm]) throw new Error(`${d.id}: 打楽器の型 ${nm} がない`);
        let row = DR[nm][DRUM_T[t]];
        if (t === 'dh' && s.crash && i === 0) row = 'X' + row.slice(1);
        return drumRow(row);
      }).join(' | '));
    }
    // 効果（盛り上げのノイズ・下降のノイズ）
    push('fx', bars.map((_, i) => {
      if (s.riser && nb >= 2 && i === nb - 2) return '@riser v13 q8 o4 c1&';
      if (s.riser && nb >= 2 && i === nb - 1) return 'c1';
      if (s.riser && nb === 1) return '@riser v13 q8 o4 c1';
      if (s.sweep && i === 0) return '@sweep v12 q8 o5 c1';
      return REST;
    }).join(' | '));
    // 動的な層（ループする曲だけ鳴る。ふだんは消えている）
    const lay = d.loop && s.layers !== false;
    push('l1', !lay ? Array(nb).fill(REST).join(' | ') : kk(`@${P.l1} v${V.l1} q5 ` + perBar((h) => arpHalf(h[0], 'wide16', 76, false) + ' ' + arpHalf(h[1], 'wide16', 76, true))));
    push('l1d', !lay ? Array(nb).fill(REST).join(' | ') : bars.map(() => drumRow('y.y.y.y.y.y.y.yy')).join(' | '));
    push('l2', !lay ? Array(nb).fill(REST).join(' | ') : kk(`@${P.l2} v${V.l2} q5 ` + perBar((h) => arpHalf(h[0], 'hit8', 69, false) + ' ' + arpHalf(h[1], 'hit8', 69, true))));
    push('dg', !lay ? Array(nb).fill(REST).join(' | ') : kk(`@${P.dg} v${V.dg} q4 l8 ` + perBar((h) => [h[0], h[1]].map((c) => { const m = 72 + ((c.root + 7 - 72) % 12 + 12) % 12; const n = nn(m > 79 ? m - 12 : m); return `${n} ${n} ${n} ${n}`; }).join(' '))));
    push('dgd', !lay ? Array(nb).fill(REST).join(' | ') : bars.map(() => drumRow('U..u....U..u....')).join(' | '));
  });
  const tracks = {};
  const meta = { lead: {}, ctr: { pan: 0.25 }, pad: {}, arp: { pan: -0.3 }, bass: {}, dk: { drum: true }, ds: { drum: true }, dh: { drum: true }, fx: {},
    l1: { layer: 1, pan: 0.35, g: 1.3 }, l1d: { layer: 1, drum: true, g: 1.2 }, l2: { layer: 2, pan: -0.2, g: 1.4 }, dg: { layer: 'danger', pan: 0.15, g: 1.3 }, dgd: { layer: 'danger', drum: true, g: 1.3 } };
  for (const t of TRACKS) {
    if (!d.loop && meta[t].layer) continue;
    tracks[t] = { mml: out[t].join(' | ') + ' |', patch: P[t] || P.lead, ...meta[t], gain: ((d.gains && d.gains[t]) ?? 1) * (meta[t].g ?? 1) };
  }
  MSONGS[d.id] = { title: d.title, tempo: d.tempo, key: d.key, loop: !!d.loop, tracks, lead: d.lead || null, rush: d.rush, duck: d.duck, fx: d.fx, trim: d.trim ?? 0,
    chords: d.sections.map((s) => ({ bars: s.bars, k: s.k || 0 })) };
  if (d.trim) for (const t of Object.keys(tracks)) tracks[t].gain *= Math.pow(10, d.trim / 20);
}
const R = (n) => Array(n).fill('r1');

// ================================================================ title（D メジャー、140、1 回）
song({
  id: 'title', title: 'ORBITAL WINGS', tempo: 140, key: 'D', loop: false, trim: 0,
  patches: { lead: 'lead_saw', ctr: 'strings', arp: 'pluck', bass: 'bass_fm' },
  sections: [
    { bars: ['D', 'D', 'G', 'A', 'Bm', 'G', 'A', 'A7'], crash: true, sweep: true,
      lead: ['d4. e f+ a >d4<', '>c+4.< b a4 f+4', 'g4. a b4 >d4<', '>c+4.< b a4 e4', 'f+4. g a4 b4', '>d4. c+< b4 g4', 'a2 >c+2<', '>e2 d4 c+4<'],
      ctr: ['f+ a', 'f+ a', 'g b', 'e a', 'f+ d', 'g b', 'e a', 'g a'],
      arp: 'up16', bass: 'oct8', dr: ['rock', 'rock2'], fill: 'fillB' },
    { bars: ['D', 'D'], crash: true, lead: ['>d1<', 'r1'], ctr: ['f+1', 'r1'], arp: 'hold', bass: 'hold', dr: ['end', 'none'], padVol: 12 },
  ],
});

// ================================================================ start（開始のファンファーレ。C で書き、面の調とテンポに合わせて移調して面の曲へ切れ目なくつなぐ）
song({
  id: 'start', trim: -1.0, title: 'Launch', tempo: 160, key: 'C', loop: false,
  patches: { lead: 'brass', ctr: 'brass', pad: 'strings', arp: 'stab', bass: 'bass_saw' }, vol: { ctr: 11 },
  sections: [
    { bars: ['C', 'Ab|Bb'], crash: true,
      lead: ['g8 g16 g16 >c8 e8 g4. e8<', '>e-4 a-4 f4 b-4<'], ctr: ['e8 e16 e16 g8 >c8 e4. c8<', '>c4 e-4 d4 f4<'], ctrHead: 'o4 l8',
      arp: 'hit8', bass: ['oct8', 'r8'], dr: ['roll', 'roll2'], riser: true },
  ],
});

// ================================================================ stage1 火山（A メジャー、152）
song({
  id: 'stage1', title: 'Magma Run', tempo: 152, key: 'A', loop: true, loopAt: 1, lead: { song: 'start', transpose: -3, tempo: 152 },
  patches: { lead: 'lead_saw', ctr: 'organ', pad: 'pad_warm', arp: 'pluck', bass: 'bass_fm' },
  sections: [
    { bars: ['A', 'A', 'D', 'E'], crash: true, sweep: true, lead: ['r1', 'r1', 'r1', 'r2 <e16 f+16 g+16 a16 b16 >c+16 d16 e16'],
      arp: 'up16', bass: ['hold', 'hold', 'oct8', 'oct8'], dr: ['hat', 'kick4', 'kick4', 'build2'], layers: false },
    { bars: ['A', 'C#m', 'D', 'E', 'F#m', 'D', 'Bm', 'E'], crash: true,
      lead: ['a4 e8. a16 b >c+ d e<', '>e4 d c+< b4 g+4', 'f+4. d f+ a >d c+<', 'b2 r e f+ g+', 'a4. g+ f+ e c+ e', 'f+4 a4 >d4 c+ <b', 'b4. a f+ d f+ a', 'g+2. e16 f+16 g+16 b16'],
      ctr: ['c+ e', 'g+ e', 'f+ a', 'g+ b', 'a f+', 'f+ d', 'd f+', 'e g+'], arp: 'up16', bass: 'oct8', dr: ['rock', 'rock2'], fill: 'fillA' },
    { bars: ['A', 'C#m', 'D', 'E', 'F#m', 'D', 'E', 'A'], crash: true,
      lead: ['a4 e8. a16 b >c+ d e<', '>e4 d c+< b4 >c+4<', '>d4. c+< b a f+ a', 'g+4. f+ e4 g+4', 'a4. g+ a b >c+ e<', '>f+4. e d c+ d e<', '>e4 d c+< b4 >c+< b', 'a2. r4'],
      ctr: ['c+ e', 'g+ e', 'f+ a', 'g+ b', 'a f+', 'f+ d', 'g+ b', 'a e'], arp: 'wide16', bass: 'oct8', dr: ['drive', 'rock2'], fill: 'fillB' },
    { bars: ['D', 'E', 'C#m', 'F#m', 'Bm', 'C#m', 'D', 'E'], crash: true,
      lead: ['a2 f+4 a4', 'b2. g+4', '>c+4.< b g+4 e4', 'f+2. r f+16 a16', '>d2< b4 >d4<', '>c+2.< g+ >c+<', '>d4 e4 f+4 a4<', '>g+2.< r16 e16 f+16 g+16'],
      ctr: ['d f+ a f+', 'e g+ b g+', 'e g+ >c+< g+', 'f+ a >c+< a', 'f+ b >d< b', 'g+ >c+ e c+<', 'a f+ d f+', 'g+ b >e< b'], ctrHead: 'o4 l4',
      arp: 'stab', arpPatch: 'stab', bass: 'synco', dr: 'synco', fill: 'fillC', riser: true },
    // ブレイク（新規）: 打楽器を半分に落として和音と分散和音で一息つき、最後に盛り上げて頭へ戻る
    { bars: ['F#m', 'D', 'A', 'E', 'F#m', 'D', 'E', 'E'], crash: true, sweep: true, leadPatch: 'lead_soft', leadVol: 13,
      lead: ['c+2 a4 f+4', 'f+2. d4', 'e2 a4 e4', 'g+2. r4', 'a2 >c+4< a4', 'f+2 a4 >d4<', 'b2 g+4 b4', '>e2.< r4'],
      arp: 'up16', arpPatch: 'harp', bass: ['hold', 'hold', 'hold', 'hold', 'pump', 'pump', 'r8', 'r16'], dr: ['halfr', 'halfr', 'halfr', 'halfr', 'half', 'half', 'build', 'build2'], riser: true },
  ],
});

// ================================================================ stage2 遺跡（D マイナー、138）
song({
  id: 'stage2', title: 'Sunken Ruins', tempo: 138, key: 'Dm', loop: true, loopAt: 1, lead: { song: 'start', transpose: 2, tempo: 138 },
  patches: { lead: 'lead_sq', ctr: 'pad_choir', pad: 'pad_choir', arp: 'harp', bass: 'bass_sub' }, vol: { ctr: 13 }, fx: { t60: 2.2, damp: 0.3, rev: 1 },
  sections: [
    { bars: ['Dm', 'Dm', 'Dm', 'Dm'], sweep: true, arp: 'harp16', bass: ['hold', 'hold', 'ruin', 'ruin'], dr: ['none', 'none', 'hat4', 'hat'], layers: false },
    { bars: ['Dm', 'Dm', 'C', 'C', 'Bb', 'Bb', 'A', 'A'], crash: true,
      lead: ['a2. g f', 'e4. f d2', 'e2. d c', '<b4. >c <g2>', 'd2. c <b->', 'f4. g d2', 'e2 c+4 e4', 'a2 r4 a b'],
      ctr: ['f1', 'f1', 'e1', 'e1', 'd1', 'd1', 'c+1', 'e1'], arp: 'harp16', bass: 'ruin', dr: 'tribal', fill: 'fillB' },
    { bars: ['Dm', 'F', 'G', 'Dm', 'Gm', 'Bb', 'C', 'A'], crash: true,
      lead: ['>c4< a f a4 >d4<', '>c2.< a >c<', 'b4 g d g4 b4', 'a2. r4', 'b-4 g d g4 b-4', '>d2.< b- >d<', '>e4 d4 c4< b-4', '>c+2.< r4'],
      ctr: ['f a', 'a f', 'g b', 'f d', 'd g', 'f b-', 'g e', 'e c+'], arp: 'harp16', bass: 'ruin', dr: 'tribal', fill: 'fillA' },
    { bars: ['Bb', 'C', 'Dm', 'A'], crash: true,
      lead: ['f4 g4 a4 b-4', '>c4 d4 e4 g4<', '>f2 e4 d4<', '>c+2 e2<'], ctr: ['d1', 'e1', 'f a', 'e c+'], arp: 'wide16', bass: 'oct8', dr: 'rock', fill: 'fillC', riser: true },
    // ブレイク（新規）: 水底の静けさ。打楽器はリムだけ、ハープと合唱
    { bars: ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A7'], sweep: true, leadPatch: 'lead_soft', leadVol: 13,
      lead: ['d2 f4 a4', 'a2. g8 f8', 'f2 d4 f4', 'b-2. r4', 'g2 b-4 >d4<', '>d2. c8< b-8', 'a2 >c+4 e4<', '>e2.< r4'],
      arp: 'up16', bass: 'hold', dr: ['halfr', 'halfr', 'halfr', 'halfr', 'halfr', 'halfr', 'build', 'build2'], riser: true },
  ],
});

// ================================================================ stage3 巨大石像（C マイナー、160）
{
  const m = ['c2 g2', 'a-2. g8 f8', 'f2 d2', 'g1', '>c2< b-4 g4', 'a-2. >c4<', 'b-2 a-4 f4', 'g2 <b4 >d4',
    'e-2. c8 e-8', 'f2. d8 f8', 'g2 b-2', '>c1<', '>c2< a-4 f4', 'b-2 >d2<', '>e-2. d8 c8<', 'b2 >d2<',
    '>g2. f8 e-8<', '>d2 f2<', '>e-2. d8 c8<', 'b2 g2', '>c2. d8 e-8<', '>f2 d2<', '>e-2 c2<', 'd2 <b2>'];
  const ch = ['Cm', 'Ab', 'Bb', 'Gm', 'Cm', 'Ab', 'Fm', 'G', 'Ab', 'Bb', 'Gm', 'Cm', 'Fm', 'Bb', 'Eb', 'G', 'Cm', 'Bb', 'Ab', 'G', 'Cm', 'Bb', 'Ab', 'G'];
  // 旋律の 4 度下（G の小節は 1 オクターブ下）を重ねて、古い聖歌のような厳かさを出す
  const low = (a, b) => m.slice(a, b).map((s, i) => `${ch[a + i] === 'G' ? 'k-12' : 'k-5'} ${s}`);
  const D = ['e-2 c4 e-4', 'f2 d4 f4', 'g2. e-8 d8', 'c1', 'a-2 >c4< a-4', 'b-2 >d4< b-4', 'b2 >d2<', '>g2.< r4'];
  song({
    id: 'stage3', title: 'Colossus', tempo: 160, key: 'Cm', loop: true, loopAt: 1, lead: { song: 'start', transpose: 0, tempo: 160 }, leadHead: 'o5 l4', ctrHead: 'o5 l4',
    patches: { lead: 'brass', ctr: 'pad_choir', pad: 'strings', arp: 'bell', bass: 'bass_saw' }, vol: { ctr: 12, arp: 10 }, gains: { dk: 0.85 }, fx: { t60: 2.0, damp: 0.3, rev: 1 },
    sections: [
      { bars: ['Cm', 'Cm', 'Cm', 'G'], crash: true, sweep: true, bass: ['hold', 'hold', 'gallop', 'gallop'], dr: ['beat5', 'beat5', 'march', 'roll2'], layers: false },
      { bars: ch.slice(0, 8), crash: true, lead: m.slice(0, 8), ctr: low(0, 8), arp: 'trip', bass: 'gallop', dr: 'gallop', fill: 'fillB' },
      { bars: ch.slice(8, 16), crash: true, lead: m.slice(8, 16), ctr: low(8, 16), arp: 'trip', bass: 'gallop', dr: ['march', 'gallop'], fill: 'fillA' },
      { bars: ch.slice(16, 24), crash: true, lead: m.slice(16, 24), ctr: low(16, 24), arp: 'trip', bass: 'gallop', dr: 'gallop', fill: 'fillC', riser: true },
      // ブレイク（新規）: 金管の合奏と合唱。打楽器は行進
      { bars: ['Ab', 'Bb', 'Cm', 'Cm', 'Ab', 'Bb', 'G', 'G'], crash: true, sweep: true, lead: D, ctr: D.map((s, i) => `${i >= 6 ? 'k-12' : 'k-5'} ${s}`), leadVol: 13,
        arp: 'trip', bass: ['hold', 'hold', 'hold', 'hold', 'walk', 'walk', 'r8', 'r16'], dr: ['beat5', 'beat5', 'beat5', 'beat5', 'march', 'march', 'march', 'roll2'], riser: true },
    ],
  });
}

// ================================================================ stage4 地形の難所（F♯ マイナー、146、3+3+2）
song({
  id: 'stage4', title: 'Gauntlet', tempo: 146, key: 'F#m', loop: true, loopAt: 1, lead: { song: 'start', transpose: 6, tempo: 146 }, leadHead: 'o5 l16',
  patches: { lead: 'lead_fm', ctr: 'strings', pad: 'pad_warm', arp: 'stab', bass: 'bass_pulse' }, vol: { arp: 11 },
  sections: [
    { bars: ['F#m', 'F#m', 'F#m', 'F#m'], sweep: true, arp: 'stab', bass: ['hold', 'hold', 'synco', 'synco'], dr: ['hat', 'hat', 'synco', 'fillC'], layers: false },
    { bars: ['F#m', 'F#m', 'D', 'E', 'F#m', 'F#m', 'Bm', 'C#'], crash: true,
      lead: ['f+8 r f+ a8 f+8 r >c+8. <b8 a8', 'g+8 a8 r g+ f+8 e4 r8 c+8', 'f+8 r f+ a8 f+8 r >d8. c+8 <a8', 'b8 g+8 r e g+8 b4 r8 >c+8<',
        '>c+8 r c+ e8 c+8 r <a8. b8 >c+8<', 'a8 g+8 r f+ e8 f+4 r8 c+8', 'd8 f+8 b8 >d8 c+8 <b8 a8 f+8', 'e+4. g+8 >c+4 <b8 g+8'],
      ctr: ['c+1', 'c+ d', 'd f+', 'e g+', 'a1', 'a g+', 'f+1', 'e+1'], arp: 'stab', bass: 'synco', dr: 'synco', fill: 'fillA' },
    { bars: ['D', 'E', 'F#m', 'F#m', 'D', 'E', 'C#7', 'C#7'], crash: true,
      lead: ['a4. f+8 a8 >d4< c+8', 'b4. g+8 b8 >e4 d8<', '>c+2^8 <b8 a8 g+8', 'a2 f+4 e8 f+8', 'a4. f+8 a8 >d4 e8<', '>f+4. e8 d8 c+4 <b8', '>c+4 <b8 g+8 e+4 g+8 b8', '>c+2 r4< g+8 >c+8<'],
      ctr: ['f+1', 'g+1', 'a g+', 'f+ e', 'f+1', 'g+1', 'e+1', 'g+1'], arp: 'gate16', arpPatch: 'pluck', bass: 'synco', dr: 'drive', fill: 'fillB' },
    { bars: ['Bm', 'C#m', 'D', 'E', 'Bm', 'C#', 'F#m', 'C#'], crash: true,
      lead: ['b8 r b >d8 <b8 a8 f+8 a8 b8', '>c+8 r c+ e8 c+8< b8 g+8 b8 >c+8<', '>d8 r d f+8 d8 c+8 <a8 >c+8 d8<', '>e8 r e g+8 e8 d8 <b8 >d8 e8<',
        '>f+4. e8 d4 c+8 <b8', '>c+4. <b8 g+4 e+4', 'f+8 r f+ a8 >c+8 r f+8. e8 c+8<', 'e+4 g+4 >c+4 <g+4'],
      ctr: ['f+ d', 'e g+', 'a f+', 'g+ b', 'f+ d', 'e+ g+', 'a c+', '<b >e+'], arp: 'stab', bass: 'synco', dr: 'synco', fill: 'fillC', riser: true },
    // ブレイク（新規）: 3+3+2 の刻みを和音だけに残し、旋律は伸びやかに
    { bars: ['D', 'E', 'F#m', 'F#m', 'D', 'E', 'C#', 'C#'], crash: true, sweep: true, leadPatch: 'lead_soft', leadVol: 13,
      lead: ['a4. f+8 a4 >d4<', 'b4. g+8 b4 >e4<', '>c+2.< a8 >c+8<', 'a2. r4', '>d4. c+8< a4 f+4', '>e4. d8< b4 g+4', 'e+2 g+2', '>c+2.< r4'],
      arp: 'gate16', arpPatch: 'pluck', bass: ['hold', 'hold', 'hold', 'hold', 'pump', 'pump', 'synco', 'r16'], dr: ['half', 'half', 'half', 'half', 'four', 'four', 'build', 'build2'], riser: true },
  ],
});

// ================================================================ stage5 生体要塞（B♭ マイナー、132、半音階）
{
  const ch = ['Bbm', 'F/A', 'Bbm7/Ab', 'Gdim', 'Gb', 'F', 'Bbm', 'F', 'Ebm', 'Daug', 'Db', 'Cdim', 'B', 'Bbm', 'Gb', 'F', 'Bbm', 'B', 'Bbm', 'Adim'];
  const drip = [['f', 'f'], ['e', 'c'], ['f', 'd-'], ['e', 'd-'], ['d-', 'g-'], ['c', 'a'], ['d-', 'f'], ['c', 'e'], ['g-', 'b-'], ['f+', 'a'], ['f', 'a-'], ['g-', 'e-'],
    ['f+', 'd+'], ['f', 'd-'], ['g-', 'd-'], ['a', 'c'], ['f', 'd-'], ['f+', 'd+'], ['f', 'e'], ['e-', 'c']].map(([a, b]) => `o6 r4 ${a} r r4 ${b} r`);
  const m = ['f2 g-4 f4', 'e2. r4', 'f4 a-4 d-4 c4', 'd-2. c <b>', '<b-2 >d-2', 'c2. <a b>', 'c4 d-4 <b4 b-4>', '<a2. r4>',
    'g-2 b-4 a4', 'a2. f+4', 'a-2 f4 a-4', 'g-2. e-4', 'f+2 d+4 f+4', 'f2. d-4', 'd-4 e-4 g-4 b-4', 'a1',
    'b-2 a2', 'b2 a+2', 'b-4 a4 a-4 g4', 'e-2 <a2>'];
  song({
    id: 'stage5', trim: 0.5, title: 'Biomass', tempo: 132, key: 'Bbm', loop: true, loopAt: 1, lead: { song: 'start', transpose: -2, tempo: 132 }, ctrHead: 'l8',
    patches: { lead: 'eerie', ctr: 'bell', pad: 'pad_glass', arp: 'arp_sq', bass: 'bass_saw' }, vol: { ctr: 12, arp: 11 }, fx: { t60: 2.4, damp: 0.25, rev: 1 },
    sections: [
      { bars: ['Bbm', 'Bbm', 'Bbm', 'Bbm'], sweep: true, bass: ['hold', 'hold', 'beat', 'beat'], dr: ['none', 'beat5', 'beat5', 'beat5'], layers: false },
      { bars: ch.slice(0, 8), lead: m.slice(0, 8), ctr: drip.slice(0, 8), arp: 'off8', bass: 'beat', dr: 'beat5', fill: 'fillB' },
      { bars: ch.slice(8, 16), crash: true, lead: m.slice(8, 16), ctr: drip.slice(8, 16), arp: 'gate16', bass: 'beat', dr: ['beat5', 'tribal'], fill: 'fillA' },
      { bars: ch.slice(16, 20), crash: true, lead: m.slice(16, 20), ctr: drip.slice(16, 20), arp: 'gate16', bass: 'pulse', dr: 'tribal', fill: 'fillC', riser: true },
      // ブレイク（新規）: 脈だけが残る
      { bars: ['Bbm', 'Bbm', 'Gb', 'Gb', 'Ebm', 'Ebm', 'F', 'F'], sweep: true, leadVol: 13,
        lead: ['d-2 f2', 'b-2. a-8 f8', 'g-2 b-2', '>d-2.< r4', 'e-2 g-2', 'b-2. >c8 d-8<', '>c2< a2', 'f1'],
        arp: 'off8', arpPatch: 'bell', bass: ['hold', 'hold', 'hold', 'hold', 'beat', 'beat', 'pulse', 'pulse'], dr: ['none', 'none', 'hat4', 'hat4', 'beat5', 'beat5', 'build', 'build2'], riser: true },
    ],
  });
}

// ================================================================ stage6 細胞空間（E マイナー、128、3 対 4）
{
  const ch = ['Em', 'Em', 'C', 'C', 'Am', 'Am', 'B7sus4', 'B', 'G', 'D/F#', 'Em', 'C', 'Am', 'Bm', 'C', 'D', 'Em', 'Em', 'C', 'C', 'Am', 'B', 'C', 'B'];
  const bell = { Em: 'g b', C: 'e g', Am: 'e a', B7sus4: 'e f+', B: 'd+ f+', G: 'd g', 'D/F#': 'd f+', Bm: 'd f+', D: 'd a' };
  const m = ['e b2 a', 'g f+2 g', 'e b2 a', 'g2. r', 'a >e2 d<', '>c <b2 a', 'b2 a2', '>d+1<',
    '>d4. <b8 g2', 'a4. f+8 d2', 'g4. b8 >e2<', '>e d c <b', '>c2 <a2', 'b2 f+2', 'g a b >c<', '>d2. <a',
    'b2. >c8 <b8', 'g1', 'e2. f+8 g8', 'g2 e2', 'a2. b8 >c8<', 'b1', '>c2 e2<', 'd+2 f+2'];
  song({
    id: 'stage6', title: 'Cell Space', tempo: 128, key: 'Em', loop: true, loopAt: 1, lead: { song: 'start', transpose: 4, tempo: 128 }, leadHead: 'o5 l4', ctrHead: 'o5 l2',
    patches: { lead: 'lead_sq', ctr: 'bell', pad: 'pad_glass', arp: 'pluck', bass: 'bass_pulse' }, vol: { ctr: 12 }, fx: { t60: 1.9, damp: 0.3, dlyBeats: 0.75, dly: 0.9 },
    sections: [
      { bars: ['Em', 'Em', 'Em', 'Em'], sweep: true, arp: 'cell16', bass: ['hold', 'hold', 'pulse', 'pulse'], dr: ['none', 'hat4', 'kick4', 'build'], layers: false },
      { bars: ch.slice(0, 8), crash: true, lead: m.slice(0, 8), ctr: ch.slice(0, 8).map((c) => bell[c]), arp: 'cell16', bass: 'pulse', dr: 'fourc', fill: 'fillA' },
      { bars: ch.slice(8, 16), crash: true, lead: m.slice(8, 16), ctr: ch.slice(8, 16).map((c) => bell[c]), arp: 'cell16', bass: 'pulse', dr: 'four', fill: 'fillB' },
      { bars: ch.slice(16, 24), crash: true, lead: m.slice(16, 24), ctr: ch.slice(16, 24).map((c) => bell[c]), arp: 'cell16', bass: 'pulse', dr: 'fourc', fill: 'fillC', riser: true },
      // ブレイク（新規）: キックを抜いて漂う
      { bars: ['C', 'D', 'Em', 'Em', 'C', 'D', 'B', 'B'], sweep: true, leadPatch: 'lead_soft', leadVol: 13,
        lead: ['e2 g2', 'f+2 a2', 'g2. b4', 'e1', 'g2 >c2<', 'a2 >d2<', 'b2 >d+2<', '>f+2.< r4'],
        arp: 'cell16', arpPatch: 'harp', bass: ['hold', 'hold', 'hold', 'hold', 'pump', 'pump', 'pulse', 'r16'], dr: ['hat4', 'hat4', 'halfr', 'halfr', 'kick4', 'kick4', 'build', 'build2'], riser: true },
    ],
  });
}

// ================================================================ stage7 機械要塞（G マイナー、168）
{
  const A = ['g8 d8 g8 a8 b-8. a16 g8 b-8', '>d4 c8 <b-8 a4 g8 a8', 'b-8 g8 b-8 >c8 d8. c16 <b-8 >e-8<', '>d4 c8 <a8 f4 a8 >c8<',
    '>d8 <b-8 >d8 e-8 f8. e-16 d8 f8<', '>g4 f8 d8 e-4 d8 c8<'];
  const m = [...A, 'b-8 >c8 d8 e-8 d8 c8 <b-8 g8', 'f+2 a4 >c4<',
    '>c16 <b-16 >c16 d16 e-8 c8 <g8 >c8 e-8 g8<', '>f4 e-8 d8 e-4 c4<', 'b-16 a16 b-16 >c16 d8 <b-8 g8 b-8 >d8 g8<', '>f4 e-8 d8 d2<',
    '>c4 e-4 a-4. g8<', '>f4 d4 <b-4. >d8<', '>e-4 g4 c4 e-4<', '>d2 <a4 f+4',
    ...A, 'b-8 >c8 d8 e-8 f8 e-8 d8 c8<', '>d2. r4<',
    'g8 b-8 >e-8 <b-8 g8 b-8 >e-8 g8<', 'a8 >c8 f8 c8 <a8 >c8 f8 a8<', '>b-4 a8 g8 f4 d4<', '>g2 d2<',
    'g8 b-8 >e-8 <b-8 g8 b-8 >e-8 g8<', 'a8 >c8 f8 c8 <a8 >c8 f8 a8<', '>f+4 a4 f+4 d4<', '>c4 <a4 f+4 d4'];
  const ch = ['Gm', 'Gm', 'Eb', 'F', 'Gm', 'Gm', 'Eb', 'D', 'Cm', 'Cm', 'Gm', 'Gm', 'Ab', 'Bb', 'Cm', 'D',
    'Gm', 'Gm', 'Eb', 'F', 'Gm', 'Gm', 'Eb', 'D', 'Eb', 'F', 'Gm', 'Gm', 'Eb', 'F', 'D', 'D'];
  const W = { Gm: 'b- >d<', Eb: 'g b-', F: 'a >c<', D: 'f+ a', Cm: 'e- g', Ab: 'e- a-', Bb: 'f b-' };
  const sec = (a, b, o) => ({ bars: ch.slice(a, b), crash: true, lead: m.slice(a, b), ctr: ch.slice(a, b).map((c) => W[c]), arp: 'mech16', bass: 'mech', ...o });
  song({
    id: 'stage7', trim: -1.6, title: 'Iron Citadel', tempo: 168, key: 'Gm', loop: true, loopAt: 1, lead: { song: 'start', transpose: -5, tempo: 168 }, leadHead: 'o5', arpCenter: 67,
    patches: { lead: 'lead_saw', ctr: 'strings', pad: 'pad_warm', arp: 'arp_sq', bass: 'bass_fm' }, vol: { arp: 11, lead: 15 },
    sections: [
      { bars: ['Gm', 'Gm', 'Gm', 'Gm'], sweep: true, arp: 'mech16', bass: ['hold', 'hold', 'mech', 'mech'], dr: ['hat', 'kick4', 'mech', 'roll2'], layers: false },
      sec(0, 8, { dr: 'mech', fill: 'fillA' }),
      sec(8, 16, { dr: 'blast', fill: 'fillB' }),
      sec(16, 24, { dr: 'mech', fill: 'fillA' }),
      sec(24, 32, { dr: 'blast', fill: 'fillC', riser: true }),
      // ブレイク（新規）: 機械が息をつく 8 小節。半分の速さの打楽器から 16 分の連打へ
      { bars: ['Eb', 'F', 'Gm', 'Gm', 'Eb', 'F', 'D', 'D'], crash: true, sweep: true, leadPatch: 'ssaw', leadVol: 13,
        lead: ['g4 b-4 >e-4 d4<', 'a4 >c4 f4 e-4<', '>d2. c8< b-8', 'g2. r4', 'b-4 >e-4 g4 f4<', '>c4 f4 a4 g4<', '>f+2 d2<', '>d4< a4 f+4 d4'],
        arp: 'gate16', bass: ['hold', 'hold', 'hold', 'hold', 'pump', 'pump', 'r16', 'r16'], dr: ['half', 'half', 'half', 'half', 'four', 'four', 'build', 'build2'], riser: true },
    ],
  });
}

// ================================================================ boss（C♯ マイナー、170。後半は短 3 度上の E マイナーへ転調）
{
  const riff = ['c+8 c+ c+ e8 c+ c+ g+8 c+ c+ e8 d+8', 'c+8 c+ c+ e8 c+ c+ >c+8< b a g+8 e8', 'a8 a a >c+8< a a >e8< a a >c+8< b8', 'b8 b b >d+8< b b >f+8 e d+ c+8 <b8',
    '>e4 d+8 c+8 d+4 <b8 g+8', '>c+4 <b8 a8 g+4 e8 g+8', 'a4 >d8 c+8 d4 f+8 a8<', '>g+8 f+ e d+8 c+8 <b+8 >d+8 g+8 f+8<'];
  const ch = ['C#m', 'C#m', 'A', 'B', 'C#m', 'C#m', 'D', 'G#7'];
  const ctr = ['e d+', 'e f+', 'e c+', 'd+ f+', 'g+ a', 'g+ e', 'f+ a', 'g+ >c<'];
  song({
    id: 'boss', trim: -2.4, title: 'Core Alert', tempo: 170, key: 'C#m', loop: true, loopAt: 1, leadHead: 'o5 l16', rush: 1.05, duck: 0.36,
    patches: { lead: 'lead_fm', ctr: 'strings', pad: 'strings', arp: 'pluck', bass: 'bass_saw' }, vol: { arp: 12 }, gains: { bass: 1.35 },
    sections: [
      { bars: ['C#m', 'G#7'], crash: true, arp: 'gate16', bass: 'r16', dr: ['blast', 'roll2'], riser: true, layers: false },
      { bars: ch, crash: true, lead: riff, ctr, arp: 'gate16', bass: 'r16', dr: 'blast', fill: 'fillC' },
      { bars: ch, k: 3, crash: true, lead: riff, ctr, leadPatch: 'ssaw', arp: 'mech16', arpPatch: 'arp_sq', bass: 'r16', dr: 'mech', fill: 'fillB' },
      // 戻りのリフ（新規）: 全員で同じ刻み
      { bars: ['C#m', 'C#m', 'A', 'G#7'], crash: true,
        lead: ['c+8 c+ c+ e8 c+ c+ g+8 c+ c+ f+8 e8', 'c+8 c+ c+ e8 c+ c+ a8 g+ f+ e8 d+8', 'a8 a a >c+8< a a >e8 d+ c+ <b8 a8', 'g+8 g+ g+ b+8 g+ g+ >d+8 f+8 g+4<'],
        arp: 'stab', arpPatch: 'stab', bass: 'gallop', dr: ['gallop', 'gallop', 'gallop', 'roll2'], riser: true },
    ],
  });
}

// ================================================================ final 最後の敵（F マイナー、156。後半は全音上の G マイナーへ転調）
{
  const m = ['f4 c4 f4 a-4', 'a-4. g f4 d-4', 'b-4. a- f4 b-4', '>c2< b2', '>c4 <a- f >c4 f4<', '>e-4. d- c4 <a-4', 'b-4. a- g4 e-4', 'e2 g2',
    'a-4. g f4 a-4', 'b-4. a- g4 b-4', '>c4. d e-4 g4<', '>f2 c2<', '>d-4. c <b-4 f4', '>e-4. d- <b-4 g-4', 'a-4. g- f4 d-4', '>c4 <b-4 g4 e4'];
  const ch = ['Fm', 'Db', 'Bbm', 'C', 'Fm', 'Db', 'Eb', 'C', 'Db', 'Eb', 'Cm', 'Fm', 'Bbm', 'Gb', 'Db', 'C'];
  const W = { Fm: 'a- >c<', Db: 'a- f', Bbm: 'f d-', C: 'e g', Eb: 'g b-', Cm: 'g e-', Gb: 'g- b-' };
  const w = (a, b) => ch.slice(a, b).map((c) => W[c]);
  song({
    id: 'final', trim: -1.2, title: 'Last Signal', tempo: 156, key: 'Fm', loop: true, loopAt: 1, rush: 1.05, duck: 0.36,
    patches: { lead: 'brass', ctr: 'pad_choir', pad: 'strings', arp: 'pluck', bass: 'bass_fm' }, vol: { arp: 12, lead: 15 }, fx: { t60: 1.9, damp: 0.3 },
    sections: [
      { bars: ['Fm', 'C'], crash: true, bass: 'r16', dr: ['roll', 'roll2'], riser: true, layers: false },
      { bars: ch.slice(0, 8), crash: true, lead: m.slice(0, 8), ctr: w(0, 8), arp: 'wide16', bass: 'mech', dr: 'blast', fill: 'fillA' },
      { bars: ch.slice(8, 16), crash: true, lead: m.slice(8, 16), ctr: w(8, 16), arp: 'up16', bass: 'r16', dr: 'drive', fill: 'fillC' },
      { bars: ch.slice(0, 8), k: 2, crash: true, lead: m.slice(0, 8), ctr: w(0, 8), leadPatch: 'ssaw', arp: 'wide16', bass: 'mech', dr: 'mech', fill: 'fillB' },
      // 戻り（新規）: 金管の下降で F マイナーへ帰る
      { bars: ['Db', 'Eb', 'C', 'C'], crash: true, lead: ['a-4. f a-4 >d-4<', 'b-4. g b-4 >e-4<', '>e2 c4< g4', '>c2.< r4'], arp: 'stab', arpPatch: 'stab', bass: 'gallop', dr: ['gallop', 'gallop', 'march', 'roll2'], riser: true },
    ],
  });
}

// ================================================================ clear 面クリア（G メジャー、144）
song({
  id: 'clear', title: 'Sector Clear', tempo: 144, key: 'G', loop: false,
  patches: { lead: 'lead_saw', ctr: 'brass', pad: 'strings', arp: 'pluck', bass: 'bass_fm' }, vol: { ctr: 11 },
  sections: [
    { bars: ['G', 'C|D'], crash: true, lead: ['g b >d g f+ d e f+<', '>e4 g e f+4 a f+<'], ctr: ['d g b >d d <b >c d<', '>c4 e c d4 f+ d<'], ctrHead: 'o5 l8',
      arp: 'up16', bass: 'oct8', dr: ['rock', 'fillB'] },
    { bars: ['G', 'G'], crash: true, lead: ['>g2.< r4', 'r1'], ctr: ['>d2.< r4', 'r1'], ctrHead: 'o5 l8', arp: 'hold', bass: 'hold', dr: ['end', 'none'] },
  ],
});

// ================================================================ gameover（A マイナー、138）
song({
  id: 'gameover', trim: 2.6, title: 'Signal Lost', tempo: 138, key: 'Am', loop: false, fx: { t60: 2.6, damp: 0.3, rev: 1 },
  patches: { lead: 'lead_soft', ctr: 'pad_choir', pad: 'pad_warm', arp: 'harp', bass: 'bass_sub' },
  sections: [
    { bars: ['Am', 'F|E', 'Am', 'Am'], sweep: true, lead: ['e4. d c4 e4', 'd4. c <b4 g+4>', '<a1>', 'r1'], ctr: ['>c4.< b a4 >c4<', 'a4. a g+4 e4', 'e1', 'r1'], ctrHead: 'o4 l8',
      arp: 'pulse8', bass: 'hold', dr: ['none', 'none', 'none', 'none'], arpVol: 8 },
  ],
});

// ================================================================ ending 全面クリア（C メジャー、144、約 32 秒で止まる）
song({
  id: 'ending', title: 'Homeward', tempo: 144, key: 'C', loop: false, fx: { t60: 2.0, damp: 0.3, rev: 1 },
  patches: { lead: 'lead_saw', ctr: 'strings', pad: 'pad_warm', arp: 'harp', bass: 'bass_fm' },
  sections: [
    { bars: ['C', 'G/B', 'Am', 'Em/G', 'F', 'C/E', 'Dm', 'G'], sweep: true, leadPatch: 'lead_soft',
      lead: ['g4 e4 >c4.< b', '>d4 <b4 g4. a', '>c4 <a4 e4. g', 'b2 g4 r4', 'a4 f4 >c4. d<', '>e4 c4 <g4. a', 'f4 a4 >d4. c<', 'b2. r4'],
      ctr: ['e g', 'd g', 'c e', '<b> e', 'c a', 'c g', 'd f', 'd g'], arp: 'up16', bass: 'ruin', dr: ['halfr', 'halfr', 'halfr', 'halfr', 'half', 'half', 'half', 'fillA'] },
    { bars: ['C', 'E7', 'Am', 'C7', 'F', 'G', 'Em', 'Am', 'Dm7|G7'], crash: true,
      lead: ['>c4 <g4 e4 g4', 'g+4 b4 >d4 e4<', '>c2 <a4 >c4<', 'b-2 g4 e4', 'a4. g f4 a4', 'b4. a g4 b4', '>e4 d c <b4 g4', 'a4 >c4 e4 a4<', '>g4 f4 d4< b4'],
      ctr: ['e g', 'd g+', 'c e', 'e b-', 'c a', 'd g', 'e g', 'e a', 'f f'], arp: 'wide16', arpPatch: 'pluck', bass: 'oct8', dr: ['rock', 'rock2'], fill: 'fillB', riser: true },
    { bars: ['C', 'C'], crash: true, lead: ['>c1<', 'r1'], ctr: ['e1', 'r1'], arp: 'hold', bass: 'hold', dr: ['end', 'none'], padVol: 12 },
  ],
});

export const MSONG_IDS = Object.keys(MSONGS);
