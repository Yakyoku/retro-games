// 音の点検（node --test tests/audio.test.js）
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

test('曲と効果音: 必要な名前がすべてある（option_shot という音は無い）', () => {
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

test('曲: 記法の誤りがなく、全トラックの長さとループ点が一致し、小節線の間はちょうど 1 小節', () => {
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

test('曲: 長さが決めた範囲', () => {
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

test('曲: 音域が音源で出せる範囲（周期レジスタ 12bit に収まり、低すぎ・高すぎない）', () => {
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

test('音源: 周期レジスタどおりの高さで鳴る（PSG と波形メモリ）', () => {
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

test('すべての曲と効果音: NaN が出ず、単独で peak < 1、無音でもない', () => {
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

test('最大の重なり（最速の曲 + 効果音 3 音を叩き続ける、音量すべて最大、arrange の有無）でも peak < 1', () => {
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

test('オプションの決まり: 同じフレームに shot を何回呼んでも 1 回分（オプション 0〜4 個で同じ音）', () => {
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

test('効果音の優先度: 高い音が低い音を奪い、低い音は高い音を奪えない', () => {
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

test('効果音は PSG-B だけを使い、曲の音（PSG-A・波形メモリ）を書き換えない', () => {
  const a = new ChipSynth(RATE), b = new ChipSynth(RATE);
  a.playMusic('stage2'); b.playMusic('stage2');
  for (let i = 0; i < 300; i++) {
    if (i % 7 === 0) b.sfx(['explode_l', 'laser', 'player_die', 'shot'][i % 4]);
    frames(a, 1); frames(b, 1);
    assert.deepEqual(b.psgA.reg, a.psgA.reg);
    assert.equal(b.wave[0].period, a.wave[0].period); assert.equal(b.wave[1].vol, a.wave[1].vol);
  }
});

test('一時停止: 曲が消え、位置が止まり、解除すると同じ位置から続く', () => {
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

test('停止と切り替え: 5ms のフェードで止まり、同じ曲の playMusic は頭に戻らない', () => {
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

test('1 回で終わる曲は終わると止まり ended を知らせる。ループする曲は全トラックが一緒に頭へ戻る', () => {
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

test('同じ操作なら同じ音（決定的）', () => {
  const run = () => {
    const sy = new ChipSynth(44100); sy.playMusic('stage4');
    const out = [];
    for (let i = 0; i < 200; i++) { if (i % 9 === 0) sy.sfx('shot'); if (i === 50) sy.sfx('explode_l'); if (i === 120) sy.setPaused(true); if (i === 140) sy.setPaused(false); out.push(frames(sy, 1)); }
    return out;
  };
  const a = run(), b = run();
  for (let i = 0; i < a.length; i++) assert.deepEqual(a[i], b[i]);
});

test('音量: bgm=0 で曲が消え、効果音だけ残る。master=0 で全部消える', () => {
  const sy = new ChipSynth(RATE); sy.playMusic('stage1'); secs(sy, 1);
  sy.setVolumes({ bgm: 0 }); secs(sy, 0.1);
  assert.ok(rms(secs(sy, 0.5)) < 1e-4);
  sy.sfx('explode_m'); assert.ok(rms(secs(sy, 0.2)) > 0.01);
  sy.setVolumes({ master: 0 }); secs(sy, 0.1); sy.sfx('explode_m');
  assert.ok(rms(secs(sy, 0.3)) < 1e-4);
});
