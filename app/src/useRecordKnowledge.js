import { useEffect, useRef, useState } from 'react';
import { desktop, notebookFetch } from './core/desktop.js';
import { applyKnowledge, buildKnowledgeRequest, recordKey, validateKnowledgeResult, knowledgeContextKey } from './core/recordKnowledge.js';

export default function useRecordKnowledge(workspace) {
  const latest = useRef(workspace); latest.current = workspace;
  const [jobs, setJobs] = useState({});
  const queue = useRef(Promise.resolve()), tasks = useRef(new Map());
  useEffect(() => () => { for (const task of tasks.current.values()) task.abort(); }, []);
  const cancel = (projectId, recordId) => { tasks.current.get(`${projectId}:${recordId}`)?.abort(); };
  const analyze = (projectId, recordId, automatic = false) => {
    const id = `${projectId}:${recordId}`, controller = new AbortController();
    cancel(projectId, recordId); tasks.current.set(id, controller);
    setJobs((old) => ({ ...old, [id]: { busy: true, message: '等待关联分析…' } }));
    const run = async () => {
      let timer;
      const report = (job) => { if (tasks.current.get(id) === controller) setJobs((old) => ({ ...old, [id]: job })); };
      try {
        if (controller.signal.aborted) { report({}); return; }
        const doc = latest.current.getProject(projectId), record = doc?.stages.find((r) => r.id === recordId);
        if (!record || (automatic && doc.knowledgeSettings?.autoAnalyze === false)) { report({}); return; }
        const key = recordKey(record), request = buildKnowledgeRequest(record, doc);
        if (automatic && record.knowledge?.contentKey === key && record.knowledge.contextKey === knowledgeContextKey(request)) { report({ message: '内容与候选未变化，沿用已有分析。' }); return; }
        timer = setTimeout(() => controller.abort(), 125000);
        const configResponse = await notebookFetch('/api/architecture/config', { signal: controller.signal });
        if (!configResponse.ok) throw new Error('本地 AI 服务不可用，请使用启动器重新启动。');
        const config = await configResponse.json();
        if (!config.configured) throw new Error(desktop ? '尚未配置 DeepSeek。请在右上角“软件设置”中填写 API Key，再重新匹配。' : '尚未配置 DeepSeek。请在 app/.env.local 填入 DEEPSEEK_API_KEY，重启后重试。');
        report({ busy: true, message: '正在匹配研究节点、记录与代码模块…' });
        const response = await notebookFetch('/api/architecture/record', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notebook-Token': config.token }, body: JSON.stringify(request), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '关联分析失败，请稍后重试。');
        const result = validateKnowledgeResult(data, request);
        if (controller.signal.aborted) return;
        let applied = false;
        latest.current.updateProject(projectId, (p) => { if (automatic && p.knowledgeSettings?.autoAnalyze === false) return p; const next = applyKnowledge(p, recordId, key, { ...result, model: data.model }); applied = next !== p; return next; });
        report({ message: applied ? '关联已更新；主题相似的结果保留为待确认建议。' : '记录或候选上下文已变化，本次结果未应用；请重新匹配。' });
      } catch (error) { report({ error: controller.signal.aborted ? '关联已取消或超时。记录已保存，可重新匹配。' : error.message }); }
      finally { clearTimeout(timer); if (tasks.current.get(id) === controller) tasks.current.delete(id); }
    };
    queue.current = queue.current.then(run, run);
  };
  return { analyze, cancel, job: (projectId, recordId) => jobs[`${projectId}:${recordId}`] || {} };
}
