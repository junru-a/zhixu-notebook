import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Scan, Minus, Plus } from 'lucide-react';
import './graph.css';

export function GraphWorkspace({ children, className = '', expanded, onExpandedChange, label }) {
  const root = useRef(null);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement;
    root.current?.querySelector('[data-expand-graph]')?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onExpandedChange(false); }
      if (event.key !== 'Tab') return;
      const items = [...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea,select,summary,[tabindex="0"]')].filter((el) => el.getClientRects().length);
      const index = items.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [expanded, onExpandedChange]);
  return <section ref={root} className={`graph-workspace ${className} ${expanded ? 'graph-expanded' : ''}`} role={expanded ? 'dialog' : 'region'} aria-modal={expanded || undefined} aria-label={label}>{children}</section>;
}

// Fit uses the real available area, including after expanding or resizing the window.
// Selection does not reset the camera; only changing the displayed graph does.
export default function GraphViewport({ width, height, resetKey, children, label, expanded, onExpandedChange }) {
  const viewport = useRef(null), drag = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState({ zoom: null, x: 0, y: 0 });
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => setCamera({ zoom: null, x: 0, y: 0 }), [resetKey, expanded]);
  const fit = Math.min(1, Math.max(1, size.width - 32) / width, Math.max(1, size.height - 32) / height);
  const zoom = camera.zoom ?? fit;
  const changeZoom = (value) => setCamera({ zoom: Math.max(Math.min(fit, .1), Math.min(2.5, value)), x: 0, y: 0 });
  const fitted = camera.zoom === null;
  useEffect(() => {
    const area = viewport.current;
    const wheel = (event) => {
      event.preventDefault();
      if (drag.current) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1;
      if (event.ctrlKey || event.metaKey) {
        const next = Math.max(Math.min(fit, .1), Math.min(2.5, zoom * Math.exp(-Math.max(-160, Math.min(160, event.deltaY * unit)) * .005)));
        const box = area.getBoundingClientRect(), x = event.clientX - box.left - size.width / 2, y = event.clientY - box.top - size.height / 2;
        setCamera({ zoom: next, x: x - (x - camera.x) * next / zoom, y: y - (y - camera.y) * next / zoom });
      } else setCamera({ zoom, x: camera.x - event.deltaX * unit, y: camera.y - event.deltaY * unit });
    };
    area.addEventListener('wheel', wheel, { passive: false });
    return () => area.removeEventListener('wheel', wheel);
  }, [camera, zoom, fit, size]);
  const fitAll = () => setCamera({ zoom: null, x: 0, y: 0 });
  const endDrag = (event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  return <div className="graph-viewer">
    <div className="graph-controls" aria-label={`${label}视图控制`}>
      <button className="button" onClick={fitAll} aria-pressed={fitted}><Scan size={15} />适配全图</button>
      <div className="graph-zoom-buttons"><button className="icon-button" aria-label={`${label}缩小`} onClick={() => changeZoom(zoom / 1.25)}><Minus size={16} /></button><output aria-label={`${label}缩放比例`}>{Math.round(zoom * 100)}%</output><button className="icon-button" aria-label={`${label}放大`} onClick={() => changeZoom(zoom * 1.25)}><Plus size={16} /></button></div>
      <button className="button quiet" onClick={() => changeZoom(1)}>原始大小</button>
      <button className="button graph-expand-button" data-expand-graph onClick={() => onExpandedChange(!expanded)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{expanded ? '收起视图' : '展开查看'}</button>
    </div>
    <div ref={viewport} className="graph-viewport" aria-label={label} data-fitted={fitted} onPointerDown={(event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      drag.current = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => { if (drag.current) setCamera({ zoom, x: drag.current.cameraX + event.clientX - drag.current.x, y: drag.current.cameraY + event.clientY - drag.current.y }); }} onPointerUp={endDrag} onPointerCancel={endDrag}
      onFocusCapture={(event) => {
        // Keyboard navigation reveals a node even when the user has zoomed in.
        if (!event.target.matches('button:focus-visible')) return;
        const node = event.target.getBoundingClientRect(), bounds = viewport.current.getBoundingClientRect();
        if (node.left < bounds.left || node.right > bounds.right || node.top < bounds.top || node.bottom > bounds.bottom) fitAll();
      }}>
      <div className="graph-world" style={{ width, height, visibility: size.width ? 'visible' : 'hidden', transform: `translate(${(size.width - width * zoom) / 2 + camera.x}px, ${(size.height - height * zoom) / 2 + camera.y}px) scale(${zoom})` }}>{children}</div>
    </div>
    <p className="graph-camera-hint">{fitted ? '已完整展示' : '拖动空白处平移 · 点击“适配全图”回到总览'} · Ctrl + 滚轮缩放 · 滚轮上下浏览{expanded ? ' · Esc 收起' : ''}</p>
  </div>;
}
