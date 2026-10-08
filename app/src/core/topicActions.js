import { createPhase } from './model.js';

// Duplicate the card's definition, not experimental records or their identity.
export function copyTopic(doc, id, positions = {}) {
  const original = doc.phases.find((p) => p.id === id);
  if (!original) return doc;
  let title = `${original.title}（副本）`, number = 2;
  while (doc.phases.some((p) => p.title === title)) title = `${original.title}（副本 ${number++}）`;
  const copy = { ...original, ...createPhase(doc.research.id, title, { order: doc.phases.length }), parentId: original.parentId || null, summary: original.summary || '', progress: original.progress, codePaths: [...(original.codePaths || [])] };
  const source = positions[`topic:${id}`] || doc.treeLayout?.positions?.[`topic:${id}`];
  const nextPositions = { ...doc.treeLayout?.positions, ...positions };
  if (source) {
    let left = source.left + 40, top = source.top + 160;
    while (Object.values(nextPositions).some((p) => Math.abs(p.left - left) < 260 && Math.abs(p.top - top) < 140)) top = top + 160;
    nextPositions[`topic:${copy.id}`] = { left, top };
  }
  return { ...doc, phases: [...doc.phases, copy], treeLayout: { ...doc.treeLayout, positions: nextPositions } };
}

// Removing a category never deletes research records. Its immediate children
// move up one level; links to the removed identity are removed, not retargeted.
export function deleteTopic(doc, id, destinationId = '') {
  const removed = doc.phases.find((p) => p.id === id);
  if (!removed) return doc;
  let phases = doc.phases.filter((p) => p.id !== id).map((p) => p.parentId === id ? { ...p, parentId: removed.parentId || null } : p);
  let destination = phases.find((p) => p.id === destinationId);
  if (doc.stages.some((r) => r.phaseId === id) && !destination) {
    destination = createPhase(doc.research.id, '未分类记录', { order: phases.length });
    phases = [...phases, destination];
  }
  const stages = doc.stages.map((r) => {
    const moved = r.phaseId === id;
    return { ...r, phaseId: moved ? destination.id : r.phaseId,
      topicIds: r.topicIds?.filter((value) => value !== id), linkDetails: r.linkDetails?.filter(link => !(link.type === 'topic' && link.targetId === id)),
      dismissedLinks: r.dismissedLinks?.filter((value) => value !== `topic:${id}`),
      // Moving the primary category invalidates old content-bound AI results.
      knowledge: moved ? undefined : r.knowledge ? { ...r.knowledge, links: r.knowledge.links.filter((link) => !(link.type === 'topic' && link.targetId === id)) } : undefined };
  });
  const positions = { ...doc.treeLayout?.positions }; delete positions[`topic:${id}`];
  const cleanGraph = (graph) => graph ? { ...graph, suggestions: (graph.suggestions || []).filter((s) => s.phaseId !== id) } : graph;
  return { ...doc, phases, stages, treeLayout: { ...doc.treeLayout, positions }, architecture: doc.architecture ? { ...doc.architecture, analysis: cleanGraph(doc.architecture.analysis), pendingAnalysis: cleanGraph(doc.architecture.pendingAnalysis) } : undefined };
}
