import { inferProgress, recordLinks, RELATIONS } from './recordKnowledge.js';
import { PROGRESS } from './workspace.js';
import { CARD_HEIGHT, CARD_WIDTH } from './graphLayout.js';

export const NETWORK_TYPES = { topic: '研究节点', record: '科研记录', module: '代码模块' };
export function buildNetwork(doc) {
  const modules = doc.architecture?.analysis?.nodes || [];
  const nodes = [
    ...doc.phases.map((n) => ({ id: `topic:${n.id}`, targetId: n.id, type: 'topic', label: n.title, description: n.summary || '研究分类', color: 'var(--accent)' })),
    ...doc.stages.map((r) => ({ id: `record:${r.id}`, targetId: r.id, type: 'record', label: r.title, description: `${PROGRESS[inferProgress(r).value].label} · 科研记录`, color: PROGRESS[inferProgress(r).value].color })),
    ...modules.map((n) => ({ id: `module:${n.id}`, targetId: n.id, type: 'module', label: n.label, description: n.summary, color: 'var(--secondary)' })),
  ];
  const ids = new Set(nodes.map((n) => n.id)), edges = [], seen = new Set();
  const add = (edge) => {
    const id = JSON.stringify([edge.source, edge.target, edge.label]);
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target || seen.has(id)) return;
    seen.add(id); edges.push({ ...edge, id });
  };
  for (const phase of doc.phases) if (phase.parentId) add({ source: `topic:${phase.parentId}`, target: `topic:${phase.id}`, label: '父子节点', origin: '科研树层级', reason: '来自你保存的研究节点层级。' });
  for (const record of doc.stages) for (const link of recordLinks(record, doc)) add({ source: `record:${record.id}`, target: `${link.type}:${link.targetId}`, label: RELATIONS[link.relation] || (link.source === '正文链接' ? '引用' : link.source), origin: link.sources.join(' + '), uncertain: link.source === 'AI 关联' || !!link.stale, reason: link.reason || (link.source === '所属节点' ? '这篇记录归属于该研究节点。' : link.source === '正文链接' ? '记录正文通过 [[双链]] 引用了这篇记录。' : '来自记录中保存的手动关联。'), evidence: link.evidence });
  for (const edge of doc.architecture?.analysis?.edges || []) add({ source: `module:${edge.source}`, target: `module:${edge.target}`, label: edge.label, origin: edge.reviewed ? '架构关系 · 已人工核查' : edge.manual ? '架构关系 · 手动补充' : '架构 AI 分析 · 待核查', uncertain: !edge.reviewed && !edge.manual, reason: edge.evidence, citations: edge.citations });
  // Only intersect explicit saved file associations. Similar names and pending
  // suggestions must not silently become knowledge links.
  const validPaths = new Set((doc.architecture?.files || []).map((file) => file.path));
  for (const phase of doc.phases) {
    const paths = new Set((phase.codePaths || []).filter((path) => validPaths.has(path)));
    for (const module of modules) {
      const shared = (module.files || []).filter((path) => paths.has(path));
      if (shared.length) add({ source: `topic:${phase.id}`, target: `module:${module.id}`, label: '关联代码文件', origin: '研究节点的文件关联', reason: `该研究节点关联了此模块的 ${shared.length} 个依据文件；这不代表模块职责已经验证。`, paths: shared });
    }
  }
  const degree = new Map(nodes.map((n) => [n.id, 0]));
  for (const edge of edges) { degree.set(edge.source, degree.get(edge.source) + 1); degree.set(edge.target, degree.get(edge.target) + 1); }
  return { nodes: nodes.map((n) => ({ ...n, degree: degree.get(n.id) })), edges };
}

export function defaultNetworkNode(network) {
  for (const type of ['record', 'topic', 'module']) {
    const candidates = network.nodes.filter((n) => n.type === type && n.degree > 0).sort((a, b) => b.degree - a.degree);
    if (candidates.length) return candidates[0].id;
  }
  return null;
}

export function layoutKnowledge(network, selectedId, local, limit = 80) {
  const neighbors = new Set([selectedId]);
  for (const edge of network.edges) if (edge.source === selectedId || edge.target === selectedId) { neighbors.add(edge.source); neighbors.add(edge.target); }
  const candidates = network.nodes.filter((n) => local ? neighbors.has(n.id) : n.degree > 0);
  // Keep overview positions stable on selection and on search input.
  let displayed = candidates.slice(0, limit);
  if (!local && candidates.length > limit) {
    const groups = Object.keys(NETWORK_TYPES).map(type => candidates.filter(node => node.type === type));
    displayed = [];
    for (let i = 0; displayed.length < limit; i++) for (const group of groups) if (group[i] && displayed.length < limit) displayed.push(group[i]);
  }
  if (!displayed.some((n) => n.id === selectedId)) {
    const selected = candidates.find((n) => n.id === selectedId);
    if (selected) displayed = [selected, ...displayed.slice(0, limit - 1)];
  }
  const nodes = [], columns = []; let col = 0;
  for (const [type, label] of Object.entries(NETWORK_TYPES)) {
    const members = displayed.filter((n) => n.type === type);
    if (!members.length) continue;
    for (let i = 0; i < members.length; i += 8) {
      const chunk = members.slice(i, i + 8);
      columns.push({ type: `${type}:${i}`, label: i ? `${label}（续）` : label, x: 24 + col * 340, count: chunk.length });
      chunk.forEach((node, row) => nodes.push({ ...node, x: 24 + col * 340, y: 52 + row * 148 })); col++;
    }
  }
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, columns, edges: network.edges.filter((e) => ids.has(e.source) && ids.has(e.target)), total: candidates.length, width: Math.max(360, ...nodes.map((n) => n.x + CARD_WIDTH + 72)), height: Math.max(230, ...nodes.map((n) => n.y + CARD_HEIGHT + 24)) };
}
