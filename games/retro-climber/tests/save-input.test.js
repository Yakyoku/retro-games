// 鉄骨レスキュー — 保存と入力のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { Save, defaultData, sanitize } from '../shared/save.js';
import { Input, padLabels, deadzone } from '../shared/input.js';
import { SAVE_KEY, SAVE_VERSION } from '../shared/config.js';

class Mem { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } }

test('保存して読み直すと設定・記録・解放面が戻る', () => {
  const st = new Mem();
  const a = new Save(st);
  a.setSetting('volMusic', 3); a.setSetting('difficulty', 'hard');
  a.recordRun({ mode: '2d', difficulty: 'hard', score: 12300, stageReached: 2, cleared: false, practice: false });
  a.unlock(3);
  const b = new Save(st);
  assert.equal(b.settings.volMusic, 3); assert.equal(b.settings.difficulty, 'hard');
  assert.equal(b.data.records['2d:hard'].hi, 12300); assert.equal(b.data.unlocked, 3);
  assert.equal(JSON.parse(st.getItem(SAVE_KEY)).version, SAVE_VERSION);
});

test('練習・別モードの記録は混ざらない', () => {
  const s = new Save(new Mem());
  s.recordRun({ mode: 'vr', difficulty: 'normal', score: 9000, stageReached: 1, practice: true });
  assert.equal(s.data.records['vr:normal'].hi, 0);
  s.recordRun({ mode: 'vr', difficulty: 'normal', score: 9000, stageReached: 1, practice: false });
  assert.equal(s.data.records['vr:normal'].hi, 9000);
  assert.equal(s.data.records['2d:normal'].hi, 0);
  assert.equal(s.data.records['vr:easy'].hi, 0);
});

test('壊れた保存データは控えから復旧、控えもなければ初期化', () => {
  const st = new Mem();
  const a = new Save(st); a.setSetting('volSfx', 2); a.setSetting('volSfx', 4); // 2 回書くと控えができる
  st.setItem(SAVE_KEY, '{"version":1,"settings":{'); // 書きかけで壊れた
  const b = new Save(st);
  assert.ok(b.recovered); assert.equal(b.settings.volSfx, 2);
  const st2 = new Mem(); st2.setItem(SAVE_KEY, 'garbage');
  const c = new Save(st2);
  assert.deepEqual(c.data, defaultData());
});

test('欠損・型違いの項目は既定値で埋める', () => {
  const { data, fixes } = sanitize({ version: 0, settings: { volMusic: 'loud', difficulty: 'ultra', volSfx: 99 }, unlocked: 'x' });
  assert.equal(data.settings.volMusic, defaultData().settings.volMusic);
  assert.equal(data.settings.difficulty, 'normal');
  assert.equal(data.settings.volSfx, 10);
  assert.equal(data.unlocked, 1);
  assert.ok(fixes.length >= 3);
});

test('localStorage が使えなくても落ちない', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const s = new Save(bad);
  assert.equal(s.save(), false);
  assert.deepEqual(s.data, defaultData());
});

// 入力（DOM なしで、イベント源を偽装する）
class FakeTarget { constructor() { this.h = {}; } addEventListener(t, f) { (this.h[t] ||= []).push(f); } fire(t, e = {}) { for (const f of this.h[t] || []) f({ preventDefault() {}, ...e }); } }

test('キーとタッチを同時に押してもジャンプは 1 回', () => {
  const t = new FakeTarget(); const inp = new Input(t);
  let touchJump = false; inp.touch = { read: () => ({ jump: touchJump, any: touchJump }) };
  t.fire('keydown', { code: 'Space' }); touchJump = true;
  let n = 0; for (let i = 0; i < 5; i++) if (inp.poll().pressed.jump) n++;
  assert.equal(n, 1);
  t.fire('keyup', { code: 'Space' }); touchJump = false; inp.poll();
  t.fire('keydown', { code: 'Space' });
  assert.equal(inp.poll().pressed.jump, true);
});

test('フォーカス喪失で押しっぱなしを解除し、復帰時に「押した瞬間」にならない', () => {
  const t = new FakeTarget(); const inp = new Input(t);
  let held = false; inp.touch = { read: () => ({ jump: held, x: held ? 1 : 0, any: held }) };
  t.fire('keydown', { code: 'ArrowRight' }); held = true;
  assert.equal(inp.poll().x, 1);
  t.fire('blur');
  // 復帰時にタッチがまだ押されたままでも、一度離すまで無視する
  const o = inp.poll();
  assert.equal(o.pressed.jump, false); assert.equal(o.x, 0);
  held = false; inp.poll(); held = true;
  assert.equal(inp.poll().pressed.jump, true);
});

test('キーの自動リピートで連続ジャンプしない', () => {
  const t = new FakeTarget(); const inp = new Input(t);
  t.fire('keydown', { code: 'Space' }); assert.equal(inp.poll().pressed.jump, true);
  t.fire('keydown', { code: 'Space', repeat: true }); assert.equal(inp.poll().pressed.jump, false);
});

test('ゲームパッドの表記は機種に合わせる・デッドゾーン', () => {
  assert.equal(padLabels('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)').south, '×');
  assert.equal(padLabels('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)').south, 'A');
  assert.equal(padLabels('Pro Controller (Vendor: 057e)').south, 'B');
  assert.equal(padLabels('Generic USB').family, 'Gamepad');
  assert.deepEqual(deadzone(0.1, 0.1), [0, 0]);
  assert.ok(deadzone(1, 0)[0] >= 0.99);
});
