const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function makeDb(result) {
  const context = vm.createContext({
    window: {
      MANGA_CONFIG: { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'public-key' },
      supabase: {
        createClient: () => ({
          from: () => ({
            select: () => ({ order: async () => result }),
          }),
        }),
      },
    },
    Util: { showBanner() {} },
  });
  vm.runInContext(fs.readFileSync('js/db.js', 'utf8'), context);
  context.window.DB.init();
  return context.window.DB;
}

test('returns loaded series separately from a successful request', async () => {
  const rows = [{ id: 'series-1', title: '作品' }];
  const result = await makeDb({ data: rows, error: null }).listSeries();
  assert.equal(result.error, null);
  assert.deepEqual(result.data, rows);
});

test('preserves a list-load error instead of treating it as an empty list', async () => {
  const error = { message: 'network unavailable' };
  const result = await makeDb({ data: null, error }).listSeries();
  assert.equal(result.error, error);
  assert.equal(result.data.length, 0);
});
