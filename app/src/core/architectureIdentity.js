// AI IDs are local to a response. Keep identity only for unambiguous matches.
const identity = node => JSON.stringify([node.label.trim(), node.kind || 'other', [...node.files].sort()]);
export function prepareArchitectureGraph(doc, graph) {
  if (graph.stableIds) return graph;
  const previous = doc.architecture?.analysis?.nodes || [], mapping = new Map(), retained = new Set();
  for (const node of graph.nodes) {
    const matches = previous.filter(old => identity(old) === identity(node));
    const unique = graph.nodes.filter(next => identity(next) === identity(node)).length === 1;
    const id = unique && matches.length === 1 ? matches[0].id : `module_${crypto.randomUUID()}`;
    mapping.set(node.id, id); if (unique && matches.length === 1) retained.add(id);
  }
  const removed = previous.filter(node => !retained.has(node.id));
  const missing = new Set(removed.map(node => node.id));
  const affected = doc.stages.filter(record => [...(record.moduleIds || []), ...(record.knowledge?.links || []).filter(link => link.type === 'module').map(link => link.targetId)].some(id => missing.has(id))).length;
  return { ...graph, stableIds: true,
    nodes: graph.nodes.map(node => ({ ...node, id: mapping.get(node.id) })),
    edges: graph.edges.map(edge => ({ ...edge, source: mapping.get(edge.source), target: mapping.get(edge.target) })),
    suggestions: graph.suggestions.map(link => ({ ...link, nodeId: mapping.get(link.nodeId) })),
    migration: { retained: retained.size, added: graph.nodes.length - retained.size, removed: removed.map(node => ({ id: node.id, label: node.label })), affected },
  };
}
