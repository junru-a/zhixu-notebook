import { useEffect, useMemo, useState } from 'react';
import { Download, Link2, Plus, Trash2 } from 'lucide-react';
import { graphMermaid } from '../core/architectureAI.js';
import { createPhase } from '../core/model.js';
import MermaidGraph from './MermaidGraph.jsx';
import GraphViewport, { GraphWorkspace } from './GraphViewport.jsx';
import { layoutArchitecture, connectionPath, layoutEdgeLabels } from '../core/graphLayout.js';

export function downloadText(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const KINDS = { entry: '入口', data: '数据处理', model: '模型', training: '训练', evaluation: '评估', other: '通用模块' };

function ModuleEditor({ node, graph, doc, onChange, onFiles, onLink, onCreate }) {
  const [label, setLabel] = useState(node.label);
  const [summary, setSummary] = useState(node.summary);
  const [topic, setTopic] = useState(doc.phases[0]?.id || '');
  const [target, setTarget] = useState('');
  const [relation, setRelation] = useState('');
  useEffect(() => { setLabel(node.label); setSummary(node.summary); }, [node.label, node.summary]);
  const dirty = label !== node.label || summary !== node.summary;
  const save = (e) => { e?.preventDefault(); if (!dirty || !label.trim()) return; onChange({ ...graph, nodes: graph.nodes.map((n) => n.id === node.id ? { ...n, label: label.trim(), summary } : n) }); };
  return <aside className="module-detail">
    <span className="eyebrow">模块详情 · {KINDS[node.kind]}</span>
    <form onSubmit={save}><label className="field">模块名称<input required maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => save()} /></label>
      <label className="field">职责与分析依据<textarea rows={5} maxLength={1500} value={summary} onChange={(e) => setSummary(e.target.value)} onBlur={() => save()} /></label>
      <button className="button" disabled={!dirty || !label.trim()} type="submit">保存模块修改</button><p className="field-hint">{!label.trim() ? '模块名称不能为空，请填写后保存。' : dirty ? '离开输入框时自动保存' : '修改已保留'}</p></form>
    <h4>依据文件 <span>{node.files.length}</span></h4><div className="module-files">{node.files.map((path) => <button key={path} onClick={() => onFiles(path)}>{path}</button>)}</div>
    <h4>模块关系</h4>{graph.edges.filter((e) => e.source === node.id || e.target === node.id).map((edge) => <div className="module-relation" key={graph.edges.indexOf(edge)}><div><b>{graph.nodes.find((n) => n.id === edge.source)?.label} → {graph.nodes.find((n) => n.id === edge.target)?.label}</b><label className="edge-label-editor">连线说明<input id={`edge-editor-${graph.edges.indexOf(edge)}`} aria-label={`连线说明 ${graph.edges.indexOf(edge) + 1}`} key={edge.label} defaultValue={edge.label} maxLength={100} onBlur={(event) => { const value = event.target.value.trim(); if (!value) { event.target.value = edge.label; return; } if (value !== edge.label) onChange({ ...graph, edges: graph.edges.map((e) => e === edge ? { ...e, label: value, reviewed: false } : e) }); }} /></label><p>{edge.reviewed ? '已人工核查' : edge.manual ? '手动补充' : edge.citations?.some((c) => c.verified) ? '引文已匹配 · 语义待核查' : '模型推断 · 待核查'}</p><small>{edge.evidence}</small>
      {edge.citations?.map((citation, index) => <details className="edge-citation" key={index}><summary>{citation.verified ? '引文匹配' : '引文未核实'} · {citation.path}</summary><pre>{citation.quote}</pre></details>)}
      <button className="button quiet" onClick={() => onChange({ ...graph, edges: graph.edges.map((e) => e === edge ? { ...e, reviewed: !e.reviewed } : e) })}>{edge.reviewed ? '撤销人工核查' : '标记已核查'}</button></div><button className="icon-button" aria-label={`移除关系 ${edge.label}`} onClick={() => onChange({ ...graph, edges: graph.edges.filter((e) => e !== edge) })}><Trash2 size={14} /></button></div>)}
    <form className="relation-form" onSubmit={(e) => { e.preventDefault(); onChange({ ...graph, edges: [...graph.edges, { source: node.id, target, label: relation.trim(), confidence: 'supported', evidence: '用户手动补充的关系', manual: true }] }); setRelation(''); }}>
      <select required aria-label="关系目标模块" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">连接到模块…</option>{graph.nodes.filter((n) => n.id !== node.id).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select>
      <input required maxLength={100} aria-label="关系说明" placeholder="例如：输出特征 / 调用训练" value={relation} onChange={(e) => setRelation(e.target.value)} /><button className="button" disabled={!target || !relation.trim() || graph.edges.length >= 60}><Plus size={14} />添加关系</button></form>
    {onLink && <><h4>归入科研树</h4><p className="field-hint">关联模块的依据文件，记录和研究状态仍由你维护。</p><div className="link-file"><select aria-label="模块关联研究节点" value={topic} onChange={(e) => setTopic(e.target.value)}>{doc.phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select><button className="button" disabled={!topic || !node.files.every((path) => doc.architecture.files.some((f) => f.path === path))} onClick={() => onLink(topic, node.files)}><Link2 size={14} />关联</button></div>
      <button className="button quiet" onClick={() => onCreate(node)}><Plus size={14} />用此模块新建研究节点</button></>}
  </aside>;
}

export default function ArchitectureGraph({ graph, doc, onChange, onFiles, onLink, update, initialModuleId }) {
  const [selectedId, setSelectedId] = useState(initialModuleId || graph.nodes[0]?.id);
  const [mode, setMode] = useState('graph');
  const [local, setLocal] = useState(false), [showLabels, setShowLabels] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const visibleGraph = useMemo(() => {
    if (!local) return graph;
    const edges = graph.edges.filter((e) => e.source === selectedId || e.target === selectedId);
    const ids = new Set([selectedId, ...edges.flatMap((e) => [e.source, e.target])]);
    return { ...graph, nodes: graph.nodes.filter((n) => ids.has(n.id)), edges };
  }, [graph, local, selectedId]);
  const { nodes, width, height } = useMemo(() => layoutArchitecture(visibleGraph), [visibleGraph]);
  const annotations = useMemo(() => layoutEdgeLabels(nodes, visibleGraph.edges), [nodes, visibleGraph.edges]);
  const boardWidth = Math.max(width, ...annotations.map((a) => a.x + 90)), boardHeight = Math.max(height, ...annotations.map((a) => a.y + 30));
  const layoutKey = nodes.map((n) => `${n.id}:${n.x}:${n.y}`).join('|');
  const selected = graph.nodes.find((n) => n.id === selectedId) || graph.nodes[0];
  const createTopic = (node) => {
    const phase = { ...createPhase(doc.research.id, node.label), summary: node.summary, parentId: null, codePaths: node.files.filter((path) => doc.architecture.files.some((f) => f.path === path)), progress: 'todo' };
    update((p) => ({ ...p, phases: [...p.phases, phase] }));
  };
  return <div className="architecture-result">
    <div className="architecture-intro"><div><h2>{graph.title}</h2><p>{graph.summary}</p></div><button className="button" onClick={() => downloadText('程序架构.mmd', graphMermaid(graph))}><Download size={15} />导出 Mermaid</button></div>
    <div className="architecture-meta"><span>{graph.nodes.length} 个模块 · {graph.edges.length} 条关系</span><span>{graph.model || 'DeepSeek'} · {new Date(graph.generatedAt).toLocaleString('zh-CN')}</span>{graph.editedAt && <span>已手动修订</span>}</div>
    <section className="analysis-coverage" aria-label="分析依据与核查"><b>分析依据与核查</b><div className="coverage-metrics"><span><strong>{graph.coverage?.code ?? '未知'} / {graph.coverage?.selected ?? graph.fileSnapshot?.length ?? '未知'}</strong>文件提供源码</span><span><strong>{graph.coverage?.truncated ?? '未知'}</strong>文件发生截断</span><span><strong>{graph.edges.filter((e) => e.citations?.some((c) => c.verified)).length} / {graph.edges.length}</strong>关系有匹配引文</span><span><strong>{graph.edges.filter((e) => e.reviewed).length} / {graph.edges.length}</strong>关系已人工核查</span></div><p>未提供经过标注集评测的准确率。引文匹配只说明文字存在；点击模块逐条检查关系与假设。{graph.coverage?.characters != null && ` 本次发送 ${graph.coverage.characters.toLocaleString()} 个源码字符。`}</p></section>
    <div className="graph-toolbar"><div className="segmented"><button aria-pressed={mode === 'graph'} className={mode === 'graph' ? 'active' : ''} onClick={() => setMode('graph')}>交互架构图</button><button aria-pressed={mode === 'mermaid'} className={mode === 'mermaid' ? 'active' : ''} onClick={() => setMode('mermaid')}>Mermaid</button></div><span>箭头表示分析出的关系 · 虚线表示推测 · 点击模块查看依据</span></div>
    <GraphWorkspace className="architecture-workbench" expanded={expanded} onExpandedChange={setExpanded} label="程序架构工作区"><div className="architecture-canvas">
      <div className="architecture-view-options"><label><input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} />只看当前模块相关关系</label>{mode === 'graph' && <label><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />显示连线说明</label>}<span>{visibleGraph.nodes.length} 个模块 · {visibleGraph.edges.length} 条关系</span></div>
      {mode === 'mermaid' ? <MermaidGraph source={graphMermaid(visibleGraph)} expanded={expanded} onExpandedChange={setExpanded} /> : <GraphViewport width={boardWidth} height={boardHeight} resetKey={layoutKey} label="架构图" expanded={expanded} onExpandedChange={setExpanded}><div className="architecture-board" style={{ width: boardWidth, height: boardHeight }}>
        <svg width={boardWidth} height={boardHeight} aria-hidden="true"><defs><marker id="architecture-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          {visibleGraph.edges.map((edge, i) => { const from = nodes.find((n) => n.id === edge.source), to = nodes.find((n) => n.id === edge.target); if (!from || !to) return null; return <g key={i} className={selected && (edge.source === selected.id || edge.target === selected.id) ? 'edge emphasized' : 'edge'}><path d={connectionPath(from, to)} strokeDasharray={edge.confidence === 'inferred' ? '5 4' : undefined} markerEnd="url(#architecture-arrow)" /><title>{edge.label}：{edge.evidence}</title></g>; })}
        {showLabels && annotations.map((a, i) => <line key={`label-${i}`} x1={a.anchorX} y1={a.anchorY} x2={a.x} y2={a.y} stroke="var(--control-line)" strokeDasharray="2 3" />)}</svg>{showLabels && annotations.map(({ edge, x, y }, i) => <button key={i} className="architecture-edge-label" style={{ left: x, top: y }} title={`${edge.label}：${edge.evidence}（点击查看及修改）`} onClick={() => { setSelectedId(edge.source); requestAnimationFrame(() => document.getElementById(`edge-editor-${graph.edges.indexOf(edge)}`)?.scrollIntoView({ block: 'nearest' })); }}>{edge.label}</button>)}{nodes.map((node) => <button key={node.id} className={`architecture-node ${node.id === selected?.id ? 'selected' : ''}`} style={{ left: node.x, top: node.y }} title={`${node.label}\n${node.summary}`} onClick={() => setSelectedId(node.id)} aria-pressed={node.id === selected?.id}><small>{KINDS[node.kind]}</small><strong>{node.label}</strong><span>{node.files.length} 个依据文件</span></button>)}
      </div></GraphViewport>}
    </div>{selected && <ModuleEditor key={selected.id} node={selected} graph={graph} doc={doc} onChange={onChange} onFiles={(path) => { setExpanded(false); onFiles(path); }} onLink={onLink} onCreate={createTopic} />}</GraphWorkspace>
    {graph.warnings.length > 0 && <details className="analysis-uncertainty"><summary>分析局限与待核查项 · {graph.warnings.length}</summary><ul>{graph.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
  </div>;
}
