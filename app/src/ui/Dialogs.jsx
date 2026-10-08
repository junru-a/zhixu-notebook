import { useEffect, useRef, useState } from 'react';
import { X, ArrowLeft, ArrowUpRight, Trash2, Code2, Eye, Columns2, Link2, Heading2, Bold, Sigma, ChevronDown } from 'lucide-react';
import { STATUS, FLOW } from '../core/model.js';
import { PROGRESS, descendantIds } from '../core/workspace.js';
import Markdown from './Markdown.jsx';
import WikiEditor from './WikiEditor.jsx';

export function Dialog({ title, children, onClose, wide = false, closeOnBackdrop = true, closeDisabled = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''}`} aria-label={title} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (closeOnBackdrop && e.target === ref.current) onClose(); }}>
    <div className="dialog-inner"><header className="dialog-header"><h2>{title}</h2><button className="icon-button" aria-label="关闭对话框" disabled={closeDisabled} title={closeDisabled ? '分析正在进行，中止请使用“取消分析”' : '关闭'} onClick={onClose}><X size={19} /></button></header>{children}</div>
  </dialog>;
}

export function ProjectDialog({ onClose, onCreate, project }) {
  const [title, setTitle] = useState(project?.title || '');
  const [description, setDescription] = useState(project?.description || '');
  return <Dialog title={project ? '编辑科研项目' : '开启一个科研项目'} onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); if (title.trim()) onCreate(title.trim(), description.trim()); }}>
    <p className="dialog-subtitle">从一个值得探索的问题开始。研究节点和实验记录，可以慢慢补充。</p>
    <label className="field">项目名称<input autoFocus required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：神经算子的时间推进精度" /></label>
    <label className="field">研究目标 <span className="optional">选填</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这个项目想回答什么问题？" /></label>
    <footer className="dialog-actions"><button type="button" className="button" onClick={onClose}>取消</button><button className="button primary" type="submit">{project ? '保存修改' : '创建项目'}</button></footer>
  </form></Dialog>;
}

export function TopicDialog({ doc, topic, parentId, onSave, onClose }) {
  const [title, setTitle] = useState(topic?.title || '');
  const [parent, setParent] = useState(topic?.parentId || parentId || '');
  const [summary, setSummary] = useState(topic?.summary || '');
  const [progress, setProgress] = useState(topic?.progress || '');
  const [aliases, setAliases] = useState((topic?.aliases || []).join('，'));
  const forbidden = topic ? descendantIds(doc.phases, topic.id) : new Set();
  return <Dialog title={topic ? '编辑研究节点' : '添加研究节点'} onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave({ title: title.trim(), parentId: parent || null, summary, progress, aliases: aliases.split(/[,，\n]/).map(name => name.trim()).filter(Boolean).slice(0, 20) }); }}>
    <p className="dialog-subtitle">节点也是记录的分类。可以代表一个子命题、一批实验，或一个研究时期。</p>
    <label className="field">节点名称<input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：二阶匹配实验" /></label>
    <label className="field">节点别名<input value={aliases} onChange={e => setAliases(e.target.value)} placeholder="选填，用逗号分隔简称" /></label>
    <label className="field">父节点<select value={parent} onChange={(e) => setParent(e.target.value)}><option value="">主命题 · {doc.research.title}</option>{doc.phases.filter((p) => !forbidden.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
    <label className="field">研究进展<select value={progress} onChange={(e) => setProgress(e.target.value)}><option value="">根据关联记录汇总</option>{Object.entries(PROGRESS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
    <p className="field-hint">汇总规则：有失败或否定记录时提示问题；全部工作做完时显示完成。你可以手动调整节点进展。</p>
    <label className="field">进展摘要<textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="进展到哪里？卡在哪里？鼠标悬停时会显示这段内容。" /></label>
    <footer className="dialog-actions"><button type="button" className="button" onClick={onClose}>取消</button><button type="submit" className="button primary">保存节点</button></footer>
  </form></Dialog>;
}

const localDatetime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.valueOf()) ? '' : new Date(d.valueOf() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function RecordEditor({ record, doc, isNew, onSave, onClose, onDelete, onNavigate, onBack, focusConnections }) {
  const [draft, setDraft] = useState({ ...record, relatedIds: record.relatedIds || [] });
  const [mode, setMode] = useState('split');

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const textarea = useRef(null);
  const connections = useRef(null);
  useEffect(() => {
    if (focusConnections) requestAnimationFrame(() => { connections.current?.scrollIntoView({ block: 'center' }); connections.current?.focus({ preventScroll: true }); });
  }, [focusConnections]);
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...record, relatedIds: record.relatedIds || [] });
  const patch = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const close = () => { if (dirty) setConfirmDiscard(true); else onClose(); };
  useEffect(() => {
    const prevent = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  const insert = (value) => {
    const el = textarea.current;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? start;
    patch('body', draft.body.slice(0, start) + value + draft.body.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + value.length, start + value.length); });
  };
  return <Dialog wide title={isNew ? '写一篇科研记录' : '科研记录'} onClose={close}>
    <form className="record-form" onSubmit={(e) => { e.preventDefault(); if (draft.title.trim()) onSave({ ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() }); }}>
      <div className="editor-intro">{onBack && <button type="button" className="button quiet" disabled={dirty} onClick={onBack}><ArrowLeft size={16} />返回上一条记录</button>}<span className="muted">{dirty ? '有未保存的修改' : '编辑后点击保存'} · Markdown / LaTeX / Mermaid</span></div>
      <label className="sr-only" htmlFor="record-title">记录标题</label><input id="record-title" className="record-title-input" autoFocus required placeholder="这一轮，你发现了什么？" value={draft.title} onChange={(e) => patch('title', e.target.value)} />
      <div className="editor-metadata"><label className="field">所属研究节点<select value={draft.phaseId} onChange={(e) => patch('phaseId', e.target.value)}>{doc.phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label className="field">记录时间<input type="datetime-local" required value={localDatetime(draft.recordedAt || draft.createdAt)} onChange={(e) => { if (e.target.value) patch('recordedAt', new Date(e.target.value).toISOString()); }} /></label><label className="field">记录编号<input value={draft.stageId || ''} placeholder="选填，如 EXP-01" onChange={(e) => patch('stageId', e.target.value)} /></label></div>
      <div className="editor-toolbar"><div className="format-tools"><button type="button" title="插入标题" onClick={() => insert('\n## 观察与结论\n')}><Heading2 size={18} /></button><button type="button" title="插入加粗" onClick={() => insert('**重点内容**')}><Bold size={18} /></button><button type="button" title="插入 LaTeX 公式" onClick={() => insert('\n$$\nE = mc^2\n$$\n')}><Sigma size={18} /></button><button type="button" title="插入 Mermaid 流程图" onClick={() => insert('\n```mermaid\nflowchart TD\n  A[提出问题] --> B[实验验证]\n  B --> C[记录结论]\n```\n')}><Code2 size={18} /></button></div><div className="segmented">{[['edit', Code2, '编辑'], ['split', Columns2, '对照'], ['preview', Eye, '预览']].map(([key, Icon, label]) => <button type="button" key={key} aria-pressed={mode === key} className={mode === key ? 'active' : ''} onClick={() => setMode(key)}><Icon size={14} />{label}</button>)}</div></div>
      <div className={`writing-area ${mode}`}>
        {mode !== 'preview' && <WikiEditor value={draft.body} onChange={e => patch('body', e.target.value)} textareaRef={textarea} records={doc.stages} record={draft} phases={doc.phases} />}
        {mode !== 'edit' && <div className="writing-preview">{draft.body ? <Markdown text={draft.body} records={doc.stages} wikiLinks={draft.wikiLinks} recordId={draft.id} /> : <div className="preview-empty"><Eye size={25} /><p>你的思考，会在这里展开。</p><span>左侧书写，右侧实时排版</span></div>}</div>}
      </div>
      <div className="editor-bottom"><div className="editor-status"><label className="field">结论判定<select value={draft.status} onChange={(e) => patch('status', e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}{v.note ? ` · ${v.note}` : ''}</option>)}</select></label><label className="field">工作进度<select value={draft.worked ? 'yes' : 'no'} onChange={(e) => patch('worked', e.target.value === 'yes')}><option value="no">未做完</option><option value="yes">已做完</option></select></label><label className="field">实验流程<select value={draft.flow} onChange={(e) => patch('flow', e.target.value)}>{Object.entries(FLOW).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label></div>
        <label className="field">标记颜色<select value={draft.progress || ''} onChange={(e) => patch('progress', e.target.value)}><option value="">自动识别正文与工作进度</option>{Object.entries(PROGRESS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
        <p className="field-hint">在正文写 [[记录标题]] 或 [[记录编号|显示文字]] 可建立双向引用。高置信度 AI 关联在保存后自动建立，其他建议在阅读页确认。</p>
        <label className="field">下一步<input value={draft.nextStep || ''} onChange={(e) => patch('nextStep', e.target.value)} placeholder="留给下一次打开记录时的自己" /></label>
        <label className="field">记录别名<input aria-label="记录别名" defaultValue={(draft.aliases || []).join('，')} onChange={e => patch('aliases', e.target.value.split(/[,，\n]/).map(name => name.trim()).filter(Boolean).slice(0, 20))} placeholder="用逗号分隔；简称也可用于 [[双链]]" /></label>
        <details className="editor-details"><summary><ChevronDown size={16} />结论边界与关联记录 <Link2 size={14} /></summary><div className="two-fields"><label className="field">适用范围<textarea rows={2} value={draft.scope || ''} onChange={(e) => patch('scope', e.target.value)} /></label><label className="field">不能推出的结论<textarea rows={2} value={draft.cannotInfer || ''} onChange={(e) => patch('cannotInfer', e.target.value)} /></label><label className="field">准入条件<textarea rows={2} value={draft.gate || ''} onChange={(e) => patch('gate', e.target.value)} /></label><label className="field">结论日期<input type="date" value={draft.concluded || ''} onChange={(e) => patch('concluded', e.target.value)} /></label></div>
          <p className="field-hint">这篇记录接续或引用了哪些记录？可多选；关联不会改变时间顺序。</p><div className="related-picker">{doc.stages.filter((s) => s.id !== draft.id).map((s) => <label key={s.id}><input type="checkbox" checked={draft.relatedIds.includes(s.id)} onChange={(e) => patch('relatedIds', e.target.checked ? [...draft.relatedIds, s.id] : draft.relatedIds.filter((id) => id !== s.id))} />{s.stageId} {s.title}</label>)}{doc.stages.length === 0 && <span className="muted">第一篇记录还没有可关联的内容</span>}</div>
        </details>
      </div>
      {(draft.relatedIds.length > 0 || doc.stages.some((s) => s.relatedIds?.includes(draft.id))) && <section className="entry-connections" ref={connections} tabIndex={-1} aria-label="关联记录"><h4>关联记录</h4>{dirty && <p className="field-hint">保存当前修改后，即可跳转到其他记录。</p>}{doc.stages.filter((s) => draft.relatedIds.includes(s.id) || s.relatedIds?.includes(draft.id)).map((s) => <button key={s.id} type="button" disabled={dirty} onClick={() => onNavigate(s)}><Link2 size={15} /><span>{draft.relatedIds.includes(s.id) ? '引用' : '被引用'} · {s.title}</span><ArrowUpRight size={15} /></button>)}</section>}
      <footer className="editor-footer">{!isNew && <button type="button" className="button danger quiet" onClick={onDelete}><Trash2 size={15} />删除</button>}<span className="muted">工作做完与结论通过分别记录</span><button type="button" className="button" onClick={close}>返回</button><button type="submit" className="button primary">保存记录</button></footer>
      {confirmDiscard && <div className="inline-confirm" role="alert">有未保存的修改。<button type="button" className="button" onClick={() => setConfirmDiscard(false)}>继续编辑</button><button type="button" className="button danger" onClick={onClose}>放弃修改并返回</button></div>}
    </form>
  </Dialog>;
}
