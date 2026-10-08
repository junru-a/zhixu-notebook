import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Trash2, Pencil, Plus, ArrowUpRight } from 'lucide-react';
import { Dialog } from './Dialogs.jsx';

export function TopicMenu({ menu, onClose, onOpen, onEdit, onAdd, onCopy, onDelete }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current, bounds = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    el.querySelector('button')?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    const outside = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const close = () => onClose();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [onClose]);
  const action = (fn) => () => { onClose(); fn(); };
  return createPortal(<div ref={ref} className="topic-context-menu" role="menu" aria-label="研究节点快捷菜单" style={{ left: menu.x, top: menu.y }} onContextMenu={(e) => e.preventDefault()} onKeyDown={(e) => {
    const buttons = [...ref.current.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); onClose(); menu.trigger?.focus({ preventScroll: true }); }
    if (e.key === 'Tab') { onClose(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  }}><div className="topic-menu-title">{menu.title}</div><button role="menuitem" onClick={action(onOpen)}><ArrowUpRight size={15} />查看关联记录</button>{!menu.root && <button role="menuitem" onClick={action(onEdit)}><Pencil size={15} />编辑节点</button>}<button role="menuitem" onClick={action(onAdd)}><Plus size={15} />添加子节点</button>{!menu.root && <><hr /><button role="menuitem" onClick={action(onCopy)}><Copy size={15} />复制节点卡片</button><button role="menuitem" className="danger" onClick={action(onDelete)}><Trash2 size={15} />删除节点卡片</button><small>复制节点信息与代码关联，不复制记录或子节点。</small></>}{menu.root && <small>主研究命题对应整个项目，可在项目首页管理。</small>}</div>, document.body);
}

export function DeleteTopicDialog({ doc, id, onClose, onDelete }) {
  const node = doc.phases.find((p) => p.id === id);
  const [destination, setDestination] = useState(node?.parentId || '');
  if (!node) return null;
  const count = doc.stages.filter((r) => r.phaseId === id).length, children = doc.phases.filter((p) => p.parentId === id).length;
  const parent = doc.phases.find((p) => p.id === node.parentId);
  return <Dialog title="删除研究节点" onClose={onClose}><div className="delete-topic-body"><p>删除“<b>{node.title}</b>”的节点卡片。</p><ul><li>{children ? `${children} 个直接子节点将移到${parent ? `“${parent.title}”` : '主研究命题'}下面，保留各自的记录。` : '没有子节点。'}</li><li>{count ? `该节点的 ${count} 篇记录全部保留，转入下方选择的分类。` : '该节点没有直接所属的记录。'}</li><li>左侧分类、知识网络、自动关联建议和画布位置同步更新；删除指向此节点的关联。</li></ul>{count > 0 && <label className="field">记录转入<select value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">新建“未分类记录”节点</option>{doc.phases.filter((p) => p.id !== id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}<p className="muted">可通过顶部“撤销”恢复节点、位置及关联。</p><footer className="dialog-actions"><button className="button" onClick={onClose}>取消</button><button className="button danger" onClick={() => onDelete(destination)}>确认删除节点</button></footer></div></Dialog>;
}
