import { useMemo, useState } from 'react';
import { Network, Search, ArrowUpRight, Focus, GitBranch, FileText, Code2 } from 'lucide-react';
import { buildNetwork, defaultNetworkNode, layoutKnowledge, NETWORK_TYPES as labels } from '../core/knowledgeNetwork.js';
import { connectionPath } from '../core/graphLayout.js';
import GraphViewport, { GraphWorkspace } from './GraphViewport.jsx';
import { KnowledgeSettings } from './RecordReader.jsx';

export { buildNetwork } from '../core/knowledgeNetwork.js';
const icons = { topic: GitBranch, record: FileText, module: Code2 };
export default function KnowledgeNetwork({ doc, update, onRecord, onTopic, onModule, initialRecordId }) {
  const network = useMemo(() => buildNetwork(doc), [doc]);
  const [choice, setChoice] = useState(initialRecordId ? `record:${initialRecordId}` : null);
  const [query, setQuery] = useState(''), [local, setLocal] = useState(true), [expanded, setExpanded] = useState(false);
  const selectedId = network.nodes.some((n) => n.id === choice) ? choice : defaultNetworkNode(network);
  const selected = network.nodes.find((n) => n.id === selectedId);
  const graph = useMemo(() => layoutKnowledge(network, selectedId, local), [network, selectedId, local]);
  const layoutKey = graph.nodes.map((n) => n.id).join('|');
  const incident = network.edges.filter((e) => e.source === selectedId || e.target === selectedId);
  const isolated = network.nodes.filter((n) => !n.degree);
  const searchResults = query.trim() ? network.nodes.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const focus = (id) => { setChoice(id); setLocal(true); };
  const open = (node) => { setExpanded(false); return node.type === 'record' ? onRecord(doc.stages.find((r) => r.id === node.targetId)) : node.type === 'topic' ? onTopic(node.targetId) : onModule(node.targetId); };
  return <main className="knowledge-page">
    <div className="page-heading"><div><h1>知识网络</h1><p className="muted">{doc.stages.length} 篇记录 · {doc.phases.length} 个研究节点 · {network.edges.length} 条已有联系</p></div><KnowledgeSettings doc={doc} update={update} /></div>
    <p className="network-explanation">把记录归属、正文双链和已保存的代码关系放在一起。这里展示已有联系，不会重新发起 AI 分析；虚线表示 AI 建立且尚未人工核查的关系。</p>
    <div className="network-toolbar"><label className="search-field"><Search size={18} /><input aria-label="搜索知识网络" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="查找记录、研究节点或代码模块" /></label><div className="segmented"><button className={local ? 'active' : ''} aria-pressed={local} onClick={() => setLocal(true)}>围绕选中项</button><button className={!local ? 'active' : ''} aria-pressed={!local} onClick={() => setLocal(false)}>关联总览</button></div></div>
    {query.trim() && <div className="network-search-results" aria-label="网络搜索结果">{searchResults.slice(0, 30).map((n) => <button key={n.id} className="button" onClick={() => focus(n.id)}><small>{labels[n.type]}</small>{n.label}</button>)}{!searchResults.length && <span className="muted">没有匹配的内容</span>}{searchResults.length > 30 && <span className="muted">显示前 30 项，请缩小搜索范围。</span>}</div>}
    <GraphWorkspace className="network-layout" label="知识网络工作区" expanded={expanded} onExpandedChange={setExpanded}>
      <div className="network-canvas"><div className="network-legend"><b>{local ? '当前焦点' : '关联总览'}</b><span>{local ? selected?.label || '尚未建立联系' : '按内容类型分组，位置不代表时间顺序'}</span><small>{graph.nodes.length} 项 · {graph.edges.length} 条联系</small></div>
        {graph.nodes.length ? <GraphViewport width={graph.width} height={graph.height} resetKey={layoutKey} label="知识网络" expanded={expanded} onExpandedChange={setExpanded}>
          <svg width={graph.width} height={graph.height} aria-hidden="true"><defs><marker id="knowledge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>{graph.edges.map((edge) => { const from = graph.nodes.find((n) => n.id === edge.source), to = graph.nodes.find((n) => n.id === edge.target); return <path key={edge.id} d={connectionPath(from, to)} fill="none" stroke={edge.source === selectedId || edge.target === selectedId ? 'var(--accent)' : 'var(--control-line)'} strokeWidth="1.5" strokeDasharray={edge.uncertain ? '6 5' : undefined} markerEnd="url(#knowledge-arrow)" />; })}</svg>
          {graph.columns.map((col) => <div key={col.type} className="network-column-label" style={{ left: col.x }}>{col.label}<span>{col.count}</span></div>)}
          {graph.nodes.map((node) => { const Icon = icons[node.type]; return <button key={node.id} className={`knowledge-node ${node.id === selectedId ? 'selected' : ''}`} style={{ left: node.x, top: node.y }} aria-label={`${labels[node.type]}：${node.label}`} aria-pressed={node.id === selectedId} onClick={() => setChoice(node.id)} title={`${node.label}\n${node.description}`}><small><Icon size={13} />{labels[node.type]}{node.type === 'record' && <i style={{ background: node.color }} />}</small><strong>{node.label}</strong><span>{node.type === 'record' ? node.description.split(' · ')[0] + ' · ' : ''}{node.degree} 条联系</span></button>; })}
        </GraphViewport> : <div className="network-empty"><Network size={28} /><h2>还没有可展示的联系</h2><p>记录归入研究节点后会自动出现在这里。正文中的 [[双链]]、已确认的 AI 关联和保存的架构关系也会汇入网络。</p></div>}
        {graph.total > graph.nodes.length && <p className="network-note">当前显示 {graph.nodes.length} / {graph.total} 项，搜索某项可查看它的直接联系。</p>}
      </div>
      <aside className="network-inspector">{selected ? <><small>{labels[selected.type]}</small><h2>{selected.label}</h2><p>{selected.description}</p><div className="network-inspector-actions"><button className="button primary" onClick={() => open(selected)}>打开{labels[selected.type]}<ArrowUpRight size={15} /></button>{!local && <button className="button" onClick={() => setLocal(true)}><Focus size={15} />只看相关</button>}</div><h3>为什么相连 <span>{incident.length}</span></h3><p className="network-inspector-hint">箭头表示下方文字描述的方向，不代表实验先后或因果。</p>{incident.map((edge) => { const other = network.nodes.find((n) => n.id === (edge.source === selectedId ? edge.target : edge.source)); return <article className="network-connection" key={edge.id}><small>{edge.origin}</small><button className="network-neighbor" onClick={() => setChoice(other.id)}><b>{other.label}</b><ArrowUpRight size={13} /></button><p className="network-relation">{edge.source === selectedId ? '当前项 → 对方' : '对方 → 当前项'} · {edge.label}</p>{edge.reason && <p>{edge.reason}</p>}{(edge.evidence || edge.paths?.length || edge.citations?.length) && <details><summary>查看关联依据</summary>{edge.evidence && <blockquote>{edge.evidence}</blockquote>}{edge.paths?.map((path) => <code key={path}>{path}</code>)}{edge.citations?.map((citation, i) => <div key={i}><small>{citation.verified ? '引文已匹配，语义仍需核查' : '引文未核实'} · {citation.path}</small><blockquote>{citation.quote}</blockquote></div>)}</details>}</article>; })}{!incident.length && <p className="muted">这项内容还没有关联。可在记录里添加双链或手动关联；代码模块可在“程序结构”里归入研究节点。</p>}</> : <div className="network-empty"><Network size={28} /><h2>从一条记录开始</h2><p>保存记录并选择所属研究节点，或打开下方未关联的内容补充联系。</p></div>}</aside>
    </GraphWorkspace>
    {!!isolated.length && <details className="network-isolated"><summary>未关联内容 <b>{isolated.length}</b><span>单独列出，避免混入关系图</span></summary><p>这些内容尚无已保存的关系，不会仅凭名称相似自动连线。</p><div>{isolated.slice(0, 50).map((node) => <button key={node.id} onClick={() => focus(node.id)}><small>{labels[node.type]}</small><span>{node.label}</span><ArrowUpRight size={14} /></button>)}</div>{isolated.length > 50 && <p>显示前 50 项，其余内容可通过上方搜索查找。</p>}</details>}
  </main>;
}
