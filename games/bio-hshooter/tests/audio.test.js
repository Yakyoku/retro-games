import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FMSynth, TPQ } from '../shared/audio/fm-core.js';
import { PATCHES } from '../shared/audio/patches.js';
import { makeSamples } from '../shared/audio/pcm.js';
import { getSongs, SONG_ORDER } from '../shared/audio/songs.js';
import { SFX } from '../shared/audio/sfx.js';

const songs = getSongs();
test('曲: すべてコンパイルでき、ループする曲は全トラックの前奏とループ長が小節単位で一致', () => {
  for (const id of SONG_ORDER) {
    const s = songs[id]; assert.ok(s, id);
    const bar = TPQ * 4;
    const loops = s.tracks.filter((t) => t.loopTick >= 0);
    if (!loops.length) continue;
    for (const t of s.tracks) {
      assert.ok(t.loopTick >= 0, `${id} ${t.kind}${t.ch}: L がない`);
      assert.equal(t.loopTick % bar, 0, `${id} ${t.kind}${t.ch}: 前奏 ${t.loopTick / bar} 小節`);
    }
    const L0 = loops[0].endTick - loops[0].loopTick, I0 = loops[0].loopTick;
    for (const t of loops) {
      assert.equal(t.loopTick, I0, `${id} ${t.kind}${t.ch}: 前奏 ${t.loopTick / bar} ≠ ${I0 / bar} 小節`);
      assert.equal(t.endTick - t.loopTick, L0, `${id} ${t.kind}${t.ch}: ループ ${(t.endTick - t.loopTick) / bar} ≠ ${L0 / bar} 小節`);
    }
  }
});

function rms(id, sec, sfx) {
  const sy = new FMSynth(48000); sy.setPatches(PATCHES); sy.setSamples(makeSamples());
  if (sfx) sy.playSfx(SFX[id]); else sy.playSong(songs[id]);
  const N = 48000 * sec, L = new Float32Array(N), R = new Float32Array(N);
  for (let o = 0; o < N; o += 128) sy.render(L, R, Math.min(128, N - o), o);
  let sum = 0, peak = 0;
  for (let i = 0; i < N; i++) { const v = L[i]; assert.ok(Number.isFinite(v), `${id} NaN at ${i}`); sum += v * v; peak = Math.max(peak, Math.abs(v), Math.abs(R[i])); }
  return { rms: Math.sqrt(sum / N), peak };
}
test('曲: 3 秒ずつ鳴らして無音でない・NaN なし・振り切れない', () => {
  for (const id of SONG_ORDER) {
    const r = rms(id, 3);
    assert.ok(r.rms > 0.005, `${id} rms ${r.rms}`);
    assert.ok(r.peak <= 1, `${id} peak ${r.peak}`);
  }
});
test('効果音: すべて鳴る', () => {
  for (const id of Object.keys(SFX)) { const r = rms(id, 0.6, true); assert.ok(r.rms > 0.001, `${id} rms ${r.rms}`); }
});
