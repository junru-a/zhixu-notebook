import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'release', '.qa', '.tmp', '.launcher', 'coverage', 'test-results', 'playwright-report']);
const issues = []; let checked = 0;
function walk(directory, relative = '') {
  for (const name of readdirSync(directory)) {
    const local = relative ? `${relative}/${name}` : name, full = resolve(directory, name), stat = lstatSync(full);
    if (stat.isSymbolicLink()) { issues.push(`${local}: symbolic link is not publishable`); continue; }
    if (stat.isDirectory()) { if (!ignored.has(name) && local !== 'docs/qa') walk(full, local); continue; }
    if (local === 'SOURCE-MANIFEST.sha256') continue;
    if ((name.startsWith('.env') && local !== 'app/.env.example') || /^(?:workspace(?:\.previous)?|settings|window)\.json$/.test(name) || /\.(?:log|pem|key|p12|pfx|exe|zip|blockmap)$/i.test(name)) issues.push(`${local}: private or generated file`);
    if (!/\.(?:js|jsx|cjs|mjs|json|md|html|ps1|vbs|ya?ml|example)$/.test(name)) continue;
    checked++;
    const text = readFileSync(full, 'utf8');
    if (/sk-[a-zA-Z0-9]{32,}/.test(text)) issues.push(`${local}: possible live API key`);
    if (/DEEPSEEK_API_KEY[ \t]*=[ \t]*[^\s#'"`]/.test(text)) issues.push(`${local}: nonempty API key assignment`);
    if (/"encryptedKey"\s*:\s*"[a-zA-Z0-9+/=]{24,}"/.test(text)) issues.push(`${local}: encrypted credential`);
    if (/[A-Z]:[\\/]Users[\\/][a-zA-Z0-9_-]+/i.test(text)) issues.push(`${local}: personal home path`);
  }
}
walk(root);
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
else console.log(`PASS: ${checked} text files checked; no private configuration or credential patterns found.`);

