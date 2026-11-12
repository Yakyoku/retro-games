// 曲データの試験: MML が読める・繰り返す曲は全トラックが同じ長さ（小節単位）
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, parseMML } from '../shared/audio/songs.js';

test('曲: すべての MML が読め、繰り返す曲は全トラックの長さが同じ（4 拍の倍数）', () => {
  for (const [name, s] of Object.entries(SONGS)) {
    const lens = s.tracks.map((t) => parseMML(t.mml, t.wave === 'drum').length);
    for (const l of lens) assert.ok(l > 0, name);
    if (s.loop) {
      for (const l of lens) assert.equal(l, lens[0], `${name}: トラックの長さが違う ${lens}`);
      assert.equal(lens[0] % 4, 0, `${name}: 小節の途中で終わる`);
    }
  }
});
test('曲: 音域が聞こえる範囲（MIDI 33〜100）', () => {
  for (const [name, s] of Object.entries(SONGS)) for (const t of s.tracks) if (t.wave !== 'drum') for (const n of parseMML(t.mml).notes) assert.ok(n.midi >= 33 && n.midi <= 100, `${name} ${n.midi}`);
});
