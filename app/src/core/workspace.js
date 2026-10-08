import { createDocument, createStage, createPhase, makeId, STATUS_KEYS, FLOW_KEYS } from './model.js';
import { validateAnalysisResult } from './architectureAI.js';
import { inferProgress, recordLinks, PROGRESS_KEYS, refreshWikiBindings, RELATIONS } from './recordKnowledge.js';

export const WORKSPACE_KEY = 'zhixu-oss:workspace:v2';
export const LEGACY_KEY = 'zhixu-oss:doc:v1';
export const PROGRESS = {
  todo: { label: '未进行', color: '#8b929c' },
  active: { label: '未完成', color: '#ce832e' },
  blocked: { label: '需勘误', color: '#d45e58' },
  done: { label: '已完成', color: '#28846b' },
};

export function newProject(title, description = '') {
  const doc = createDocument(title);
  doc.research.description = description;
  doc.phases[0].title = '初步探索';
  return doc;
}

// Phases are research topics, stages are dated records. Keep the v1 identifiers
// so existing records retain their topic and can still be exported independently.
export function normalizeProject(input) {
  if (typeof input?.research?.id !== 'string' || !input.research.id || typeof input.research.title !== 'string' || !Array.isArray(input.phases) || !Array.isArray(input.stages)) throw new Error('项目缺少标题、研究节点或记录列表');
  if (input.schemaVersion > 1) throw new Error('项目来自更新版本，请先更新应用');
  if (input.research.description != null && typeof input.research.description !== 'string') throw new Error('项目说明必须是文字');
  if (input.treeLayout != null) {
    const layout = input.treeLayout;
    if (!layout || typeof layout !== 'object' || (layout.snap != null && typeof layout.snap !== 'boolean') || (layout.positions != null && (typeof layout.positions !== 'object' || Array.isArray(layout.positions) || Object.values(layout.positions).some((p) => !p || !Number.isFinite(p.left) || !Number.isFinite(p.top) || Math.abs(p.left) > 1e9 || Math.abs(p.top) > 1e9)))) throw new Error('科研树布局坐标格式有误');
  }
  if (input.architecture && (!Array.isArray(input.architecture.files) || input.architecture.files.some((file) => typeof file.path !== 'string' || !Array.isArray(file.symbols) || !Array.isArray(file.imports) || [...file.symbols, ...file.imports].some((name) => typeof name !== 'string')))) throw new Error('程序结构数据格式有误');
  if (input.architecture?.sources) {
    const { sources, files, revision } = input.architecture;
    if (!Array.isArray(sources) || sources.some((s) => !s || typeof s.id !== 'string' || typeof s.label !== 'string' || typeof s.root !== 'string') || new Set(sources.map((s) => s.id)).size !== sources.length || new Set(files.map((f) => f.path)).size !== files.length || files.some((f) => !sources.some((s) => s.id === f.sourceId) || typeof f.originalPath !== 'string') || !Number.isInteger(revision) || revision < 0) throw new Error('多目录索引格式有误');
  }
  const analysisDraft = input.architecture?.analysisDraft;
  if (analysisDraft && (!Array.isArray(analysisDraft.selectedPaths) || analysisDraft.selectedPaths.length > 2400 || analysisDraft.selectedPaths.some((p) => typeof p !== 'string' || p.length > 600) || typeof analysisDraft.sendCode !== 'boolean' || typeof analysisDraft.sendRecords !== 'boolean' || typeof analysisDraft.intent !== 'string' || analysisDraft.intent.length > 2000)) throw new Error('分析选项格式有误');
  for (const graph of [input.architecture?.analysis, input.architecture?.pendingAnalysis].filter(Boolean)) {
    if (!Array.isArray(graph.fileSnapshot) || graph.fileSnapshot.length > 300 || graph.fileSnapshot.some((f) => !f || typeof f.path !== 'string') || !Array.isArray(graph.topicSnapshot) || graph.topicSnapshot.some((t) => typeof t?.id !== 'string') || !Number.isInteger(graph.revision)) throw new Error('架构图快照格式有误');
    validateAnalysisResult(graph, { files: graph.fileSnapshot, topics: graph.topicSnapshot });
  }
  const ids = new Set();
  const validAliases = value => value == null || (Array.isArray(value) && value.length <= 20 && value.every(name => typeof name === 'string' && name.length <= 200));
  const phases = input.phases.map((p) => {
    if (typeof p?.id !== 'string' || !p.id || ids.has(p.id) || typeof p.title !== 'string') throw new Error('研究节点缺少标题或编号重复');
    if (p.summary != null && typeof p.summary !== 'string') throw new Error('节点摘要必须是文字');
    if (!validAliases(p.aliases)) throw new Error('节点别名格式有误');
    if (p.codePaths && (!Array.isArray(p.codePaths) || p.codePaths.some((path) => typeof path !== 'string'))) throw new Error('节点关联路径格式有误');
    ids.add(p.id);
    if (p.progress && !PROGRESS[p.progress]) throw new Error('研究节点状态无法识别');
    return { ...p, researchId: input.research.id, parentId: p.parentId || null };
  });
  for (const phase of phases) {
    const seen = new Set([phase.id]);
    let parent = phase.parentId;
    while (parent) {
      if (!ids.has(parent) || seen.has(parent)) throw new Error('研究树存在循环或无效父节点');
      seen.add(parent);
      parent = phases.find((p) => p.id === parent).parentId;
    }
  }
  const stageIds = new Set();
  if (input.knowledgeSettings && typeof input.knowledgeSettings.autoAnalyze !== 'boolean') throw new Error('自动关联设置格式有误');
  const stages = input.stages.map((s) => {
    if (typeof s?.id !== 'string' || !s.id || stageIds.has(s.id) || !ids.has(s.phaseId) || typeof s.title !== 'string') throw new Error('记录编号重复或所属节点不存在');
    if (!STATUS_KEYS.includes(s.status) || !FLOW_KEYS.includes(s.flow) || typeof s.worked !== 'boolean') throw new Error('记录状态不符合格式');
    for (const field of ['body', 'nextStep', 'scope', 'cannotInfer', 'gate', 'concluded', 'stageId', 'leadSentence']) if (s[field] != null && typeof s[field] !== 'string') throw new Error(`记录的 ${field} 必须是文字`);
    for (const field of ['createdAt', 'updatedAt', 'recordedAt']) if (s[field] && (typeof s[field] !== 'string' || Number.isNaN(new Date(s[field]).valueOf()))) throw new Error('记录日期无法识别');
    stageIds.add(s.id);
    if (!validAliases(s.aliases)) throw new Error('记录别名格式有误');
    if (s.linkDetails != null && (!Array.isArray(s.linkDetails) || s.linkDetails.length > 1000 || s.linkDetails.some(link => !['topic', 'record', 'module'].includes(link?.type) || typeof link.targetId !== 'string' || (link.relation && !RELATIONS[link.relation]) || (link.origin && !['ai', 'manual'].includes(link.origin)) || ['reason', 'evidence', 'targetEvidence', 'contentKey', 'targetKey', 'model', 'confirmedAt'].some(field => link[field] != null && (typeof link[field] !== 'string' || link[field].length > 2000))))) throw new Error('关联依据格式有误');
    if (s.progress && !PROGRESS_KEYS.includes(s.progress)) throw new Error('记录颜色格式有误');
    for (const field of ['topicIds', 'moduleIds', 'dismissedLinks']) if (s[field] != null && (!Array.isArray(s[field]) || s[field].some((id) => typeof id !== 'string'))) throw new Error('记录关联格式有误');
    if (s.wikiLinks != null && (!Array.isArray(s.wikiLinks) || s.wikiLinks.some((link) => typeof link?.target !== 'string' || typeof link?.recordId !== 'string' || (link.fragment != null && (typeof link.fragment !== 'string' || link.fragment.length > 600))))) throw new Error('正文链接格式有误');
    if (s.knowledge) {
      const k = s.knowledge;
      const evidence = (v) => v && typeof v.reason === 'string' && typeof v.evidence === 'string' && typeof v.confidence === 'number' && v.confidence >= 0 && v.confidence <= 1 && ['accepted', 'suggested', 'dismissed'].includes(v.decision) && (v.targetEvidence == null || typeof v.targetEvidence === 'string') && (v.targetKey == null || typeof v.targetKey === 'string') && (v.relation == null || !!RELATIONS[v.relation]);
      if (typeof k.contentKey !== 'string' || (k.contextKey != null && (typeof k.contextKey !== 'string' || k.contextKey.length > 100)) || typeof k.summary !== 'string' || !Array.isArray(k.links) || k.links.length > 30 || k.links.some((link) => !evidence(link) || !['topic', 'record', 'module'].includes(link.type) || typeof link.targetId !== 'string') || (k.progress && (!evidence(k.progress) || !PROGRESS_KEYS.includes(k.progress.value)))) throw new Error('AI 关联数据格式有误');
    }
    return { ...s, body: s.body || '', relatedIds: Array.isArray(s.relatedIds) ? s.relatedIds : [] };
  });
  for (const stage of stages) stage.relatedIds = stage.relatedIds.filter((id) => id !== stage.id && stageIds.has(id));
  return refreshWikiBindings({ ...input, schemaVersion: 1, phases, stages });
}

export function parseWorkspace(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (value?.schemaVersion && value.schemaVersion > 2) throw new Error('备份来自更新版本，请先更新应用');
  const projects = value?.research ? [normalizeProject(value)] : value?.version === 2 && Array.isArray(value.projects) ? value.projects.map(normalizeProject) : null;
  if (!projects) throw new Error('无法识别备份格式，请选择本软件导出的 JSON');
  if (new Set(projects.map((p) => p.research.id)).size !== projects.length) throw new Error('项目编号重复');
  return { version: 2, projects };
}

export function loadWorkspace(storage) {
  try {
    const saved = storage.getItem(WORKSPACE_KEY);
    if (saved !== null) return { workspace: parseWorkspace(saved), error: '' };
    const legacy = storage.getItem(LEGACY_KEY);
    return { workspace: legacy ? parseWorkspace(legacy) : { version: 2, projects: [] }, error: '' };
  } catch (err) { return { workspace: null, error: `读取失败：${err.message}。原始数据已保留。` }; }
}

export function saveWorkspace(storage, workspace) {
  try {
    const text = JSON.stringify(workspace);
    const previous = storage.getItem(WORKSPACE_KEY);
    if (previous && previous !== text) {
      // Never replace a usable recovery snapshot with corrupt storage contents.
      let valid = false;
      try { parseWorkspace(previous); valid = true; } catch { /* keep snapshot */ }
      if (valid) storage.setItem(`${WORKSPACE_KEY}:prev`, previous);
    }
    storage.setItem(WORKSPACE_KEY, text);
    return '';
  } catch { return '保存失败，可能是浏览器存储空间不足。请立即导出备份；当前改动仍在页面中。'; }
}

export function mergeWorkspaces(local, incoming) {
  const projects = [...local.projects];
  for (const next of incoming.projects) {
    const index = projects.findIndex((p) => p.research.id === next.research.id);
    if (index < 0) { projects.push(next); continue; }
    const prev = projects[index];
    const phases = [...prev.phases];
    for (const phase of next.phases) if (!phases.some((p) => p.id === phase.id)) phases.push(phase);
    const stages = new Map(prev.stages.map((s) => [s.id, s]));
    for (const stage of next.stages) {
      if (!stages.has(stage.id) || (stage.updatedAt || '') > (stages.get(stage.id).updatedAt || '')) stages.set(stage.id, stage);
    }
    projects[index] = normalizeProject({ ...prev, phases, stages: [...stages.values()] });
  }
  return { version: 2, projects };
}

export function descendantIds(phases, id) {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of phases) if (result.has(p.parentId) && !result.has(p.id)) { result.add(p.id); changed = true; }
  }
  return result;
}

export function topicRecords(doc, id) {
  const ids = descendantIds(doc.phases, id);
  return doc.stages.filter((s) => ids.has(s.phaseId) || recordLinks(s, doc).some((link) => link.type === 'topic' && ids.has(link.targetId)));
}

export function progressOf(records, override) {
  if (PROGRESS[override]) return override;
  if (!records.length) return 'todo';
  const values = records.map((record) => inferProgress(record).value);
  if (values.includes('blocked')) return 'blocked';
  if (values.every((value) => value === 'done')) return 'done';
  if (values.every((value) => value === 'todo')) return 'todo';
  return 'active';
}

export const recordDate = (record) => record.recordedAt || record.createdAt || '';
export const chronological = (records) => [...records].sort((a, b) => recordDate(a).localeCompare(recordDate(b)) || a.id.localeCompare(b.id));

export function createDemoProject() {
  const doc = newProject('示例研究 · 传感器校准', '虚构演示：练习整理记录、公式与研究节点。');
  doc.research.demo = true;
  doc.phases = [
    ['校准准备', null, 'done', '确认量程和测量环境。'],
    ['重复性实验', null, 'active', '补充多个时段的测量。'],
    ['室内测量', 1, 'done', '完成示例测量。'],
    ['环境漂移复核', 1, 'blocked', '示例结果需复核。'],
    ['报告整理', null, 'todo', '汇总图表和结论边界。'],
  ].map(([title, parent, progress, summary], i) => ({ ...createPhase(doc.research.id, title, { id: doc.research.id + '_p' + i, order: i }), parentId: parent === null ? null : doc.research.id + '_p' + parent, progress, summary }));
  const examples = [
    { title: '检查设备与量程', phase: 0, status: 'passed', worked: true, body: '## 演示记录\n以下内容与数值均为虚构。\n\n设备已检查，校准准备已完成。', scope: '仅演示记录方式。' },
    { title: '室内测量已完成', phase: 2, status: 'passed', worked: true, body: '## 演示测量\n均值公式：$\\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_i$。\n\n| 样本 | 示例值 |\n| --- | --- |\n| A | 2.0 |\n| B | 2.2 |\n\n本轮已完成。', nextStep: '在不同环境下复核。' },
    { title: '环境漂移需要勘误', phase: 3, status: 'failed', worked: true, body: '## 虚构复核案例\n参考温度记录遗漏，当前比较需勘误。\n\n下一步补充环境条件。', cannotInfer: '不能据此判断仪器失效。' },
    { title: '下一组测量计划', phase: 1, status: 'running', worked: false, body: '## 未完成\n准备下一组虚构测量，结果待填。\n\n\x60\x60\x60mermaid\nflowchart LR\n A[准备] --> B[测量] --> C[复核]\n\x60\x60\x60', nextStep: '补齐测量与环境说明。' },
  ];
  doc.stages = examples.map(({ phase, ...item }, i) => ({ ...createStage(doc.phases[phase].id, item.title, { now: new Date('2026-01-0' + (i + 1) + 'T10:00:00Z'), stageId: 'DEMO-0' + (i + 1) }), ...item }));
  doc.stages[3].relatedIds = [doc.stages[1].id];
  return doc;
}
