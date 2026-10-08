export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 128;

// Collapse cycles before assigning columns. This keeps feedback loops from
// pinning every downstream module to the first column.
export function layoutArchitecture(graph) {
  const ids = new Set(graph.nodes.map((n) => n.id)), adjacency = new Map([...ids].map((id) => [id, []]));
  for (const edge of graph.edges) if (ids.has(edge.source) && ids.has(edge.target)) adjacency.get(edge.source).push(edge.target);
  let index = 0;
  const indices = new Map(), low = new Map(), stack = [], stacked = new Set(), components = [];
  function visit(id) {
    indices.set(id, index); low.set(id, index++); stack.push(id); stacked.add(id);
    for (const target of adjacency.get(id)) {
      if (!indices.has(target)) { visit(target); low.set(id, Math.min(low.get(id), low.get(target))); }
      else if (stacked.has(target)) low.set(id, Math.min(low.get(id), indices.get(target)));
    }
    if (low.get(id) === indices.get(id)) {
      const group = []; let member;
      do { member = stack.pop(); stacked.delete(member); group.push(member); } while (member !== id);
      components.push(group);
    }
  }
  for (const id of ids) if (!indices.has(id)) visit(id);
  const groups = new Map(components.flatMap((members, i) => members.map((id) => [id, i])));
  const outgoing = components.map(() => new Set()), degrees = components.map(() => 0), levels = components.map(() => 0);
  for (const [source, targets] of adjacency) for (const target of targets) {
    const a = groups.get(source), b = groups.get(target);
    if (a !== b && !outgoing[a].has(b)) { outgoing[a].add(b); degrees[b]++; }
  }
  const queue = degrees.flatMap((degree, i) => degree === 0 ? [i] : []);
  for (let i = 0; i < queue.length; i++) for (const next of outgoing[queue[i]]) {
    levels[next] = Math.max(levels[next], levels[queue[i]] + 1);
    if (--degrees[next] === 0) queue.push(next);
  }
  const columns = new Map(), depth = Math.max(0, ...levels), rowsPerColumn = Math.max(6, Math.ceil(graph.nodes.length / 4));
  for (const node of graph.nodes) { const rank = levels[groups.get(node.id)], level = depth > 4 ? Math.floor(rank * 5 / (depth + 1)) : rank; if (!columns.has(level)) columns.set(level, []); columns.get(level).push(node); }
  const nodes = []; let column = 0;
  for (const [, members] of [...columns].sort((a, b) => a[0] - b[0])) {
    members.forEach((node, i) => nodes.push({ ...node, x: 24 + (column + Math.floor(i / rowsPerColumn)) * 320, y: 24 + (i % rowsPerColumn) * 156 }));
    column += Math.ceil(members.length / rowsPerColumn);
  }
  return { nodes, width: Math.max(360, ...nodes.map((n) => n.x + CARD_WIDTH + 72)), height: Math.max(200, ...nodes.map((n) => n.y + CARD_HEIGHT + 24)) };
}

export function connectionPath(from, to) {
  const rightward = from.x < to.x, same = from.x === to.x;
  const start = { x: from.x + (rightward || same ? CARD_WIDTH : 0), y: from.y + CARD_HEIGHT / 2 };
  const end = { x: to.x + (rightward ? 0 : CARD_WIDTH), y: to.y + CARD_HEIGHT / 2 };
  const middle = same ? start.x + 64 : (start.x + end.x) / 2;
  return `M${start.x},${start.y} C${middle},${start.y} ${middle},${end.y} ${end.x},${end.y}`;
}

export function layoutEdgeLabels(nodes, edges) {
  // ponytail: bounded label placement can overlap on dense graphs; use a layout engine if local filtering no longer suffices.
  const occupied = nodes.map((n) => ({ x: n.x - 8, y: n.y - 8, w: CARD_WIDTH + 16, h: CARD_HEIGHT + 16 }));
  return edges.map((edge) => {
    const from = nodes.find((n) => n.id === edge.source), to = nodes.find((n) => n.id === edge.target);
    if (!from || !to) return null;
    const anchorX = from.x === to.x ? from.x + CARD_WIDTH + 48 : (from.x + to.x + CARD_WIDTH) / 2;
    const anchorY = (from.y + to.y) / 2 + CARD_HEIGHT / 2;
    const w = 150, h = 24;
    let point = { x: anchorX, y: anchorY };
    outer: for (const dx of [0, 90, -90, 180, -180]) for (const dy of [0, -28, 28, -56, 56, -84, 84, -112, 112]) {
      const x = anchorX + dx, y = anchorY + dy;
      if (x < w / 2 + 4 || y < h / 2 + 4) continue;
      if (occupied.every((r) => x + w / 2 <= r.x || x - w / 2 >= r.x + r.w || y + h / 2 <= r.y || y - h / 2 >= r.y + r.h)) { point = { x, y }; break outer; }
    }
    occupied.push({ x: point.x - w / 2, y: point.y - h / 2, w, h });
    return { ...point, anchorX, anchorY, edge };
  }).filter(Boolean);
}
