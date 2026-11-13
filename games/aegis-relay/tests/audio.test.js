// 音のデータの検査（聞けない環境なので、楽譜・波形の正しさを数値で確かめる）
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMML } from '../shared/audio/mml.js';
import { SONGS, AREA_SONG, START_SONG, CHIP_SONG } from '../shared/audio/songs.js';
import { compileSong, voiceLead, PAT, FILL } from '../shared/audio/arrange.js';
import { SFX, CHIP_NAME } from '../shared/audio/sfx.js';
import { DRUMS } from '../shared/audio/drums.js';
import { INSTRUMENTS, superSawTable } from '../shared/audio/instruments.js';
import { reverbIR, softClipCurve } from '../shared/audio/fx.js';
import { SONGS as CHIP_SONGS } from '../shared/audio/chip-songs.js';
import { SFX as CHIP_SFX } from '../shared/audio/chip-sfx.js';
import { compileSong as compileChip } from '../shared/audio/chip.js';
import { EVENT_SE } from '../shared/sound-map.js';

const pc = (m) => ((m % 12) + 12) % 12;
const C = Object.fromEntries(Object.entries(SONGS).map(([k, s]) => [k, compileSong(s)]));
const LOOPS = ['title', 'stageA', 'stageB', 'stageC', 'core'], STAGES = ['stageA', 'stageB', 'stageC'];

test('MML: 長さ・付点・ループ位置・小節線の検査', () => {
  const p = parseMML('l8 c d L e4. r8 f2');
  assert.equal(p.loopAt, 1); assert.equal(p.length, 1 + 1.5 + 0.5 + 2);
  assert.equal(p.notes[0].midi, 60);
  assert.throws(() => parseMML('l8 c d e | f g a b', { strictBars: true }), /小節/);
  assert.doesNotThrow(() => parseMML('l8 c d e f g a b > c | c1', { strictBars: true }));
});

test('曲: 長さとループ位置が小節単位、全イベントが曲の中に収まる', () => {
  for (const [name, c] of Object.entries(C)) {
    assert.ok(Math.abs(c.len / c.bar - c.bars) < 1e-9, name);
    if (!c.once) assert.ok(Math.abs(c.loopAt / c.bar - Math.round(c.loopAt / c.bar)) < 1e-9, `${name} ループ位置`);
    for (const e of c.events) { assert.ok(e.t >= 0 && e.t < c.len - 1e-9, `${name} ${e.tr} t=${e.t}`); assert.ok(Number.isFinite(e.v) && e.v > 0 && e.v <= 1.001, `${name} ${e.tr} v=${e.v}`); }
    for (let i = 1; i < c.events.length; i++) assert.ok(c.events[i].t >= c.events[i - 1].t, `${name} 並び順`);
    for (const e of c.events) if (!e.k) assert.ok(INSTRUMENTS.includes(e.inst), `${name} 楽器 ${e.inst}`); else assert.ok(DRUMS[e.k], `${name} ドラム ${e.k}`);
  }
});

test('曲の展開: ステージ曲はイントロ → A → A2 → B → サビ、ループ部分が 32 小節以上、3 曲ある', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(AREA_SONG), ['stageA', 'stageB', 'stageC', 'stageA', 'stageB', 'stageC', 'stageA', 'stageB']);
  for (const n of STAGES) {
    const c = C[n];
    assert.deepEqual(c.sections.map((s) => s.name), ['intro', 'A', 'A2', 'B', 'chorus'], n);
    assert.ok((c.len - c.loopAt) / c.bar >= 32 - 1e-9, `${n} ループ ${(c.len - c.loopAt) / c.bar} 小節`);
    assert.ok(c.tempo >= 150 && c.tempo <= 175);
    assert.ok(C[START_SONG(STAGES.indexOf(n))].once);
  }
  assert.ok((C.title.len - C.title.loopAt) / C.title.bar >= 16 && C.title.loopAt > 0, 'タイトルはイントロ → 主題');
  assert.ok(C.core.bars >= 16);
});

test('曲: どのセクションにもベース・ドラム・和音があり、サビにはハモりとシンバルがある（ジングル以外）', () => {
  for (const n of LOOPS) {
    const c = C[n];
    for (const s of c.sections) {
      const t0 = s.bar0 * c.bar, t1 = (s.bar0 + s.bars) * c.bar, ev = c.events.filter((e) => e.L === 0 && e.t >= t0 - 1e-9 && e.t < t1 - 1e-9), has = (tr) => ev.some((e) => e.tr === tr);
      for (const tr of ['bass', 'pad', 'kick', 'hat']) assert.ok(has(tr), `${n}/${s.name} に ${tr} がない`);
      if (s.name !== 'intro') { assert.ok(has('lead'), `${n}/${s.name} lead`); assert.ok(has('snare'), `${n}/${s.name} snare`); assert.ok(ev.some((e) => e.k === 'crash' && Math.abs(e.t - t0) < 1e-9), `${n}/${s.name} 頭のシンバル`); }
      if (s.name === 'chorus') assert.ok(has('harm') && has('arp'), `${n} サビ`);
      // セクションの最後の小節にフィルイン（タムかスネアの連打）
      const last = ev.filter((e) => e.t >= t1 - c.bar && (e.k === 'snare' || (e.k || '').startsWith('tom')));
      assert.ok(last.length >= 3, `${n}/${s.name} フィルイン`);
    }
    // 層: 合体（1）と緊張（2）が全小節にある
    for (const L of [1, 2]) for (let b = 0; b < c.bars; b++) assert.ok(c.events.some((e) => e.L === L && e.t >= b * c.bar - 1e-9 && e.t < (b + 1) * c.bar), `${n} 層 ${L} 小節 ${b}`);
  }
});

test('旋律: すべての音が「調の音階 か その時の和音の音」、拍の頭の長い音は和音の音、音域は A3〜E7', () => {
  for (const [name, c] of Object.entries(C)) {
    assert.ok(c.leadNotes.length > 0, name);
    for (const n of c.leadNotes) {
      const p = pc(n.m), where = `${name}/${n.section} ${Math.floor(n.b / 4) + 1} 小節目 ${n.part}`;
      const inChord = n.chord.pcs.includes(p);
      assert.ok(c.key.pcs.includes(p) || inChord, `${where}: 音階外の音 ${n.m}（和音 ${n.chord.name}）`);
      if (n.dur >= 1 && Math.abs(n.b - Math.round(n.b)) < 1e-6) assert.ok(inChord, `${where}: 長い音 ${n.m} が和音 ${n.chord.name} の音でない`);
      assert.ok(n.m >= 57 && n.m <= 100, `${where}: 音域 ${n.m}`);
    }
    // 伴奏（ベース・パッド・アルペジオ・刻み・層）はすべて和音の音
    for (const e of c.events) if (!e.k && !['lead', 'bell'].includes(e.tr)) {
      const b = e.t / c.spb; let seg = c.segs[0]; for (const s of c.segs) if (s.t0 <= b + 1e-6) seg = s;
      const ok = seg.chord.pcs.includes(pc(e.m)) || (e.tr === 'bass' && (pc(e.m) === seg.chord.bass || pc(e.m) === pc(seg.chord.bass + 7))) || (e.tr === 'spark' && c.key.pcs.includes(pc(e.m)));
      assert.ok(ok, `${name} ${e.tr} ${e.m} が和音 ${seg.chord.name} の音でない（${b} 拍）`);
    }
  }
});

test('旋律: 3 つのステージ曲・タイトル・コアの主旋律は互いに別もの（音程の並びが一致しない）', () => {
  const sig = (n) => C[n].leadNotes.filter((x) => x.part === 'lead').slice(0, 24).map((x, i, a) => (i ? x.m - a[i - 1].m : 0)).join(',');
  const s = LOOPS.map(sig); assert.equal(new Set(s).size, s.length);
});

test('声部進行: パッドの各声の動きは 4 半音以内、ベースは E1〜G3', () => {
  for (const [name, c] of Object.entries(C)) {
    for (let i = 1; i < c.padVoicings.length; i++) { const a = c.padVoicings[i - 1].v, b = c.padVoicings[i].v; for (let k = 0; k < Math.min(a.length, b.length); k++) assert.ok(Math.abs(a[k] - b[k]) <= 4, `${name} ${c.padVoicings[i - 1].chord}→${c.padVoicings[i].chord}`); }
    for (const e of c.events) if (e.tr === 'bass') assert.ok(e.m >= 28 && e.m <= 55, `${name} bass ${e.m}`);
  }
  assert.deepEqual(voiceLead([55, 59, 64], [0, 4, 7]), [55, 60, 64]); // Em → C: 1 声だけ半音動く
});

test('ドラムの型: どの行も 16 分 × 16、フィルインは小節に収まる', () => {
  for (const [k, p] of Object.entries(PAT)) for (const [d, row] of Object.entries(p)) { assert.equal(row.length, 16, `${k}.${d}`); assert.ok(DRUMS[d], d); }
  for (const [k, f] of Object.entries(FILL)) for (const [d, row] of Object.entries(f.rows)) { assert.equal(f.from + row.length, 16, `${k}.${d}`); assert.ok(DRUMS[d], d); }
});

const wavOk = (name, x, maxSec) => {
  let peak = 0; for (const v of x) { assert.ok(Number.isFinite(v), `${name} NaN`); peak = Math.max(peak, Math.abs(v)); }
  assert.ok(peak > 0.3 && peak <= 0.96, `${name} peak ${peak}`);
  assert.ok(Math.abs(x[0]) < 0.02 && Math.abs(x[x.length - 1]) < 0.02, `${name} 頭か尻が 0 でない（クリックになる）`);
  assert.ok(x.length / 48000 <= maxSec, `${name} 長さ ${x.length / 48000}`);
};
test('効果音・ドラムの波形: 有限・最大値 0.96 以下・頭と尻が 0・長さが妥当', () => {
  for (const [k, d] of Object.entries(SFX)) {
    for (let v = 0; v < (d.vary || 1); v++) wavOk(k, d.make(v), 3);
    assert.ok(d.pri >= 0 && d.gap > 0 && d.gain > 0 && d.gain <= 1 && d.voices >= 1, k);
  }
  for (const [k, f] of Object.entries(DRUMS)) wavOk(k, f(), 2);
  // 爆発は大きいほど長く、低い（S25）
  const len = (n) => SFX[n].make(0).length; assert.ok(len('kill') < len('killMid') && len('killMid') < len('killBig') && len('killBig') < len('killCore'));
  assert.ok(SFX.kill.vary >= 2 && SFX.kill.rnd > 0 && SFX.shot.rnd > 0);
});

test('スーパーソーの波形表はループの継ぎ目が合い、左右が別の波形（ステレオ）', () => {
  const t = superSawTable(57), n = t.l.length;
  // 継ぎ目: 最後の標本 → 最初の標本の段差が、波形の中のふつうの段差より大きくない
  let mx = 0; for (let i = 1; i < n; i++) mx = Math.max(mx, Math.abs(t.l[i] - t.l[i - 1]));
  assert.ok(Math.abs(t.l[0] - t.l[n - 1]) <= mx * 1.01);
  let dot = 0, a = 0, b = 0; for (let i = 0; i < n; i++) { dot += t.l[i] * t.r[i]; a += t.l[i] ** 2; b += t.r[i] ** 2; }
  assert.ok(dot / Math.sqrt(a * b) < 0.8, `左右の相関 ${dot / Math.sqrt(a * b)}`);
});

test('マスターの最終段は必ず ±0.93 以内・単調増加、残響は減衰する', () => {
  const c = softClipCurve(); for (let i = 1; i < c.length; i++) assert.ok(c[i] >= c[i - 1]);
  assert.ok(Math.max(...c) <= 0.93 + 1e-6 && Math.min(...c) >= -0.93 - 1e-6);
  assert.ok(Math.abs(c[(c.length - 1) / 2]) < 1e-9);
  const ir = reverbIR(), e = (x, a, b) => { let s = 0; for (let i = Math.floor(a * 48000); i < b * 48000; i++) s += x[i] ** 2; return s; };
  assert.ok(e(ir.l, 0, 0.3) > e(ir.l, 0.6, 0.9) * 10 && e(ir.l, 0.6, 0.9) > e(ir.l, 1.3, 1.6));
  let dot = 0; for (let i = 0; i < ir.l.length; i++) dot += ir.l[i] * ir.r[i]; assert.ok(Math.abs(dot) < 0.3, '左右の残響は別もの');
});

test('音イベント対応表: 効果音はモダン・旧チップの両方に定義がある', () => {
  const cases = [{}, { docked: true }, { big: true }, { r: 8 }, { r: 7 }, { type: 'core', big: true }];
  const used = new Set();
  for (const [k, f] of Object.entries(EVENT_SE)) for (const e of cases) {
    const name = f(e); used.add(name); assert.ok(SFX[name], `${k} → ${name}`);
    const chip = name in CHIP_NAME ? CHIP_NAME[name] : name; assert.ok(chip === null || CHIP_SFX[chip], `${k} → ${name}（チップ）`);
  }
  for (const n of ['kill', 'killMid', 'killBig', 'killCore', 'shot', 'shotDocked']) assert.ok(used.has(n), n);
  for (const n of ['uiMove', 'uiOk', 'uiBack', 'pause', 'coreAlert']) assert.ok(SFX[n], n);
  for (const n of Object.keys(SONGS)) assert.ok(CHIP_SONGS[CHIP_SONG[n]], `曲 ${n} のチップ版`);
});

test('旧チップ音源の曲: 全トラックの長さとループ位置が小節単位でそろう', () => {
  for (const [name, s] of Object.entries(CHIP_SONGS)) {
    if (s.once) continue;
    const c = compileChip(s), bar = c.spb * 4;
    for (const tr of c.tracks) { assert.ok(Math.abs(tr.len - c.len) < 1e-6, `${name} ch${tr.ch}`); assert.ok(Math.abs(tr.loopAt - c.loopAt) < 1e-6, `${name} ch${tr.ch} loop`); }
    assert.ok(Math.abs((c.len / bar) - Math.round(c.len / bar)) < 1e-6, `${name} 小節の途中で終わる`);
    assert.equal(s.drums.loop.length * c.spb / 4, c.len, `${name} drums`);
  }
});
