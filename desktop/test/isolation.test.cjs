const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('public edition has its own profile, installer identity and storage keys', () => {
  const root = path.resolve(__dirname, '../..');
  const main = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8');
  const launcher = fs.readFileSync(path.join(root, 'scripts/desktop-launcher.ps1'), 'utf8');
  const settings = require('../package.json');
  assert.match(main, /'ZhixuNotebookOpenSource'/);
  assert.ok(!main.includes('--legacy-config='));
  assert.equal(settings.build.appId, 'cn.zhixu.notebook.opensource');
  assert.match(launcher, /Programs\\ZhixuNotebookOpenSource/);
  assert.ok(!launcher.includes('legacyConfig'));
  assert.match(fs.readFileSync(path.join(root, 'app/src/core/workspace.js'), 'utf8'), /zhixu-oss:workspace:v2/);
});

