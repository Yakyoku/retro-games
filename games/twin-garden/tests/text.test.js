// 文字の試験: 画面に出す文の漢字には、すべて読みがながつく（[漢字|かな] か、自動の読みがな表で）
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, BONUS, LESSONS } from '../shared/core/stages.js';
import { rubyAuto } from '../shared/ui/dom-ui.js';

const KANJI = /[一-鿿]/;
const bare = (s) => s.replace(/\[[^\]]+\]/g, '');
test('読みがな: 面の説明・練習の文・ボーナスの説明に、読みのない漢字が残らない', () => {
  const texts = [...STAGES.map((s) => s.tip), ...LESSONS.flatMap((l) => l.steps), ...Object.values(BONUS).map((b) => b.tip)];
  const left = texts.map((t) => [t, bare(rubyAuto(t))]).filter(([, b]) => KANJI.test(b));
  assert.deepEqual(left.map(([t, b]) => `${t} → ${b.match(/[一-鿿]+/g).join('')}`), []);
});
test('読みがな: 面の名前・ボーナスの名前には読みがある', () => {
  for (const s of STAGES) assert.ok(s.ruby && !KANJI.test(s.ruby), s.name);
  for (const b of Object.values(BONUS)) assert.ok(b.ruby && !KANJI.test(b.ruby), b.name);
  for (const l of LESSONS) assert.ok(!KANJI.test(bare(l.name)), `練習の名前に読みのない漢字: ${l.name}`);
});
