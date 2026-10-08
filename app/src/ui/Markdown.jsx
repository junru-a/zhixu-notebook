import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { renderMarkdown, plainPreview } from '../core/markdown.js';
import { resolveWiki } from '../core/recordKnowledge.js';
import { referenceParts, referenceText, referenceDestinations } from '../core/wikiLinks.js';

let mermaidPromise;
let renderQueue = Promise.resolve();
export function Mermaid({ source }) {
  const uid = useId().replace(/:/g, '');
  const [result, setResult] = useState({ svg: '', error: '' });
  const count = useRef(0);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    const id = `diagram-${uid}-${++count.current}`;
    setResult({ svg: '', error: '' });
    const run = async () => {
      try {
        mermaidPromise ||= import('mermaid').then(({ default: m }) => m);
        const mermaid = await mermaidPromise;
        if (!active) return;
        const tokens = getComputedStyle(document.documentElement);
        const color = (name) => tokens.getPropertyValue(name).trim();
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: { darkMode: theme === 'dark', background: color('--surface'), primaryColor: color('--soft'), primaryTextColor: color('--text'), primaryBorderColor: color('--control-line'), lineColor: color('--muted'), fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '14px' }, flowchart: { htmlLabels: false, curve: 'basis' } });
        const { svg } = await mermaid.render(id, source);
        if (active) setResult({ svg, error: '' });
      } catch { if (active) setResult({ svg: '', error: '流程图语法有误，请检查 Mermaid 内容。' }); }
      finally { document.getElementById(`d${id}`)?.remove(); }
    };
    renderQueue = renderQueue.then(run, run);
    return () => { active = false; };
  }, [source, uid, theme]);
  if (result.error) return <p className="notice error">{result.error}</p>;
  return result.svg ? <div className="mermaid-render" dangerouslySetInnerHTML={{ __html: result.svg }} /> : <p className="muted">正在绘制流程…</p>;
}

export default function Markdown({ text = '', records = [], wikiLinks = [], onRecord, onMissing, recordId }) {
  const blocks = useMemo(() => text.split(/(^```mermaid[^\n]*\n[\s\S]*?^```\s*$)/m), [text]);
  return <div className="prose" onClick={(event) => { const link = event.target.closest('[data-record-id]'); if (link?.dataset.recordId && onRecord) onRecord(records.find(r => r.id === link.dataset.recordId), link.dataset.fragment); const missing = event.target.closest('[data-wiki-target]'); if (missing && onMissing) onMissing(missing.dataset.wikiTarget); }}>{blocks.map((block, i) => block.startsWith('```mermaid')
    ? <Mermaid key={i} source={block.replace(/^```mermaid[^\n]*\n/, '').replace(/\n```\s*$/, '')} />
    : <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(block, { resolveWiki: target => resolveWiki(target, records, wikiLinks, recordId), fragment: target => wikiLinks.find(link => link.target === target)?.fragment ?? referenceParts(target).fragment, referenceExists: (id, fragment) => !fragment || referenceDestinations(records.find(r => r.id === id) || {}).some(item => item.fragment === fragment), linkTitle: (id, fragment) => { const record = records.find(r => r.id === id); return record ? (fragment ? plainPreview(referenceText(record, fragment), 250) || '该段落已移除' : `${record.title}\n${plainPreview(record.body, 250)}`) : ''; },
      // ponytail: embedded references preview one level; expand recursively only if bounded recursion is needed.
      embedPreview: (id, fragment) => plainPreview(referenceText(records.find(r => r.id === id) || {}, fragment), 800) || '尚无可预览的内容。' }) }} />)}</div>;
}
