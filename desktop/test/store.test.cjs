const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('../store.cjs');
const root = path.resolve(__dirname, '../.qa/store');
fs.mkdirSync(root, { recursive: true });
const key = 'zhixu-oss:workspace:v2';
const validate = (text) => { const value = JSON.parse(text); if (value.version !== 2 || !Array.isArray(value.projects)) throw new Error('Invalid workspace'); };
test('native workspace persists across process/store instances with a separate recovery snapshot', () => {
  const directory = fs.mkdtempSync(path.join(root, 'persist-'));
  const store = createStore(directory, validate);
  assert.equal(store.getItem(key), null);
  const first = JSON.stringify({ version: 2, projects: [{ id: 'one' }] });
  const second = JSON.stringify({ version: 2, projects: [{ id: 'two' }] });
  store.setItem(key, first); store.setItem(`${key}:prev`, first); store.setItem(key, second);
  const reopened = createStore(directory, validate);
  assert.equal(reopened.getItem(key), second); assert.equal(reopened.getItem(`${key}:prev`), first);
  assert.equal(fs.readdirSync(directory).some((name) => name.endsWith('.tmp')), false);
});
test('invalid or oversized writes cannot replace valid records', () => {
  const directory = fs.mkdtempSync(path.join(root, 'reject-')), store = createStore(directory, validate);
  const value = JSON.stringify({ version: 2, projects: [] }); store.setItem(key, value);
  assert.throws(() => store.setItem(key, 'broken')); assert.throws(() => store.setItem(key, 'x'.repeat(31 * 1024 * 1024)));
  assert.equal(store.getItem(key), value);
});
test('renderer cannot choose arbitrary paths or read settings/key files', () => {
  const directory = fs.mkdtempSync(path.join(root, 'paths-')), store = createStore(directory, validate);
  for (const name of ['../settings.json', 'settings.json', '__proto__', 'constructor']) { assert.throws(() => store.getItem(name)); assert.throws(() => store.setItem(name, '{}')); }
  assert.deepEqual(fs.readdirSync(directory), []);
});
test('corrupt on-disk current data remains available for recovery, not treated as a fresh notebook', () => {
  const directory = fs.mkdtempSync(path.join(root, 'corrupt-')), store = createStore(directory, validate);
  fs.writeFileSync(path.join(directory, 'workspace.json'), '{incomplete');
  assert.equal(store.getItem(key), '{incomplete');
  assert.equal(fs.readFileSync(path.join(directory, 'workspace.json'), 'utf8'), '{incomplete');
});
