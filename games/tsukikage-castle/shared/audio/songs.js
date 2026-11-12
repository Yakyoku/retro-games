// 月影の魔城 — 曲。旋律・和音進行・リズム型はすべてこの作品のために新しく書いた（既存曲の引用・採譜ではない）。
// 1980 年代中盤のアーケード作品の作曲上の雰囲気（短調・速いテンポ・跳ねるベース・矩形波の旋律・金管の刺し）を目指した。
// 割り当て: FM 0 ベース / FM 1・2 和音 / FM 3 対旋律・重ね / PSG 0 旋律 / PSG 1 分散和音 / PCM 0 太鼓 / PCM 1 打楽器
import { compileSong } from './mml.js';
import { P } from './patches.js';

const NN = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];
const n = (m, l = '') => (m == null ? `r${l}` : `o${Math.floor(m / 12) - 1}${NN[((m % 12) + 12) % 12]}${l}`);
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function chord(name) {
  const m = /^([A-G](?:#|b)?)(m7|m|7|dim|sus)?$/.exec(name);
  if (!m) throw new Error('chord ' + name);
  const root = PC[m[1]], q = m[2] || '';
  const iv = q === 'm' ? [0, 3, 7] : q === '7' ? [0, 4, 10] : q === 'm7' ? [0, 3, 10] : q === 'dim' ? [0, 3, 6] : q === 'sus' ? [0, 5, 7] : [0, 4, 7];
  let bass = 36 + root; if (bass > 43) bass -= 12;
  const v = iv.map((i) => { let p = 60 + root + i; while (p > 69) p -= 12; while (p < 56) p += 12; return p; }).sort((a, b) => a - b);
  return { bass, v, arp: [v[0], v[1], v[2], v[0] + 12] };
}
const prog = (s) => s.trim().split(/\s+/).map(chord);
const rep = (s, k) => Array(k).fill(s).join(' ');

const BASS = {
  drive: (c) => { const r = c.bass; return [r, r, r + 12, r, r, r + 12, r + 7, r + 12].map((m) => n(m, 8)).join(' '); },
  gallop: (c) => { const r = c.bass; return `${n(r, 8)} ${n(r, 16)} ${n(r, 16)} ${n(r + 12, 8)} ${n(r, 16)} ${n(r, 16)} ${n(r, 8)} ${n(r + 7, 8)} ${n(r + 12, 8)} ${n(r + 10, 8)}`; },
  march: (c) => { const r = c.bass; return `${n(r, 4)} ${n(r + 7, 4)} ${n(r, 4)} ${n(r + 7, 8)} ${n(r + 5, 8)}`; },
  walk: (c) => { const r = c.bass; return `${n(r, 4)} ${n(r + 12, 8)} ${n(r, 8)} ${n(r + 7, 4)} ${n(r + 3, 8)} ${n(r + 5, 8)}`; },
  pulse: (c) => { const r = c.bass; return rep(`${n(r, 8)} ${n(r + 12, 8)}`, 4); },
  long: (c) => `${n(c.bass, 2)} ${n(c.bass + 7, 2)}`,
  half: (c) => `${n(c.bass, 2)} ${n(c.bass, 4)} ${n(c.bass + 12, 4)}`,
};
const STAB = {
  off: (c, i) => `r8 ${n(c.v[i], 8)} r8 ${n(c.v[i], 8)} r8 ${n(c.v[i], 8)} r8 ${n(c.v[i], 8)}`,
  push: (c, i) => `${n(c.v[i], 8)} r8 r8 ${n(c.v[i], 8)} r8 ${n(c.v[i], 8)} ${n(c.v[i], 4)}`,
  long: (c, i) => n(c.v[i], 1),
  half: (c, i) => `${n(c.v[i], 2)} ${n(c.v[i], 2)}`,
  hit: (c, i) => `${n(c.v[i], 4)} r2.`,
};
const ARP = {
  up16: (c) => Array.from({ length: 16 }, (_, k) => n(c.arp[k % 4] + 12, 16)).join(' '),
  wave16: (c) => { const o = [0, 1, 2, 3, 2, 1]; return Array.from({ length: 16 }, (_, k) => n(c.arp[o[k % 6]] + 12, 16)).join(' '); },
  eighth: (c) => Array.from({ length: 8 }, (_, k) => n(c.arp[k % 4] + 12, 8)).join(' '),
  drip: (c) => `${n(c.arp[3] + 12, 8)} r8 ${n(c.arp[1] + 12, 8)} r8 r8 ${n(c.arp[2] + 12, 8)} r4`,
  none: () => 'r1',
};
const DRUM = {
  rock: 'l8 K H S H K K S H',
  drive: 'l16 K r H r S r H H K r K r S r H r',
  march: 'l8 K H S H K H S S',
  half: 'l4 K S K S',
  soft: 'l4 K H S H',
  boss: 'l16 K r H K S r H r K K H r S r S S',
  none: 'r1',
};
const bars = (list) => list.join(' ');
const each = (pr, fn) => pr.map(fn).join(' ');

function song(def) {
  const pr = prog(def.prog);
  const B = def.bars;
  const fm = [
    `t${def.tempo} @${def.bassP ?? P.SLAP_BASS} v${def.bassV ?? 13} q6 ${def.intro || ''} L ` + each(pr, BASS[def.bass]),
    `@${def.padP ?? P.TOMB_BRASS} v${def.padV ?? 9} q${def.padQ ?? 5} ${def.intro || ''} L ` + each(pr, (c) => STAB[def.stab](c, 1)),
    `@${def.padP ?? P.TOMB_BRASS} v${def.padV ?? 9} q${def.padQ ?? 5} ${def.intro || ''} L ` + each(pr, (c) => STAB[def.stab](c, 2)),
    def.counter ? `@${def.counterP ?? P.GHOST_LEAD} v${def.counterV ?? 9} q7 D4 ${def.intro || ''} L ${def.counter}` : null,
  ];
  const psg = [
    `@${def.leadP ?? 0} v${def.leadV ?? 12} q7 ${def.intro || ''} L ${bars(B)}`,
    def.arp ? `@${def.arpP ?? 1} v${def.arpV ?? 8} q5 ${def.intro || ''} L ` + each(pr, ARP[def.arp]) : null,
  ];
  const pcm = [
    def.drum ? `v${def.drumV ?? 12} ${def.intro ? def.intro : ''} L ${rep(DRUM[def.drum], pr.length)}` : null,
    def.perc ? `v10 ${def.intro || ''} L ${def.perc}` : null,
  ];
  return compileSong({ id: def.id, title: def.title, tempo: def.tempo, fm, psg, pcm, loopBars: pr.length, barsSrc: B });
}
// ループしない短い曲（ジングル）: 和音とベースを指定の小節だけ鳴らして終わる
function jingle(def) {
  const pr = prog(def.prog);
  const fm = [
    `t${def.tempo} @${def.bassP ?? P.SLAP_BASS} v13 q6 ` + each(pr, BASS[def.bass || 'half']),
    `@${def.padP ?? P.TOMB_BRASS} v10 q7 ` + each(pr, (c) => STAB[def.stab || 'long'](c, 1)),
    `@${def.padP ?? P.TOMB_BRASS} v10 q7 ` + each(pr, (c) => STAB[def.stab || 'long'](c, 2)),
    def.counter ? `@${def.counterP ?? P.GHOST_LEAD} v10 q7 ${def.counter}` : null,
  ];
  const psg = [`@${def.leadP ?? 0} v12 q7 ${bars(def.bars)}`];
  const pcm = [def.drum ? `v12 ${def.drum}` : null];
  return compileSong({ id: def.id, title: def.title, tempo: def.tempo, fm, psg, pcm, loopBars: 0, barsSrc: def.bars });
}

export const SONG_DEFS = {
  title: { kind: 'song', id: 'title', title: '月影の魔城（タイトル）', tempo: 112, prog: 'Dm Bb Gm A Dm Bb Gm A7', bass: 'half', stab: 'long', padP: P.CRYPT_ORGAN, padV: 8, arp: 'wave16', arpP: 3, arpV: 7, drum: 'soft', drumV: 9,
    counterP: P.WIND_CHOIR, counterV: 8, counter: 'o4 d1 d1 d1 c+1 d1 d1 d1 e1',
    bars: ['o5d2a4.g8', 'o5f4e8d8f4a4', 'o5g2o6d4.c8', 'o5a2.c+4', 'o5d2a4.o6c8', 'o6d4c8o5a+8a4f4', 'o5g4a+4o6d4g4', 'o6e2c+2'] },
  stage1: { kind: 'song', id: 'stage1', title: '月夜の墓地', tempo: 152, prog: 'Dm Dm Bb A Dm Dm Gm A F C Dm A Bb F Gm A', bass: 'drive', stab: 'off', arp: null, drum: 'rock',
    counterP: P.BONE_BELL, counterV: 7, counter: 'r1 r1 r1 r1 r1 r1 r1 r1 o5 a1 g1 f1 e1 f1 a1 g1 e1',
    bars: ['o5d8r16d16f8a8g8f8e8c+8', 'o5d4a4o6d4o5a4', 'o5a+8a8g8f8e8f8g8e8', 'o5a2r8a8g+8a8', 'o5d8r16d16f8a8o6d8o5a+8a8g8', 'o5f8e8d8e8f4a4', 'o5g8f8e8d8c+8d8e8g8', 'o5a2.r4',
      'o5a8o6c8o5a8f8c4f8a8', 'o5g8e8c8e8g4o6c4', 'o5d8f8a8o6d8c8o5a8f8a8', 'o5e4c+8e8a4g4', 'o5f8a+8o6d8o5a+8f4d4', 'o5a8o6c8f8c8o5a4f4', 'o5g8a+8o6d8o5g8a+8o6d8g4', 'o6e2c+4o5a4'] },
  stage2: { kind: 'song', id: 'stage2', title: '廃村と地下墓所', tempo: 136, prog: 'Gm Gm Eb D Gm Cm D7 Gm Bb F Gm D Eb Bb Cm D', bass: 'walk', stab: 'push', padP: P.HARPSI, padV: 8, arp: 'eighth', arpP: 3, arpV: 6, drum: 'march', drumV: 10,
    bars: ['o5g8.a16a+8g8d4r8d8', 'o5a+8.o6c16d8o5a+8g4r4', 'o5d+8g8a+8o6d+8d8c8o5a+8g8', 'o5f+4a4o6d4r4', 'o5g8.a16a+8g8o6d4c8o5a+8', 'o5a8g8f+8d+8d8c8o4a+8a8', 'o5d8f+8a8o6c8o5a8f+8d8c8', 'o5g2r4d4',
      'o5f8a+8o6d8f8d4o5a+4', 'o6c8o5a8f8a8o6c4f4', 'o6d8c8o5a+8g8a+8o6d8g4', 'o5f+8a8o6d8c8o5a4f+4', 'o5g8a+8o6d+8g8f8d+8d8c8', 'o6d4o5a+4f4d4', 'o5d+8g8o6c8d+8d8c8o5a+8a8', 'o5f+2a4o6d4'] },
  stage3: { kind: 'song', id: 'stage3', title: '洞窟と水路', tempo: 124, prog: 'Em Em C B Em Em Am B G D Em B C G Am B', bass: 'pulse', stab: 'long', padP: P.CRYPT_ORGAN, padV: 7, arp: 'drip', arpP: 3, arpV: 8, drum: 'half', drumV: 9, leadP: 4,
    bars: ['o5e4.f+8g4b4', 'o5a8g8f+8e8f+2', 'o5e4.g8o6c4o5b8a8', 'o5b2.r4', 'o5e4.f+8g4b4', 'o6d8c8o5b8a8b4g4', 'o5a4o6c8o5b8a4e4', 'o5d+2f+2',
      'o5g4.a8b4o6d4', 'o5a4f+8a8o6d2', 'o5b8a8g8f+8e4b4', 'o5f+2d+2', 'o5e4g8o6c8e4d8c8', 'o5b4.a8g4d4', 'o5c8e8a8o6c8o5b8a8g8f+8', 'o5d+2.r4'] },
  stage4: { kind: 'song', id: 'stage4', title: '魔物の塔', tempo: 164, prog: 'Am F G E Am F Dm E F G Am Am Dm E Am E', bass: 'gallop', stab: 'off', arp: 'up16', arpV: 6, drum: 'drive', drumV: 11,
    bars: ['o5a8o6c8e8a8g8e8c8o5b8', 'o6c8o5a8f8a8o6c4f4', 'o6d8o5b8g8b8o6d4g4', 'o5g+8b8o6e8o5b8g+4e4', 'o5a8o6c8e8a8g8e8c8e8', 'o6f8e8d8c8o5a4o6c4', 'o6d8c8o5a8f8d4a4', 'o5g+2b4o6e4',
      'o6f4.e8d4c4', 'o5b4.o6c8d4g4', 'o6e8d8c8o5b8a8g8a8b8', 'o6c8o5b8a8g+8a4e4', 'o6d4f4a4f4', 'o6e4g+4b4g+4', 'o6a8g8e8c8e8c8o5a8o6c8', 'o5b2g+2'] },
  stage5: { kind: 'song', id: 'stage5', title: '炎の城塞', tempo: 172, prog: 'Cm Cm Ab G Cm Cm Fm G Ab Bb Cm Cm Fm G Cm G', bass: 'drive', bassP: P.DEEP_BASS, stab: 'push', drum: 'drive', drumV: 12,
    counterP: P.FUZZ_LEAD, counterV: 6, counter: 'r1 r1 r1 r1 r1 r1 r1 r1 o4 g+1 a+1 o5 c1 c1 o4 g+1 b1 o5 c1 o4 b1',
    bars: ['o5c8c8g8c8a+8c8g8f8', 'o5d+8f8g8a+8o6c4o5g4', 'o5g+8g8f8d+8f8g8g+8o6c8', 'o5b4d4g4b4', 'o5c8c8g8c8a+8c8g8f8', 'o5d+8f8g8o6c8d+4d4', 'o6c8o5g+8f8g+8o6c8d8d+8c8', 'o5b2.r4',
      'o5g+8o6c8d+8c8o5g+4f4', 'o5a+8o6d8f8d8o5a+4f4', 'o6g8f8d+8d8c8d8d+8f8', 'o6g2.r8g8', 'o6g+8f8c8o5g+8o6c8f8g+8c8', 'o6g8d8o5b8g8b8o6d8g8d8', 'o6c8d+8g8o7c8o6g8d+8c8d+8', 'o5b2d4g4'] },
  stage6: { kind: 'song', id: 'stage6', title: '魔城中枢', tempo: 148, prog: 'Bm G Em F# Bm G C F# Em Bm F# Bm G Em F# F#', bass: 'march', bassP: P.DEEP_BASS, stab: 'half', padP: P.CRYPT_ORGAN, padV: 8, arp: 'wave16', arpV: 6, drum: 'march', drumV: 10,
    bars: ['o5b4o6d4f+4e8d8', 'o6d8o5b8g8b8o6d2', 'o5e8g8b8o6e8d8o5b8g8e8', 'o5f+2a+2', 'o5b4o6d4f+4a8g8', 'o6g8f+8e8d8o5b4g4', 'o5g8o6c8e8g8f+8e8c8o5a+8', 'o5f+2.r4',
      'o6e4.f+8g4e4', 'o6f+4.e8d4o5b4', 'o5a+8o6c+8e8f+8e8c+8o5a+8f+8', 'o5b2o6d2', 'o6d4.e8f+4g4', 'o6e8f+8g8e8o5b4e4', 'o5f+8a+8o6c+8e8f+8e8c+8o5a+8', 'o5f+2a+2'] },
  boss: { kind: 'song', id: 'boss', title: '魔物の咆哮（ボス）', tempo: 176, prog: 'Cm Cm Db Cm Cm Cm Bbm G', bass: 'gallop', bassP: P.DEEP_BASS, stab: 'off', padP: P.GRIM_STRINGS, padV: 9, arp: null, drum: 'boss', drumV: 12,
    perc: 'C1 r1 r1 r1 C1 r1 r1 r1',
    bars: ['o5c4r8c8d+8c8f+8g8', 'o5c4r8c8d+8f8f+8g8', 'o5c+8f8g+8o6c+8c8o5g+8f8c+8', 'o5c4g4o6c4o5g4', 'o6c8o5g8d+8c8o6d+8c8o5g8d+8', 'o6f8d+8c8o5g8o6f+8f8d+8c8', 'o5a+8o6c+8f8c+8o5a+4f4', 'o5b4d4f4g4'] },
  lastboss: { kind: 'song', id: 'lastboss', title: '魔城の主', tempo: 160, prog: 'Em C Em C Am B Em B C D Bm Em Am F# B B', bass: 'gallop', bassP: P.DEEP_BASS, stab: 'push', padP: P.GRIM_STRINGS, padV: 9, arp: 'up16', arpV: 5, drum: 'boss', drumV: 12,
    counterP: P.FUZZ_LEAD, counterV: 8,
    counter: 'o4 e8g8b8>e8d+8e8<b8g8 >c8<g8e8g8>c4e4 e8f+8g8b8a8g8f+8e8 e8d8c8<g8>c4<g4 a8>c8e8a8g8e8c8e8 <d+8f+8b8>d+8f+4d+4 e4.f+8g4b4 a4g4f+4d+4 g4.f+8e4c4 f+4.e8d4<a4 b8>d8f+8b8a8f+8d8<b8 >e2.r4 c8e8a8>c8<b8a8e8c8 c+8e8f+8a+8>c+4<a+4 b4a4g4f+4 d+2f+4b4',
    bars: ['o5e8g8b8o6e8d+8e8o5b8g8', 'o6c8o5g8e8g8o6c4e4', 'o6e8f+8g8b8a8g8f+8e8', 'o6e8d8c8o5g8o6c4o5g4', 'o5a8o6c8e8a8g8e8c8e8', 'o5d+8f+8b8o6d+8f+4d+4', 'o6e4.f+8g4b4', 'o6a4g4f+4d+4',
      'o6g4.f+8e4c4', 'o6f+4.e8d4o5a4', 'o5b8o6d8f+8b8a8f+8d8o5b8', 'o6e2.r4', 'o6c8e8a8o7c8o6b8a8e8c8', 'o6c+8e8f+8a+8o7c+4o6a+4', 'o6b4a4g4f+4', 'o6d+2f+4b4'] },
  ending: { kind: 'song', id: 'ending', title: '夜明けの帰路（エンディング）', tempo: 112, prog: 'F C Dm Bb F C Bb C Dm Am Bb F Gm C F F', bass: 'walk', stab: 'long', padP: P.WIND_CHOIR, padV: 8, arp: 'wave16', arpP: 3, arpV: 6, drum: 'soft', drumV: 8,
    bars: ['o5a4.g8f4c4', 'o5e4.f8g4c4', 'o5f4a4o6d4c4', 'o5a+2a4g4', 'o5a4.g8f4o6c4', 'o6c4o5a+4a4g4', 'o5f4g4a4a+4', 'o5g2.r4',
      'o5a4.a+8o6c4d4', 'o6e4.d8c4o5a4', 'o5a+4o6c4d4f4', 'o6c2.o5a4', 'o5a+4.a8g4a+4', 'o5a4g4e4c4', 'o5f1', 'r2o5f4a4'] },
  start: { kind: 'jingle', id: 'start', title: '出陣', tempo: 168, prog: 'Dm Dm', bass: 'half', stab: 'hit', drum: 'l8 K r S r K K S S K r r r r2',
    bars: ['o5d8f8a8o6d8c+4.r8', 'o6d2r2'] },
  clear: { kind: 'jingle', id: 'clear', title: '凱歌（ステージクリア）', tempo: 150, prog: 'D C D D', bass: 'half', stab: 'long', drum: 'l8 K H S H K H S H K H S H K H S S l2 C r',
    bars: ['o5a8d8f+8a8o6d4o5a4', 'o6c8o5g8o6c8e8g4e4', 'o6d8o5a8o6d8f+8a4f+4', 'o6d2.r4'] },
  death: { kind: 'jingle', id: 'death', title: '討ち死に', tempo: 132, prog: 'Dm A', bass: 'long', stab: 'hit',
    bars: ['o5a8g+8g8f+8f8e8d+8d8', 'o5c+2r2'] },
  gameover: { kind: 'jingle', id: 'gameover', title: '終わりの鐘（ゲームオーバー）', tempo: 88, prog: 'Dm Bb Gm Dm', bass: 'long', stab: 'long', padP: P.CRYPT_ORGAN,
    counterP: P.BONE_BELL, counter: 'o4 d1 d1 d1 d1',
    bars: ['o5a4f4d4e4', 'o5f2e4c+4', 'o5d4o4a4f4g4', 'o5d1'] },
};

let cache = null;
export function getSongs() {
  if (cache) return cache;
  cache = {};
  for (const [k, d] of Object.entries(SONG_DEFS)) cache[k] = d.kind === 'song' ? song(d) : jingle(d);
  return cache;
}
