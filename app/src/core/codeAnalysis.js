const SOURCE = /\.(?:py|f95|f03|f08|f|js|jsx|ts|tsx|mjs|cjs|c|h|cpp|hpp|rs|go|java|jl|r|m|f90|ipynb|md|toml|json|yaml|yml)$/i;
const IGNORED = /(?:^|\/)(?:node_modules|\.git|\.venv|venv|__pycache__|dist|build|\.next|vendor)(?:\/|$)/;
const PRIVATE = /(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key)|(?:credentials|secrets?)[^/]*|package-lock\.json|pnpm-lock\.yaml)$/i;
export const isSourcePath = (path) => SOURCE.test(path) && !IGNORED.test(path) && !PRIVATE.test(path);
export const isIgnoredDirectory = (path) => IGNORED.test(`${path}/`) || PRIVATE.test(path);

// Deliberately a static, local scan: never execute a selected file and never send
// source to a service. Import strings are hints, not resolved dependency edges.
export async function analyzeFiles(files, onContent) {
  const accepted = Array.from(files).map((file) => ({ file, path: (file.webkitRelativePath || file.name).replace(/\\/g, '/') }))
    .filter(({ path }) => isSourcePath(path));
  if (!accepted.length) throw new Error('没有找到支持的源码或说明文件。请选择项目文件夹。');
  if (accepted.length > 1200) throw new Error('源码文件超过 1200 个，请选择更具体的程序子目录。');
  const results = [];
  let bytes = 0;
  let skipped = 0;
  for (const { file, path } of accepted) {
    if (file.size > 512 * 1024 || bytes + file.size > 12 * 1024 * 1024) { skipped++; continue; }
    bytes += file.size;
    const text = await file.text();
    const imports = Array.from(text.matchAll(/(?:from\s+|import\s*\(?|require\s*\()\s*['"]([^'"\n]+)['"]|^\s*(?:from|import)\s+([\w.]+)/gm), (m) => m[1] || m[2]).slice(0, 40);
    // ponytail: language-specific declaration hints, not a resolved call graph; use parsers for complete syntax coverage.
    if (/\.(?:f90|f95|f03|f08|f)$/i.test(path)) imports.push(...Array.from(text.matchAll(/^\s*use(?:\s*,[^:]+::)?\s*(?:\:\:)?\s*(\w+)/gmi), match => match[1]));
    if (/\.(?:c|h|cpp|hpp)$/i.test(path)) imports.push(...Array.from(text.matchAll(/^\s*#include\s*[<"]([^>"]+)/gm), match => match[1]));
    const symbols = Array.from(text.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:def|class|function)\s+(\w+)/g), (m) => m[1]).slice(0, 40);
    if (/\.(?:f90|f95|f03|f08|f)$/i.test(path)) symbols.push(...Array.from(text.matchAll(/^\s*(?:(?:recursive|pure|elemental|real(?:\([^)]*\))?|integer|complex(?:\([^)]*\))?)\s+)*(?:program|module(?!\s+procedure\b)|subroutine|function)\s+(\w+)/gmi), match => match[1]));
    if (/\.(?:c|h|cpp|hpp)$/i.test(path)) symbols.push(...Array.from(text.matchAll(/^\s*(?:[\w:<>,*&]+\s+)+(\w+)\s*\([^;{}\n]*\)\s*\{/gm), match => match[1]));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    results.push({ path, imports: [...new Set(imports)].slice(0, 40), symbols, size: file.size, characterCount: text.length, hash });
    onContent?.(path, text);
  }
  if (!results.length) throw new Error('文件均超过单文件 512 KB 限制，请选择较小的源码目录。');
  return { root: results[0].path.split('/')[0], scannedAt: new Date().toISOString(), files: results, skipped, method: 'local-static-v1' };
}

// Keep legacy paths unchanged so existing research associations remain valid.
export function withSources(architecture) {
  if (architecture?.sources) return architecture;
  if (!architecture) return { sources: [], files: [], revision: 0 };
  return { ...architecture, revision: architecture.revision || 0, sources: [{ id: 'legacy', root: architecture.root || '程序', label: architecture.root || '程序', scannedAt: architecture.scannedAt, skipped: architecture.skipped || 0 }], files: architecture.files.map((file) => ({ ...file, sourceId: 'legacy', originalPath: file.path })) };
}

export function mergeSource(previous, scan, sourceId = crypto.randomUUID(), replace = false) {
  const architecture = withSources(previous);
  const existing = architecture.sources.find((s) => s.id === sourceId);
  if (replace && !existing) throw new Error('该目录已被移除，请重新添加。');
  if (replace && existing.root !== scan.root) throw new Error(`请选择原目录 ${existing.root}；其他目录请使用“添加目录”。`);
  let label = existing?.label || scan.root;
  for (let suffix = 2; architecture.sources.some((s) => s.id !== sourceId && s.label === label); suffix++) label = `${scan.root} (${suffix})`;
  const source = { id: sourceId, root: scan.root, label, scannedAt: scan.scannedAt, skipped: scan.skipped };
  const oldPaths = new Map(architecture.files.filter((f) => f.sourceId === sourceId).map((f) => [f.originalPath, f.path]));
  const files = scan.files.map((file) => ({ ...file, sourceId, originalPath: file.path, path: oldPaths.get(file.path) || `${label}/${file.path.split('/').slice(1).join('/') || file.path}` }));
  const allFiles = [...architecture.files.filter((f) => f.sourceId !== sourceId), ...files];
  if (allFiles.length > 2400) throw new Error('本项目索引上限为 2400 个文件，请缩小目录范围。');
  const before = architecture.files.filter((f) => f.sourceId === sourceId);
  const changed = before.length !== files.length || files.some((f) => !before.some((old) => old.path === f.path && old.hash === f.hash));
  return { ...architecture, sources: existing ? architecture.sources.map((s) => s.id === sourceId ? source : s) : [...architecture.sources, source], files: allFiles, scannedAt: scan.scannedAt, revision: architecture.revision + (changed ? 1 : 0), method: 'local-static-v2' };
}

export function removeSource(previous, sourceId) {
  const architecture = withSources(previous);
  return { ...architecture, sources: architecture.sources.filter((s) => s.id !== sourceId), files: architecture.files.filter((f) => f.sourceId !== sourceId), revision: architecture.revision + 1 };
}

export function matchingSuggestions(doc) {
  if (!doc.architecture) return [];
  return doc.architecture.files.flatMap((file) => {
    const base = file.path.split('/').pop().replace(/\.[^.]+$/, '');
    const matches = doc.phases.map((phase) => {
      const records = doc.stages.filter((s) => s.phaseId === phase.id);
      const text = [phase.title, phase.summary, ...records.flatMap((s) => [s.title, s.body])].join(' ').toLowerCase();
      const escapedBase = base.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const namesFile = text.includes(file.path.toLowerCase()) || (base.length >= 4 && new RegExp(`(^|[^a-z0-9_])${escapedBase}($|[^a-z0-9_])`).test(text));
      const matchedSymbol = file.symbols.find((name) => name.length >= 5 && text.includes(name.toLowerCase()));
      return { phase, score: namesFile ? 2 : matchedSymbol ? 1 : 0, reason: namesFile ? '节点或记录提及文件名' : `记录提及符号 ${matchedSymbol}` };
    }).filter((m) => m.score && !m.phase.codePaths?.includes(file.path)).sort((a, b) => b.score - a.score);
    return matches.slice(0, 2).map((match) => ({ path: file.path, phaseId: match.phase.id, title: match.phase.title, reason: match.reason }));
  }).slice(0, 30);
}

export function fileHierarchy(files, root = '程序结构') {
  const tree = { name: root, path: '', children: [] };
  for (const file of files) {
    let cursor = tree;
    const parts = file.path.split('/');
    parts.forEach((name, i) => {
      let child = cursor.children.find((n) => n.name === name);
      if (!child) { child = { name, path: parts.slice(0, i + 1).join('/'), children: [] }; cursor.children.push(child); }
      if (i === parts.length - 1) child.file = file;
      cursor = child;
    });
  }
  return tree;
}
