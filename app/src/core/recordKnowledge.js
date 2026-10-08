import { extractWikiTargets } from './markdown.js';
import { redactSecrets } from './architectureAI.js';
import { resolveWiki, referenceParts } from './wikiLinks.js';
export { resolveWiki } from './wikiLinks.js';
export const RELATIONS = { related: '相关', references: '引用', continues: '接续', reproduces: '复现', implements: '实现', uses_data: '使用数据', supports: '支持', contradicts: '反驳' };
export const targetKey = (target, doc) => signature([target.id, target.title || target.label, target.aliases, recordText(target), target.summary, target.kind, target.phaseId, target.status, target.worked, target.files, target.files && doc ? [doc.architecture?.revision, target.files.map(path => [path, doc.architecture?.files?.find(file => file.path === path)?.hash || ''])] : null]);
export const knowledgeContextKey = request => signature([request.topics, request.records, request.modules]);

export const PROGRESS_KEYS = ['todo', 'active', 'blocked', 'done'];
export const LINK_TYPES = { topic: '研究节点', record: '科研记录', module: '代码模块' };
const fields = { topic: 'topicIds', record: 'relatedIds', module: 'moduleIds' };
export const recordText = (record) => [record.title, record.stageId, record.body, record.nextStep, record.scope, record.cannotInfer].filter(Boolean).join('\n');
// Content signature for stale UI responses, not a security hash.
export function recordKey(record) {
  return signature([recordText(record), record.phaseId, record.status, record.worked]);
}
function signature(value) {
  const text = JSON.stringify(value);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${a >>> 0}-${b >>> 0}`;
}
export const freshKnowledge = (record) => record.knowledge?.contentKey === recordKey(record) ? record.knowledge : null;

export function inferProgress(record) {
  if (PROGRESS_KEYS.includes(record.progress)) return { value: record.progress, source: '手动标记', reason: '以你的选择为准；切换“自动识别”可重新按内容判断。' };
  if (['failed', 'unverified', 'stopped'].includes(record.status)) return { value: 'blocked', source: '结论判定', reason: '当前结论有失败、否定或停止标记，需要复核。' };
  if (record.worked) return { value: 'done', source: '工作进度', reason: '你已将本轮工作标记为做完。' };
  const ai = freshKnowledge(record)?.progress;
  if (ai?.decision === 'accepted') return { ...ai, source: 'AI 识别' };
  const text = `${record.title || ''}\n${record.body || ''}`.replace(/```[\s\S]*?```|`[^`]*`/g, '').replace(/^>.*$/gm, '').replace(/\*\*|__/g, '');
  const clauses = text.split(/[\n。；;：:！？!?]/).map((s) => s.trim()).filter(Boolean);
  // A named current stage takes precedence over plans for a different stage.
  const own = record.stageId ? clauses.filter((s) => s.includes(record.stageId)) : [];
  const current = own.length ? own : clauses.filter((s) => !/^(下一步|下一轮|后续|计划|拟|如果|待完成后|上一轮|上一阶段|引用|参考)/.test(s));
  const candidates = current.join('\n').replace(/(无需|不需|不必)(要)?(勘误|修正|纠正|更正|复核)|没有(发现)?(错误|问题)|未发现(错误|问题)/g, '').replace(/(并非|不能|无法|不确定|尚不能)(说|确认|判断|证明|认定|是否)?(已完成|已通过|验证通过)/g, '');
  if (/需(要)?(勘误|修正|纠正|更正)|存在(严重)?(错误|问题)|计算错误|结果有误|未通过|验证失败/.test(candidates)) return { value: 'blocked', source: '文字识别', reason: '正文含需更正或未通过的明确表述。' };
  if (/(尚未|暂未|还未|仍未|未)(完成|收尾)|待收尾|进行中|结果待补充/.test(candidates)) return { value: 'active', source: '文字识别', reason: '正文说明工作正在进行或尚未收尾。' };
  if (/(尚未|还未|未)(开始|进行|开展)|还没有开始/.test(candidates)) return { value: 'todo', source: '文字识别', reason: '正文说明这项工作尚未开始。' };
  if (/已完成|已经完成|可以结项|已结项|已通过|验证通过|完成了/.test(candidates)) return { value: 'done', source: '文字识别', reason: '正文含已完成、已通过或可以结项的明确表述。' };
  return { value: record.status && record.status !== 'not_started' ? 'active' : 'todo', source: '工作进度', reason: '没有足够明确的文字依据，沿用工作进度。可手动标记或交给 AI 分析。' };
}

export function pinWikiLinks(record, records) {
  return extractWikiTargets(record.body).map(target => ({ target, recordId: resolveWiki(target, records, record.wikiLinks, record.id) || record.wikiLinks?.find(link => link.target === target)?.recordId || '', fragment: record.wikiLinks?.find(link => link.target === target)?.fragment ?? referenceParts(target).fragment }));
}
export function refreshWikiBindings(doc, previous) {
  const names = stages => JSON.stringify(stages.map(r => [r.id, r.title, r.stageId, r.aliases]));
  const changedTargets = !previous || names(doc.stages) !== names(previous.stages);
  let changed = false;
  const stages = doc.stages.map(record => {
    const old = previous?.stages.find(r => r.id === record.id);
    if (!changedTargets && old?.body === record.body && old?.wikiLinks === record.wikiLinks) return record;
    const wikiLinks = pinWikiLinks(record, doc.stages);
    if (JSON.stringify(wikiLinks) === JSON.stringify(record.wikiLinks)) return record;
    changed = true; return { ...record, wikiLinks };
  });
  return changed ? { ...doc, stages } : doc;
}
export function unlinkedMentions(doc, record) {
  const names = [record.title, ...(record.aliases || [])].filter(name => name.length >= 2);
  return doc.stages.filter(r => r.id !== record.id && !recordLinks(r, doc).some(link => link.type === 'record' && link.targetId === record.id))
    .flatMap(r => { const text = recordText(r).replace(/```[\s\S]*?```|`[^`]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, ''); const name = names.find(n => text.includes(n));
      if (!name) return []; const index = text.indexOf(name); return [{ record: r, context: text.slice(Math.max(0, index - 60), index + name.length + 100) }]; });
}
export function recordLinks(record, doc) {
  const links = [], seen = new Map();
  const add = (type, targetId, source, extra = {}) => {
    const targets = type === 'record' ? doc.stages : type === 'topic' ? doc.phases : doc.architecture?.analysis?.nodes || [];
    const target = targets.find(n => n.id === targetId);
    if (!target || (type === 'record' && targetId === record.id)) return;
    const key = `${type}:${targetId}`, existing = seen.get(key);
    if (existing) { if (!existing.sources.includes(source)) existing.sources.push(source); return; }
    const link = { ...extra, type, targetId, source, sources: [source] };
    if (link.targetKey && targetKey(target, doc) !== link.targetKey) link.stale = true;
    if (link.origin === 'ai' && link.contentKey && link.contentKey !== recordKey(record)) link.stale = true;
    seen.set(key, link); links.push(link);
  };
  add('topic', record.phaseId, '所属节点');
  for (const [type, field] of Object.entries(fields)) for (const id of record[field] || []) {
    const detail = record.linkDetails?.find(item => item.type === type && item.targetId === id);
    const evidence = detail || freshKnowledge(record)?.links.find(link => link.type === type && link.targetId === id);
    add(type, id, detail?.origin === 'ai' ? 'AI 建议 · 已确认' : '手动关联', evidence || {});
  }
  for (const link of pinWikiLinks(record, doc.stages)) add('record', link.recordId, '正文链接', { fragment: link.fragment });
  for (const link of freshKnowledge(record)?.links || []) if (link.decision === 'accepted') {
    const target = (link.type === 'topic' ? doc.phases : link.type === 'record' ? doc.stages : doc.architecture?.analysis?.nodes || []).find(n => n.id === link.targetId);
    if (!link.targetKey || (target && link.targetKey === targetKey(target))) add(link.type, link.targetId, 'AI 关联', link);
  }
  return links;
}
export function knowledgeTargetsChanged(record, doc) {
  return (record.knowledge?.links || []).some(link => {
    const target = (link.type === 'topic' ? doc.phases : link.type === 'record' ? doc.stages : doc.architecture?.analysis?.nodes || []).find(item => item.id === link.targetId);
    return !target || (link.targetKey && link.targetKey !== targetKey(target));
  });
}
export const targetName = (doc, link) => (link.type === 'topic' ? doc.phases : link.type === 'record' ? doc.stages : doc.architecture?.analysis?.nodes || []).find((n) => n.id === link.targetId)?.title || (link.type === 'module' && doc.architecture?.analysis?.nodes.find((n) => n.id === link.targetId)?.label) || '目标已移除';

export function setLinkDecision(record, link, decision) {
  const key = `${link.type}:${link.targetId}`;
  const matched = record.knowledge?.links.find(item => `${item.type}:${item.targetId}` === key);
  const prior = record.linkDetails?.find(item => `${item.type}:${item.targetId}` === key);
  const knowledge = record.knowledge ? { ...record.knowledge, links: record.knowledge.links.map(item => `${item.type}:${item.targetId}` === key ? { ...item, decision } : item) } : undefined;
  const field = fields[link.type];
  const currentEvidence = matched && record.knowledge.contentKey === recordKey(record) && (!link.evidence || link.evidence === matched.evidence);
  const details = (record.linkDetails || []).filter(item => `${item.type}:${item.targetId}` !== key);
  if (decision === 'accepted') details.push({ ...(currentEvidence ? matched : prior || matched || {}), ...link, type: link.type, targetId: link.targetId, origin: prior?.origin || (matched ? 'ai' : 'manual'), decision, confirmedAt: new Date().toISOString(), model: record.knowledge?.model || prior?.model || '', contentKey: currentEvidence ? record.knowledge.contentKey : prior?.contentKey || matched?.contentKey || (matched ? record.knowledge?.contentKey : '') || recordKey(record), relation: link.relation || prior?.relation || matched?.relation || 'related' });
  return { ...record, knowledge, linkDetails: details, [field]: decision === 'accepted' ? [...new Set([...(record[field] || []), link.targetId])] : (record[field] || []).filter(id => id !== link.targetId), dismissedLinks: decision === 'dismissed' ? [...new Set([...(record.dismissedLinks || []), key])] : (record.dismissedLinks || []).filter(id => id !== key) };
}
export function deleteRecord(doc, id) {
  return { ...doc, stages: doc.stages.filter((r) => r.id !== id).map((r) => ({ ...r, relatedIds: (r.relatedIds || []).filter((value) => value !== id), linkDetails: r.linkDetails?.filter(link => !(link.type === 'record' && link.targetId === id)), knowledge: r.knowledge ? { ...r.knowledge, links: r.knowledge.links.filter((link) => !(link.type === 'record' && link.targetId === id)) } : undefined })) };
}

const short = (text, length) => redactSecrets(String(text || '')).slice(0, length);
export function buildKnowledgeRequest(record, doc) {
  const text = recordText(record).toLowerCase();
  const terms = [...new Set([...(text.match(/[a-z0-9_-]{2,}/g) || []), ...(text.match(/[\u4e00-\u9fa5]{2,}/g) || []).flatMap(word => Array.from({ length: Math.max(0, word.length - 1) }, (_, i) => word.slice(i, i + 2)))])];
  const rank = (text) => terms.reduce((score, term) => score + (text.toLowerCase().includes(term) ? 1 : 0), 0);
  const candidates = (items, limit) => items.map(item => ({ item, score: 3 * rank(item.title || item.label || '') + 2 * rank((item.aliases || []).join(' ')) + rank([item.summary, item.scope, item.nextStep, item.body].filter(Boolean).join(' ')) })).sort((a, b) => b.score - a.score).slice(0, limit).map(entry => entry.item);
  return {
    record: { id: record.id, title: short(record.title, 300), text: short(recordText(record), 40000), phaseId: record.phaseId },
    topics: candidates(doc.phases, 80).map((n) => ({ id: n.id, title: short(n.title, 200), aliases: (n.aliases || []).slice(0, 20).map(name => short(name, 200)), key: targetKey(n, doc), summary: short(n.summary, 500) })),
    records: candidates(doc.stages.filter((r) => r.id !== record.id), 60).map((r) => ({ id: r.id, title: short(r.title, 200), aliases: [r.stageId, ...(r.aliases || [])].filter(Boolean).slice(0, 20).map(name => short(name, 200)), key: targetKey(r, doc), summary: short([r.leadSentence, r.scope, r.nextStep, (r.body || '').slice(0, 400), (r.body || '').slice(-200)].filter(Boolean).join('\n'), 800) })),
    modules: candidates(doc.architecture?.analysis?.nodes || [], 40).map((n) => ({ id: n.id, title: short(n.label, 200), aliases: (n.files || []).slice(0, 20).map(name => short(name, 600)), key: targetKey(n), summary: short(n.summary, 700) })),
  };
}
const string = (value, max) => typeof value === 'string' && value.length <= max;
export function validateKnowledgeRequest(value) {
  if (!value || !string(value.record?.id, 200) || !value.record.id || !string(value.record.title, 300) || !string(value.record.text, 40000) || !string(value.record.phaseId, 200)) throw new Error('记录内容格式有误或过长');
  for (const [field, max, size] of [['topics', 80, 500], ['records', 60, 800], ['modules', 40, 700]]) {
    if (!Array.isArray(value[field]) || value[field].length > max || value[field].some((n) => !n || !string(n.id, 200) || !n.id || !string(n.title, 200) || !string(n.summary, size)) || new Set(value[field].map((n) => n.id)).size !== value[field].length) throw new Error('关联候选格式有误');
  }
  for (const field of ['topics', 'records', 'modules']) for (const item of value[field]) {
    if (item.key != null && !string(item.key, 100)) throw new Error('候选版本格式有误');
    if (item.aliases != null && (!Array.isArray(item.aliases) || item.aliases.length > 20 || item.aliases.some(alias => !string(alias, 600)))) throw new Error('候选别名格式有误');
  }
  return value;
}
export function validateKnowledgeResult(value, request) {
  if (!value || !string(value.summary, 2000) || !Array.isArray(value.links) || value.links.length > 30) throw new Error('AI 关联结果格式有误');
  const confidence = (item) => typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1 && string(item.reason, 800) && item.reason.trim() && string(item.evidence, 1000);
  const evidence = (item) => item.confidence >= 0.9 && item.evidence.trim().length >= 4 && request.record.text.includes(item.evidence.trim());
  const seen = new Set();
  const links = value.links.map((link) => {
    const options = link?.type === 'topic' ? request.topics : link?.type === 'record' ? request.records : link?.type === 'module' ? request.modules : [];
    const key = `${link?.type}:${link?.targetId}`;
    if (!confidence(link || {}) || !options.some((n) => n.id === link.targetId) || (link.type === 'record' && link.targetId === request.record.id) || seen.has(key)) throw new Error('AI 返回了无效、重复或跨项目的关联');
    seen.add(key);
    const target = options.find(n => n.id === link.targetId);
    const names = [target.id, target.title, ...(target.aliases || [])].filter(name => name.length >= 2 && !name.includes('遮盖'));
    const explicit = names.some(name => link.evidence.includes(name) && options.filter(n => [n.id, n.title, ...(n.aliases || [])].includes(name)).length === 1);
    const targetEvidence = typeof link.targetEvidence === 'string' && link.targetEvidence.length <= 1000 ? link.targetEvidence : '';
    const targetVerified = targetEvidence.trim().length >= 2 && [target.title, target.summary, ...(target.aliases || [])].join('\n').includes(targetEvidence.trim());
    const relation = RELATIONS[link.relation] ? link.relation : 'related';
    const safe = !/无关|不相关|不引用|不能证明|未采用|不属于|尚未使用/.test(link.evidence) && !['supports', 'contradicts'].includes(relation);
    return { type: link.type, targetId: link.targetId, confidence: link.confidence, reason: link.reason, evidence: link.evidence, targetEvidence, targetKey: target.key || '', relation, decision: evidence(link) && explicit && targetVerified && safe ? 'accepted' : 'suggested' };
  });
  let progress = null;
  if (value.progress != null) {
    if (!PROGRESS_KEYS.includes(value.progress.value) || !confidence(value.progress)) throw new Error('AI 状态格式有误');
    const lexical = inferProgress({ body: value.progress.evidence, status: 'not_started', worked: false });
    progress = { value: value.progress.value, reason: value.progress.reason, evidence: value.progress.evidence, confidence: value.progress.confidence, decision: evidence(value.progress) && lexical.source === '文字识别' && lexical.value === value.progress.value ? 'accepted' : 'suggested' };
  }
  return { summary: value.summary, links, progress, contextKey: knowledgeContextKey(request) };
}
export function applyKnowledge(doc, recordId, key, result) {
  const record = doc.stages.find((r) => r.id === recordId);
  if (!record || recordKey(record) !== key || (result.contextKey && result.contextKey !== knowledgeContextKey(buildKnowledgeRequest(record, doc)))) return doc;
  const allowed = { topic: new Set(doc.phases.map((n) => n.id)), record: new Set(doc.stages.map((n) => n.id)), module: new Set((doc.architecture?.analysis?.nodes || []).map((n) => n.id)) };
  const links = result.links.filter((link) => allowed[link.type]?.has(link.targetId)).map((link) => ({ ...link, contentKey: key, decision: record.dismissedLinks?.includes(`${link.type}:${link.targetId}`) ? 'dismissed' : link.decision }));
  return { ...doc, stages: doc.stages.map((r) => r.id === recordId ? { ...r, updatedAt: new Date().toISOString(), knowledge: { ...result, links, contentKey: key, generatedAt: new Date().toISOString() } } : r) };
}
