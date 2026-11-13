import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODERN_SONGS, CHORD, STEMS, MODERN_SFX_NAMES, GRAB_MATERIAL, COMBO_SCALE, MODERN_CLIMB } from '../src/audio/modern-songs.js';
import { MODERN_SFX } from '../src/audio/modern.js';
import { parseMML, renderSong } from '../src/audio/psg.js';
import { SONGS, CLIMB_SONG } from '../src/audio/music.js';
import { SFX } from '../src/audio/sfx.js';
import { VOICES, synthVoice } from '../src/audio/voice.js';

test('モダンの曲: 和音は小節数ぶんあり、旋律の長さは曲の長さと一致し、パターンは 16 分 × 16', () => {
  for (const [k, s] of Object.entries(MODERN_SONGS)) {
    assert.equal(s.chords.length, s.bars, `${k}: 和音の数`);
    for (const [root, type] of s.chords) { assert.ok(CHORD[type], `${k}: 和音の種類 ${type}`); assert.ok(root >= 36 && root <= 60); }
    const len = parseMML(s.lead, s.bpm).length, want = s.bars * 4 * 60 / s.bpm;
    assert.ok(Math.abs(len - want) < 1e-6, `${k}: 旋律 ${len} ≠ ${want}`);
    for (const [name, p] of Object.entries(s.drums)) for (const q of Array.isArray(p) ? p : [p]) if (q) assert.equal(q.length, 16, `${k}: ${name}`);
    assert.equal(s.chordRhythm.length, 16);
    for (const [step, n] of s.bass) assert.ok(step >= 0 && step + n <= 16, `${k}: ベースが小節をはみ出す`);
  }
  assert.deepEqual(Object.keys(MODERN_CLIMB), Object.keys(CLIMB_SONG), '棟のテーマごとに曲がある');
  for (const v of Object.values(MODERN_CLIMB)) assert.ok(MODERN_SONGS[v] && SONGS[v], `${v}: モダンとレトロの両方にある（切替・代替用）`);
  assert.equal(STEMS.length, 6);
});

test('モダンの効果音: 名前の一覧とレシピが一致し、app.js が呼ぶ音はどちらの音源でも鳴らせる', () => {
  assert.deepEqual([...MODERN_SFX_NAMES].sort(), Object.keys(MODERN_SFX).sort());
  for (const m of new Set(Object.values(GRAB_MATERIAL))) assert.ok(MODERN_SFX['grab_' + m], m);
  for (const it of ['pot', 'can', 'bucket', 'bottle']) assert.ok(MODERN_SFX['break_' + it]);
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const called = new Set([...app.matchAll(/(?:A|this\.audio)\.play\('([a-zA-Z0-9_]+)'/g)].map((m) => m[1]));
  for (const n of called) {
    const retro = SFX[n] || VOICES[n] || (n === 'combo' && SFX.combo1);
    assert.ok(retro, `レトロ音源に ${n} がない`);
    const modern = VOICES[n] || MODERN_SFX[n] || n === 'grab' || n === 'dropBreak';
    assert.ok(modern, `モダン音源に ${n} がない`);
  }
  for (let i = 1; i < COMBO_SCALE.length; i++) assert.ok(COMBO_SCALE[i] > COMBO_SCALE[i - 1], 'コンボの音階は上がり続ける');
});

test('掛け声（高品質）: 有限の値で、音割れせず、無音でない', () => {
  for (const k of Object.keys(VOICES)) {
    const d = synthVoice(k, 44100, { lofi: false, hq: true }); let pk = 0, sq = 0;
    for (const v of d) { assert.ok(Number.isFinite(v)); pk = Math.max(pk, Math.abs(v)); sq += v * v; }
    assert.ok(pk < 1 && pk > 0.3, `${k}: 最大 ${pk}`); assert.ok(Math.sqrt(sq / d.length) > 0.02);
  }
});

test('レトロ音源（クラシック）は従来どおり: 全トラックの長さが一致し、ループは 1 周の長さ', () => {
  for (const [k, s] of Object.entries(SONGS)) {
    if (!s.loop) continue;
    const lens = s.tracks.map((t) => parseMML(t.mml, s.bpm).length);
    for (const l of lens) assert.ok(Math.abs(l - lens[0]) < 1e-6, `${k}: トラックの長さ`);
    const r = renderSong(s, 22050); assert.ok(Math.abs(r.pcm.length / 22050 - lens[0]) < 0.02);
    let pk = 0; for (const v of r.pcm) pk = Math.max(pk, Math.abs(v)); assert.ok(pk < 1);
  }
});
