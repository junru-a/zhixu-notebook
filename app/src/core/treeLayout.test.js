import { expect, it } from 'vitest';
import { createDemoProject, parseWorkspace } from './workspace.js';

it('preserves layout through export/import without changing research hierarchy', () => {
  const doc = createDemoProject(), parents = doc.phases.map((p) => p.parentId);
  doc.treeLayout = { snap: false, positions: { [`research:${doc.research.id}`]: { left: 40, top: 80 }, [`topic:${doc.phases[0].id}`]: { left: -379, top: 50127 } } };
  const restored = parseWorkspace(JSON.stringify({ version: 2, projects: [doc] })).projects[0];
  expect(restored.treeLayout).toEqual(doc.treeLayout);
  expect(restored.phases.map((p) => p.parentId)).toEqual(parents);
});
it('rejects invalid or unbounded imported layout coordinates', () => {
  for (const left of ['100', Infinity, NaN, 1e10, -1e10]) {
    const doc = createDemoProject(); doc.treeLayout = { positions: { root: { left, top: 40 } } };
    expect(() => parseWorkspace({ version: 2, projects: [doc] })).toThrow('科研树布局');
  }
});
