import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMML } from '../shared/audio/mml.js';
import { SONGS } from '../shared/audio/songs.js';
import { compileSong } from '../shared/audio/engine.js';
import { SFX } from '../shared/audio/sfx.js';
import { EVENT_SE } from '../shared/sound-map.js';

test('MML: 長さ・付点・ループ位置', () => {
  const p = parseMML('l8 c d L e4. r8 f2');
  assert.equal(p.loopAt, 1); assert.equal(p.length, 1 + 1.5 + 0.5 + 2);
  assert.equal(p.notes[0].midi, 60);
});

test('ループする曲は全トラックの長さとループ位置が小節単位でそろう', () => {
  for (const [name, s] of Object.entries(SONGS)) {
    if (s.once) continue;
    const c = compileSong(s);
    const bar = c.spb * 4;
    for (const tr of c.tracks) {
      assert.ok(Math.abs(tr.len - c.len) < 1e-6, `${name} ch${tr.ch} len ${tr.len / bar} vs ${c.len / bar}`);
      assert.ok(Math.abs(tr.loopAt - c.loopAt) < 1e-6, `${name} ch${tr.ch} loop`);
    }
    assert.ok(Math.abs((c.len / bar) - Math.round(c.len / bar)) < 1e-6, `${name} 小節の途中で終わる`);
    const pat = s.drums.loop; assert.equal(pat.length * c.spb / 4, c.len, `${name} drums`);
  }
});

test('音域: 矩形波は 30Hz〜5kHz に収まる', () => {
  for (const s of Object.values(SONGS)) for (const tr of compileSong(s).tracks) for (const n of tr.notes) {
    const hz = 440 * 2 ** ((n.midi - 69) / 12); assert.ok(hz > 30 && hz < 5000, `${hz}`);
  }
});

test('音イベント対応表の効果音はすべて定義済み', () => {
  for (const [k, f] of Object.entries(EVENT_SE)) {
    const name = f({ docked: true, big: true }); assert.ok(SFX[name], k + '→' + name);
    const name2 = f({}); assert.ok(SFX[name2], k + '→' + name2);
  }
});
