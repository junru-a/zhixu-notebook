import { it, expect } from 'vitest';
import { newProject, normalizeProject } from './workspace.js';
import { createStage, createPhase } from './model.js';
import { applyKnowledge, buildKnowledgeRequest, recordKey, recordLinks, setLinkDecision, validateKnowledgeResult, refreshWikiBindings } from './recordKnowledge.js';
import { resolveWiki, referenceDestinations, referenceText } from './wikiLinks.js';
import { renderMarkdown } from './markdown.js';
import { prepareArchitectureGraph } from './architectureIdentity.js';
const fixture = () => {
  const doc = newProject('Synthetic'); doc.phases.push(createPhase(doc.research.id, '目标实验'));
  doc.stages = [createStage(doc.phases[0].id, '原记录'), createStage(doc.phases[0].id, '目标记录')];
  doc.stages[0].body = '本轮已完成，参考目标实验。'; return doc;
};
const result = doc => ({ summary: '说明', progress: null, links: [{ type: 'topic', targetId: doc.phases[1].id, confidence: .99, reason: '显式引用', evidence: '参考目标实验', targetEvidence: '目标实验', relation: 'references' }] });
it('requires an explicit unique target and evidence from both sides for automatic links', () => {
  const doc = fixture(), req = buildKnowledgeRequest(doc.stages[0], doc), raw = result(doc);
  expect(validateKnowledgeResult(raw, req).links[0].decision).toBe('accepted');
  raw.links[0].evidence = '本轮已完成'; expect(validateKnowledgeResult(raw, req).links[0].decision).toBe('suggested');
  raw.links[0].evidence = '参考目标实验'; raw.links[0].targetEvidence = '伪造目标依据'; expect(validateKnowledgeResult(raw, req).links[0].decision).toBe('suggested');
});
it('candidate edits invalidate a response even when the source record is unchanged', () => {
  const doc = fixture(), record = doc.stages[0], accepted = validateKnowledgeResult(result(doc), buildKnowledgeRequest(record, doc));
  doc.phases[1].title = '另一方向'; expect(applyKnowledge(doc, record.id, recordKey(record), accepted)).toBe(doc);
});
it('confirmed AI evidence survives edits and export/import as a visibly stale snapshot', () => {
  let doc = fixture(); doc = applyKnowledge(doc, doc.stages[0].id, recordKey(doc.stages[0]), validateKnowledgeResult(result(doc), buildKnowledgeRequest(doc.stages[0], doc)));
  const link = doc.stages[0].knowledge.links[0]; doc.stages[0] = setLinkDecision(doc.stages[0], link, 'accepted'); doc.stages[0].body += '\n额外说明。';
  doc = normalizeProject(JSON.parse(JSON.stringify(doc)));
  expect(recordLinks(doc.stages[0], doc).find(item => item.targetId === link.targetId)).toMatchObject({ source: 'AI 建议 · 已确认', evidence: '参考目标实验', targetEvidence: '目标实验', stale: true });
});
it('late-created targets are pinned and cannot be replaced by a same-name record after deletion', () => {
  let doc = fixture(); doc.stages[0].body = '[[未来目标]]'; doc = refreshWikiBindings(doc);
  const previous = structuredClone(doc); doc.stages[1].title = '未来目标'; doc = refreshWikiBindings(doc, previous);
  const saved = doc.stages[0].wikiLinks; doc.stages[1].title = '更名目标'; expect(resolveWiki('未来目标', doc.stages, saved)).toBe(doc.stages[1].id);
  doc.stages[1] = { ...doc.stages[1], id: 'another', title: '未来目标' }; expect(resolveWiki('未来目标', doc.stages, saved)).toBe(null);
});
it('aliases, heading and block references retain safe destination identity', () => {
  const records = [{ id: 'r1', title: '目标', aliases: ['简称'], body: '## 结论\n示例结果。 ^result\n\n## 计划\n后续安排' }];
  expect(resolveWiki('简称#结论', records)).toBe('r1'); expect(referenceText(records[0], '结论')).not.toContain('后续安排');
  expect(referenceText(records[0], '^result')).toBe('示例结果。'); expect(referenceDestinations(records[0]).map(item => item.fragment)).toEqual(['结论', '^result', '计划']);
  expect(renderMarkdown(records[0].body)).toContain('data-block-id="result"');
});
it('overlapping manual and wiki origins remain visible; removing one does not alter authored text', () => {
  const doc = fixture(); doc.stages[0] = { ...doc.stages[0], body: '[[目标记录]]', relatedIds: [doc.stages[1].id] }; doc.stages[0] = refreshWikiBindings(doc).stages[0];
  expect(recordLinks(doc.stages[0], doc).find(item => item.type === 'record').sources).toEqual(['手动关联', '正文链接']);
});
it('new architecture response IDs cannot hijack old module associations', () => {
  const doc = fixture(); doc.architecture = { analysis: { nodes: [{ id: 'm1', label: '测量', kind: 'data', files: ['measure.py'] }] } };
  doc.stages[0].moduleIds = ['m1'];
  const graph = { nodes: [{ id: 'm1', label: '绘图', kind: 'data', files: ['plot.py'] }], edges: [], suggestions: [] };
  const next = prepareArchitectureGraph(doc, graph); expect(next.nodes[0].id).not.toBe('m1'); expect(next.migration.affected).toBe(1);
  graph.nodes[0] = { id: 'new-id', label: '测量', kind: 'data', files: ['measure.py'] }; expect(prepareArchitectureGraph(doc, graph).nodes[0].id).toBe('m1');
});
it('scientific supports/refutes claims stay pending even with a high score', () => {
  const doc = fixture(), raw = result(doc); raw.links[0].relation = 'supports'; expect(validateKnowledgeResult(raw, buildKnowledgeRequest(doc.stages[0], doc)).links[0].decision).toBe('suggested');
});
