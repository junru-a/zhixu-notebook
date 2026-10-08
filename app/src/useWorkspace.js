import { useRef, useState } from 'react';
import { loadWorkspace, saveWorkspace, parseWorkspace, mergeWorkspaces, WORKSPACE_KEY } from './core/workspace.js';
import { workspaceStorage } from './core/desktop.js';
import { refreshWikiBindings } from './core/recordKnowledge.js';

export default function useWorkspace() {
  const [state, setState] = useState(() => {
    try { return loadWorkspace(workspaceStorage()); }
    catch { return { workspace: null, error: '浏览器存储不可用，无法读取记录。' }; }
  });
  const current = useRef(state.workspace);
  const history = useRef([]);
  const [revision, setRevision] = useState(0);
  const [savedAt, setSavedAt] = useState(null);

  const commit = (next, remember = true) => {
    if (remember && current.current) history.current = [...history.current.slice(-29), current.current];
    current.current = next;
    let error;
    try { error = saveWorkspace(workspaceStorage(), next); } catch { error = '保存失败，请导出当前备份。'; }
    setState({ workspace: next, error });
    setSavedAt(error ? null : new Date());
    setRevision((r) => r + 1);
  };
  return {
    ...state, revision, savedAt, canUndo: history.current.length > 0,
    getProject: (id) => current.current?.projects.find((p) => p.research.id === id),
    updateProject: (id, fn, remember = true) => {
      const projects = current.current.projects.map((p) => p.research.id === id ? refreshWikiBindings(fn(p), p) : p);
      if (projects.some((p, i) => p !== current.current.projects[i])) commit({ ...current.current, projects }, remember);
    },
    addProject: (project) => commit({ ...current.current, projects: [...current.current.projects, project] }),
    undo: () => { const previous = history.current.pop(); if (previous) commit(previous, false); },
    importBackup: (raw) => commit(mergeWorkspaces(current.current || { version: 2, projects: [] }, parseWorkspace(raw))),
    restore: () => {
      const raw = workspaceStorage().getItem(`${WORKSPACE_KEY}:prev`);
      if (!raw) throw new Error('没有可恢复的快照，请导入已有备份。');
      commit(parseWorkspace(raw));
    },
  };
}
