const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('js/util.js', 'utf8'), context);
const { consecutiveFromOne, isSeriesComplete } = context.window.Util;

test('counts only the unbroken sequence beginning with volume one', () => {
  assert.equal(consecutiveFromOne([]), 0);
  assert.equal(consecutiveFromOne([1, 2, 3]), 3);
  assert.equal(consecutiveFromOne([1, 2, 4, 5]), 2);
  assert.equal(consecutiveFromOne([2, 3]), 0);
});

test('treats a series as complete only when every known volume is checked', () => {
  assert.equal(isSeriesComplete({ total_volumes: 3, checked_volumes: [1, 2, 3] }), true);
  assert.equal(isSeriesComplete({ total_volumes: 3, checked_volumes: [1, 3] }), false);
  assert.equal(isSeriesComplete({ total_volumes: 3, checked_volumes: [1, 2, 3, 4] }), true);
  assert.equal(isSeriesComplete({ total_volumes: null, checked_volumes: [1, 2, 3] }), false);
  assert.equal(isSeriesComplete({ volume_display_count: 3, checked_volumes: [1, 2, 3] }), false);
});

test('lists every missing volume before the highest checked one', () => {
  const { findGaps } = context.window.Util;
  assert.deepEqual([...findGaps([1, 2, 4, 6])], [3, 5]);
  assert.deepEqual([...findGaps([1, 2, 3])], []);
  assert.deepEqual([...findGaps([])], []);
});

test('uses checked volumes, falling back to the former read/owned volumes', () => {
  const { progressVolumes } = context.window.Util;
  assert.deepEqual([...progressVolumes({ checked_volumes: [1, 2], read_volumes: [5] })], [1, 2]);
  assert.deepEqual([...progressVolumes({ read_volumes: [3], owned_volumes: [4] })], [3]);
  assert.deepEqual([...progressVolumes({ read_volumes: [], owned_volumes: [4] })], [4]);
  assert.deepEqual([...progressVolumes({})], []);
});
