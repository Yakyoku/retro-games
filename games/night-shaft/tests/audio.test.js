// 音 v2: 曲の各パートの長さがそろう・配布用ファイルと manifest がそろう・効果音は無音でなく割れない・ループ位置が正しい
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SONGS2 } from '../shared/audio/songs2.js';
import { parseMML, renderSong, SR } from '../shared/audio/synth2.js';
import { SFX2, carHum2, ambience } from '../shared/audio/sfx2.js';
const here = join(dirname(fileURLToPath(import.meta.url)), '..');

test('曲: 全パートの長さが一致する（小節のずれが無い）', () => {
  for (const [name, song] of Object.entries(SONGS2)) {
    const lens = song.tracks.map((t) => parseMML(t.mml, song.tempo, !!t.drum).length);
    for (const l of lens) assert.ok(Math.abs(l - lens[0]) < 1e-6, `${name}: ${lens.join('/')}`);
  }
});
test('配布用 MP3 と manifest がそろい、ループ曲は「末尾 1 秒＋曲＋先頭 1 秒」の位置を持つ', () => {
  const m = JSON.parse(readFileSync(join(here, 'shared/audio/files/manifest.json'), 'utf8'));
  for (const [name, song] of Object.entries(SONGS2)) {
    assert.ok(m[name], name);
    assert.ok(existsSync(join(here, 'shared/audio/files', m[name].file)), m[name].file);
    if (m[name].hot) assert.ok(existsSync(join(here, 'shared/audio/files', m[name].hot)));
    if (song.loop) { assert.equal(m[name].loopStart, 1.0); const len = parseMML(song.tracks[0].mml, song.tempo, !!song.tracks[0].drum).length; assert.ok(Math.abs(m[name].loopEnd - 1.0 - len) < 0.01, name); }
  }
});
test('短い曲（書類ジングル）をレンダリングでき、NaN が無く割れない', () => {
  const r = renderSong(SONGS2.doc);
  let pk = 0; for (const v of r.L) { assert.ok(Number.isFinite(v)); pk = Math.max(pk, Math.abs(v)); }
  assert.ok(pk > 0.1 && pk <= 1, String(pk));
});
test('効果音: すべて無音でなく、ピーク ≤ 1、ステレオ。走行音は 1 秒ちょうど、環境音はループ用の長さ', () => {
  for (const [name, fn] of Object.entries(SFX2)) {
    const [L, R] = fn(); assert.equal(L.length, R.length, name);
    let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    assert.ok(pk > 0.05 && pk <= 1, `${name} ${pk}`);
  }
  assert.equal(carHum2()[0].length, SR);
  for (const k of ['office', 'lab', 'rain']) assert.ok(ambience(k)[0].length > SR * 10);
});
