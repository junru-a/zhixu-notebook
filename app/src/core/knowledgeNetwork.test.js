import { describe, it, expect } from 'vitest';
import { buildNetwork, defaultNetworkNode, layoutKnowledge } from './knowledgeNetwork.js';
import { layoutArchitecture, CARD_WIDTH, CARD_HEIGHT } from './graphLayout.js';
import { recordKey } from './recordKnowledge.js';

const fixture = () => ({ phases: [{ id: 'topic', title: '训练', codePaths: ['train.py', 'missing.py'] }, { id: 'empty', title: '未关联' }], stages: [{ id: 'r', title: '训练结果', phaseId: 'topic', body: '已经完成训练', moduleIds: ['train'] }], architecture: { files: [{ path: 'train.py' }, { path: 'model.py' }], analysis: { nodes: [{ id: 'train', label: '训练', files: ['train.py'] }, { id: 'model', label: '模型', files: ['model.py'] }, { id: 'old', label: '训练', files: ['missing.py'] }], edges: [{ source: 'train', target: 'model', label: '调用模型', evidence: 'import model', citations: [{ path: 'train.py', quote: 'import model', verified: true }] }], suggestions: [{ nodeId: 'model', phaseId: 'empty' }] } } });
describe('knowledge network sources and readable layouts', () => {
  it('includes saved module relations and exact valid file associations with evidence', () => {
    const network = buildNetwork(fixture());
    expect(network.edges.find((e) => e.label === '调用模型')).toMatchObject({ source: 'module:train', target: 'module:model', uncertain: true, reason: 'import model' });
    expect(network.edges.find((e) => e.label === '关联代码文件')).toMatchObject({ source: 'topic:topic', target: 'module:train', paths: ['train.py'] });
    expect(network.edges.some((e) => e.target === 'module:old' || e.target === 'topic:empty')).toBe(false);
    expect(network.nodes.find((n) => n.id === 'module:old').degree).toBe(0);
  });
  it('keeps human reviews distinct and excludes pending AI links', () => {
    const doc = fixture(), r = doc.stages[0];
    doc.architecture.analysis.edges[0].reviewed = true;
    r.knowledge = { contentKey: recordKey(r), links: [{ type: 'topic', targetId: 'empty', decision: 'suggested', reason: '待确认' }] };
    const network = buildNetwork(doc);
    expect(network.edges.find((e) => e.label === '调用模型').uncertain).toBe(false);
    expect(network.edges.some((e) => e.target === 'topic:empty')).toBe(false);
  });
  it('filters broken endpoints and duplicate relations without modifying source data', () => {
    const doc = fixture(); doc.architecture.analysis.edges.push({ ...doc.architecture.analysis.edges[0] }, { source: 'train', target: 'deleted', label: '过期关系' });
    const before = JSON.stringify(doc), network = buildNetwork(doc);
    expect(network.edges.filter((e) => e.label === '调用模型')).toHaveLength(1);
    expect(network.edges.some((e) => e.target.includes('deleted'))).toBe(false);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('opens at a connected record and shows its direct neighborhood; isolates remain available', () => {
    const network = buildNetwork(fixture()), selected = defaultNetworkNode(network);
    expect(selected).toBe('record:r');
    expect(layoutKnowledge(network, selected, true).nodes.map((n) => n.id)).toEqual(['topic:topic', 'record:r', 'module:train']);
    expect(layoutKnowledge(network, 'topic:empty', true).nodes).toHaveLength(1);
    expect(layoutKnowledge(network, null, false).nodes.some((n) => n.id === 'topic:empty')).toBe(false);
    expect(defaultNetworkNode({ nodes: [], edges: [] })).toBeNull();
  });
  it('does not shuffle overview when selection changes, and retains a late selected node at the display limit', () => {
    const network = buildNetwork(fixture());
    expect(layoutKnowledge(network, 'record:r', false)).toEqual(layoutKnowledge(network, 'module:model', false));
    expect(layoutKnowledge(network, 'record:r', true, 1).nodes[0].id).toBe('record:r');
  });
  it('lays out a cyclic architecture and its downstream modules without overlaps or clipped bounds', () => {
    const graph = { nodes: Array.from({ length: 30 }, (_, i) => ({ id: String(i) })), edges: [{ source: '0', target: '1' }, { source: '1', target: '0' }, { source: '1', target: '2' }] };
    const layout = layoutArchitecture(graph);
    expect(layout.nodes.find((n) => n.id === '2').x).toBeGreaterThan(layout.nodes.find((n) => n.id === '1').x);
    for (const a of layout.nodes) {
      expect(a.x + CARD_WIDTH).toBeLessThan(layout.width);
      expect(a.y + CARD_HEIGHT).toBeLessThan(layout.height);
      for (const b of layout.nodes.filter((n) => n.id !== a.id)) expect(a.x + CARD_WIDTH <= b.x || b.x + CARD_WIDTH <= a.x || a.y + CARD_HEIGHT <= b.y || b.y + CARD_HEIGHT <= a.y).toBe(true);
    }
  });
});
