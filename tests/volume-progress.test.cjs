const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('js/util.js', 'utf8'), context);
const { consecutiveFromOne } = context.window.Util;

test('counts only the unbroken sequence beginning with volume one', () => {
  assert.equal(consecutiveFromOne([]), 0);
  assert.equal(consecutiveFromOne([1, 2, 3]), 3);
  assert.equal(consecutiveFromOne([1, 2, 4, 5]), 2);
  assert.equal(consecutiveFromOne([2, 3]), 0);
});
