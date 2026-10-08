const fs = require('node:fs/promises');
const path = require('node:path');
const { analyzeFiles, isSourcePath, isIgnoredDirectory } = require('../app/src/core/codeAnalysis.js');

// Paths come only from the native picker. Never follow nested symlinks/junctions
// or execute a selected file. The renderer receives relative paths and snippets.
async function readDirectories(selected) {
  const roots = [...new Map(selected.map((root) => [path.resolve(root).toLowerCase(), path.resolve(root)])).values()];
  if (roots.length > 20) throw new Error('一次最多选择 20 个目录，请分批添加。');
  const results = [], errors = [];
  let bytes = 0, entries = 0;
  for (const root of roots) {
    const files = [], snippets = [], label = path.basename(root) || '程序';
    let skipped = 0;
    try {
      const walk = async (directory, relative) => {
        const children = await fs.readdir(directory, { withFileTypes: true });
        for (const child of children) {
          if (++entries > 30000) throw new Error('目录条目过多，请选择更具体的子目录。');
          const local = `${relative}/${child.name}`, full = path.join(directory, child.name);
          if (child.isSymbolicLink()) { skipped++; continue; }
          if (child.isDirectory()) { if (!isIgnoredDirectory(local)) await walk(full, local); continue; }
          if (!child.isFile() || !isSourcePath(local)) continue;
          const stat = await fs.lstat(full);
          if (stat.isSymbolicLink()) { skipped++; continue; }
          if (stat.size > 512 * 1024 || bytes + stat.size > 12 * 1024 * 1024) { skipped++; continue; }
          if (files.length >= 1200) throw new Error('源码超过 1200 个，请选择更具体的子目录。');
          bytes += stat.size;
          const text = await fs.readFile(full, 'utf8');
          files.push({ webkitRelativePath: local, size: stat.size, text: async () => text });
        }
      };
      await walk(root, label);
      const scan = await analyzeFiles(files, (filePath, text) => snippets.push([filePath, text]));
      scan.skipped += skipped;
      results.push({ scan, snippets });
    } catch (error) { errors.push(`${label}：${error.code ? '目录无法读取，请检查访问权限。' : error.message}`); }
  }
  return { results, errors };
}
module.exports = { readDirectories };
