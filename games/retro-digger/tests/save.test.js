// 保存: 保存不可・破損・旧形式でも起動できる。記録はモード・難易度・種別・VR 移動方式で分かれる。
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as save from '../shared/save.js';

let store = {};
beforeEach(() => {
  store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  save._resetMemory();
});

test('何も保存されていなければ既定値', () => {
  const d = save.load(); assert.equal(d.settings.difficulty, 'normal'); assert.equal(d.settings.vrMove, 'step');
});
test('壊れたデータでも既定値で起動する', () => {
  store['retro-digger:save'] = '{not json';
  const d = save.load(); assert.equal(d.settings.difficulty, 'normal'); assert.equal(save.saveStatus, 'reset-corrupt');
});
test('旧形式（v1）のハイスコアを移す', () => {
  store['retro-digger:save'] = JSON.stringify({ v: 1, hi: { '2d': 5000 }, settings: { difficulty: 'hard' } });
  const d = save.load(); assert.equal(d.settings.difficulty, 'hard'); assert.equal(save.getRecord('2d|normal|run').hi, 5000); assert.equal(save.saveStatus, 'migrated');
});
test('localStorage が使えなくても動く（メモリ上だけ）', () => {
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  save._resetMemory();
  const d = save.load(); assert.ok(d.settings);
  assert.equal(save.persist(), false); assert.equal(save.saveStatus, 'unavailable');
  assert.equal(save.submitRecord('2d|normal|run', 100, 1), true);
});
test('記録はモード・難易度・種別・VR 移動方式で分かれる', () => {
  const a = save.recordKey('2d', 'normal', 'run'), b = save.recordKey('2d', 'normal', 'practice'), c = save.recordKey('vr', 'normal', 'run', 'step'), d = save.recordKey('vr', 'normal', 'run', 'smooth'), e = save.recordKey('3d', 'hard', 'run');
  assert.equal(new Set([a, b, c, d, e]).size, 5);
  save.submitRecord(a, 900, 2); assert.equal(save.getRecord(b).hi, 0);
  assert.equal(save.submitRecord(a, 500, 1), false); assert.equal(save.getRecord(a).hi, 900);
});
test('不正な値は捨てる', () => {
  store['retro-digger:save'] = JSON.stringify({ v: 2, settings: { difficulty: 42, vol: { master: 'x' } }, records: { k: { hi: 'NaN' } }, progress: { 'p': 99 } });
  const d = save.load(); assert.equal(d.settings.difficulty, 'normal'); assert.equal(d.settings.vol.master, 0.8); assert.equal(d.records.k, undefined); assert.equal(d.progress.p, 6);
});
