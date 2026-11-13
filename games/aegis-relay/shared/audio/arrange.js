// AEGIS RELAY — 編曲（モダン音源）。曲のデータ（songs.js: 和音の並び＋主旋律＋各パートの型）から、全パートの音符を作る。
// ・主旋律（lead）と対旋律（bell）は MML の手書き。ベース・パッド・アルペジオ・刻み・ドラムは和音の並びと「型」から作る
// ・パッドは前の和音にいちばん近い転回形を選ぶ（声部進行をなめらかに）
// ・状況で足す層（S23）: layer 1 = 合体中の上の層、layer 2 = 残り 1 機の緊張の層。どの層も同じ時間軸に置く → 必ず同期する
// ・曲の長さ・ループ位置は小節単位。時間は「拍」で作り、最後に秒へ直す
import { parseMML } from './mml.js';
import { RISE_SEC } from './drums.js';

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7] };
const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const mod12 = (n) => ((n % 12) + 12) % 12;

export function parseChord(name, tr = 0) {
  const m = /^([A-G][#b]?)(maj7|m7|m|7|sus4)?(?:\/([A-G][#b]?))?$/.exec(name); if (!m) throw new Error('和音が読めない: ' + name);
  const root = mod12(PC[m[1]] + tr), ivs = QUAL[m[2] || ''];
  return { name, root, pcs: ivs.map((i) => mod12(root + i)), bass: m[3] ? mod12(PC[m[3]] + tr) : root };
}
export function parseKey(key, tr = 0) {
  const m = /^([A-G][#b]?)(m?)$/.exec(key); const tonic = mod12(PC[m[1]] + tr), mode = m[2] ? 'minor' : 'major';
  return { tonic, mode, pcs: SCALE[mode].map((i) => mod12(tonic + i)) };
}

// ── ドラムの型（16 分 × 16 = 1 小節。X 強 / x 普通 / o 弱 / - ごく弱（ゴースト）/ . 休み）──
const VEL = { X: 1, x: 0.8, o: 0.5, '-': 0.28 };
export const PAT = {
  none:   {},
  intro:  { kick: 'x.......x.......', hatC: 'x.o.x.o.x.o.x.o.' },
  rock:   { kick: 'x.....x.x.......', snare: '....X.......X...', hatC: 'x.o.x.o.x.o.x.o.' },
  rockB:  { kick: 'x..x..x...x.x...', snare: '....X..-....X..-', hatC: 'x.o.x.o.x.o.x...', hatO: '..............x.' },
  four:   { kick: 'x...x...x...x...', snare: '....X.......X...', clap: '....x.......x...', hatC: 'x--.x--.x--.x--.', hatO: '..x...x...x...x.' },
  drive:  { kick: 'x.x...x.x.x...x.', snare: '....X.......X...', hatC: 'xoxoxoxoxoxoxoxo' },
  half:   { kick: 'x.......x.x.....', snare: '........X.......', hatC: 'x.o.x.o.x.o.x.o.', ride: 'x...x...x...x...' },
  ride:   { kick: 'x.....x.x..x....', snare: '....X.......X...', ride: 'x.o.x.o.x.o.x.o.', hatC: '..x...x...x...x.' },
  tribal: { kick: 'x.....x...x.....', snare: '....X.......X...', tomL: '..x.....x.....x.', tomM: '.....o.......o..', hatC: 'x.o.x.o.x.o.x.o.' },
  pulse:  { kick: 'x...x...x...x...', hatC: '..o...o...o...o.' },
  slow:   { kick: 'x.........x.....', snare: '........x.......', ride: 'x...o...x...o...' },
};
// フィルイン: 小節の from 目（16 分）から後ろを差し替える。roll は強さがだんだん上がるスネアロール（S10）
export const FILL = {
  fillA: { from: 8, rows: { kick: 'x.......', snare: 'X.xxx...', tomH: '.....x..', tomM: '......x.', tomL: '.......x' } },
  fillB: { from: 8, rows: { kick: 'x...x...', tomH: 'xx......', tomM: '..xx....', tomL: '....xx..', snare: '......XX' } },
  fillC: { from: 12, rows: { snare: 'xxXX', kick: 'x...' } },
  roll:  { from: 0, roll: true, rows: { kick: 'x...x...x...x...' } },
  roll2: { from: 8, roll: true, rows: { kick: 'x...x...' } },
  stop:  { from: 8, rows: { kick: 'x.......', snare: 'X.......', crash: 'x.......' } },
};
const DRUM_TRACK = { kick: 'kick', snare: 'snare', clap: 'snare', hatC: 'hat', hatO: 'hat', shaker: 'hat', crash: 'cym', ride: 'cym', rise: 'cym', tomH: 'tom', tomM: 'tom', tomL: 'tom' };

// ── ベースの型: seg（t0, len（拍）, chord）→ [拍の位置, 長さ, 根音からの半音, 強さ] ──
const BASS = {
  eighth: (n) => Array.from({ length: n * 2 }, (_, i) => [i / 2, 0.4, i === n * 2 - 1 && n === 4 ? 7 : 0, i % 2 ? 0.75 : 0.95]),
  drive:  (n) => Array.from({ length: n }, (_, b) => [[b, 0.36, 0, 0.95], [b + 0.5, 0.2, 0, 0.7], [b + 0.75, 0.2, b === n - 1 ? 12 : 0, 0.8]]).flat(),
  octave: (n) => Array.from({ length: n * 2 }, (_, i) => [i / 2, 0.38, i % 2 ? 12 : 0, i % 2 ? 0.75 : 0.95]),
  synco:  (n) => (n === 4 ? [[0, 1.2, 0, 0.95], [1.5, 1.2, 0, 0.9], [3, 0.4, 7, 0.85], [3.5, 0.4, 12, 0.8]] : [[0, 1.2, 0, 0.95], [1.5, 0.4, 7, 0.85]]),
  walk:   (n) => [0, 0, 7, 0, 12, 0, 7, 7].slice(0, n * 2).map((s, i) => [i / 2, 0.4, s, i % 2 ? 0.75 : 0.95]),
  long:   (n) => [[0, n * 0.97, 0, 0.9]],
};
// ── アルペジオの型: 和音の音を並べた「はしご」の何段目を鳴らすか ──
const ARP = {
  up16:     { step: 0.25, seq: [0, 1, 2, 3] },
  updown16: { step: 0.25, seq: [0, 1, 2, 3, 4, 3, 2, 1] },
  skip16:   { step: 0.25, seq: [0, 2, 1, 3, 2, 4, 3, 1] },
  up8:      { step: 0.5, seq: [0, 1, 2, 3, 2, 1, 2, 3] },
  gate16:   { step: 0.25, seq: [0, null, 2, 1, null, 3, 2, null, 0, null, 2, 1, null, 3, 2, 4] },
};
const bassRoot = (pc) => 31 + mod12(pc - 7); // G1（49Hz）〜F#2（92Hz）

// 和音 → パッドの配置。前の配置にいちばん近い（各声の動きの合計が最小の）転回形を選ぶ
export function voiceLead(prev, pcs, lo = 53, hi = 72) {
  const opts = pcs.map((pc) => { const o = []; for (let m = lo; m <= hi; m++) if (mod12(m) === pc) o.push(m); return o; });
  let best = null, bestCost = Infinity;
  const rec = (i, cur) => {
    if (i === opts.length) {
      const v = [...cur].sort((a, b) => a - b); if (v[v.length - 1] - v[0] > 12) return;
      for (let k = 1; k < v.length; k++) if (v[k] - v[k - 1] < 2) return; // 半音でぶつかる配置は避ける
      let cost = 0; if (prev) for (let k = 0; k < v.length; k++) cost += Math.abs(v[k] - prev[Math.min(k, prev.length - 1)]); else cost = Math.abs(v[0] - 57) * 2 + (mod12(v[0]) === pcs[0] ? 0 : 3);
      if (cost < bestCost) { bestCost = cost; best = v; }
      return;
    }
    for (const m of opts[i]) rec(i + 1, [...cur, m]);
  };
  rec(0, []);
  return best;
}

export function compileSong(song) {
  const tr = song.transpose || 0, spb = 60 / song.tempo, key = parseKey(song.key, tr);
  const ev = []; // { b: 拍, d: 拍, tr, inst, m, v, L } / ドラムは { b, k, v, L, tr }（rise だけ sec 指定のずらしを持つ）
  const segs = [], sections = [], leadNotes = [], padVoicings = [];
  let bar0 = 0, prevVoicing = null;
  const layers = song.layers !== false;
  for (const sec of song.sections) {
    const b0 = bar0 * 4, nb = sec.chords.length;
    sections.push({ name: sec.name, bar0, bars: nb, once: !!sec.once });
    const mySegs = [];
    sec.chords.forEach((c, i) => { const parts = Array.isArray(c) ? c : [c]; parts.forEach((nm, k) => mySegs.push({ t0: b0 + i * 4 + k * 4 / parts.length, len: 4 / parts.length, chord: parseChord(nm, tr), bar: bar0 + i })); });
    segs.push(...mySegs);
    const chordAt = (b) => { let s = mySegs[0]; for (const x of mySegs) if (x.t0 <= b + 1e-6) s = x; return s.chord; };
    const lv = sec.level ?? 1;
    // 主旋律・対旋律
    for (const [part, track, inst] of [['lead', 'lead', sec.leadInst || 'lead'], ['bell', 'bell', 'bell']]) {
      if (!sec[part]) continue;
      const p = parseMML(sec[part], { strictBars: true });
      if (Math.abs(p.length - nb * 4) > 1e-6) throw new Error(`${song.name}/${sec.name}/${part}: ${p.length / 4} 小節ぶん（${nb} 小節のはず）`);
      for (const n of p.notes) {
        const m = n.midi + tr, v = n.vol / 15 * lv, d = n.dur * (n.gate >= 8 ? 1 : 0.6 + n.gate * 0.05);
        ev.push({ b: b0 + n.t, d, tr: track, inst, m, v, L: 0 });
        leadNotes.push({ part, section: sec.name, b: b0 + n.t, dur: n.dur, m, chord: chordAt(b0 + n.t) });
        if (part !== 'lead') continue;
        if (sec.harm && n.dur >= 0.5) { // ハモり: 主旋律の 3〜9 半音下にある和音の音
          const pcs = chordAt(b0 + n.t).pcs; let h = null;
          for (let x = m - 3; x >= m - 9; x--) if (pcs.includes(mod12(x))) { h = x; break; }
          if (h != null) ev.push({ b: b0 + n.t, d, tr: 'harm', inst: 'harm', m: h, v: v * 0.8, L: 0 });
        }
        if (layers && n.dur >= 0.5) ev.push({ b: b0 + n.t, d: Math.min(d, 1.5), tr: 'spark', inst: 'glass', m: m + 12 > 98 ? m : m + 12, v: 0.6, L: 1 }); // 合体中: 1 オクターブ上をベルで重ねる
      }
    }
    // 和音から作るパート
    for (const s of mySegs) {
      const c = s.chord, R = bassRoot(c.bass), voicing = voiceLead(prevVoicing, c.pcs); prevVoicing = voicing;
      padVoicings.push({ b: s.t0, chord: c.name, v: voicing });
      if (sec.bass) {
        const pat = sec.bass === 'pedal' ? BASS.eighth(s.len).map((x) => [x[0], x[1], 0, x[3]]) : BASS[sec.bass](s.len);
        const root = sec.bass === 'pedal' ? bassRoot(key.tonic) : R;
        for (const [t, d, semi, v] of pat) ev.push({ b: s.t0 + t, d, tr: 'bass', inst: 'bass', m: root + (semi === 7 && c.name.includes('dim') ? 6 : semi), v: v * lv, L: 0 });
      }
      if (sec.pad) for (const m of voicing) ev.push({ b: s.t0, d: s.len, tr: 'pad', inst: 'pad', m: m + (sec.pad === 'hi' ? 12 : 0), v: 0.75 * lv, L: 0 });
      const ladder = [...voicing.map((m) => m + 12), ...voicing.map((m) => m + 24)];
      if (sec.arp) {
        const a = ARP[sec.arp], n = Math.round(s.len / a.step);
        for (let i = 0; i < n; i++) { const k = a.seq[(Math.round((s.t0 - b0) / a.step) + i) % a.seq.length]; if (k == null) continue; ev.push({ b: s.t0 + i * a.step, d: a.step * 0.8, tr: 'arp', inst: 'arp', m: ladder[Math.min(k, ladder.length - 1)], v: (i % 4 === 0 ? 0.85 : 0.6) * lv, L: 0 }); }
      }
      if (sec.stab) {
        const st0 = Math.round((s.t0 - Math.floor(s.t0 / 4) * 4) * 4);
        for (let i = 0; i < s.len * 4; i++) { const ch = sec.stab[st0 + i]; if (VEL[ch]) for (const m of voicing) ev.push({ b: s.t0 + i / 4, d: 0.3, tr: 'stab', inst: 'stab', m, v: VEL[ch] * 0.8 * lv, L: 0 }); }
      }
      if (layers) {
        // 合体中の層: 高いベルの 8 分アルペジオ
        for (let i = 0; i < s.len * 2; i++) ev.push({ b: s.t0 + i / 2, d: 0.4, tr: 'spark', inst: 'glass', m: ladder[[3, 4, 5, 4][i % 4]] + (ladder[5] < 86 ? 12 : 0), v: 0.32, L: 1 });
        // 緊張の層: 根音と 5 度の 16 分の刻み
        const base = 72 + mod12(c.root - 0);
        for (let i = 0; i < s.len * 4; i++) if (i % 4 !== 1) ev.push({ b: s.t0 + i / 4, d: 0.12, tr: 'danger', inst: 'pulse', m: base + (i % 4 === 3 ? 7 : 0) - (base > 79 ? 12 : 0), v: i % 4 === 0 ? 0.8 : 0.55, L: 2 });
      }
    }
    // ドラム
    for (let i = 0; i < nb; i++) {
      const bb = b0 + i * 4, pat = PAT[sec.drums || 'none'], fill = i === nb - 1 && sec.fill ? FILL[sec.fill] : null, from = fill ? fill.from : 16;
      const put = (k, step, ch, mul = 1) => { if (VEL[ch]) ev.push({ b: bb + step / 4, k, v: VEL[ch] * mul * (k === 'kick' ? 1 : lv), tr: DRUM_TRACK[k], L: 0 }); };
      for (const [k, row] of Object.entries(pat)) for (let s = 0; s < from; s++) put(k, s, row[s]);
      if (fill) {
        for (const [k, row] of Object.entries(fill.rows)) for (let s = 0; s < row.length; s++) put(k, from + s, row[s]);
        if (fill.roll) for (let s = from; s < 16; s++) ev.push({ b: bb + s / 4, k: 'snare', v: 0.3 + 0.7 * ((s - from + 1) / (16 - from)) ** 1.5, tr: 'snare', L: 0 });
      }
      if (i === 0 && sec.crash) ev.push({ b: bb, k: 'crash', v: 0.9, tr: 'cym', L: 0 });
      if (layers) {
        for (let s = 0; s < 16; s++) ev.push({ b: bb + s / 4, k: 'shaker', v: s % 4 === 0 ? 0.55 : s % 2 ? 0.25 : 0.4, tr: 'hat', L: 1 });
        for (const s of [0, 3, 8, 11]) ev.push({ b: bb + s / 4, k: 'tomL', v: s % 8 ? 0.45 : 0.7, tr: 'tom', L: 2 });
      }
    }
    if (sec.rise) ev.push({ b: b0 + nb * 4, off: -RISE_SEC, k: 'rise', v: 0.8, tr: 'cym', L: 0 });
    bar0 += nb;
  }
  const bar = spb * 4, len = bar0 * bar;
  const onceBars = song.sections.filter((s) => s.once).reduce((a, s) => a + s.chords.length, 0);
  const events = ev.map((e) => ({ ...e, t: e.b * spb + (e.off || 0), d: e.d != null ? e.d * spb : 0 })).filter((e) => e.t >= 0).sort((a, b) => a.t - b.t);
  return { name: song.name, tempo: song.tempo, spb, bar, len, bars: bar0, loopAt: song.once ? null : onceBars * bar, once: !!song.once, events, key, segs, sections, leadNotes, padVoicings, mix: song.mix || {} };
}
