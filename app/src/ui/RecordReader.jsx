import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Pencil, Trash2, Link2, Network, RefreshCw, X } from 'lucide-react';
import { Dialog } from './Dialogs.jsx';
import Markdown from './Markdown.jsx';
import { PROGRESS, recordDate } from '../core/workspace.js';
import { STATUS, createStage } from '../core/model.js';
import { referenceParts, referenceDestinations } from '../core/wikiLinks.js';
import { buildKnowledgeRequest, freshKnowledge, inferProgress, LINK_TYPES, recordLinks, setLinkDecision, targetName, unlinkedMentions, RELATIONS, knowledgeTargetsChanged } from '../core/recordKnowledge.js';
import { ProgressBadge } from './TopicTree.jsx';

export function ProgressControl({ record, onChange, compact = false }) {
  const progress = inferProgress(record);
  return <label className={`progress-control ${progress.value} ${compact ? 'compact' : ''}`} title={`${progress.source}：${progress.reason}`}>
    <span className="status-dot" /><span className="sr-only">记录颜色：{record.title}</span>
    <select aria-label={`记录颜色：${record.title}`} value={record.progress || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">自动 · {PROGRESS[progress.value].label}</option>
      {Object.entries(PROGRESS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
    </select>
  </label>;
}

export function KnowledgeSettings({ doc, update }) {
  return <label className="knowledge-setting"><input type="checkbox" checked={doc.knowledgeSettings?.autoAnalyze ?? true} onChange={(e) => update((p) => ({ ...p, knowledgeSettings: { autoAnalyze: e.target.checked } }))} /><span>保存后自动匹配<small>使用已配置的 DeepSeek；明确目标且双方引文匹配的高分关联自动建立；其他结果待确认。</small></span></label>;
}

export default function RecordReader({ record, doc, onClose, onEdit, onDelete, onPatch, onNavigate, onBack, onTopic, onModule, onNetwork, focusConnections, focusFragment = '', job, onAnalyze, onCancel, update }) {
  const [linkType, setLinkType] = useState('topic'), [target, setTarget] = useState('');
  const connections = useRef(null), documentRef = useRef(null);
  const [missing, setMissing] = useState(''), [message, setMessage] = useState(''), [relation, setRelation] = useState('related');
  const links = recordLinks(record, doc), progress = inferProgress(record), knowledge = knowledgeTargetsChanged(record, doc) ? null : freshKnowledge(record);
  const mentions = unlinkedMentions(doc, record);
  const unresolved = (record.wikiLinks || []).filter(link => !link.recordId || !doc.stages.some(r => r.id === link.recordId && (!link.fragment || referenceDestinations(r).some(item => item.fragment === link.fragment))));
  const orphaned = (record.moduleIds || []).filter(id => !doc.architecture?.analysis?.nodes.some(node => node.id === id));
  const inbound = doc.stages.filter((r) => r.id !== record.id && recordLinks(r, doc).some((link) => link.type === 'record' && link.targetId === record.id));
  const options = (linkType === 'topic' ? doc.phases : linkType === 'record' ? doc.stages : doc.architecture?.analysis?.nodes || []).filter((n) => n.id !== record.id && !links.some((l) => l.type === linkType && l.targetId === n.id));
  useEffect(() => { if (focusConnections) connections.current?.scrollIntoView({ block: 'center' }); }, [focusConnections]);
  const navigate = (link) => link.type === 'record' ? onNavigate(doc.stages.find((r) => r.id === link.targetId)) : link.type === 'topic' ? onTopic(link.targetId) : onModule(link.targetId);
  const scrollFragment = fragment => { if (!fragment) return; const selector = fragment.startsWith('^') ? `[data-block-id="${CSS.escape(fragment.slice(1))}"]` : `[data-heading="${CSS.escape(fragment)}"]`; const element = documentRef.current?.querySelector(selector); if (element) { element.scrollIntoView({ block: 'center' }); element.animate([{ backgroundColor: 'var(--accent-soft)' }, { backgroundColor: 'transparent' }], { duration: 1500 }); } else setMessage('引用的标题或段落已移除，可点击断链修复。'); };
  useEffect(() => { requestAnimationFrame(() => scrollFragment(focusFragment)); }, [record.id, focusFragment]);
  const openWiki = (target, fragment) => { if (target?.id === record.id) scrollFragment(fragment); else onNavigate(target, fragment); };
  const changeLink = (link, decision) => onPatch((r) => setLinkDecision(r, link, decision));
  return <Dialog wide title="阅读科研记录" onClose={onClose}>
    <div className="reader-toolbar">{onBack && <button className="button quiet" onClick={onBack}><ArrowLeft size={16} />返回上一条记录</button>}<span className="muted">已保存 · 阅读模式</span><div className="reader-actions"><button className="button quiet" onClick={onNetwork}><Network size={16} />知识网络</button><button className="button danger quiet" onClick={onDelete}><Trash2 size={16} />删除记录</button><button className="button primary" onClick={onEdit}><Pencil size={16} />编辑记录</button></div></div>
    <div className="reader-layout"><article ref={documentRef} className="reader-document">
      <div className="reader-meta"><button onClick={() => onTopic(record.phaseId)}>{doc.phases.find((p) => p.id === record.phaseId)?.title}</button><span>{record.stageId}</span><time>{new Date(recordDate(record)).toLocaleString('zh-CN')}</time></div>
      <h1>{record.title}</h1>
      <div className="reader-state"><ProgressControl record={record} onChange={(value) => onPatch((r) => ({ ...r, progress: value }))} /><small>{progress.source}</small></div>
      {message && <p className="notice" role="status">{message}</p>}<p className="field-hint progress-reason">{progress.reason}</p>
      {record.body ? <Markdown text={record.body} records={doc.stages} wikiLinks={record.wikiLinks} recordId={record.id} onRecord={openWiki} onMissing={setMissing} /> : <p className="reader-empty">还没有正文，点击“编辑记录”开始书写。</p>}
      <div className="reader-facts">{[['结论判定', record.status === 'not_started' ? '尚未填写（与进度颜色独立）' : STATUS[record.status]?.label], ['下一步', record.nextStep], ['适用范围', record.scope], ['不能推出的结论', record.cannotInfer], ['准入条件', record.gate], ['结论日期', record.concluded]].filter(([, value]) => value).map(([label, value]) => <section key={label}><h3>{label}</h3><p>{value}</p></section>)}</div>
      <section className="entry-connections reader-connections" ref={connections} aria-label="关联记录"><h3>记录之间的联系 <span>{links.filter((l) => l.type === 'record').length + inbound.length}</span></h3>
        {links.filter((l) => l.type === 'record').map((link) => <button key={link.targetId} onClick={() => navigate(link)}><Link2 size={15} /><span>引用 · {targetName(doc, link)}</span><ArrowUpRight size={15} /></button>)}
        {inbound.map(r => <button key={r.id} onClick={() => onNavigate(r)}><Link2 size={15} /><span>被引用 · {r.title}<small className="reader-link-context">{r.body?.slice(Math.max(0, r.body.indexOf(record.title) - 60), Math.max(0, r.body.indexOf(record.title)) + 180)}</small></span><ArrowUpRight size={15} /></button>)}
        {!inbound.length && !links.some((l) => l.type === 'record') && <p className="muted">在正文写入 [[记录标题]]，或在右侧添加关联。</p>}
        {!!mentions.length && <details><summary>未链接提及 · {mentions.length}</summary>{mentions.slice(0, 20).map(item => <div key={item.record.id}><button className="button quiet" onClick={() => onNavigate(item.record)}>{item.record.title}</button><p className="reader-link-context">{item.context}</p><button className="button" onClick={() => { update(p => ({ ...p, stages: p.stages.map(r => r.id === item.record.id ? { ...r, body: r.body + `\n\n关联记录：[[${record.id}|${record.title.replace(/[\]|\n]/g, ' ')}]]`, updatedAt: new Date().toISOString() } : r) })); setMessage('已在提及记录中添加正文引用。'); }}>添加引用</button></div>)}</details>}
      </section>
    </article><aside className="reader-knowledge" aria-label="知识关联">
      <div className="knowledge-heading"><h3>知识关联</h3><span>{links.length}</span></div>
      <p className="muted">让这次发现回到研究脉络中。</p>
      <div className="knowledge-links">{links.map((link) => <div className="knowledge-link" key={`${link.type}:${link.targetId}`}><div><small>{LINK_TYPES[link.type]} · {link.sources.join(' + ')} · {RELATIONS[link.relation] || '相关'}</small><button className="linked-title" onClick={() => navigate(link)}>{targetName(doc, link)}<ArrowUpRight size={13} /></button>{link.stale && <p className="field-hint">依据可能过期，人工关联仍保留。</p>}{link.source === 'AI 关联' && <button className="button quiet" onClick={() => changeLink(link, 'accepted')}>确认并保留</button>}{link.stale && knowledge?.links.some(item => item.type === link.type && item.targetId === link.targetId) && <button className="button quiet" onClick={() => changeLink(knowledge.links.find(item => item.type === link.type && item.targetId === link.targetId), 'accepted')}>采用新的依据</button>}{link.reason && <details><summary>关联依据</summary><p>{link.reason}</p><blockquote>{link.evidence}</blockquote>{link.targetEvidence && <blockquote>目标依据：{link.targetEvidence}</blockquote>}{link.confirmedAt && <small>{link.model} · 确认于 {new Date(link.confirmedAt).toLocaleString()}</small>}</details>}</div>{!['所属节点', '正文链接'].includes(link.source) && <button className="icon-button" title={link.sources.includes('正文链接') ? '移除手动/AI 来源；正文引用仍保留' : '移除此关联'} aria-label={`移除关联：${targetName(doc, link)}`} onClick={() => changeLink(link, 'dismissed')}><X size={14} /></button>}</div>)}</div>
      <details className="manual-link"><summary>手动添加关联</summary><label className="field">关联类型<select aria-label="关联类型" value={linkType} onChange={(e) => { setLinkType(e.target.value); setTarget(''); }}>{Object.entries(LINK_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="field">关联目标<select aria-label="关联目标" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">选择目标</option>{options.map((n) => <option key={n.id} value={n.id}>{n.title || n.label}</option>)}</select></label><label className="field">关系含义<select aria-label="关系含义" value={relation} onChange={e => setRelation(e.target.value)}>{Object.entries(RELATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="button" disabled={!target} onClick={() => { changeLink({ type: linkType, targetId: target, relation }, 'accepted'); setTarget(''); }}><Link2 size={15} />建立链接</button>{!options.length && <p className="field-hint">暂无可选目标。代码模块需要先在程序结构中生成并保留架构图。</p>}</details>
      {!!unresolved.length && <details open><summary>待修复的正文链接 · {unresolved.length}</summary>{unresolved.map(link => <button key={link.target} className="button quiet" onClick={() => setMissing(link.target)}>{link.target} · 选择或创建目标</button>)}</details>}{!!orphaned.length && <p className="notice">{orphaned.length} 个原代码模块已不在当前图谱，旧关联保留；请手动选择新的对应模块。</p>}<section className="ai-links"><h3>AI 辅助关联</h3><KnowledgeSettings doc={doc} update={update} /><p className="field-hint">发送本篇内容及本项目候选摘要到 DeepSeek；不发送源码。自动关联可移除，科学结论由你填写。</p><details className="payload-preview"><summary>查看本次发送范围</summary><pre>{JSON.stringify(buildKnowledgeRequest(record, doc), null, 2)}</pre><p className="field-hint">正文最多 4 万字；候选按文字相关度选取，最多 80 个节点、60 篇记录、40 个模块。未覆盖的内容可手动关联。</p></details>
        <div className="ai-controls"><button className="button" disabled={job.busy} onClick={onAnalyze}><RefreshCw size={15} />{job.busy ? '正在匹配…' : '重新匹配'}</button>{job.busy && <button className="button quiet" onClick={onCancel}>取消</button>}</div>
        {(job.error || job.message) && <p className={job.error ? 'notice error' : 'field-hint'} role="status">{job.error || job.message}</p>}
        {record.knowledge && !knowledge && <p className="notice">记录或目标内容已变化，上次 AI 关联需要复核。已确认关联与证据快照仍保留。</p>}
        {knowledge && <><p className="ai-summary">{knowledge.summary}</p>{knowledge.progress?.decision === 'suggested' && <div className="knowledge-suggestion"><small>待确认的状态</small><ProgressBadge value={knowledge.progress.value} /><p>{knowledge.progress.reason}</p><button className="button" onClick={() => onPatch((r) => ({ ...r, progress: knowledge.progress.value, knowledge: { ...r.knowledge, progress: { ...knowledge.progress, decision: 'accepted' } } }))}>采用状态</button><button className="button quiet" onClick={() => onPatch((r) => ({ ...r, knowledge: { ...r.knowledge, progress: { ...knowledge.progress, decision: 'dismissed' } } }))}>忽略</button></div>}
          {knowledge.links.filter((link) => link.decision === 'suggested').map((link) => <div className="knowledge-suggestion" key={`${link.type}:${link.targetId}`}><small>待确认 · {Math.round(link.confidence * 100)}% 模型评分</small><b>{targetName(doc, link)}</b><p>{link.reason}</p><blockquote>{link.evidence}</blockquote>{link.targetEvidence && <blockquote>目标依据：{link.targetEvidence}</blockquote>}<button className="button" onClick={() => changeLink(link, 'accepted')}>建立关联</button><button className="button quiet" onClick={() => changeLink(link, 'dismissed')}>忽略</button></div>)}
          {!!knowledge.links.filter((link) => link.decision === 'dismissed').length && <details><summary>已忽略的建议</summary>{knowledge.links.filter((link) => link.decision === 'dismissed').map((link) => <div className="knowledge-suggestion" key={`${link.type}:${link.targetId}`}><b>{targetName(doc, link)}</b><p>{link.reason}</p><button className="button" onClick={() => changeLink(link, 'accepted')}>恢复关联</button></div>)}</details>}
          {!knowledge.links.length && <p className="field-hint">没有找到有依据的关联，可手动添加。</p>}
        </>}
      </section>
    </aside></div><footer className="reader-footer"><span className="muted">正文链接、反向引用和研究树同步显示</span><button className="button" onClick={onClose}>返回</button></footer>
    {missing && <RepairLinkDialog target={missing} doc={doc} onClose={() => setMissing('')} onSelect={(id, fragment) => { onPatch(r => ({ ...r, wikiLinks: [...(r.wikiLinks || []).filter(link => link.target !== missing), { target: missing, recordId: id, fragment }] })); setMissing(''); }} onCreate={title => { const created = createStage(record.phaseId, title); update(p => ({ ...p, stages: [...p.stages.map(r => r.id === record.id ? { ...r, wikiLinks: [...(r.wikiLinks || []).filter(link => link.target !== missing), { target: missing, recordId: created.id, fragment: '' }] } : r), created] })); setMissing(''); onNavigate(created); }} />}
  </Dialog>;
}

function RepairLinkDialog({ target, doc, onClose, onSelect, onCreate }) {
  const parts = referenceParts(target);
  const [selected, setSelected] = useState(''), [fragment, setFragment] = useState(parts.fragment), [title, setTitle] = useState(parts.target);
  const record = doc.stages.find(r => r.id === selected), destinations = record ? referenceDestinations(record) : [];
  return <Dialog title="修复正文链接" onClose={onClose}><p className="dialog-subtitle">{target}：请选择明确的目标，或创建一篇新记录。</p><label className="field">现有记录<select aria-label="修复链接目标" value={selected} onChange={e => { setSelected(e.target.value); setFragment(''); }}><option value="">选择记录（同名记录请根据分类区分）</option>{doc.stages.map(r => <option key={r.id} value={r.id}>{doc.phases.find(p => p.id === r.phaseId)?.title} / {r.title} · {r.stageId || new Date(r.createdAt).toLocaleDateString()}</option>)}</select></label><label className="field">定位位置<select aria-label="修复链接位置" value={destinations.some(item => item.fragment === fragment) ? fragment : ''} onChange={e => setFragment(e.target.value)}><option value="">整篇记录</option>{destinations.map(item => <option key={item.fragment} value={item.fragment}>{item.kind} · {item.label}</option>)}</select></label><button className="button primary" disabled={!selected} onClick={() => onSelect(selected, fragment)}>绑定目标</button><hr/><label className="field">新记录标题<input aria-label="断链新记录标题" value={title} onChange={e => setTitle(e.target.value)} /></label><button className="button" disabled={!title.trim()} onClick={() => onCreate(title.trim())}>创建并链接</button></Dialog>;
}
