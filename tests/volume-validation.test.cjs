const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('js/util.js', 'utf8'), context);
const { validateVolumeFields } = context.window.Util;

test('rejects a total volume count below the checked volume', () => {
  assert.match(validateVolumeFields({ total_volumes: 5, checked_volumes: [1, 6] }), /超えています/);
  assert.equal(validateVolumeFields({ total_volumes: 6, checked_volumes: [1, 6] }), null);
});

test('rejects non-positive total volumes', () => {
  assert.match(validateVolumeFields({ total_volumes: 0, checked_volumes: [] }), /1以上/);
  assert.equal(validateVolumeFields({ total_volumes: null, checked_volumes: [99] }), null);
});
