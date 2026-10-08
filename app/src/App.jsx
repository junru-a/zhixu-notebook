import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, Search, ArrowUpRight, ChevronRight, ChevronDown, ArrowLeft, GitBranch, FileText, Folder, Download, Upload, Undo2, Check, Sun, Moon, ArrowDownUp, Pencil, X, CircleHelp, Code2, Link2, Menu, ArrowRight, FlaskConical, PanelRightClose, PanelRightOpen, CircleAlert } from 'lucide-react';
import useWorkspace from './useWorkspace.js';
import { createStage, createPhase, STATUS } from './core/model.js';
import { newProject, createDemoProject, chronological, recordDate, topicRecords, progressOf, PROGRESS, descendantIds } from './core/workspace.js';
import { summarizeRecord } from './core/recordPreview.js';
import { ProjectDialog, TopicDialog, RecordEditor, Dialog } from './ui/Dialogs.jsx';
import TopicTree, { ProgressBadge, ProgressIcon } from './ui/TopicTree.jsx';
import CodeStructure from './ui/CodeStructure.jsx';
import { Mermaid } from './ui/Markdown.jsx';
import { Trash2 } from 'lucide-react';
import RecordReader, { ProgressControl } from './ui/RecordReader.jsx';
import KnowledgeNetwork from './ui/KnowledgeNetwork.jsx';
import useRecordKnowledge from './useRecordKnowledge.js';
import { deleteRecord, pinWikiLinks, recordLinks } from './core/recordKnowledge.js';
import './ui/knowledge.css';
import { desktop } from './core/desktop.js';
import { DesktopTools, DesktopWelcome } from './ui/DesktopSettings.jsx';

const displayDate = (iso, options = {}) => {
  const d = new Date(iso);
  return Number.isNaN(d.valueOf()) ? '日期未填写' : d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', ...options });
};
const VIEW_LABELS = { records: '科研记录', tree: '科研树', knowledge: '知识网络', code: '程序结构' };
function Logo() { return <div className="brand"><BookOpen size={31} strokeWidth={1.7} aria-hidden="true" /><b>知序</b><span>科研记录本</span></div>; }

function TopicNav({ doc, selected, onSelect, parent = null }) {
  return doc.phases.filter((p) => (p.parentId || null) === parent).map((topic) => <TopicItem key={topic.id} doc={doc} topic={topic} selected={selected} onSelect={onSelect} />);
}
function TopicItem({ doc, topic, selected, onSelect }) {
  const [open, setOpen] = useState(true);
  const children = doc.phases.some((p) => p.parentId === topic.id);
  const records = topicRecords(doc, topic.id);
  const progress = progressOf(records, topic.progress);
  useEffect(() => { if (descendantIds(doc.phases, topic.id).has(selected)) setOpen(true); }, [selected, doc.phases, topic.id]);
  return <div className="topic-branch"><div className="topic-nav-row">
    {children ? <button className="branch-toggle" aria-label={`${open ? '折叠' : '展开'} ${topic.title}`} aria-expanded={open} onClick={() => setOpen(!open)}><ChevronRight size={13} className={open ? 'rotated' : ''} /></button> : <span className="branch-spacer" />}
    <button className={`nav-topic ${selected === topic.id ? 'active' : ''}`} aria-current={selected === topic.id ? 'true' : undefined} onClick={() => onSelect(topic.id)} title={`${topic.title} · ${PROGRESS[progress].label}`}><ProgressIcon value={progress} /><span>{topic.title}</span><small>{records.length}</small></button>
    </div>{children && open && <div className="topic-children"><TopicNav doc={doc} selected={selected} onSelect={onSelect} parent={topic.id} /></div>}
  </div>;
}

function RecordCard({ record, doc, onOpen, onFilter, focused, onProgress, onDelete }) {
  const topic = doc.phases.find((p) => p.id === record.phaseId);
  const progress = progressOf([record]);
  const linkedRecords = recordLinks(record, doc).filter((link) => link.type === 'record').length;
  const summary = useMemo(() => summarizeRecord(record), [record]);
  const date = new Date(recordDate(record));
  return <article className="timeline-row" id={`record-${record.id}`}>
    <div className="time-gutter"><time dateTime={recordDate(record)}><b>{displayDate(recordDate(record)).replace('/', ' / ')}</b><span>{date.getFullYear()}</span><span>{date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></time><ProgressIcon value={progress} /></div>
    <div className={`record-card ${focused ? 'is-focused' : ''}`} data-progress={progress}>
      <div className="record-top"><button className="topic-label" onClick={() => onFilter(record.phaseId)} title={`查看 ${topic?.title} 的记录`}><Folder size={15} />{topic?.title}</button>{record.stageId && <span className="record-code">{record.stageId}</span>}<ProgressControl compact record={record} onChange={onProgress} /><button className="icon-button" aria-label={`删除记录：${record.title}`} title="删除记录" onClick={onDelete}><Trash2 size={15} /></button></div>
      <button className="record-body-button" onClick={() => onOpen(record)}><h3>{record.title || '未命名记录'}<ArrowUpRight size={18} /></h3></button>
      <div className="record-excerpt">{summary.sections.length ? summary.sections.filter((section, i) => i === 0 || !/待.*(问题|定位|验证|确认)|未解决/.test(section.title)).map((section, i) => <div className="excerpt-section" key={i}>{section.title && <span>{section.title}</span>}<p>{section.text}</p></div>) : <p className="muted">{record.body ? '包含公式、图表或代码，打开记录查看完整内容。' : '还没有正文，打开记录继续填写。'}</p>}</div>
      {['passed', 'failed', 'unverified', 'stopped'].includes(record.status) && <div className={`record-conclusion ${progress}`}><span>结论判定</span><b>{STATUS[record.status]?.label}</b>{record.worked && <small>本轮工作已做完</small>}</div>}
      {record.nextStep && <div className="next-step"><span>下一步</span><ArrowRight size={17} /><p>{record.nextStep}</p>{!linkedRecords && <button className="next-open" onClick={() => onOpen(record)} aria-label={`打开记录：${record.title}`}><ArrowUpRight size={17} /></button>}</div>}
      {(linkedRecords > 0 || !record.nextStep) && <div className="record-bottom">{linkedRecords > 0 && <button onClick={() => onOpen(record, true)}><Link2 size={16} />关联 {linkedRecords} 篇记录</button>}<button className="open-entry" onClick={() => onOpen(record)}>打开记录<ArrowUpRight size={15} /></button></div>}
    </div>
  </article>;
}

function FlowPanel({ records, onLocate, focusedId, onClose }) {
  const [mermaid, setMermaid] = useState(false);
  const ordered = useMemo(() => chronological(records), [records]);
  const source = useMemo(() => {
    const escape = (s) => String(s).replace(/["<>\[\]{}|`\\&;#]/g, ' ').replace(/\n/g, ' ').slice(0, 32);
    return `flowchart TD\n${ordered.map((s, i) => ` n${i}["${escape(s.title)}"]`).join('\n')}\n${ordered.slice(1).map((_, i) => ` n${i} --> n${i + 1}`).join('\n')}`;
  }, [ordered]);
  const next = [...ordered].reverse().find((s) => s.nextStep && !s.worked);
  const unresolved = [...ordered].reverse().filter((s) => progressOf([s]) === 'blocked').flatMap((record) => {
    const questions = summarizeRecord(record).questions;
    return (questions.length ? questions : [record.title]).map((text) => ({ text, record }));
  });
  return <aside className="flow-panel" aria-label="研究脉络">
    <div className="flow-heading"><h2>研究脉络</h2>{onClose && <button className="icon-button" aria-label="收起研究脉络" onClick={onClose}><PanelRightClose size={18} /></button>}</div>
    <div className="flow-controls"><p className="flow-description">随当前记录更新</p><div className="flow-mode"><button aria-pressed={!mermaid} className={!mermaid ? 'active' : ''} onClick={() => setMermaid(false)}>时间流程</button><button aria-pressed={mermaid} className={mermaid ? 'active' : ''} onClick={() => setMermaid(true)}>Mermaid</button></div></div>
    {ordered.length ? mermaid ? <Mermaid source={source} /> : <ol className="mini-flow">{ordered.map((s) => <li key={s.id}><button aria-label={`定位记录：${s.title}`} aria-current={focusedId === s.id ? 'true' : undefined} className={focusedId === s.id ? 'active' : ''} onClick={() => onLocate(s)} title={s.title}><ProgressIcon value={progressOf([s])} /><span><b>{s.title.split(/[：:，,]/)[0]}</b><time>{displayDate(recordDate(s)).replace('/', ' / ')}</time></span></button></li>)}</ol> : <div className="flow-empty"><GitBranch size={28} /><p>有记录后，这里会形成时间流程。</p></div>}
    <p className="flow-note">{mermaid ? '根据记录标题生成流程图。' : '点击节点，定位对应记录。'}<br />连线仅表示时间顺序。</p>
    {unresolved.length > 0 && <section className="context-section"><h3>当前待核查 <span>{unresolved.length}</span></h3>{unresolved.slice(0, 3).map(({ text, record }, i) => <button className="unresolved-item" key={`${record.id}-${i}`} onClick={() => onLocate(record)}><CircleAlert size={17} /><span>{text}</span></button>)}{unresolved.length > 3 && <p className="muted">另有 {unresolved.length - 3} 项，详见标记为“需勘误”的记录。</p>}</section>}
    {next && <section className="context-section next-focus"><h3>下一步</h3><p>{next.nextStep}</p><button onClick={() => onLocate(next)}>定位这篇记录<ArrowUpRight size={14} /></button></section>}
  </aside>;
}

export default function App() {
  const workspace = useWorkspace();
  const knowledge = useRecordKnowledge(workspace);
  const [projectId, setProjectId] = useState(null);
  const [view, setView] = useState('records');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [descending, setDescending] = useState(true);
  const [fromTree, setFromTree] = useState(false);
  const [focusedId, setFocusedId] = useState(null);
  const [flowVisible, setFlowVisible] = useState(true);
  const [mobileFlow, setMobileFlow] = useState(false);
  const [projectDialog, setProjectDialog] = useState(false);
  const [topicDialog, setTopicDialog] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [knowledgeFocus, setKnowledgeFocus] = useState(null);
  const [moduleFocus, setModuleFocus] = useState(null);
  const [entryTrail, setEntryTrail] = useState([]);
  const [help, setHelp] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('zhixu-oss:theme') || 'light'; } catch { return 'light'; } });
  const fileInput = useRef(null);
  const sidebarRef = useRef(null);
  const toastTimer = useRef(null);
  const treeViewports = useRef({});
  const sessions = useRef({});
  const recordsMain = useRef(null);
  const doc = workspace.workspace?.projects.find((p) => p.research.id === projectId);
  const projects = workspace.workspace?.projects || [];
  const say = (message) => { clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(''), 4500); };
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('zhixu-oss:theme', theme); } catch {} }, [theme]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (!mobileNav) return;
    const previous = document.activeElement;
    const sidebar = sidebarRef.current;
    const controls = () => [...sidebar.querySelectorAll('button:not(:disabled),select')].filter((el) => el.getClientRects().length);
    controls()[0]?.focus();
    const keydown = (e) => {
      if (e.key === 'Escape') setMobileNav(false);
      if (e.key === 'Tab') {
        const elements = controls();
        if (e.shiftKey && document.activeElement === elements[0]) { e.preventDefault(); elements.at(-1)?.focus(); }
        if (!e.shiftKey && document.activeElement === elements.at(-1)) { e.preventDefault(); elements[0]?.focus(); }
      }
    };
    const wide = window.matchMedia('(min-width: 761px)');
    const resize = () => { if (wide.matches) setMobileNav(false); };
    document.addEventListener('keydown', keydown); wide.addEventListener('change', resize);
    return () => { document.removeEventListener('keydown', keydown); wide.removeEventListener('change', resize); previous?.focus(); };
  }, [mobileNav]);
  const update = (fn, remember = true) => workspace.updateProject(projectId, fn, remember);
  const patchRecord = (id, fn) => update((p) => ({ ...p, stages: p.stages.map((r) => r.id === id ? { ...fn(r), updatedAt: new Date().toISOString() } : r) }));
  const viewedRecord = doc?.stages.find((r) => r.id === viewing?.id);
  const openModule = (id) => { setModuleFocus(id); setViewing(null); setView('code'); };
  const removeRecord = () => { knowledge.cancel(projectId, deletingId); update((p) => deleteRecord(p, deletingId)); setDeletingId(null); setEditing(null); setViewing(null); setEntryTrail([]); say('记录已删除，可通过顶部撤销恢复'); };
  const rememberSession = () => { if (projectId) sessions.current[projectId] = { view, filter, query, statusFilter, descending, fromTree, focusedId }; };
  const enter = (id) => {
    rememberSession();
    const cached = sessions.current[id];
    setProjectId(id); setView(cached?.view || 'records'); setFilter(cached?.filter || 'all'); setQuery(cached?.query || ''); setStatusFilter(cached?.statusFilter || 'all'); setDescending(cached?.descending ?? true); setFromTree(cached?.fromTree || false); setFocusedId(cached?.focusedId || null); setMobileNav(false); setKnowledgeFocus(null); setModuleFocus(null); setViewing(null);
  };
  const goHome = () => { rememberSession(); setProjectId(null); setMobileNav(false); };
  const switchView = (value) => { setView(value); setMobileNav(false); if (value === 'code') setModuleFocus(null); };
  const selectTopic = (id, origin = 'sidebar') => {
    setFilter(id); setView('records'); setQuery(''); setStatusFilter('all'); setMobileNav(false); setFocusedId(null); setFromTree(origin === 'tree');
    recordsMain.current?.scrollTo({ top: 0 });
  };
  const selectedTopic = doc?.phases.find((p) => p.id === filter);
  useEffect(() => {
    if (doc && filter !== 'all' && !selectedTopic) { setFilter('all'); setFromTree(false); }
  }, [doc, filter, selectedTopic]);
  const records = useMemo(() => {
    if (!doc) return [];
    const q = query.toLowerCase().trim();
    const candidates = filter === 'all' ? doc.stages : topicRecords(doc, filter);
    const filtered = candidates.filter((s) => (!q || [s.title, s.body, s.nextStep, s.scope, s.cannotInfer, s.stageId].join(' ').toLowerCase().includes(q)) && (statusFilter === 'all' || progressOf([s]) === statusFilter));
    const sorted = chronological(filtered);
    return descending ? sorted.reverse() : sorted;
  }, [doc, filter, query, statusFilter, descending]);
  const locate = (record) => {
    setFocusedId(record.id); setMobileFlow(false);
    requestAnimationFrame(() => {
      const row = document.getElementById(`record-${record.id}`);
      row?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      row?.querySelector('.record-body-button')?.focus({ preventScroll: true });
    });
  };
  const openRecord = (record, focusConnections = false) => { if (!record) return; setFocusedId(record.id); setEntryTrail([]); setViewing({ id: record.id, focusConnections }); };
  const addRecord = () => {
    let phaseId = selectedTopic?.id || doc.phases[0]?.id;
    if (!phaseId) { const phase = createPhase(doc.research.id, '初步探索'); phaseId = phase.id; update((p) => ({ ...p, phases: [...p.phases, phase] })); }
    setViewing(null); setEntryTrail([]); setEditing({ record: createStage(phaseId, ''), isNew: true });
  };
  const saveRecord = (record) => {
    record = { ...record, wikiLinks: pinWikiLinks(record, [...doc.stages.filter((r) => r.id !== record.id), record]) };
    update((p) => ({ ...p, stages: editing.isNew ? [...p.stages, record] : p.stages.map((s) => s.id === record.id ? record : s) }));
    if (filter !== 'all' && !descendantIds(doc.phases, filter).has(record.phaseId)) setFilter(record.phaseId);
    setQuery(''); setStatusFilter('all'); setEditing(null); setViewing(null); setEntryTrail([]); say(doc.knowledgeSettings?.autoAnalyze === false ? '记录已保存' : '记录已保存，正在尝试自动匹配');
    if (doc.knowledgeSettings?.autoAnalyze !== false) knowledge.analyze(projectId, record.id, true);
    requestAnimationFrame(() => locate(record));
  };
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(workspace.workspace, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `知序科研记录本_${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); say('已导出全部项目的备份');
  };
  const importBackup = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    try { if (file.size > 20 * 1024 * 1024) throw new Error('备份超过 20 MB，请拆分为单项目备份。'); workspace.importBackup(await file.text()); say('备份已合并，同编号记录保留较新版本'); }
    catch (err) { say(`导入失败：${err.message}`); }
  };
  const demo = () => { const existing = projects.find((p) => p.research.demo); if (existing) enter(existing.research.id); else { const example = createDemoProject(); workspace.addProject(example); enter(example.research.id); } };
  const toggleFlow = () => { if (window.matchMedia('(max-width: 1100px)').matches) setMobileFlow(true); else setFlowVisible(!flowVisible); };
  const headerTools = <><DesktopTools /><button className="icon-button theme-toggle" title={theme === 'light' ? '切换深色主题' : '切换浅色主题'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button><button className="button quiet backup-button" onClick={exportBackup} disabled={!workspace.workspace}><Download size={17} /><span>导出备份</span></button></>;

  return <>
    <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={importBackup} />
    {workspace.error && <div className="storage-error" role="alert"><span>{workspace.error}</span><button onClick={() => { try { workspace.restore(); say('已恢复上一份快照'); } catch (e) { say(e.message); } }}>恢复上次快照</button><button onClick={() => fileInput.current.click()}>导入备份</button>{workspace.workspace && <button onClick={exportBackup}>导出当前数据</button>}</div>}
    {!doc ? <div className="project-page"><header className="home-header"><Logo /><div className="header-tools"><button className="button quiet" onClick={() => fileInput.current.click()}><Upload size={17} /><span>导入备份</span></button>{headerTools}</div></header>
      <main className="project-home"><div className="project-section-title"><div><h1>科研项目 <span>{projects.length}</span></h1><p>选择一个项目，继续记录和整理你的研究。</p></div><button className="button primary" disabled={!workspace.workspace} onClick={() => setProjectDialog('new')}><Plus size={18} />新建项目</button></div>
        {!projects.length && <DesktopWelcome onImport={() => fileInput.current.click()} />}
        <div className="project-grid">{projects.map((project) => {
          const done = project.phases.filter((p) => progressOf(topicRecords(project, p.id), p.progress) === 'done').length;
          const latest = chronological(project.stages).at(-1);
          return <button className="project-card" key={project.research.id} onClick={() => enter(project.research.id)}><div className="project-card-top"><FlaskConical size={24} />{project.research.demo && <span className="demo-badge">演示项目</span>}<ArrowUpRight size={20} /></div><h2>{project.research.title}</h2><p>{project.research.description || '研究目标尚未填写。进入项目后可以补充。'}</p><div className="project-counts"><span><FileText size={16} />{project.stages.length} 篇记录</span><span><GitBranch size={16} />{project.phases.length} 个节点</span></div><footer><span>{latest ? `最近记录 ${displayDate(recordDate(latest))}` : '尚无记录'}</span><span>{done} / {project.phases.length} 节点完成</span></footer></button>;
        })}<button className="new-project-card" disabled={!workspace.workspace} onClick={() => setProjectDialog('new')}><Plus size={28} /><b>创建科研项目</b><span>独立管理一个研究主题的记录与进展</span></button></div>
        <div className="home-bottom"><BookOpen size={24} /><div><b>先体验一份科研记录本</b><p>查看演示项目里的时间记录、科研树和公式排版。</p></div><button className="button" disabled={!workspace.workspace} onClick={demo}>打开演示项目<ArrowRight size={16} /></button></div>
        <footer className="home-footer">{desktop ? '数据保存在本机数据文件夹，可导出全部项目备份。关闭窗口后留在后台，托盘右键可退出。' : '数据保存在当前浏览器，可导出全部项目备份。'}</footer>
      </main></div> : <div className="workspace-shell">
        <aside ref={sidebarRef} className={`sidebar ${mobileNav ? 'mobile-open' : ''}`} aria-label="项目与研究分类"><div className="sidebar-brand"><Logo /><button className="icon-button mobile-close" aria-label="关闭导航" onClick={() => setMobileNav(false)}><X size={20} /></button></div><button className="back-projects" onClick={goHome}><ArrowLeft size={16} />全部科研项目</button>
          <div className="current-project"><div className="project-switch-label"><label htmlFor="project-switch">当前项目</label><button title="编辑项目名称和目标" className="icon-button" onClick={() => setProjectDialog('edit')}><Pencil size={15} /></button></div><div className="project-select"><select id="project-switch" aria-label="切换科研项目" value={projectId} onChange={(e) => enter(e.target.value)} title={doc.research.title}>{projects.map((p) => <option key={p.research.id} value={p.research.id}>{p.research.title}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div>{doc.research.demo && <span className="demo-badge">演示项目</span>}</div>
          <div className="sidebar-section-label"><span>研究分类</span><button className="icon-button" title="添加分类节点" onClick={() => setTopicDialog({ parentId: selectedTopic?.id || null })}><Plus size={18} /></button></div><nav className="topic-navigation" aria-label="研究分类"><button className={`nav-topic all-records ${filter === 'all' ? 'active' : ''}`} aria-current={filter === 'all' ? 'true' : undefined} onClick={() => selectTopic('all')}><FileText size={19} /><span>全部记录</span><small>{doc.stages.length}</small></button><TopicNav key={projectId} doc={doc} selected={filter} onSelect={selectTopic} /></nav>
          <footer className="sidebar-footer"><button className="button quiet" onClick={() => setHelp(true)}><CircleHelp size={17} />使用说明</button><button className="icon-button" title="导入记录备份" onClick={() => fileInput.current.click()}><Upload size={17} /></button></footer>
        </aside>
        {mobileNav && <button tabIndex={-1} aria-label="收起导航遮罩" className="nav-backdrop" onClick={() => setMobileNav(false)} />}
        <div className="workspace-main" inert={mobileNav ? '' : undefined}><header className="workspace-header"><button className="icon-button mobile-menu" title="打开导航" onClick={() => setMobileNav(true)}><Menu size={21} /></button><nav className="breadcrumbs" aria-label="当前位置"><button onClick={goHome}>科研项目</button><ChevronRight size={14} /><span title={doc.research.title}>{doc.research.title}</span></nav><div className="header-tools"><span className={`saved-label ${workspace.error ? 'save-failed' : ''}`}><Check size={16} />{workspace.error ? '保存失败' : workspace.savedAt ? '已保存到本机' : '本机记录'}</span><button className="icon-button" title="撤销上次保存或操作" disabled={!workspace.canUndo} onClick={() => { workspace.undo(); say('已撤销上次操作'); }}><Undo2 size={18} /></button>{headerTools}</div></header>
        <div className="view-nav-row"><nav className="view-tabs" aria-label="项目视图">{Object.entries(VIEW_LABELS).map(([key, label]) => <button key={key} aria-current={view === key ? 'page' : undefined} className={view === key ? 'active' : ''} onClick={() => switchView(key)}>{label}</button>)}</nav>{view === 'records' && <button className="flow-toggle icon-button" title="显示或隐藏研究脉络" onClick={toggleFlow}><PanelRightOpen size={19} /></button>}</div>
        {view === 'records' ? <div className={`records-layout ${!flowVisible ? 'flow-hidden' : ''}`}><main className="records-main" ref={recordsMain}>
          {fromTree && <button className="back-to-tree" onClick={() => switchView('tree')}><ArrowLeft size={15} />返回科研树</button>}
          <div className="page-heading"><div className="heading-title"><h1>{selectedTopic?.title || '全部记录'}</h1><span className="record-count" role="status">{records.length} 篇记录</span>{selectedTopic && <button className="icon-button" title="编辑当前研究节点" onClick={() => setTopicDialog({ topic: selectedTopic })}><Pencil size={16} /></button>}</div><button className="button primary" onClick={addRecord}><Plus size={18} />新建记录</button></div>
          {selectedTopic?.summary && <p className="topic-summary">{selectedTopic.summary}</p>}
          {selectedTopic?.codePaths?.length > 0 && <div className="linked-code-note"><Code2 size={16} /><span>关联代码：{selectedTopic.codePaths.join('、')}</span><button onClick={() => setView('code')}>查看</button></div>}
          <div className="record-filters"><label className="search-field"><Search size={20} /><input aria-label="检索研究记录" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题、结论或正文" />{query && <button className="icon-button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={15} /></button>}</label><select aria-label="筛选记录进度" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">全部进度</option>{Object.entries(PROGRESS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select><button className="button sort-button" onClick={() => setDescending(!descending)}><ArrowDownUp size={16} />{descending ? '最新在前' : '最早在前'}</button></div>
          <div className="timeline">{records.map((record) => <RecordCard key={record.id} record={record} doc={doc} onOpen={openRecord} onFilter={selectTopic} focused={focusedId === record.id} onProgress={(progress) => patchRecord(record.id, (r) => ({ ...r, progress }))} onDelete={() => setDeletingId(record.id)} />)}{!records.length && <div className="records-empty"><BookOpen size={34} /><h2>{query || statusFilter !== 'all' ? '没有找到匹配的记录' : '这里还没有研究记录'}</h2><p>{query || statusFilter !== 'all' ? '换一个关键词，或清除筛选条件。' : `在${selectedTopic ? `“${selectedTopic.title}”` : '这个项目'}写下你的第一轮问题和观察。`}</p>{query || statusFilter !== 'all' ? <button className="button" onClick={() => { setQuery(''); setStatusFilter('all'); }}>清除筛选</button> : <button className="button primary" onClick={addRecord}><Plus size={17} />写第一篇记录</button>}</div>}</div>
        </main>{flowVisible && <FlowPanel records={records} focusedId={focusedId || chronological(records).at(-1)?.id} onLocate={locate} onClose={() => setFlowVisible(false)} />}</div> : view === 'tree' ? <TopicTree key={projectId} doc={doc} update={update} initialViewport={treeViewports.current[projectId]} onViewportChange={(viewport) => { treeViewports.current[projectId] = viewport; }} onOpen={(id) => selectTopic(id, 'tree')} onEdit={(topic) => setTopicDialog({ topic })} onAdd={(parentId) => setTopicDialog({ parentId })} /> : view === 'knowledge' ? <KnowledgeNetwork key={`${projectId}:${knowledgeFocus}`} doc={doc} update={update} initialRecordId={knowledgeFocus} onRecord={openRecord} onTopic={selectTopic} onModule={openModule} /> : <CodeStructure key={`${projectId}:${moduleFocus}`} doc={doc} update={update} onNode={selectTopic} initialModuleId={moduleFocus} />}
        </div>
      </div>}
    {projectDialog && <ProjectDialog project={projectDialog === 'edit' ? doc?.research : null} onClose={() => setProjectDialog(false)} onCreate={(title, description) => { if (projectDialog === 'edit') update((p) => ({ ...p, research: { ...p.research, title, description } })); else { const project = newProject(title, description); workspace.addProject(project); enter(project.research.id); } setProjectDialog(false); }} />}
    {topicDialog && doc && <TopicDialog doc={doc} {...topicDialog} onClose={() => setTopicDialog(null)} onSave={(patch) => { if (topicDialog.topic) update((p) => ({ ...p, phases: p.phases.map((phase) => phase.id === topicDialog.topic.id ? { ...phase, ...patch } : phase) })); else update((p) => ({ ...p, phases: [...p.phases, { ...createPhase(p.research.id, patch.title, { order: p.phases.length }), ...patch }] })); setTopicDialog(null); }} />}
    {viewedRecord && !editing && <RecordReader key={viewedRecord.id} record={viewedRecord} doc={doc} focusConnections={viewing.focusConnections} focusFragment={viewing.fragment} update={update} job={knowledge.job(projectId, viewedRecord.id)} onAnalyze={() => knowledge.analyze(projectId, viewedRecord.id)} onCancel={() => knowledge.cancel(projectId, viewedRecord.id)} onPatch={(fn) => patchRecord(viewedRecord.id, fn)} onClose={() => { setViewing(null); setEntryTrail([]); }} onEdit={() => setEditing({ record: viewedRecord, isNew: false })} onDelete={() => setDeletingId(viewedRecord.id)} onNavigate={(record, fragment) => { if (record && record.id !== viewedRecord.id) { setEntryTrail((trail) => [...trail, viewedRecord.id]); setViewing({ id: record.id, fragment }); } }} onBack={entryTrail.length ? () => { setViewing({ id: entryTrail.at(-1), focusConnections: true }); setEntryTrail((trail) => trail.slice(0, -1)); } : undefined} onTopic={(id) => { setViewing(null); selectTopic(id); }} onModule={openModule} onNetwork={() => { setKnowledgeFocus(viewedRecord.id); setViewing(null); setView('knowledge'); }} />}
    {editing && doc && <RecordEditor key={editing.record.id} {...editing} doc={doc} onNavigate={(record) => { setEditing(null); openRecord(record); }} onClose={() => { setEditing(null); setEntryTrail([]); }} onSave={saveRecord} onDelete={() => setDeletingId(editing.record.id)} />}
    {deletingId && doc && <Dialog title="删除科研记录" onClose={() => setDeletingId(null)}><div className="delete-record-body"><p>删除“{doc.stages.find((r) => r.id === deletingId)?.title}”？相关引用会断开，正文中的链接文字会保留。可通过顶部“撤销”恢复。</p><div className="dialog-actions"><button className="button" onClick={() => setDeletingId(null)}>保留记录</button><button className="button danger" onClick={removeRecord}>确认删除</button></div></div></Dialog>}
    {mobileFlow && doc && <Dialog title="研究脉络" onClose={() => setMobileFlow(false)}><FlowPanel records={records} focusedId={focusedId} onLocate={locate} /></Dialog>}
    {help && <Dialog title="使用科研记录本" onClose={() => setHelp(false)}><div className="help-content"><p><b>先选择项目</b><br />每个科研项目拥有独立的记录、分类和程序结构。侧栏顶部可切换项目。</p><p><b>顶部切换视图，左侧筛选分类</b><br />研究分类也是科研树上的节点。父节点包含子节点的记录，新建记录会默认归入当前分类。</p><p><b>时间与研究关系分开查看</b><br />右侧流程按时间串联，点击可定位记录。正文中使用 [[记录标题]] 或 [[记录编号|显示文字]] 建立链接，阅读页显示双向引用；知识网络展示节点、记录和代码模块的联系。</p><p><b>进展与结论分别记录</b><br />灰色：未进行；橙色：未完成；红色：需勘误；绿色：已完成。颜色支持正文识别与手动修改。做完实验不代表结论通过。</p><p><b>编辑后保存，定期备份</b><br />正文支持 Markdown、LaTeX 和 Mermaid。编辑后点击“保存记录”，未保存离开会提醒。数据保存在当前浏览器，可导出全部项目备份。</p></div></Dialog>}
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button aria-label="关闭提示" onClick={() => setToast('')}><X size={15} /></button></div>}
  </>;
}
