const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup(removeResult = { error: null }) {
  const removed = [];
  const client = { storage: { from: (bucket) => ({ remove: async (paths) => { removed.push([bucket, ...paths]); return removeResult; } }) } };
  const context = vm.createContext({ window: {}, document: {}, DB: { getClient: () => client }, Auth: {}, Util: {} });
  vm.runInContext(fs.readFileSync('js/covers.js', 'utf8'), context);
  return { Covers: context.window.Covers, removed };
}
const own = 'https://x.supabase.co/storage/v1/object/public/manga-shelf-covers/user-1/series-1.jpg?v=123';

test('removes the stored cover of our own bucket', async () => {
  const { Covers, removed } = setup();
  assert.equal((await Covers.remove(own)).removed, true);
  assert.deepEqual(removed, [['manga-shelf-covers', 'user-1/series-1.jpg']]);
});

test('does nothing for external or missing cover URLs', async () => {
  const { Covers, removed } = setup();
  assert.equal((await Covers.remove('https://images.example.com/a.jpg')).removed, false);
  assert.equal((await Covers.remove(null)).removed, false);
  assert.equal(removed.length, 0);
});

test('reports a removal error without throwing', async () => {
  const { Covers } = setup({ error: { message: 'denied' } });
  const result = await Covers.remove(own);
  assert.equal(result.removed, false);
  assert.equal(result.error.message, 'denied');
});
