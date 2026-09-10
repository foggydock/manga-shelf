const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
async function setup({ meta, cover, saveError } = {}) {
  const elements = new Map();
  const events = {};
  const writes = [];
  const coverRequests = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', style: {}, hidden: false, checked: false, disabled: false,
      textContent: '', addEventListener: (name, fn) => { events[id + ':' + name] = fn; },
      removeAttribute() {}, appendChild() {}, reset() {},
      querySelectorAll: () => [...elements.values()],
    });
    return elements.get(id);
  };
  const db = {
    init() {}, listSeries: async () => [],
    fetchSynopsis: () => meta || Promise.resolve({ data: { ok: true, author: '作者', synopsis: '紹介文', status: '完結', total_volumes: 40 } }),
    insertSeries: async fields => { writes.push(['insert', fields]); return { error: saveError }; },
    updateSeries: async (id, fields) => { writes.push(['update', fields]); return { error: saveError }; },
  };
  const ctx = vm.createContext({
    document: { getElementById: element },
    window: { addEventListener: (name, fn) => { events[name] = fn; } },
    DB: db, Auth: { refreshSession: async () => {}, onChange() {}, isLoggedIn: () => true, getUserEmail: () => '' },
    Covers: { prepareCandidate: (...args) => { coverRequests.push(args); return cover || Promise.resolve({ blob: {}, matched_title: '作品 1', isbn: '9784091868923' }); }, upload: async () => { writes.push(['upload']); return { url: 'https://example.test/cover.jpg' }; } },
    Util: { toRangeString: () => '', parseRange: s => s ? [1] : [], showBanner() {} },
    URL: { createObjectURL: () => 'blob:candidate', revokeObjectURL() {} },
    setTimeout, clearTimeout,
    crypto: { randomUUID: () => 'new-id' },
  });
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), ctx);
  await events.DOMContentLoaded();
  await events['addBtn:click']();
  element('editTitle').value = '作品';
  return { element, events, writes, coverRequests };
}

test('fills metadata and previews cover without writing before save', async () => {
  const { element: el, events, writes } = await setup();
  await events['fetchMetadataBtn:click']();
  assert.equal(el('editAuthor').value, '作者');
  assert.equal(el('editTotalVolumes').value, '40');
  assert.equal(el('coverCandidate').hidden, false);
  assert.equal(el('useCoverCandidate').checked, false);
  assert.equal(writes.length, 0);
  el('useCoverCandidate').checked = true;
  await events['editForm:submit']({ preventDefault() {} });
  assert.equal(writes[0][0], 'upload');
  assert.equal(writes[1][1].cover_url, 'https://example.test/cover.jpg');
  assert.equal(writes[1][1].owned_volumes.length, 0);
});

test('uses ISBN for the cover lookup without changing the saved series title', async () => {
  const { element: el, events, writes, coverRequests } = await setup();
  el('editTitle').value = 'BLUE GIANT';
  el('editIsbn').value = '978-4-09-185678-4';
  await events['fetchMetadataBtn:click']();
  assert.deepEqual(coverRequests[0], ['BLUE GIANT', '', '9784091856784']);
  assert.equal(el('editTitle').value, 'BLUE GIANT');
  el('useCoverCandidate').checked = true;
  await events['editForm:submit']({ preventDefault() {} });
  assert.equal(writes[1][1].title, 'BLUE GIANT');
});

test('rejects an invalid ISBN before starting metadata or cover lookup', async () => {
  const { element: el, events, coverRequests } = await setup();
  el('editIsbn').value = '1234';
  await events['fetchMetadataBtn:click']();
  assert.equal(coverRequests.length, 0);
  assert.match(el('editMessage').textContent, /10桁または13桁/);
});

test('preserves manual fields and ownership/read entries', async () => {
  const { element: el, events, writes } = await setup();
  el('editAuthor').value = '手入力の作者';
  el('editOwned').value = '1';
  el('editRead').value = '1';
  el('editCoverUrl').value = 'https://example.test/manual.jpg';
  await events['fetchMetadataBtn:click']();
  assert.equal(el('editAuthor').value, '手入力の作者');
  assert.equal(el('editOwned').value, '1');
  assert.equal(el('editRead').value, '1');
  await events['editForm:submit']({ preventDefault() {} });
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1].cover_url, 'https://example.test/manual.jpg');
});

test('late response cannot fill another edit or overwrite changed title', async () => {
  const slow = deferred();
  const { element: el, events, writes } = await setup({ meta: slow.promise });
  const fetching = events['fetchMetadataBtn:click']();
  events['editCancelBtn:click']();
  events['addBtn:click']();
  el('editTitle').value = '別作品';
  slow.resolve({ data: { ok: true, author: '古い結果' } });
  await fetching;
  assert.equal(el('editAuthor').value, '');
  assert.equal(el('coverCandidate').hidden, true);
  assert.equal(writes.length, 0);
});

test('metadata failure still provides a selectable cover and retry', async () => {
  const { element: el, events } = await setup({ meta: Promise.resolve({ error: { message: '取得エラー' } }) });
  await events['fetchMetadataBtn:click']();
  assert.equal(el('coverCandidate').hidden, false);
  assert.match(el('editMessage').textContent, /取得エラー/);
  assert.equal(el('fetchMetadataBtn').disabled, false);
});

test('cover failure preserves useful metadata', async () => {
  const cover = deferred();
  const { element: el, events } = await setup({ cover: cover.promise.then(() => { throw Error('書影なし'); }) });
  const fetching = events['fetchMetadataBtn:click']();
  cover.resolve();
  await fetching;
  assert.equal(el('editAuthor').value, '作者');
  assert.match(el('editMessage').textContent, /書影なし/);
});

test('unchecked cover is not uploaded when saving', async () => {
  const { events, writes } = await setup();
  await events['fetchMetadataBtn:click']();
  await events['editForm:submit']({ preventDefault() {} });
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1].cover_url, null);
});

test('save failure stays in edit with values and a visible error', async () => {
  const { element: el, events } = await setup({ saveError: { message: '保存できません' } });
  await events['fetchMetadataBtn:click']();
  await events['editForm:submit']({ preventDefault() {} });
  assert.equal(el('editModal').style.display, 'flex');
  assert.equal(el('editAuthor').value, '作者');
  assert.match(el('editMessage').textContent, /保存できません/);
  assert.equal(el('fetchMetadataBtn').disabled, false);
});
