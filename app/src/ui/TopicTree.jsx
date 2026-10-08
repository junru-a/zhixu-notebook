import { useEffect, useMemo, useRef, useState } from 'react';
import { hierarchy, tree } from 'd3';
import { Plus, Minus, Pencil, Maximize, ArrowUpRight, GitBranch, Circle, CircleDot, CircleAlert, CircleCheck } from 'lucide-react';
import { TopicMenu, DeleteTopicDialog } from './TopicMenu.jsx';
import { copyTopic, deleteTopic } from '../core/topicActions.js';
import { PROGRESS, progressOf, topicRecords, chronological } from '../core/workspace.js';

export function ProgressIcon({ value }) {
  const Icon = { todo: Circle, active: CircleDot, blocked: CircleAlert, done: CircleCheck }[value] || Circle;
  return <Icon size={19} className={`progress-icon ${value}`} aria-label={PROGRESS[value]?.label || '未开始'} />;
}

export function ProgressBadge({ value }) {
  const state = PROGRESS[value] || PROGRESS.todo;
  return <span className={`progress-badge ${value}`}><ProgressIcon value={value} />{state.label}</span>;
}

export default function TopicTree({ doc, onOpen, onEdit, onAdd, update, initialViewport, onViewportChange }) {
  const [pan, setPan] = useState({ x: initialViewport?.x ?? -(initialViewport?.left || 0), y: initialViewport?.y ?? -(initialViewport?.top || 0) });
  const panning = useRef(null);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(initialViewport?.zoom ?? 0.9);
  const container = useRef(null), gesture = useRef(null), suppressClick = useRef(false);
  const [dragPosition, setDragPosition] = useState(null);
  const [menu, setMenu] = useState(null), [deletingId, setDeletingId] = useState(null), [actionMessage, setActionMessage] = useState('');
  const snap = doc.treeLayout?.snap !== false;
  const positionKey = (node) => node.depth === 0 ? `research:${doc.research.id}` : `topic:${node.data.id}`;
  const align = (value) => snap ? Math.round(value / 20) * 20 : Math.round(value);

  const moveCamera = (next, nextZoom = zoom) => { setPan(next); setZoom(nextZoom); onViewportChange?.({ ...next, zoom: nextZoom }); };
  useEffect(() => {
    const canvas = container.current;
    const scroll = (event) => {
      event.preventDefault();
      if (gesture.current || panning.current) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) {
        const next = Math.max(.15, Math.min(2.5, zoom * Math.exp(-Math.max(-160, Math.min(160, event.deltaY * unit)) * .005)));
        const bounds = canvas.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
        moveCamera({ x: x - (x - pan.x) * next / zoom, y: y - (y - pan.y) * next / zoom }, next);
      } else moveCamera({ x: pan.x - event.deltaX * unit, y: pan.y - event.deltaY * unit });
    };
    canvas.addEventListener('wheel', scroll, { passive: false });
    return () => canvas.removeEventListener('wheel', scroll);
  }, [pan, zoom, onViewportChange]);
  const changeZoom = (nextZoom) => {
    const value = Math.round(Math.min(2.5, Math.max(.15, nextZoom)) * 100) / 100;
    const x = container.current.clientWidth / 2, y = container.current.clientHeight / 2;
    moveCamera({ x: x - (x - pan.x) * value / zoom, y: y - (y - pan.y) * value / zoom }, value);
  };
  const layout = useMemo(() => {
    const children = (id) => doc.phases.filter((p) => (p.parentId || null) === id).map((p) => ({ ...p, children: children(p.id) }));
    const root = hierarchy({ id: 'root', title: doc.research.title, children: children(null) });
    tree().nodeSize([155, 308])(root);
    const nodes = root.descendants();
    const min = Math.min(...nodes.map((n) => n.x));
    nodes.forEach((n) => { const key = positionKey(n), saved = doc.treeLayout?.positions?.[key];
      n.top = saved?.top ?? Math.round((n.x - min + 70) / 20) * 20;
      n.left = saved?.left ?? Math.round((n.y + 55) / 20) * 20;
      if (dragPosition?.key === key) { n.top = dragPosition.top; n.left = dragPosition.left; } });
    return { nodes, links: root.links(), width: Math.max(...nodes.map((n) => n.left)) + 305, height: Math.max(...nodes.map((n) => n.top)) + 210 };
  }, [doc, dragPosition]);
  const commit = (key, left, top) => {
    const positions = Object.fromEntries(layout.nodes.map((n) => [positionKey(n), { left: n.left, top: n.top }]));
    positions[key] = { left, top };
    update((p) => ({ ...p, treeLayout: { ...p.treeLayout, positions } }));
  };
  const startDrag = (event, node) => {
    if (event.button !== 0) return;
    suppressClick.current = false;
    gesture.current = { key: positionKey(node), x: event.clientX, y: event.clientY, left: node.left, top: node.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    const drag = gesture.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    drag.moved = true; suppressClick.current = true;
    drag.position = { key: drag.key, left: align(drag.left + (event.clientX - drag.x) / zoom), top: align(drag.top + (event.clientY - drag.y) / zoom) };
    setDragPosition(drag.position);
  };
  const endDrag = (event, cancel = false) => {
    const drag = gesture.current; gesture.current = null;
    if (drag?.moved && !cancel) commit(drag.key, drag.position.left, drag.position.top);
    setDragPosition(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const fit = () => {
    const left = Math.min(...layout.nodes.map(n => n.left)), top = Math.min(...layout.nodes.map(n => n.top));
    const width = Math.max(...layout.nodes.map(n => n.left + 260)) - left;
    const height = Math.max(...layout.nodes.map(n => n.top + 140)) - top;
    const availableHeight = Math.max(160, container.current.clientHeight - 100);
    const value = Math.min(1, (container.current.clientWidth - 64) / width, (availableHeight - 48) / height);
    moveCamera({ x: (container.current.clientWidth - width * value) / 2 - left * value, y: (availableHeight - height * value) / 2 - top * value }, value);
  };
  return <section className="tree-view">
    <div className="tree-intro"><div><h1>科研树 <span>{doc.phases.length} 个研究节点</span></h1><p>拖动空白处平移画布，拖动卡片调整位置；点击卡片查看记录；Ctrl + 滚轮缩放。</p></div><button className="button primary" onClick={() => onAdd(null)}><Plus size={18} />添加研究节点</button></div>
    <div className="tree-legend">{Object.keys(PROGRESS).map((key) => <ProgressBadge key={key} value={key} />)}<span>颜色表示研究进展，结论判定单独保留</span></div>
    {actionMessage && <p className="tree-action-message" role="status">{actionMessage}</p>}
    <div className={`tree-canvas ${isPanning ? 'panning' : ''}`} style={{ backgroundSize: `${20 * zoom}px ${20 * zoom}px`, backgroundPosition: `${pan.x - 10 * zoom}px ${pan.y - 10 * zoom}px` }} ref={container} tabIndex={0} aria-label="科研树画布，拖动空白处或使用方向键平移"
      onPointerDown={(e) => { if (e.button !== 0 || e.target.closest('.topic-node')) return; panning.current = { x: e.clientX, y: e.clientY, origin: pan }; setIsPanning(true); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const start = panning.current; if (start) moveCamera({ x: start.origin.x + e.clientX - start.x, y: start.origin.y + e.clientY - start.y }); }}
      onPointerUp={(e) => { if (!panning.current) return; panning.current = null; setIsPanning(false); e.currentTarget.releasePointerCapture(e.pointerId); }}
      onLostPointerCapture={() => { panning.current = null; setIsPanning(false); }}
      onPointerCancel={() => { panning.current = null; setIsPanning(false); }}
      onKeyDown={(e) => { if (e.target !== e.currentTarget) return; const offsets = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }; if (offsets[e.key]) { e.preventDefault(); moveCamera({ x: pan.x + offsets[e.key][0], y: pan.y + offsets[e.key][1] }); } }}>
        <div className="tree-paper" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <svg width="1" height="1" style={{ overflow: 'visible' }} aria-hidden="true">{layout.links.map(({ source, target }) => <path key={target.data.id} d={`M${source.left + 244},${source.top + 56} C${source.left + 278},${source.top + 56} ${target.left - 32},${target.top + 56} ${target.left},${target.top + 56}`} fill="none" stroke="var(--tree-line)" strokeWidth="1.7" />)}</svg>
          {layout.nodes.map((node) => {
            const isRoot = node.depth === 0;
            const records = isRoot ? doc.stages : topicRecords(doc, node.data.id);
            const progress = progressOf(records, node.data.progress);
            return <article key={node.data.id} className={`topic-node ${isRoot ? 'root-node' : ''} ${dragPosition?.key === positionKey(node) ? 'dragging' : ''}`} data-progress={isRoot ? undefined : progress} data-position-key={positionKey(node)} onContextMenu={(e) => { e.preventDefault(); setMenu({ id: node.data.id, root: isRoot, title: node.data.title, x: e.clientX, y: e.clientY, trigger: e.currentTarget.querySelector('.node-main') }); }} style={{ left: node.left, top: node.top, '--node-color': PROGRESS[progress].color }}>
              <button className="node-main" title="拖动调整位置；Alt + 方向键微调；Esc 取消拖动" onPointerDown={(e) => startDrag(e, node)} onPointerMove={moveDrag} onPointerUp={(e) => endDrag(e)} onPointerCancel={(e) => endDrag(e, true)} onLostPointerCapture={(e) => { if (gesture.current) endDrag(e, true); }} onKeyDown={(e) => {
                if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const box = e.currentTarget.getBoundingClientRect(); setMenu({ id: node.data.id, root: isRoot, title: node.data.title, x: box.left + 20, y: box.top + 20, trigger: e.currentTarget }); }
                if (e.key === 'Escape' && gesture.current) { gesture.current = null; setDragPosition(null); suppressClick.current = true; e.preventDefault(); }
                if (e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const step = snap ? 20 : 1; commit(positionKey(node), align(node.left + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0)), align(node.top + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0))); }
              }} onClick={(e) => { if (suppressClick.current && e.detail !== 0) { suppressClick.current = false; return; } onOpen(isRoot ? 'all' : node.data.id); }}>
                <span className="node-overline">{isRoot ? <><GitBranch size={13} />主研究命题</> : <ProgressBadge value={progress} />}</span>
                <strong>{node.data.title}</strong><span className="node-count">{records.length} 篇记录 <ArrowUpRight size={13} /></span>
              </button>
              {!isRoot && <button className="icon-button node-edit" aria-label={`编辑节点 ${node.data.title}`} onClick={() => onEdit(node.data)}><Pencil size={13} /></button>}
              <button className="node-add" aria-label={`在 ${node.data.title} 下添加子节点`} onClick={() => onAdd(isRoot ? null : node.data.id)}><Plus size={12} /></button>
              <div className="node-popover"><b>{node.data.title}</b><p>{node.data.summary || '可编辑节点，补充当前进展与待解决的问题。'}</p><span>{records.filter((s) => s.worked).length} / {records.length} 篇记录的工作已做完</span><p>下一步：{chronological(records).findLast?.((s) => s.nextStep)?.nextStep || '尚未填写'}</p></div>
            </article>;
          })}
        </div>
    </div>
    <div className="canvas-toolbar"><button className="icon-button" aria-label="缩小科研树" disabled={zoom <= .15} onClick={() => changeZoom(zoom - .1)}><Minus size={17} /></button><span>{Math.round(zoom * 100)}%</span><button className="icon-button" aria-label="放大科研树" disabled={zoom >= 2.5} onClick={() => changeZoom(zoom + .1)}><Plus size={17} /></button><i /><label className="tree-snap"><input type="checkbox" checked={snap} onChange={(e) => update((p) => ({ ...p, treeLayout: { ...p.treeLayout, snap: e.target.checked } }))} />网格吸附</label><button className="button quiet" disabled={!Object.keys(doc.treeLayout?.positions || {}).length} onClick={() => update((p) => ({ ...p, treeLayout: { ...p.treeLayout, positions: {} } }))}>自动排列</button><button className="button quiet" onClick={fit}><Maximize size={16} />适配全图</button></div>
    {menu && <TopicMenu menu={menu} onClose={() => setMenu(null)} onOpen={() => onOpen(menu.root ? 'all' : menu.id)} onEdit={() => onEdit(doc.phases.find((p) => p.id === menu.id))} onAdd={() => onAdd(menu.root ? null : menu.id)} onCopy={() => {
      const positions = Object.fromEntries(layout.nodes.map((n) => [positionKey(n), { left: n.left, top: n.top }]));
      update((p) => copyTopic(p, menu.id, positions)); setActionMessage('已复制节点卡片，左侧分类与代码关联已同步；可通过顶部撤销恢复。');
    }} onDelete={() => setDeletingId(menu.id)} />}
    {deletingId && <DeleteTopicDialog doc={doc} id={deletingId} onClose={() => setDeletingId(null)} onDelete={(destination) => { update((p) => deleteTopic(p, deletingId, destination)); setDeletingId(null); setActionMessage('节点已删除，记录已保留，分类和关联已同步。可通过顶部撤销恢复。'); }} />}
  </section>;
}
