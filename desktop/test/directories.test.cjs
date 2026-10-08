const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { readDirectories } = require('../directories.cjs');
const base = path.resolve(__dirname, '../.qa/directories');
async function fixture() {
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'scan-'));
  for (const dir of ['a/models', 'b/models', 'training', 'a/models/node_modules', 'a/models/secrets']) await fs.mkdir(path.join(root, dir), { recursive: true });
  await fs.writeFile(path.join(root, 'a/models/net.py'), 'class Net:\n    pass\n');
  await fs.writeFile(path.join(root, 'b/models/other.py'), 'class OtherNet:\n    pass\n');
  await fs.writeFile(path.join(root, 'training/train.py'), 'from models.net import Net\n');
  await fs.writeFile(path.join(root, 'a/models/node_modules/private.py'), 'not for scanning');
  await fs.writeFile(path.join(root, 'a/models/secrets/hidden.py'), 'not for scanning');
  await fs.writeFile(path.join(root, 'a/models/.env.local'), 'never share');
  return root;
}
test('one native selection reads multiple distinct roots, including same-name folders', async () => {
  const root = await fixture();
  const value = await readDirectories(['a/models', 'b/models', 'training'].map((dir) => path.join(root, dir)));
  assert.equal(value.results.length, 3); assert.deepEqual(value.errors, []);
  assert.deepEqual(value.results.map((r) => r.scan.files.length), [1, 1, 1]);
  assert.deepEqual(value.results.map((r) => r.scan.root), ['models', 'models', 'training']);
  assert.equal(value.results[0].scan.files[0].characterCount, 20);
  assert.equal(value.results[0].snippets[0][1], 'class Net:\n    pass\n');
});
test('cancelled/empty selections read nothing; duplicates do not import twice', async () => {
  assert.deepEqual(await readDirectories([]), { results: [], errors: [] });
  const root = await fixture(), dir = path.join(root, 'a/models');
  assert.equal((await readDirectories([dir, dir])).results.length, 1);
});
test('long file tails reach the sampler through the actual native upload pipeline', async () => {
  const root = await fixture(), directory = path.join(root, 'training');
  const source = '# header\n' + '# padding\n'.repeat(1400) + 'def final_measurement():\n    return 1\n';
  await fs.writeFile(path.join(directory, 'long.py'), source);
  const { results } = await readDirectories([directory]);
  const { buildAnalysisRequest } = require('../../app/src/core/architectureAI.js');
  const request = buildAnalysisRequest({ research: { title: 'Test' }, phases: [] }, results[0].scan.files, new Map(results[0].snippets));
  const file = request.files.find(item => item.path.endsWith('/long.py'));
  assert.ok(file.excerpt.includes('final_measurement'));
  assert.ok(file.excerptRanges.at(-1).startLine > 1000);
  assert.ok(file.excerpt.length <= 6000);
});
test('an unreadable root does not discard valid selected directories', async () => {
  const root = await fixture();
  const value = await readDirectories([path.join(root, 'missing'), path.join(root, 'training')]);
  assert.equal(value.results.length, 1); assert.equal(value.errors.length, 1);
});
test('nested junctions cannot silently expand selected source scope', async () => {
  const root = await fixture();
  await fs.symlink(path.join(root, 'training'), path.join(root, 'a/models/linked'), 'junction');
  const value = await readDirectories([path.join(root, 'a/models')]);
  assert.equal(value.results[0].scan.files.length, 1); assert.equal(value.results[0].scan.skipped, 1);
});
