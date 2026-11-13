// 音の点検（node --test tests/audio.test.js）
// 前半 = レトロ音源（従来の PSG・波形メモリ、chip.js）。後半 = モダン音源（modern.js）と切り替え（core.js）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChipSynth, PSG_CLOCK, psgPeriod, wavePeriod } from '../shared/audio/chip.js';
import { compileSong, BAR_TICKS } from '../shared/audio/mml.js';
import { SONGS, WAVES, INSTRUMENTS } from '../shared/audio/songs.js';
import { SFX } from '../shared/audio/sfx.js';

const RATE = 48000;
const SONG_IDS = ['title', 'start', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'boss', 'final', 'clear', 'gameover', 'ending'];
const LOOPING = new Set(['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'boss', 'final']);
const SFX_NAMES = ['shot', 'double', 'laser', 'missile', 'capsule', 'gauge', 'powerup', 'deny', 'shield_on', 'shield_hit', 'enemy_hit',
  'explode_s', 'explode_m', 'explode_l', 'boss_explode', 'player_die', 'ring', 'warning', 'cursor', 'select', 'cancel', 'pause', 'extend', 'checkpoint'];

const frames = (sy, n) => { const buf = new Float32Array(Math.round(n * RATE / 60)); sy.render(buf); return buf; };
const secs = (sy, s) => { const buf = new Float32Array(Math.round(s * RATE)); sy.render(buf); return buf; };
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const peak = (x) => { let p = 0; for (const v of x) { if (!Number.isFinite(v)) return Infinity; p = Math.max(p, Math.abs(v)); } return p; };

test('レトロ音源 — 曲と効果音: 必要な名前がすべてある（option_shot という音は無い）', () => {
  for (const id of SONG_IDS) assert.ok(SONGS[id], `曲 ${id} がない`);
  for (const n of SFX_NAMES) assert.ok(SFX[n], `効果音 ${n} がない`);
  assert.equal(SFX.option_shot, undefined, 'オプションの弾は独自の音を持たない');
  assert.equal(SFX.gauge, SFX.capsule, 'gauge は capsule と同じ音');
  for (const n of Object.keys(SFX)) {
    const d = SFX[n];
    assert.ok(Number.isInteger(d.pri) && d.frames.length > 0, n);
    for (const f of d.frames) {
      assert.ok(f.p >= 0 && f.p <= 4095 && f.n >= 0 && f.n <= 31 && f.v >= 0 && f.v <= 16, `${n}: レジスタの範囲外 ${JSON.stringify(f)}`);
    }
  }
});

test('レトロ音源 — 曲: 記法の誤りがなく、全トラックの長さとループ点が一致し、小節線の間はちょうど 1 小節', () => {
  for (const id of SONG_IDS) {
    const c = compileSong(id, SONGS[id]);
    assert.deepEqual(c.errors, [], id);
    const ts = Object.entries(c.tracks);
    assert.ok(ts.length >= 3, `${id}: トラックが少ない`);
    for (const [k, t] of ts) {
      assert.equal(t.totalTicks, c.totalTicks, `${id}.${k}: 長さ ${t.totalTicks / BAR_TICKS} 小節 ≠ ${c.totalTicks / BAR_TICKS}`);
      assert.equal(t.totalTicks % BAR_TICKS, 0, `${id}.${k}: 小節の途中で終わる`);
      if (LOOPING.has(id)) assert.equal(t.loopTick, c.loopTick, `${id}.${k}: ループ点 ${t.loopTick / BAR_TICKS} ≠ ${c.loopTick / BAR_TICKS} 小節`);
      else assert.equal(t.loopTick, -1, `${id}.${k}: 1 回で終わる曲に L がある`);
    }
    assert.equal(c.loop, LOOPING.has(id), `${id}: loop の指定`);
  }
});

test('レトロ音源 — 曲: 長さが決めた範囲', () => {
  const want = { title: [12, 18], start: [3, 6], clear: [4, 6.5], gameover: [4, 7], ending: [25, 36] };
  for (const id of SONG_IDS) {
    const c = compileSong(id, SONGS[id]);
    if (id === 'boss') assert.ok(c.loopSeconds >= 10 && c.loopSeconds <= 20, `boss ループ ${c.loopSeconds}`);
    else if (LOOPING.has(id)) assert.ok(c.loopSeconds >= (id === 'final' ? 15 : 30) && c.loopSeconds <= 70, `${id} ループ ${c.loopSeconds}`);
    else assert.ok(c.seconds >= want[id][0] && c.seconds <= want[id][1], `${id} 長さ ${c.seconds}`);
  }
  // 面の曲はテンポか調がすべて違う
  const seen = new Set();
  for (let i = 1; i <= 7; i++) { const s = SONGS['stage' + i]; const key = s.tempo; assert.ok(!seen.has(key), `stage${i} のテンポが他と同じ`); seen.add(key); }
});

test('レトロ音源 — 曲: 音域が音源で出せる範囲（周期レジスタ 12bit に収まり、低すぎ・高すぎない）', () => {
  for (const id of SONG_IDS) {
    const c = compileSong(id, SONGS[id]);
    for (const [k, t] of Object.entries(c.tracks)) {
      if (k === 'D') continue;
      for (const e of t.events) {
        if (e.t !== 'n') continue;
        assert.ok(INSTRUMENTS[e.inst], `${id}.${k}: 音色 ${e.inst} がない`);
        const top = e.m + (e.arp ? Math.max(...e.arp) : 0);
        const hz = 440 * Math.pow(2, (e.m - 69) / 12), hzTop = 440 * Math.pow(2, (top - 69) / 12);
        if (k[0] === 'W') { assert.ok(INSTRUMENTS[e.inst].wave && WAVES[INSTRUMENTS[e.inst].wave], `${id}.${k}: 波形のない音色 ${e.inst}`); assert.ok(hz >= 40 && hzTop <= 2000, `${id}.${k}: ${hz.toFixed(0)}Hz`); }
        else { assert.ok(!INSTRUMENTS[e.inst].wave, `${id}.${k}: PSG に波形音色 ${e.inst}`); assert.ok(hz >= 90 && hzTop <= 2700, `${id}.${k}: ${hz.toFixed(0)}Hz`); }
        assert.ok(psgPeriod(hz) > 1 && psgPeriod(hz) < 4095 && wavePeriod(hz) > 1 && wavePeriod(hz) < 4095);
      }
    }
  }
});

test('レトロ音源 — 音源: 周期レジスタどおりの高さで鳴る（PSG と波形メモリ）', () => {
  const count = (x) => { let n = 0; for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) n++; return n; };
  const sy = new ChipSynth(RATE);
  sy.writePSG(0, 0, 254); sy.writePSG(0, 1, 0); sy.writePSG(0, 7, 0x3e); sy.writePSG(0, 8, 15);
  sy.setPaused(false); sy.fade = 1; sy.fadeTarget = 1;
  secs(sy, 0.2); const x = secs(sy, 1);
  const f = PSG_CLOCK / (16 * 254);
  assert.ok(Math.abs(count(x) - f) < 3, `PSG ${count(x)}Hz（期待 ${f.toFixed(1)}）`);
  const sy2 = new ChipSynth(RATE);
  sy2.setWaveTable(0, WAVES.sine); sy2.setWavePeriod(0, 127); sy2.setWaveVolume(0, 15); sy2.fade = 1; sy2.fadeTarget = 1;
  secs(sy2, 0.2); const y = secs(sy2, 1);
  const g = PSG_CLOCK / (32 * 127);
  assert.ok(Math.abs(count(y) - g) < 3, `波形メモリ ${count(y)}Hz（期待 ${g.toFixed(1)}）`);
});

test('レトロ音源 — すべての曲と効果音: NaN が出ず、単独で peak < 1、無音でもない', () => {
  for (const id of SONG_IDS) {
    const sy = new ChipSynth(RATE); sy.playMusic(id);
    const x = secs(sy, 4);
    const p = peak(x);
    assert.ok(p < 1, `${id} peak ${p}`);
    assert.ok(rms(x) > 0.02, `${id} がほぼ無音 rms ${rms(x)}`);
  }
  for (const n of Object.keys(SFX)) {
    const sy = new ChipSynth(RATE); sy.sfx(n);
    const x = secs(sy, SFX[n].frames.length / 60 + 0.1);
    assert.ok(peak(x) < 1, n); assert.ok(rms(x) > 0.003, `${n} がほぼ無音`);
  }
});

test('レトロ音源 — 最大の重なり（最速の曲 + 効果音 3 音を叩き続ける、音量すべて最大、arrange の有無）でも peak < 1', () => {
  for (const arrange of [false, true]) {
    for (const song of ['stage7', 'boss', 'final']) {
      const sy = new ChipSynth(RATE); sy.setVolumes({ master: 1, bgm: 1, sfx: 1 }); sy.setArrange(arrange); sy.playMusic(song);
      const L = new Float32Array(800), R = new Float32Array(800);
      let p = 0;
      const loud = ['explode_l', 'boss_explode', 'player_die', 'laser', 'explode_m', 'shield_on', 'double'];
      for (let i = 0; i < 60 * 12; i++) {
        sy.sfx(loud[i % loud.length]); sy.sfx('shot'); sy.sfx('explode_s');
        sy.renderStereo(L, R); p = Math.max(p, peak(L), peak(R));
      }
      assert.ok(p < 1, `${song} arrange=${arrange} peak ${p}`);
      assert.ok(p > 0.3, `${song}: 音が出ていない ${p}`);
    }
  }
});

test('レトロ音源 — オプションの決まり: 同じフレームに shot を何回呼んでも 1 回分（オプション 0〜4 個で同じ音）', () => {
  const outs = [];
  for (const k of [1, 2, 5]) {
    const sy = new ChipSynth(RATE); sy.playMusic('stage1');
    frames(sy, 30);
    for (let i = 0; i < k; i++) sy.sfx('shot');
    assert.deepEqual(sy.sfxActive().filter(Boolean), ['shot'], '1 チャンネルだけ使う');
    outs.push(frames(sy, 20));
  }
  assert.deepEqual(outs[1], outs[0]); assert.deepEqual(outs[2], outs[0]);
  // 連射: 次のフレームで呼び直すと同じチャンネルで頭から（重ならない）
  const sy = new ChipSynth(RATE);
  const ch = sy.sfx('shot'); frames(sy, 3);
  assert.equal(sy.sfx('shot'), ch); assert.deepEqual(sy.sfxActive().filter(Boolean), ['shot']);
  assert.equal(sy.sfx('gauge'), sy.sfx('capsule'), 'gauge と capsule は同じ音なので同じチャンネル');
});

test('レトロ音源 — 効果音の優先度: 高い音が低い音を奪い、低い音は高い音を奪えない', () => {
  const sy = new ChipSynth(RATE);
  sy.sfx('player_die'); sy.sfx('boss_explode'); sy.sfx('warning');
  frames(sy, 2);
  assert.equal(sy.sfx('shot'), -1, '低い音は鳴らない');
  assert.deepEqual([...sy.sfxActive()].sort(), ['boss_explode', 'player_die', 'warning']);
  const sy2 = new ChipSynth(RATE);
  sy2.sfx('shot'); sy2.sfx('enemy_hit'); sy2.sfx('cursor'); frames(sy2, 1);
  const c = sy2.sfx('explode_l');
  assert.ok(c >= 0); assert.ok(!sy2.sfxActive().includes('enemy_hit'), '一番低い enemy_hit が奪われる');
  assert.ok(sy2.sfxActive().includes('explode_l'));
  // 同じ優先度なら一番古い音を奪う
  const sy3 = new ChipSynth(RATE);
  sy3.sfx('shot'); frames(sy3, 1); sy3.sfx('missile'); frames(sy3, 1); sy3.sfx('cursor'); frames(sy3, 1);
  sy3.sfx('double');
  assert.ok(!sy3.sfxActive().includes('shot') && sy3.sfxActive().includes('double'));
});

test('レトロ音源 — 効果音は PSG-B だけを使い、曲の音（PSG-A・波形メモリ）を書き換えない', () => {
  const a = new ChipSynth(RATE), b = new ChipSynth(RATE);
  a.playMusic('stage2'); b.playMusic('stage2');
  for (let i = 0; i < 300; i++) {
    if (i % 7 === 0) b.sfx(['explode_l', 'laser', 'player_die', 'shot'][i % 4]);
    frames(a, 1); frames(b, 1);
    assert.deepEqual(b.psgA.reg, a.psgA.reg);
    assert.equal(b.wave[0].period, a.wave[0].period); assert.equal(b.wave[1].vol, a.wave[1].vol);
  }
});

test('レトロ音源 — 一時停止: 曲が消え、位置が止まり、解除すると同じ位置から続く', () => {
  const ref = new ChipSynth(RATE), sy = new ChipSynth(RATE);
  ref.playMusic('stage1'); sy.playMusic('stage1');
  secs(ref, 2); secs(sy, 2);
  sy.sfx('laser'); frames(sy, 1); frames(ref, 1);
  const before = sy.musicPosition();
  sy.setPaused(true);
  const quiet = secs(sy, 1.5);
  assert.ok(rms(quiet, Math.round(0.06 * RATE)) < 1e-5, `一時停止中に音が残る ${rms(quiet, Math.round(0.06 * RATE))}`);
  assert.deepEqual(sy.musicPosition(), before, '一時停止中は進まない');
  assert.deepEqual(sy.sfxActive(), [null, null, null], '鳴っていた効果音は止まる');
  sy.sfx('pause');
  assert.ok(sy.sfxActive().includes('pause'), '一時停止中でもポーズ音は鳴らせる');
  assert.ok(rms(frames(sy, 20)) > 0.005);
  sy.setPaused(false);
  // 基準と同じフレーム数だけ進めて、曲のレジスタが一致する
  const target = ref.musicPosition().frame;
  while (sy.musicPosition().frame < target) frames(sy, 1);
  assert.equal(sy.musicPosition().frame, target);
  assert.equal(sy.musicPosition().tick, ref.musicPosition().tick);
  assert.deepEqual(sy.psgA.reg.slice(0, 11), ref.psgA.reg.slice(0, 11));
  for (let k = 0; k < 120; k++) {
    frames(ref, 1); frames(sy, 1);
    assert.deepEqual(sy.psgA.reg.slice(0, 11), ref.psgA.reg.slice(0, 11), `再開後 ${k} フレーム`);
  }
  assert.ok(rms(frames(sy, 30)) > 0.02, '再開後に鳴っている');
});

test('レトロ音源 — 停止と切り替え: 5ms のフェードで止まり、同じ曲の playMusic は頭に戻らない', () => {
  const sy = new ChipSynth(RATE); sy.playMusic('stage3');
  secs(sy, 1);
  const p = sy.musicPosition().frame;
  sy.playMusic('stage3');
  assert.ok(sy.musicPosition().frame === p, '同じ曲は続ける');
  sy.playMusic('stage3', { restart: true }); secs(sy, 0.01);
  assert.ok(sy.musicPosition().frame < 3, 'restart で頭から');
  secs(sy, 1);
  sy.stopMusic();
  const x = secs(sy, 0.5);
  assert.ok(!sy.isMusicPlaying());
  assert.ok(rms(x, Math.round(0.06 * RATE)) < 1e-5, '止めたあとに音が残る');
  // 止め際の 1 サンプルの段差が、鳴っている最中の普通の段差より大きくない
  let mx = 0; for (let i = 1; i < Math.round(0.01 * RATE); i++) mx = Math.max(mx, Math.abs(x[i] - x[i - 1]));
  assert.ok(mx < 0.2, `止め際の段差 ${mx}`);
});

test('レトロ音源 — 1 回で終わる曲は終わると止まり ended を知らせる。ループする曲は全トラックが一緒に頭へ戻る', () => {
  const sy = new ChipSynth(RATE); sy.playMusic('start');
  let ended = false;
  for (let i = 0; i < 10 * 60 && !ended; i++) { frames(sy, 1); ended = sy.drainEvents().some((e) => e.type === 'ended' && e.id === 'start'); }
  assert.ok(ended && !sy.isMusicPlaying());
  const s2 = new ChipSynth(RATE); s2.playMusic('boss');
  const c = s2.compiled('boss');
  let loops = 0;
  for (let i = 0; i < Math.ceil((c.seconds + c.loopSeconds) * 60) + 10; i++) { frames(s2, 1); loops += s2.drainEvents().filter((e) => e.type === 'loop').length; }
  assert.equal(loops, 2);
  for (const t of s2.song.tracks) assert.ok(!t.done);
  const idx = s2.song.tracks.map((t) => t.idx - t.loopIdx);
  assert.ok(idx.every((v) => v >= 0), 'どのトラックもループ点より後ろにいる');
});

test('レトロ音源 — 同じ操作なら同じ音（決定的）', () => {
  const run = () => {
    const sy = new ChipSynth(44100); sy.playMusic('stage4');
    const out = [];
    for (let i = 0; i < 200; i++) { if (i % 9 === 0) sy.sfx('shot'); if (i === 50) sy.sfx('explode_l'); if (i === 120) sy.setPaused(true); if (i === 140) sy.setPaused(false); out.push(frames(sy, 1)); }
    return out;
  };
  const a = run(), b = run();
  for (let i = 0; i < a.length; i++) assert.deepEqual(a[i], b[i]);
});

test('レトロ音源 — 音量: bgm=0 で曲が消え、効果音だけ残る。master=0 で全部消える', () => {
  const sy = new ChipSynth(RATE); sy.playMusic('stage1'); secs(sy, 1);
  sy.setVolumes({ bgm: 0 }); secs(sy, 0.1);
  assert.ok(rms(secs(sy, 0.5)) < 1e-4);
  sy.sfx('explode_m'); assert.ok(rms(secs(sy, 0.2)) > 0.01);
  sy.setVolumes({ master: 0 }); secs(sy, 0.1); sy.sfx('explode_m');
  assert.ok(rms(secs(sy, 0.3)) < 1e-4);
});

// ================================================================ モダン音源
import { ModernSynth } from '../shared/audio/modern.js';
import { SoundCore } from '../shared/audio/core.js';
import { compileModernSong, MODERN_DRUM_KEYS } from '../shared/audio/mml.js';
import { MSONGS, parseChord } from '../shared/audio/songs2.js';
import { MSFX, RETRO_ALIAS } from '../shared/audio/sfx2.js';
import { PATCHES, DRUMKIT } from '../shared/audio/patches.js';
import { basic, loudness, bands, truePeak, fft } from '../tools/audio-metrics.js';
import { PerformanceObserver } from 'node:perf_hooks';

const NEW_SFX = ['turret_fire', 'piston_slam', 'zap_warn', 'zap_beam', 'tentacle', 'cell_pop', 'boss_enter', 'boss_telegraph', 'boss_beam', 'boss_attack', 'part_destroyed', 'phase_change',
  'shield_break', 'powerup_speed', 'powerup_missile', 'powerup_double', 'powerup_laser', 'powerup_option', 'resume', 'start', 'stinger'];
const st = (sy, sec) => { const n = Math.round(sec * RATE), L = new Float32Array(n), R = new Float32Array(n); sy.renderStereo(L, R); return { L, R }; };
const stf = (sy, fr) => st(sy, fr / 60);
const rms2 = (r) => basic(r.L, r.R).rms;
const peakHz = (x, lo = 20, hi = 20000) => {
  const N = 16384, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N && i < x.length; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  fft(re, im); let b = 1, m = 0;
  for (let k = Math.ceil(lo * N / RATE); k < Math.min(N / 2, hi * N / RATE); k++) { const p = re[k] * re[k] + im[k] * im[k]; if (p > m) { m = p; b = k; } }
  return b * RATE / N;
};
const hiLo = (r) => { const b = bands(r.L, r.R).db, tot = 20 * Math.log10(basic(r.L, r.R).rms + 1e-9); const s = (a) => tot + 10 * Math.log10(a.reduce((x, v) => x + 10 ** (v / 10), 0)); return { hi: s(b.slice(6)), lo: s(b.slice(0, 4)) }; };

test('モダン音源 — 曲と効果音: 従来の名前がすべてあり、新しい効果音もある（option_shot は無い）。レトロ音源への読み替えが漏れなくある', () => {
  for (const id of SONG_IDS) assert.ok(MSONGS[id], `曲 ${id} がない`);
  assert.deepEqual(Object.keys(MSONGS).sort(), [...SONG_IDS].sort());
  for (const n of [...SFX_NAMES, ...NEW_SFX]) assert.ok(MSFX[n], `効果音 ${n} がない`);
  assert.equal(MSFX.option_shot, undefined);
  for (const n of Object.keys(MSFX)) {
    assert.ok(MSFX[n].layers.length > 0 && Number.isInteger(MSFX[n].pri), n);
    if (!SFX[n]) { assert.ok(n in RETRO_ALIAS, `${n}: レトロ音源での読み替えがない`); assert.ok(RETRO_ALIAS[n] === null || SFX[RETRO_ALIAS[n]], n); }
  }
  // 重要な音ほど優先度が高い
  assert.ok(MSFX.player_die.pri > MSFX.boss_explode.pri && MSFX.boss_explode.pri > MSFX.warning.pri - 1 && MSFX.warning.pri > MSFX.explode_l.pri && MSFX.explode_l.pri > MSFX.shot.pri && MSFX.shot.pri > MSFX.enemy_hit.pri);
});

test('モダン音源 — 曲: 記法の誤りがなく、全トラックの長さとループ点が一致し、音色・打楽器が定義済み。ループ曲には動的な層がある', () => {
  for (const id of SONG_IDS) {
    const c = compileModernSong(id, MSONGS[id]);
    assert.deepEqual(c.errors, [], id);
    assert.ok(c.tracks.length >= 9, `${id}: トラック数 ${c.tracks.length}（12 声以上を鳴らせる編成）`);
    for (const t of c.tracks) {
      assert.equal(t.totalTicks, c.totalTicks, `${id}.${t.name}: 長さ ${t.totalTicks / BAR_TICKS} 小節 ≠ ${c.totalTicks / BAR_TICKS}`);
      assert.equal(t.totalTicks % BAR_TICKS, 0, `${id}.${t.name}`);
      if (LOOPING.has(id)) assert.equal(t.loopTick, c.loopTick, `${id}.${t.name}: ループ点`); else assert.equal(t.loopTick, -1);
      for (const e of t.events) {
        if (e.t === 'n') assert.ok(PATCHES[e.inst], `${id}.${t.name}: 音色 ${e.inst} がない`);
        if (e.t === 'd') assert.ok(DRUMKIT[e.d] && MODERN_DRUM_KEYS.includes(e.d), `${id}.${t.name}: 打楽器 ${e.d}`);
      }
    }
    assert.equal(c.loop, LOOPING.has(id));
    const layers = new Set(c.tracks.map((t) => t.layer));
    if (LOOPING.has(id)) assert.ok(layers.has(1) && layers.has(2) && layers.has('danger'), `${id}: 動的な層`);
    const lead = MSONGS[id].lead;
    if (/^stage/.test(id)) { assert.ok(lead && MSONGS[lead.song] && !MSONGS[lead.song].loop && lead.tempo === MSONGS[id].tempo, `${id}: 開始ファンファーレの指定`); parseChord(MSONGS[id].key); }
  }
});

test('モダン音源 — 曲: 長さが決めた範囲（面の曲は 45〜70 秒のループに展開部がある）、面ごとにテンポが違う', () => {
  const want = { title: [14, 20], start: [2.5, 5], clear: [5, 8], gameover: [5, 8], ending: [28, 36] };
  const seen = new Set();
  for (const id of SONG_IDS) {
    const c = compileModernSong(id, MSONGS[id]);
    if (id === 'boss') assert.ok(c.loopSeconds >= 20 && c.loopSeconds <= 35, `boss ${c.loopSeconds}`);
    else if (id === 'final') assert.ok(c.loopSeconds >= 35 && c.loopSeconds <= 55, `final ${c.loopSeconds}`);
    else if (LOOPING.has(id)) { assert.ok(c.loopSeconds >= 45 && c.loopSeconds <= 70, `${id} ループ ${c.loopSeconds}`); assert.ok(c.introSeconds >= 4, `${id} 前奏`); assert.ok(!seen.has(c.tempo)); seen.add(c.tempo); assert.ok(MSONGS[id].chords.length >= 5, `${id}: 前奏＋A/B/C＋ブレイク`); }
    else assert.ok(c.seconds >= want[id][0] && c.seconds <= want[id][1], `${id} 長さ ${c.seconds}`);
  }
});

test('モダン音源 — 曲の作り: 調の中の音が 9 割以上（ファンファーレは借用和音で 6 割以上）、音域が各パートの範囲内', () => {
  const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 9, 10, 11];
  for (const id of SONG_IDS) {
    const def = MSONGS[id], c = compileModernSong(id, def), key = parseChord(def.key), scale = def.key.endsWith('m') ? MINOR : MAJOR;
    const ks = []; for (const s of def.chords) for (let i = 0; i < s.bars.length; i++) ks.push(s.k);
    let all = 0, inKey = 0;
    for (const t of c.tracks) {
      if (t.drum) continue;
      let tick = 0;
      for (const e of t.events) {
        if (e.t === 'n' && e.inst !== 'riser' && e.inst !== 'sweep') for (const m of e.ms || [e.m]) {
          const pc = (((m - ks[Math.min(ks.length - 1, Math.floor(tick / 96))] - key.root) % 12) + 12) % 12;
          all += e.len; if (scale.includes(pc)) inKey += e.len;
          if (t.name === 'bass') assert.ok(m >= 26 && m <= 58, `${id} 低音 ${m}`);
          if (t.name === 'lead') assert.ok(m >= 52 && m <= 98, `${id} 旋律 ${m}`);
          assert.ok(m >= 24 && m <= 108, `${id}.${t.name} ${m}`);
        }
        tick += e.len;
      }
    }
    assert.ok(inKey / all >= (id === 'start' ? 0.6 : 0.9), `${id}: 調の中の音 ${(inKey / all * 100).toFixed(0)}%`);
  }
});

test('モダン音源 — 高さが正しい（A4 = 440Hz、移調、効果音の step で音階が上がる）', () => {
  MSONGS.__pitch = { tempo: 120, loop: false, key: 'C', chords: [], tracks: { a: { mml: '@lead_soft o4 a1 | a1 |', patch: 'lead_soft' } } };
  try {
    const sy = new ModernSynth(RATE); sy.playMusic('__pitch'); st(sy, 0.5);
    assert.ok(Math.abs(peakHz(st(sy, 1).L) - 440) < 4);
    const s2 = new ModernSynth(RATE); s2._startSong('__pitch', { transpose: 3 }); st(s2, 0.5);
    assert.ok(Math.abs(peakHz(st(s2, 1).L) - 440 * 2 ** (3 / 12)) < 5, '移調 +3');
  } finally { delete MSONGS.__pitch; }
  const f = [0, 1, 2, 3, 4, 5].map((step) => { const sy = new ModernSynth(RATE); sy.sfx('capsule', { step }); st(sy, 0.06); return peakHz(st(sy, 0.3).L, 600, 6000); });
  for (let i = 1; i < 6; i++) assert.ok(f[i] > f[i - 1] * 1.05, `ゲージ ${i}: ${f[i - 1].toFixed(0)} → ${f[i].toFixed(0)}Hz`);
  const sh = [1, 5].map((step) => { const sy = new ModernSynth(RATE); sy.sfx('shield_hit', { step }); return peakHz(st(sy, 0.3).L, 800, 6000); });
  assert.ok(sh[0] < sh[1] * 0.8, `シールドの残りが少ないほど低い ${sh}`);
});

test('モダン音源 — すべての曲と効果音: NaN なし、単独でピーク 0.9 未満・真のピーク 1.0 未満、無音でない、直流なし、モノラルにしても痩せない', () => {
  for (const id of SONG_IDS) {
    const sy = new ModernSynth(RATE); sy.playMusic(id);
    const r = st(sy, 12), b = basic(r.L, r.R);
    assert.equal(b.nan, 0, id); assert.ok(b.peak < 0.9, `${id} peak ${b.peak}`); assert.ok(b.rms > 0.02, `${id} がほぼ無音 ${b.rms}`);
    assert.ok(Math.abs(b.dc) < 1e-3, `${id} 直流 ${b.dc}`); assert.ok(b.corr > 0.3, `${id} 左右の相関 ${b.corr}`);
    assert.ok(Math.max(truePeak(r.L), truePeak(r.R)) < 1.0, `${id} 真のピーク`);
    assert.equal(sy.steals, 0, `${id}: 声が足りない`);
  }
  for (const n of Object.keys(MSFX)) {
    const sy = new ModernSynth(RATE); sy.sfx(n);
    const r = st(sy, sy.sfxDefs[n].seconds + 0.5), b = basic(r.L, r.R);
    assert.equal(b.nan, 0, n); assert.ok(b.peak < 0.9 && b.peak > 0.02, `${n} peak ${b.peak}`); assert.ok(Math.abs(b.dc) < 3e-3, `${n} 直流`);
    const tail = st(sy, 3); assert.ok(rms2({ L: tail.L.subarray(RATE * 2), R: tail.R.subarray(RATE * 2) }) < 2e-3, `${n} が鳴りやまない`);
    assert.deepEqual(sy.sfxActive().filter(Boolean), [], `${n} が終わらない`);
  }
});

test('モダン音源 — 曲の音量がそろっている（統合ラウドネス -15 LUFS ± 2 LU）', () => {
  for (const id of SONG_IDS) {
    const sy = new ModernSynth(RATE); sy.playMusic(id);
    const c = sy.compiled(id), r = st(sy, Math.min(40, c.seconds + 1));
    const l = loudness(r.L, r.R).lufs;
    assert.ok(Math.abs(l + 15) <= 2, `${id}: ${l.toFixed(1)} LUFS`);
  }
});

test('モダン音源 — 最大の重なり（最速の曲＋すべての層＋効果音を毎フレーム、音量最大）でもピーク 0.9 未満・NaN なし', () => {
  const loud = ['explode_l', 'boss_explode', 'player_die', 'laser', 'explode_m', 'shield_on', 'double', 'part_destroyed', 'boss_beam', 'phase_change', 'warning'];
  for (const song of ['stage7', 'boss', 'final']) {
    const sy = new ModernSynth(RATE); sy.setVolumes({ master: 1, bgm: 1, sfx: 1 }); sy.setIntensity(2); sy.setLayer('danger', true); sy.playMusic(song);
    const L = new Float32Array(800), R = new Float32Array(800); let p = 0;
    for (let i = 0; i < 60 * 10; i++) {
      sy.sfx(loud[i % loud.length], { pan: (i % 21) / 10 - 1 }); sy.sfx('shot'); sy.sfx('explode_s');
      sy.renderStereo(L, R); p = Math.max(p, peak(L), peak(R));
    }
    assert.ok(p < 0.9, `${song} peak ${p}`); assert.ok(p > 0.3);
    assert.ok(sy.peakVoices >= 20, `同時発音 ${sy.peakVoices}`);
  }
});

test('モダン音源 — オプションの決まり: 同じフレームに shot を何回呼んでも 1 回分。連射しても shot は 1 つしか鳴っていない', () => {
  const outs = [];
  for (const k of [1, 2, 5]) {
    const sy = new ModernSynth(RATE); sy.playMusic('stage1'); stf(sy, 30);
    for (let i = 0; i < k; i++) sy.sfx('shot');
    assert.deepEqual(sy.sfxActive().filter(Boolean), ['shot']);
    outs.push(stf(sy, 20).L);
  }
  assert.deepEqual(outs[1], outs[0]); assert.deepEqual(outs[2], outs[0]);
  const sy = new ModernSynth(RATE);
  for (let i = 0; i < 40; i++) { sy.sfx('shot'); sy.sfx('shot'); assert.equal(sy.sfxActive().filter((x) => x === 'shot').length, 1); stf(sy, 6); }
  for (const w of ['double', 'laser', 'missile']) { const s2 = new ModernSynth(RATE); for (let i = 0; i < 10; i++) { s2.sfx(w); stf(s2, 3); assert.equal(s2.sfxActive().filter(Boolean).length, 1, w); } }
});

test('モダン音源 — 連射の音は毎回わずかに違い、音量はそろっている', () => {
  const sy = new ModernSynth(RATE); const a = [];
  for (let i = 0; i < 6; i++) { sy.sfx('shot'); a.push(stf(sy, 12)); }
  for (let i = 1; i < 6; i++) {
    assert.notDeepEqual(a[i].L, a[0].L);
    const d = 20 * Math.log10(rms2(a[i]) / rms2(a[0])); assert.ok(Math.abs(d) < 2.5, `音量差 ${d.toFixed(1)}dB`);
  }
});

test('モダン音源 — 効果音の優先度: 高い音が低い音を奪い、低い音は高い音を奪えない。同じ優先度なら古い音から', () => {
  const hi = ['player_die', 'boss_explode', 'warning', 'phase_change', 'boss_enter', 'extend', 'start', 'stinger', 'powerup', 'powerup_speed', 'powerup_missile', 'powerup_double'];
  const sy = new ModernSynth(RATE);
  for (const n of hi) assert.ok(sy.sfx(n) >= 0, n);
  stf(sy, 2);
  assert.equal(sy.sfx('shot'), -1, '低い音は鳴らない'); assert.equal(sy.sfx('explode_l'), -1);
  assert.deepEqual(sy.sfxActive().slice().sort(), hi.slice().sort());
  assert.ok(sy.sfx('player_die') >= 0, 'ミスの音はいつでも鳴る');
  const lo = ['shot', 'double', 'laser', 'missile', 'enemy_hit', 'turret_fire', 'tentacle', 'cell_pop', 'explode_s', 'ring', 'cursor', 'capsule'];
  const s2 = new ModernSynth(RATE);
  for (const n of lo) { assert.ok(s2.sfx(n) >= 0, n); st(s2, 0.002); }
  assert.ok(s2.sfx('explode_l') >= 0);
  assert.ok(!s2.sfxActive().includes('enemy_hit'), '一番低くて古い enemy_hit が奪われる');
  assert.ok(s2.sfxActive().includes('turret_fire') && s2.sfxActive().includes('explode_l'));
  assert.ok(s2.sfx('warning') >= 0); assert.ok(!s2.sfxActive().includes('turret_fire'));
  // 警告・ミス・ボスの音は、ほかの音で埋まっていても必ず鳴る
  const s3 = new ModernSynth(RATE);
  for (let i = 0; i < 200; i++) { s3.sfx(lo[i % lo.length]); s3.sfx('explode_m'); s3.sfx('explode_s'); stf(s3, 1); }
  for (const n of ['player_die', 'warning', 'boss_explode', 'boss_enter']) { assert.ok(s3.sfx(n) >= 0, n); assert.ok(s3.sfxActive().includes(n)); }
});

test('モダン音源 — 効果音は曲の声を奪わない（曲の進行と発音は効果音があっても同じ）', () => {
  const a = new ModernSynth(RATE), b = new ModernSynth(RATE);
  a.playMusic('stage2'); b.playMusic('stage2');
  const snap = (sy) => sy.mv.map((v) => (v.on ? `${v.trk.name}:${v.noteT}:${v.rel}` : '-')).join(',');
  for (let i = 0; i < 400; i++) {
    if (i % 5 === 0) b.sfx(['explode_l', 'laser', 'player_die', 'shot', 'boss_explode'][i % 5]);
    stf(a, 1); stf(b, 1);
    assert.equal(snap(b), snap(a)); assert.equal(b.musicPosition().tick, a.musicPosition().tick);
  }
});

test('モダン音源 — 一時停止: 曲は止まらずにこもる（高域が 18dB 以上下がる）。鳴っていた効果音は消え、ポーズ音は鳴る。解除で元に戻り、位置はずれない', () => {
  const ref = new ModernSynth(RATE), sy = new ModernSynth(RATE);
  ref.playMusic('stage1'); sy.playMusic('stage1');
  st(ref, 8); st(sy, 8);
  const before = hiLo(st(sy, 2)); st(ref, 2);
  sy.sfx('explode_l'); stf(sy, 2); stf(ref, 2);
  sy.setPaused(true);
  const tr = st(sy, 0.5); st(ref, 0.5);
  assert.deepEqual(sy.sfxActive().filter(Boolean), [], '鳴っていた効果音は止まる');
  const paused = hiLo(st(sy, 2)); st(ref, 2);
  assert.ok(before.hi - paused.hi > 18, `高域 ${before.hi.toFixed(1)} → ${paused.hi.toFixed(1)}dB`);
  assert.ok(before.lo - paused.lo < 12, `低域は残る ${before.lo.toFixed(1)} → ${paused.lo.toFixed(1)}dB`);
  let mx = 0; for (let i = 1; i < tr.L.length; i++) mx = Math.max(mx, Math.abs(tr.L[i] - tr.L[i - 1]));
  assert.ok(mx < 0.5, `止め際の段差 ${mx}`);
  assert.ok(sy.sfx('pause') >= 0 && sy.sfxActive().includes('pause'));
  assert.ok(rms2(stf(sy, 20)) > 0.005); stf(ref, 20);
  sy.setPaused(false); st(sy, 0.6); st(ref, 0.6);
  assert.deepEqual(sy.musicPosition(), ref.musicPosition(), '位置は止めなかった場合と同じ');
  const after = hiLo(st(sy, 2)), want = hiLo(st(ref, 2));
  assert.ok(Math.abs(after.hi - want.hi) < 3, `解除後の高域 ${after.hi.toFixed(1)} / ${want.hi.toFixed(1)}`);
});

test('モダン音源 — 停止と切り替え: フェードで止まり、同じ曲の playMusic は頭に戻らない。restart で頭から。切り替えは前の曲を消してから', () => {
  const sy = new ModernSynth(RATE); sy.playMusic('stage3'); st(sy, 2);
  const p = sy.musicPosition().tick;
  sy.playMusic('stage3'); st(sy, 0.01);
  assert.ok(sy.musicPosition().tick >= p && sy.musicPosition().tick < p + 5, '同じ曲は続ける');
  sy.playMusic('stage3', { restart: true }); st(sy, 0.6);
  assert.ok(sy.musicPosition().seconds < 0.5, `restart で頭から ${sy.musicPosition().seconds}`);
  st(sy, 2);
  sy.playMusic('boss', { fade: 0.2 }); assert.equal(sy.musicPosition().id, 'stage3'); st(sy, 0.5);
  assert.equal(sy.musicPosition().id, 'boss');
  st(sy, 2);
  sy.stopMusic({ fade: 0.3 });
  const x = st(sy, 0.4); assert.ok(!sy.isMusicPlaying());
  let mx = 0; for (let i = 1; i < x.L.length; i++) mx = Math.max(mx, Math.abs(x.L[i] - x.L[i - 1]));
  assert.ok(mx < 0.5, `止め際の段差 ${mx}`);
  st(sy, 5);
  assert.ok(rms2(st(sy, 0.5)) < 1e-4, '止めたあと（残響が消えたあと）に音が残る');
  // テープストップ: 高さが落ちてから次の曲へ
  const t = new ModernSynth(RATE); t.playMusic('stage1'); st(t, 8);
  const c0 = bands(...Object.values(st(t, 0.5))).centroid;
  t.playMusic('gameover', { mode: 'tape', fade: 0.9 }); st(t, 0.45);
  const c1 = bands(...Object.values(st(t, 0.4))).centroid;
  assert.ok(c1 < c0 * 0.75, `テープストップで音が低くなる ${c0.toFixed(0)} → ${c1.toFixed(0)}Hz`);
  st(t, 1); assert.equal(t.musicPosition().id, 'gameover');
});

test('モダン音源 — 1 回で終わる曲は終わると ended。ループ曲は全トラックが一緒に戻り、毎周同じ長さ', () => {
  const sy = new ModernSynth(RATE); sy.playMusic('clear');
  let ended = false;
  for (let i = 0; i < 20 * 60 && !ended; i++) { stf(sy, 1); ended = sy.drainEvents().some((e) => e.type === 'ended' && e.id === 'clear'); }
  assert.ok(ended && !sy.isMusicPlaying());
  const s2 = new ModernSynth(RATE); s2.playMusic('boss');
  const c = s2.compiled('boss'), at = [];
  const n = Math.ceil((c.seconds + c.loopSeconds) * RATE) + 4096, L = new Float32Array(512), R = new Float32Array(512);
  for (let done = 0; done < n; done += 512) { s2.renderStereo(L, R); for (const e of s2.drainEvents()) if (e.type === 'loop' || e.type === 'loopStart') at.push(e.sample); }
  assert.equal(at.length, 3, 'loopStart・1 周目・2 周目');
  assert.ok(Math.abs((at[1] - at[0]) - (at[2] - at[1])) <= 64, `周の長さ ${at[1] - at[0]} / ${at[2] - at[1]}`);
  assert.ok(Math.abs((at[1] - at[0]) / RATE - c.loopSeconds) < 0.01);
  for (let i = 0; i < s2.song.n; i++) { const t = s2.tracks[i]; assert.ok(!t.done && t.idx >= t.loopIdx, t.name); }
});

test('モダン音源 — 開始ファンファーレから面の曲へ切れ目なくつながる（無音なし・ended を出さない・面の調とテンポに合わせる）', () => {
  for (const id of ['stage1', 'stage5']) {
    const sy = new ModernSynth(RATE); sy.playMusic(id, { lead: true, restart: true });
    st(sy, 0.3);
    assert.equal(sy.musicPosition().id, id); assert.equal(sy.musicPosition().lead, true);
    assert.equal(sy.song.id, 'start'); assert.equal(sy.song.transpose, MSONGS[id].lead.transpose);
    sy.playMusic(id); st(sy, 0.01); assert.equal(sy.song.id, 'start', '同じ曲をもう一度頼んでも頭に戻らない');
    const r = st(sy, 7), w = Math.round(0.06 * RATE);
    for (let s = 0; s + w < r.L.length; s += w) assert.ok(rms(r.L, s, s + w) > 0.004, `${id}: ${(s / RATE).toFixed(2)} 秒に無音`);
    assert.equal(sy.musicPosition().lead, false); assert.equal(sy.song.id, id);
    assert.ok(!sy.drainEvents().some((e) => e.type === 'ended'));
    // ファンファーレ 2 小節ぶんのあと、面の曲の頭から
    const bars = 2 * 4 * 60 / MSONGS[id].tempo;
    assert.ok(Math.abs(sy.musicPosition().seconds - 7.31) < 0.02);
    assert.ok(Math.abs(sy.song.tick / 24 * 60 / MSONGS[id].tempo - (7.31 - bars)) < 0.05, 'テンポを面に合わせている');
  }
});

test('モダン音源 — 動的な曲: 強さ 1・2 と danger で層が加わり（発音が増える）、戻すと消える。ふだんは鳴らない', () => {
  const run = (n, dg) => { const sy = new ModernSynth(RATE); sy.setIntensity(n); sy.setLayer('danger', dg); sy.playMusic('boss'); st(sy, 6); const r = st(sy, 12); return { sy, l: loudness(r.L, r.R).lufs, names: new Set(sy.mv.filter((v) => v.on).map((v) => v.trk.name)) }; };
  const a = run(0, false), b = run(1, false), c = run(2, false), d = run(0, true);
  assert.ok(b.l > a.l + 0.1 && c.l > b.l + 0.05 && d.l > a.l + 0.1, `LUFS ${[a.l, b.l, c.l, d.l].map((v) => v.toFixed(2))}`);
  assert.ok(c.l - a.l < 4, '大きくなりすぎない');
  const sy = new ModernSynth(RATE); sy.playMusic('final'); st(sy, 5);
  const on = (name) => sy.tracks.slice(0, sy.song.n).find((t) => t.name === name).lg;
  assert.equal(on('l1'), 0); assert.equal(on('l2'), 0); assert.equal(on('dg'), 0);
  sy.setIntensity(2); st(sy, 1); assert.equal(on('l1'), 1); assert.equal(on('l2'), 1); assert.ok(sy.tempoMul > 1.0, '強さ 2 でわずかに速く');
  sy.setLayer('danger', true); st(sy, 1); assert.equal(on('dg'), 1);
  sy.setIntensity(0); sy.setLayer('danger', false); st(sy, 4); assert.equal(on('l1'), 0); assert.equal(on('dg'), 0); assert.ok(Math.abs(sy.tempoMul - 1) < 1e-9);
});

test('モダン音源 — 効果音の定位: pan で左右に振れ、中央は左右同じ。大きな効果音の間は曲が下がる', () => {
  const e = (pan) => { const sy = new ModernSynth(RATE); sy.sfx('enemy_hit', pan === null ? undefined : { pan }); const r = st(sy, 0.2); return [rms(r.L), rms(r.R)]; };
  const [cl, cr] = e(null), [ll, lr] = e(-1), [rl, rr] = e(1), [hl, hr] = e(0.5);
  assert.ok(Math.abs(cl - cr) / cl < 0.05, '中央'); assert.ok(ll > lr * 3, '左'); assert.ok(rr > rl * 3, '右'); assert.ok(hr > hl * 1.3 && hr < hl * 4, '±0.5 は控えめ');
  const a = new ModernSynth(RATE), b = new ModernSynth(RATE); a.playMusic('stage1'); b.playMusic('stage1'); st(a, 6); st(b, 6);
  b.sfx('player_die'); st(a, 0.3); st(b, 0.3);
  assert.ok(b.sfxDuck < 0.6 && a.sfxDuck === 1, `曲を下げる ${b.sfxDuck}`);
  st(b, 4); assert.ok(b.sfxDuck > 0.97, '戻る');
});

test('モダン音源 — 同じ操作なら同じ音（決定的）。標本化周波数を変えても曲の長さは同じで NaN が出ない', () => {
  const run = () => {
    const sy = new ModernSynth(44100); sy.playMusic('stage4', { lead: true });
    const out = [];
    for (let i = 0; i < 300; i++) { if (i % 9 === 0) sy.sfx('shot', { pan: 0.2 }); if (i === 50) sy.sfx('explode_l'); if (i === 120) sy.setPaused(true); if (i === 140) sy.setPaused(false); if (i === 200) sy.setIntensity(2);
      const b = new Float32Array(735), c = new Float32Array(735); sy.renderStereo(b, c); out.push(b, c); }
    return out;
  };
  const a = run(), b = run();
  for (let i = 0; i < a.length; i++) assert.deepEqual(a[i], b[i]);
  for (const sr of [22050, 44100, 96000]) {
    const sy = new ModernSynth(sr); sy.playMusic('boss'); sy.sfx('boss_explode');
    const n = sr * 4, L = new Float32Array(n), R = new Float32Array(n); sy.renderStereo(L, R);
    const b2 = basic(L, R); assert.equal(b2.nan, 0); assert.ok(b2.peak < 0.9 && b2.rms > 0.02, `${sr}Hz`);
    assert.ok(Math.abs(sy.musicPosition().tick - 4 * 170 * 24 / 60) <= 2, `${sr}Hz の進み ${sy.musicPosition().tick}`);
  }
  // モノラルで受け取ると左右の平均
  const s1 = new ModernSynth(RATE), s2 = new ModernSynth(RATE); s1.playMusic('title'); s2.playMusic('title');
  const m = new Float32Array(4800); s1.render(m); const r = st(s2, 0.1);
  for (let i = 0; i < 4800; i += 97) assert.ok(Math.abs(m[i] - 0.5 * (r.L[i] + r.R[i])) < 1e-6);
});

test('モダン音源 — 音量: bgm=0 で曲が消え効果音だけ残る。master=0 で全部消える', () => {
  const sy = new ModernSynth(RATE); sy.playMusic('stage1'); st(sy, 1);
  sy.setVolumes({ bgm: 0 }); st(sy, 6);
  assert.ok(rms2(st(sy, 0.5)) < 1e-4);
  sy.sfx('explode_m'); assert.ok(rms2(st(sy, 0.2)) > 0.01);
  sy.setVolumes({ master: 0 }); st(sy, 0.2); sy.sfx('explode_m');
  assert.ok(rms2(st(sy, 0.3)) < 1e-4);
});

test('モダン音源 — 音の計算の中でメモリを確保しない（慣らしたあと 40 秒ぶん計算して GC が起きない）', async () => {
  let gcs = 0; const obs = new PerformanceObserver((l) => { gcs += l.getEntries().length; }); obs.observe({ entryTypes: ['gc'] });
  const sy = new ModernSynth(RATE); sy.playMusic('boss'); sy.setIntensity(2);
  const L = new Float32Array(128), R = new Float32Array(128);
  const run = (sec) => { for (let i = 0; i < 375 * sec; i++) { if (i % 40 === 0) sy.sfx('shot'); if (i % 100 === 0) sy.sfx('explode_m'); sy.renderStereo(L, R); sy.evCount = 0; } };
  run(30);
  // JIT の最適化は裏で進むので（機械が混んでいると遅れる）、40 秒の窓を最大 4 回測って一番少ない回数を見る
  let best = Infinity;
  for (let k = 0; k < 4 && best > 0; k++) {
    await new Promise((r) => setTimeout(r, 30)); gcs = 0;
    run(40);
    await new Promise((r) => setTimeout(r, 30)); best = Math.min(best, gcs);
  }
  obs.disconnect();
  assert.equal(best, 0, `GC ${best} 回（音の計算の中で確保している）`);
});

test('モダン音源 — 計算時間: いちばん重い曲＋効果音でも実時間の 25% 未満（この環境の 1 コア。ふだんは 3〜6%）', () => {
  const sy = new ModernSynth(RATE); sy.playMusic('boss'); sy.setIntensity(2); sy.setLayer('danger', true);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let i = 0; i < 375 * 3; i++) sy.renderStereo(L, R);
  const t0 = process.cpuUsage().user;      // CPU 時間で測る（ほかの処理に待たされた時間は数えない）
  for (let i = 0; i < 375 * 10; i++) { if (i % 37 === 0) sy.sfx('shot'); if (i % 90 === 0) sy.sfx('explode_m'); if (i % 50 === 0) sy.sfx('enemy_hit'); sy.renderStereo(L, R); }
  const ms = (process.cpuUsage().user - t0) / 1000;
  assert.ok(ms < 2500, `10 秒ぶんに ${ms.toFixed(0)}ms`);
});

test('音源の切り替え（core.js）: モダン ⇄ レトロで曲が鳴り直し、効果音は読み替えて鳴る。NaN・クリップなし', () => {
  const core = new SoundCore(RATE);
  assert.equal(core.mode, 'modern');
  core.playMusic('stage2', { lead: true }); let r = st(core, 2);
  assert.ok(rms2(r) > 0.02 && basic(r.L, r.R).corr < 0.999, 'モダンはステレオ');
  core.setMode('retro'); core.setMode('retro');
  r = st(core, 0.5); assert.equal(basic(r.L, r.R).nan, 0); assert.ok(basic(r.L, r.R).peak < 0.99);
  st(core, 1); r = st(core, 1);
  assert.equal(core.musicPosition().id, 'stage2'); assert.ok(core.retro.isMusicPlaying() && !core.modern.isMusicPlaying());
  assert.deepEqual(r.L, r.R, 'レトロはモノラル'); assert.ok(rms2(r) > 0.02);
  assert.ok(core.sfx('shot', { pan: 0.5 }) >= 0); assert.ok(core.sfx('zap_beam') >= 0, 'laser に読み替え'); assert.equal(core.sfx('boss_enter'), -1, 'レトロには無い音');
  assert.ok(core.retro.sfxActive().includes('laser'));
  core.setPaused(true); st(core, 0.3); assert.ok(rms2(st(core, 0.3)) < 1e-4, 'レトロの一時停止は従来どおり無音'); core.setPaused(false);
  core.setIntensity(2); core.setLayer('danger', true);
  core.setMode('modern'); r = st(core, 1.5);
  assert.equal(basic(r.L, r.R).nan, 0); assert.ok(basic(r.L, r.R).peak < 0.99);
  assert.equal(core.musicPosition().id, 'stage2'); assert.ok(core.modern.isMusicPlaying());
  assert.ok(core.sfx('boss_enter') >= 0);
  core.stopMusic(); st(core, 1); assert.ok(!core.isMusicPlaying());
});
