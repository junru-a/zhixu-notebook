import { it, expect } from 'vitest';
import { createDocument, createPhase, createStage } from './model.js';
import { parseWorkspace } from './workspace.js';
import { copyTopic, deleteTopic } from './topicActions.js';
const fixture = () => {
  const doc = createDocument('测试'); const parent = doc.phases[0];
  parent.summary = '研究摘要'; parent.codePaths = ['model.py'];
  const child = { ...createPhase(doc.research.id, '子方向'), parentId: parent.id };
  doc.phases.push(child); doc.stages.push(createStage(parent.id, '父记录'), { ...createStage(child.id, '子记录'), topicIds: [parent.id], dismissedLinks: [`topic:${parent.id}`], knowledge: { links: [{ type: 'topic', targetId: parent.id }, { type: 'record', targetId: 'retained' }] } });
  doc.treeLayout = { positions: { [`topic:${parent.id}`]: { left: 40, top: 40 }, [`topic:${child.id}`]: { left: 360, top: 40 } } };
  return doc;
};
it('copies only the card with a new identity, unique name and separate position', () => {
  const doc = fixture(), before = JSON.stringify(doc), id = doc.phases[0].id;
  const next = copyTopic(doc, id), copy = next.phases.at(-1);
  expect(copy.id).not.toBe(id); expect(copy.summary).toBe('研究摘要'); expect(copy.codePaths).toEqual(['model.py']);
  expect(next.stages).toBe(doc.stages); expect(next.phases[1].parentId).toBe(id);
  expect(next.treeLayout.positions[`topic:${copy.id}`]).not.toEqual(doc.treeLayout.positions[`topic:${id}`]);
  expect(copyTopic(next, id).phases.at(-1).title).not.toBe(copy.title); expect(JSON.stringify(doc)).toBe(before);
});
it('deletes only the chosen category, promotes children and preserves records in a chosen destination', () => {
  const doc = fixture(), id = doc.phases[0].id, child = doc.phases[1].id;
  const next = deleteTopic(doc, id, child);
  expect(next.phases).toHaveLength(1); expect(next.phases[0].parentId).toBeNull();
  expect(next.stages).toHaveLength(2); expect(next.stages.every((r) => r.phaseId === child)).toBe(true);
  expect(next.stages[0].body).toBe(doc.stages[0].body); expect(next.stages[1].topicIds).toEqual([]);
  expect(next.stages[1].knowledge.links).toEqual([{ type: 'record', targetId: 'retained' }]);
  expect(next.stages[1].dismissedLinks).toEqual([]); expect(next.treeLayout.positions[`topic:${id}`]).toBeUndefined();
});
it('retains last-category records in a new category and remains importable', () => {
  const doc = createDocument('测试'); doc.stages.push(createStage(doc.phases[0].id, '保留记录'));
  const next = deleteTopic(doc, doc.phases[0].id);
  expect(next.phases[0].title).toBe('未分类记录'); expect(next.stages[0].phaseId).toBe(next.phases[0].id);
  expect(parseWorkspace({ version: 2, projects: [next] }).projects[0].stages).toHaveLength(1);
});
it('cleans saved and pending suggestions without removing architecture nodes or unrelated suggestions', () => {
  const doc = fixture(), id = doc.phases[0].id, other = doc.phases[1].id;
  const graph = { nodes: [{ id: 'module' }], suggestions: [{ phaseId: id }, { phaseId: other }] };
  doc.architecture = { analysis: graph, pendingAnalysis: graph };
  const next = deleteTopic(doc, id);
  for (const key of ['analysis', 'pendingAnalysis']) { expect(next.architecture[key].suggestions).toEqual([{ phaseId: other }]); expect(next.architecture[key].nodes).toEqual(graph.nodes); }
});
it('does not create a replacement for an empty last category or modify a missing category', () => {
  const doc = createDocument('测试'); expect(deleteTopic(doc, doc.phases[0].id).phases).toEqual([]);
  expect(deleteTopic(doc, 'missing')).toBe(doc); expect(copyTopic(doc, 'missing')).toBe(doc);
});
