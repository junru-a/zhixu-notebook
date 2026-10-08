import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
if (!existsSync(resolve(root, '../app/dist/index.html'))) throw new Error('请先在根目录运行 npm run build。');
mkdirSync(resolve(root, 'build'), { recursive: true });
copyFileSync(resolve(root, '../LICENSE'), resolve(root, 'build/LICENSE'));
copyFileSync(resolve(root, '../THIRD_PARTY_LICENSES.md'), resolve(root, 'build/THIRD_PARTY_LICENSES.md'));
copyFileSync(resolve(root, '../THIRD_PARTY_NOTICES.md'), resolve(root, 'build/THIRD_PARTY_NOTICES.md'));
await build({ entryPoints: [resolve(root, 'main.cjs')], outfile: resolve(root, 'build/main.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], legalComments: 'eof' });
copyFileSync(resolve(root, 'preload.cjs'), resolve(root, 'build/preload.cjs'));
function copyDirectory(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = resolve(source, entry.name), to = resolve(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}
const webOutput = resolve(root, 'build/web');
if (dirname(webOutput) !== resolve(root, 'build')) throw new Error('构建输出路径不正确');
rmSync(webOutput, { recursive: true, force: true });
copyDirectory(resolve(root, '../app/dist'), webOutput);
console.log('桌面程序与页面已准备好；配置和个人数据不会打包。');
