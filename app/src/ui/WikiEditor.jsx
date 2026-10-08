import { useState } from 'react';
import { referenceDestinations, referenceParts, resolveWiki } from '../core/wikiLinks.js';

export default function WikiEditor({ value, onChange, textareaRef, records, record, phases }) {
  const [caret, setCaret] = useState(0), [selected, setSelected] = useState(0), [dismissed, setDismissed] = useState(false);
  const match = value.slice(0, caret).match(/\[\[([^\]\n]*)$/);
  const query = match?.[1] || '', parts = referenceParts(query.split('|')[0]);
  const pool = [...records.filter(r => r.id !== record.id), record];
  const targetId = resolveWiki(parts.target, pool, [], record.id);
  const target = pool.find(r => r.id === targetId);
  const headings = match && query.includes('#');
  const options = (headings ? referenceDestinations(target || {}).map(item => ({ ...item, record: target || record })) : pool.filter(r => !query || [r.title, r.stageId, ...(r.aliases || [])].some(name => name?.toLowerCase().includes(parts.target.toLowerCase()))).map(r => ({ record: r, label: r.title, fragment: '', kind: '记录' })))
    .filter(item => !headings || item.fragment.toLowerCase().includes(parts.fragment.toLowerCase())).slice(0, 12);
  const open = !!match && !dismissed && !!options.length;
  const choose = item => {
    const label = item.record.title + (item.fragment ? ' · ' + item.label : '');
    const text = `[[${item.record.id}${item.fragment ? '#' + item.fragment : ''}|${label.replace(/\]|\||\n/g, ' ')}]]`;
    const start = caret - match[0].length, end = caret + (value.slice(caret).startsWith(']]') ? 2 : 0);
    onChange({ target: { value: value.slice(0, start) + text + value.slice(end) } });
    setDismissed(true);
    requestAnimationFrame(() => { textareaRef.current.focus(); textareaRef.current.setSelectionRange(start + text.length, start + text.length); });
  };
  return <div className="wiki-editor"><textarea ref={textareaRef} aria-label="记录正文" value={value} onChange={e => { setCaret(e.target.selectionStart); setSelected(0); setDismissed(false); onChange(e); }} onSelect={e => setCaret(e.target.selectionStart)} spellCheck={false} placeholder={'## 本轮问题\n\n输入 [[ 选择记录；输入 # 选择标题或段落'}
    aria-autocomplete="list" aria-controls={open ? 'wiki-suggestions' : undefined} aria-expanded={open} onKeyDown={e => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissed(true); }
      else if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setSelected(index => (index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(options[selected % options.length]); }
    }} />
    {open && <div className="wiki-suggestions" id="wiki-suggestions" role="listbox" aria-label="选择链接目标">{options.map((item, i) => <button type="button" role="option" aria-selected={i === selected % options.length} key={item.record.id + ':' + item.fragment} onMouseDown={e => e.preventDefault()} onClick={() => choose(item)}><b>{item.label}</b><small>{item.kind} · {phases.find(p => p.id === item.record.phaseId)?.title} · {item.record.stageId || new Date(item.record.recordedAt || item.record.createdAt).toLocaleDateString()}</small></button>)}</div>}
  </div>;
}
