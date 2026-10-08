import { useMemo, useRef, useState } from 'react';
import { FolderUp, FileCode2, Folder, ChevronRight, Link2, Check, Network, RefreshCw, Trash2, Search } from 'lucide-react';
import { analyzeFiles, fileHierarchy, matchingSuggestions, withSources, mergeSource, removeSource } from '../core/codeAnalysis.js';
import { Dialog } from './Dialogs.jsx';
import AnalysisDialog from './AnalysisDialog.jsx';
import ArchitectureGraph from './ArchitectureGraph.jsx';
import { desktop } from '../core/desktop.js';
import './architecture.css';
import { prepareArchitectureGraph } from '../core/architectureIdentity.js';

// Snippets remain in page memory. Hashes prevent reusing stale source after undo.
const sessionSources = new Map();
function FileBranch({ item, onSelect, selected, depth = 0 }) {
  const [open, setOpen] = useState(depth < 3);
  return <div><button className={`file-row ${selected === item.path ? 'selected' : ''}`} style={{ paddingLeft: 14 + depth * 18 }} aria-expanded={item.file ? undefined : open} onClick={() => item.file ? onSelect(item.file.path) : setOpen(!open)}>
    {!item.file && <ChevronRight size={12} className={open ? 'rotated' : ''} />}{item.file ? <FileCode2 size={15} /> : <Folder size={15} />}<span>{item.name}</span></button>{open && item.children.map((child) => <FileBranch key={child.path} item={child} onSelect={onSelect} selected={selected} depth={depth + 1} />)}</div>;
}

export default function CodeStructure({ doc, update, onNode, initialModuleId }) {
  const input = useRef(null), replacement = useRef(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [selectedPath, setSelectedPath] = useState(null), [topic, setTopic] = useState(doc.phases[0]?.id || '');
  const [mode, setMode] = useState(initialModuleId || doc.architecture?.pendingAnalysis || doc.architecture?.analysis ? 'graph' : 'files'), [query, setQuery] = useState(''), [remove, setRemove] = useState(null);
  const [analysisOpen, setAnalysisOpen] = useState(false), [cacheVersion, setCacheVersion] = useState(0);
  const [showSavedGraph, setShowSavedGraph] = useState(!!initialModuleId);
  const architecture = useMemo(() => withSources(doc.architecture), [doc.architecture]);
  const candidate = showSavedGraph ? null : architecture.pendingAnalysis;
  const setCandidate = (value) => { setShowSavedGraph(false); update((p) => ({ ...p, architecture: { ...withSources(p.architecture), pendingAnalysis: value || undefined } })); };
  const selected = architecture.files.find((f) => f.path === selectedPath);
  const graph = candidate || architecture.analysis;
  const filtered = useMemo(() => architecture.files.filter((f) => f.path.toLowerCase().includes(query.toLowerCase())), [architecture, query]);
  const structure = useMemo(() => fileHierarchy(filtered), [filtered]);
  const suggestions = useMemo(() => matchingSuggestions(doc), [doc]);
  const contents = useMemo(() => {
    const cache = sessionSources.get(doc.research.id);
    return new Map(architecture.files.filter((f) => f.hash && cache?.get(f.path)?.hash === f.hash).map((f) => [f.path, cache.get(f.path).text]));
  }, [architecture, doc.research.id, cacheVersion]);
  const applyScans = (results, errors = [], replaceId = null) => {
    let added = 0, count = 0;
    const failures = [...errors], cache = sessionSources.get(doc.research.id) || new Map();
    update((p) => {
      let next = withSources(p.architecture);
      for (const item of results) {
        try {
          const sourceId = replaceId || crypto.randomUUID(), snippets = new Map(item.snippets);
          next = mergeSource(next, item.scan, sourceId, !!replaceId);
          for (const f of next.files.filter((f) => f.sourceId === sourceId)) cache.set(f.path, { hash: f.hash, text: snippets.get(f.originalPath) });
          added++;
        } catch (err) { failures.push(`${item.scan.root}：${err.message}`); }
      }
      count = next.sources.length;
      for (const path of cache.keys()) if (!next.files.some((f) => f.path === path)) cache.delete(path);
      return added ? { ...p, architecture: next } : p;
    });
    sessionSources.set(doc.research.id, cache);
    while (sessionSources.size > 3) sessionSources.delete(sessionSources.keys().next().value);
    setCacheVersion((v) => v + 1); setSelectedPath(null);
    if (added) setMessage(`已${replaceId ? '更新' : '添加'} ${added} 个目录，当前共 ${count} 个目录。`);
    if (failures.length) setError(failures.join('\n'));
  };
  const choose = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const snippets = [];
      const scan = await analyzeFiles(files, (path, text) => snippets.push([path, text]));
      applyScans([{ scan, snippets }], [], replacement.current);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); replacement.current = null; }
  };
  const pick = async (id = null) => {
    if (!desktop?.chooseDirectories) { replacement.current = id; input.current.click(); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await desktop.chooseDirectories(!id);
      if (result) applyScans(result.results, result.errors, id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const saveAnalysisOptions = (draft) => update((p) => ({ ...p, architecture: { ...withSources(p.architecture), analysisDraft: draft } }), false);
  const link = (phaseId, paths) => {
    const validPaths = (Array.isArray(paths) ? paths : [paths]).filter((path) => architecture.files.some((f) => f.path === path));
    update((p) => ({ ...p, phases: p.phases.map((phase) => phase.id === phaseId ? { ...phase, codePaths: [...new Set([...(phase.codePaths || []), ...validPaths])] } : phase) }));
    setMessage('已关联到研究节点，可从科研树查看对应记录。');
  };
  const changeGraph = (next) => {
    if (candidate) setCandidate({ ...next, editedAt: new Date().toISOString() });
    else update((p) => ({ ...p, architecture: { ...p.architecture, analysis: { ...next, editedAt: new Date().toISOString() } } }));
  };
  const openFile = (path) => {
    if (!architecture.files.some((f) => f.path === path)) { setError('该文件已移除，图谱依据来自旧快照。请更新目录后重新分析。'); return; }
    setSelectedPath(path); setQuery(''); setMode('files');
  };
  const missingLinks = new Set(doc.phases.flatMap((p) => p.codePaths || []).filter((path) => !architecture.files.some((f) => f.path === path))).size;
  const aiSuggestions = architecture.analysis?.suggestions.filter((s) => {
    const node = architecture.analysis.nodes.find((n) => n.id === s.nodeId), phase = doc.phases.find((p) => p.id === s.phaseId);
    return node && phase && node.files.some((path) => !phase.codePaths?.includes(path));
  }) || [];
  return <section className="code-view"><input hidden ref={input} type="file" webkitdirectory="" directory="" multiple onChange={choose} />
    <div className="page-heading"><div><h1>程序结构</h1><p>把分散的程序放在同一张地图里，追溯到你的研究记录。</p></div><div className="code-actions"><button className="button" disabled={busy || analysisOpen || !!architecture.pendingAnalysis} onClick={() => pick()}><FolderUp size={16} />{busy ? '正在读取…' : desktop?.chooseDirectories ? '批量添加目录' : '添加目录'}</button><button className="button primary" disabled={busy || !architecture.files.length || !!architecture.pendingAnalysis} onClick={() => setAnalysisOpen(true)}><Network size={16} />DeepSeek 分析</button></div></div>
    {error && <div className="notice error" role="alert">{error}<button onClick={() => setError('')}>关闭</button></div>}
    {message && <p className="code-feedback" role="status"><Check size={14} />{message}</p>}
    {!architecture.sources.length ? <div className="code-empty"><div className="code-empty-icon"><FolderUp size={32} /></div><h2>从分散的目录，建立完整的研究地图</h2><p>{desktop?.chooseDirectories ? '选择模型、训练脚本、评估等目录，支持 Ctrl / Shift 多选。' : '浏览器版可连续添加目录；桌面版支持 Ctrl / Shift 一次多选。'}<br />不同位置的目录可分批追加，已有目录会保留。</p><div className="code-steps"><span>01 添加目录</span><ChevronRight size={15} /><span>02 查看架构</span><ChevronRight size={15} /><span>03 关联研究</span></div><button className="button" onClick={() => pick()}>选择本地文件夹</button><small>选择目录只在本机读取 · 点击 DeepSeek 分析后可检查发送范围</small></div> : <>
      <details className="source-collection" open={mode === 'files'}><summary className="source-heading"><h2>程序来源 <span>{architecture.sources.length} 个目录 · {architecture.files.length} 个文件</span></h2><p>{desktop?.chooseDirectories ? 'Ctrl / Shift 多选文件夹 · 不同位置可继续追加' : '浏览器版连续追加 · 桌面版支持一次多选'}</p></summary>
        {architecture.sources.map((source) => <div className="source-row" key={source.id}><Folder size={18} /><div><b>{source.label}</b><span>{architecture.files.filter((f) => f.sourceId === source.id).length} 个文件 · {source.skipped || 0} 个超限跳过 · {source.scannedAt ? new Date(source.scannedAt).toLocaleString('zh-CN') : '旧版索引'}</span></div><button className="button quiet" disabled={busy || !!architecture.pendingAnalysis} aria-label={`更新目录 ${source.label}`} onClick={() => pick(source.id)}><RefreshCw size={14} />更新</button><button className="icon-button" disabled={busy || !!architecture.pendingAnalysis} aria-label={`移除目录 ${source.label}`} onClick={() => setRemove(source)}><Trash2 size={15} /></button></div>)}
      </details>
      <div className="code-tabs" role="group" aria-label="程序查看方式"><button className={mode === 'files' ? 'active' : ''} aria-pressed={mode === 'files'} onClick={() => setMode('files')}><Folder size={16} />目录与文件</button><button className={mode === 'graph' ? 'active' : ''} aria-pressed={mode === 'graph'} onClick={() => setMode('graph')}><Network size={16} />架构图谱{graph && <span>{graph.nodes.length}</span>}</button></div>
      {missingLinks > 0 && <p className="notice">{missingLinks} 个研究关联路径暂不在当前目录中，关联已保留。可重新读取原目录，或使用顶部撤销恢复索引。</p>}
      {mode === 'files' ? <><div className="code-summary"><b>本地索引</b><span>导入与函数名来自文本规则，尚不等同于模块调用关系。</span></div><div className="code-split"><div className="file-browser"><label className="file-search"><Search size={15} /><input aria-label="搜索代码文件" placeholder="查找文件或目录…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="file-tree">{structure.children.map((item) => <FileBranch key={item.path + query} item={item} onSelect={setSelectedPath} selected={selectedPath} />)}{!filtered.length && <p className="field-hint">未找到匹配文件</p>}</div></div><div className="code-detail">{selected ? <><FileCode2 size={24} /><h3>{selected.path.split('/').pop()}</h3><p className="file-path">{selected.path}</p><h4>识别到的函数 / 类</h4><div className="code-tags">{selected.symbols.map((s) => <code key={s}>{s}</code>)}{!selected.symbols.length && <span className="muted">未识别到命名符号</span>}</div><h4>导入线索</h4><div className="code-tags">{selected.imports.map((s) => <code key={s}>{s}</code>)}{!selected.imports.length && <span className="muted">没有匹配到导入语句</span>}</div><p className="field-hint">可能遗漏动态导入、别名及部分语言语法。</p><h4>关联到研究节点</h4><div className="link-file"><select aria-label="代码关联研究节点" value={topic} onChange={(e) => setTopic(e.target.value)}>{doc.phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select><button className="button primary" disabled={!doc.phases.some((p) => p.id === topic)} onClick={() => link(topic, selected.path)}><Link2 size={14} />关联</button></div>{doc.phases.filter((p) => p.codePaths?.includes(selected.path)).map((p) => <button className="linked-topic" key={p.id} onClick={() => onNode(p.id)}><Check size={13} />{p.title}<ChevronRight size={13} /></button>)}</> : <div className="preview-empty"><FileCode2 size={28} /><p>选择左侧文件，查看代码线索并关联研究节点</p></div>}</div></div></> : <>
        {showSavedGraph && architecture.pendingAnalysis && <div className="analysis-review"><p>正在查看记录关联的已保存图谱。另有新图谱待确认。</p><button className="button" onClick={() => setShowSavedGraph(false)}>查看待保存图谱</button></div>}
        {candidate && <div className="analysis-review"><div><b>新分析结果 · 待保存</b><p>草稿已暂存，可先修改。保存会替换现有图谱，顶部撤销可恢复。</p>{candidate.migration && <p>模块身份：保留 {candidate.migration.retained}，新增 {candidate.migration.added}，未匹配 {candidate.migration.removed.length}；{candidate.migration.affected} 篇记录的旧关联需要重新选择。旧关联不会自动转给不同模块。</p>}</div><button className="button" onClick={() => setCandidate(null)}>放弃本次结果</button><button className="button primary" disabled={candidate.revision !== architecture.revision} onClick={() => { update((p) => ({ ...p, architecture: { ...architecture, analysis: prepareArchitectureGraph(p, candidate), pendingAnalysis: undefined } })); setMessage('架构图谱已保存，研究关联仍需逐项确认。'); }}>保存为当前图谱</button></div>}
        {graph && graph.revision !== architecture.revision && <p className="notice">目录已变更，此图谱对应旧版索引。请重新分析；旧图谱及手动修改会保留到你保存新结果。</p>}
        {graph ? <><p className="field-hint">本次覆盖 {graph.coverage?.selected || graph.fileSnapshot?.length} / {graph.coverage?.total || architecture.files.length} 个文件，其中 {graph.coverage?.code || 0} 个提供源码片段。AI 对职责与关系的解释需核查。</p><ArchitectureGraph initialModuleId={initialModuleId} graph={graph} doc={doc} onChange={changeGraph} onFiles={openFile} onLink={candidate ? null : link} update={update} /></> : <div className="code-empty"><Network size={30} /><h2>目录已就绪，接下来理解模块关系</h2><p>DeepSeek 可综合多个目录的源码片段，分析入口、数据流与模块职责。<br />生成的图谱支持修改，科研关联由你确认。</p><button className="button primary" onClick={() => setAnalysisOpen(true)}>选择范围并分析</button></div>}
      </>}
      <div className="suggestions"><h3>待确认的研究关联 <span>{suggestions.length + aiSuggestions.length}</span></h3><p>名称匹配与 AI 分析分别标明依据，确认后才会关联代码文件。</p>
        {aiSuggestions.map((s, i) => { const node = architecture.analysis.nodes.find((n) => n.id === s.nodeId), phase = doc.phases.find((p) => p.id === s.phaseId); return <div className="suggestion" key={`ai-${i}`}><div><b>{node.label} → {phase.title}</b><p>AI 建议 · {s.reason}</p></div><button className="button" disabled={architecture.analysis.revision !== architecture.revision} onClick={() => link(s.phaseId, node.files)}>确认模块关联</button></div>; })}
        {suggestions.map((s) => <div className="suggestion" key={s.path + s.phaseId}><div><code>{s.path}</code><p>名称匹配 · {s.reason} → {s.title}</p></div><button className="button" onClick={() => link(s.phaseId, s.path)}>确认关联</button></div>)}{!suggestions.length && !aiSuggestions.length && <p className="muted">暂无待确认建议。可以选中文件，手动关联到研究节点。</p>}</div>
    </>}
    {remove && <Dialog title="移除程序目录" onClose={() => setRemove(null)}><p>移除“{remove.label}”的文件索引。已有研究记录与路径关联会保留，现有架构图会标记为需要更新。可使用顶部撤销恢复。</p><footer className="dialog-actions"><button className="button" onClick={() => setRemove(null)}>取消</button><button className="button danger" onClick={() => { const next = removeSource(architecture, remove.id); update((p) => ({ ...p, architecture: next })); setRemove(null); setSelectedPath(null); setMessage('目录已移除，研究记录和已有路径关联已保留。'); }}>确认移除目录</button></footer></Dialog>}
    {analysisOpen && <AnalysisDialog doc={doc} architecture={architecture} contents={contents} onOptions={saveAnalysisOptions} onClose={() => setAnalysisOpen(false)} onResult={(result) => { setCandidate(prepareArchitectureGraph(doc, result)); setAnalysisOpen(false); setMode('graph'); }} />}
  </section>;
}
