// 音: 各パートの長さがそろう・NaN が無い・割れない・ループのつなぎ目に大きな段差が無い
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../shared/audio/songs.js';
import { renderSong, parseMML, SFX_DEFS, carHumLoop, SR } from '../shared/audio/synth.js';

test('曲: 全パートの長さが一致し、波形に NaN が無く、ピーク < 1', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    const lens = song.tracks.map((t) => parseMML(t.mml, song.tempo).length);
    for (const l of lens) assert.ok(Math.abs(l - lens[0]) < 1e-6, `${name} パートの長さ ${lens}`);
    const r = renderSong(song);
    let peak = 0;
    for (const v of r.data) { assert.ok(Number.isFinite(v), name); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak < 1 && peak > 0.2, `${name} peak ${peak}`);
    if (r.loop) {
      const d = r.data; const n = Math.round(r.loopEnd * SR);
      let maxStep = 0; for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(d[i] - d[i - 1]));
      assert.ok(Math.abs(d[n - 1] - d[0]) < maxStep * 0.5, `${name} ループの段差`);
    }
  }
});
test('stage 曲は 16 小節（138 BPM）', () => {
  const r = renderSong(SONGS.stage);
  assert.ok(Math.abs(r.loopEnd - 16 * 4 * 60 / 138) < 1e-3);
});
test('効果音: すべて無音でなく、割れない。走行音のループは 1 秒ちょうど', () => {
  for (const [name, fn] of Object.entries(SFX_DEFS)) {
    const d = fn(); let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak > 0.01 && peak < 1, `${name} ${peak}`);
  }
  assert.equal(carHumLoop().data.length, SR);
});
