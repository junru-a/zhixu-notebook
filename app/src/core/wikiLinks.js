export function referenceParts(value) {
  const index = value.indexOf('#');
  return { target: (index < 0 ? value : value.slice(0, index)).trim(), fragment: index < 0 ? '' : value.slice(index + 1).trim() };
}
export function resolveWiki(value, records, saved = [], currentId = '') {
  const pinned = saved.find(link => link.target === value);
  if (pinned?.recordId) return records.some(record => record.id === pinned.recordId) ? pinned.recordId : null;
  const { target } = referenceParts(value);
  if (!target) return records.some(record => record.id === currentId) ? currentId : null;
  const exact = records.find(record => record.id === target);
  if (exact) return exact.id;
  const matches = records.filter(record => record.title === target || record.stageId === target || record.aliases?.includes(target));
  return matches.length === 1 ? matches[0].id : null;
}
const plainHeading = text => text.replace(/[*_`]/g, '').trim();
export function referenceDestinations(record) {
  let fence = false, math = false;
  const found = [];
  for (const [index, line] of (record.body || '').split('\n').entries()) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (/^\s*\$\$/.test(line)) { if ((line.match(/\$\$/g) || []).length === 1) math = !math; continue; }
    if (fence || math) continue;
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) found.push({ fragment: plainHeading(heading[2]), label: plainHeading(heading[2]), kind: '标题', line: index, level: heading[1].length });
    const block = line.match(/(?:^|\s)\^([A-Za-z0-9-]+)\s*$/);
    if (block) found.push({ fragment: '^' + block[1], label: block[1], kind: '段落', line: index });
  }
  return found.filter((item, index) => found.findIndex(other => other.fragment === item.fragment) === index);
}
export function referenceText(record, fragment = '') {
  if (!fragment) return record.body || '';
  const destinations = referenceDestinations(record), destination = destinations.find(item => item.fragment === fragment);
  if (!destination) return '';
  const lines = (record.body || '').split('\n');
  if (fragment.startsWith('^')) {
    const id = fragment.slice(1), end = destination.line;
    let start = end, last = end;
    if (lines[end].trim() === '^' + id) { last--; while (last >= 0 && !lines[last].trim()) last--; start = last; }
    while (start > 0 && lines[start - 1].trim() && !/^#{1,6}\s/.test(lines[start - 1])) start--;
    return lines.slice(start, last + 1).join('\n').replace(new RegExp('\\s*\\^' + id + '\\s*$'), '');
  }
  const start = destination.line;
  const end = destinations.find(item => item.kind === '标题' && item.line > start && item.level <= destination.level)?.line ?? lines.length;
  return lines.slice(start, end).join('\n');
}
