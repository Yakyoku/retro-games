// 鉄骨レスキュー — 曲データのテスト（ループの長さがそろう・音域・効果音の表）
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMML } from '../shared/audio/mml.js';
import { SONGS } from '../shared/audio/songs.js';
import { SFX } from '../shared/audio/sfx.js';

test('ループ曲は全トラックの拍数がそろう', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    const beats = song.tracks.map((t) => parseMML(t).beats);
    if (song.loop) assert.ok(beats.every((b) => Math.abs(b - beats[0]) < 1e-9), `${name}: ${beats}`);
    for (const t of song.tracks) for (const n of parseMML(t).notes) assert.ok(n.f > 40 && n.f < 5000, `${name} の音域外 ${n.f}`);
  }
});
test('MML: 付点・タイ・オクターブ', () => {
  const r = parseMML('t120 o4 l4 c. d8 e&e >c');
  assert.equal(r.notes.length, 4);
  assert.equal(r.notes[0].d, 1.5); assert.equal(r.notes[2].d, 2);
  assert.ok(Math.abs(r.notes[3].f - 523.25) < 0.1);
  assert.equal(r.beats, 5);
});
test('効果音: 主要イベントがすべて登録され、優先度と系統を持つ', () => {
  for (const k of ['jump', 'land', 'step', 'climb', 'jumpOver', 'smash', 'hammer', 'swing', 'lift', 'throw', 'barrelBounce', 'device', 'deviceWrong', 'ventWarn', 'steam', 'timeWarn', 'bonk', 'menuMove', 'menuOk', 'menuBack', 'pause', 'boltHop', 'crateOut', 'checkpoint']) {
    assert.ok(SFX[k], k); assert.equal(typeof SFX[k].pri, 'number', k); assert.ok(SFX[k].ch, k);
  }
});
