import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from './Dialogs.jsx';
import { buildAnalysisRequest, validateAnalysisResult, analysisOptions, analysisCoverage } from '../core/architectureAI.js';
import { downloadText } from './ArchitectureGraph.jsx';
import { desktop, notebookFetch } from '../core/desktop.js';

export default function AnalysisDialog({ doc, architecture, contents, onClose, onResult, onOptions }) {
  const [options, setOptions] = useState(() => analysisOptions(architecture));
  const { sendCode, sendRecords, intent } = options;
  const selected = useMemo(() => new Set(options.selectedPaths), [options.selectedPaths]);
  const patchOptions = (patch) => { const next = { ...options, ...patch }; setOptions(next); onOptions(next); };
  const setSelected = (value) => patchOptions({ selectedPaths: [...(typeof value === 'function' ? value(selected) : value)] });
  const setSendCode = (sendCode) => patchOptions({ sendCode });
  const setSendRecords = (sendRecords) => patchOptions({ sendRecords });
  const setIntent = (intent) => patchOptions({ intent });
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef(null);
  const loadConfig = async () => {
    setError('');
    try { const response = await notebookFetch('/api/architecture/config'); if (!response.ok) throw new Error(); const value = await response.json(); if (typeof value.configured !== 'boolean') throw new Error(); setConfig(value); }
    catch { setError('本地分析服务未连接，请用启动脚本运行应用后重试。'); }
  };
  useEffect(() => { loadConfig(); return () => controller.current?.abort(); }, []);
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setElapsed((s) => s + 1), 1000); return () => clearInterval(timer); }, [busy]);
  const files = architecture.files.filter((f) => selected.has(f.path));
  const preview = useMemo(() => { try { return { payload: buildAnalysisRequest(doc, files, contents, { sendCode, sendRecords, intent }) }; } catch (err) { return { error: err.message }; } }, [doc, selected, contents, sendCode, sendRecords, intent]);
  const payload = preview.payload;
  const codeCount = payload?.files.filter((f) => f.excerpt != null).length || 0;
  const missing = sendCode ? files.filter((f) => !contents.has(f.path)).length : 0;
  const coverage = payload && analysisCoverage(payload, files, architecture.files.length);
  const toggle = (paths, checked) => setSelected((prev) => { const next = new Set(prev); for (const path of paths) checked ? next.add(path) : next.delete(path); return next; });
  const run = async () => {
    setBusy(true); setError(''); setElapsed(0); controller.current = new AbortController();
    try {
      const response = await notebookFetch('/api/architecture/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notebook-Token': config.token }, body: JSON.stringify(payload), signal: controller.current.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '分析请求失败，请重试。');
      const validated = validateAnalysisResult(data, payload);
      onResult({ ...validated, model: data.model, generatedAt: data.generatedAt, usage: data.usage, revision: architecture.revision, fileSnapshot: files.map((f) => ({ path: f.path, hash: f.hash || '' })), topicSnapshot: payload.topics.map((t) => ({ id: t.id })), coverage });
    } catch (err) { if (err.name !== 'AbortError') setError(err.message); }
    finally { setBusy(false); }
  };
  return <Dialog wide closeOnBackdrop={false} closeDisabled={busy} title="DeepSeek 架构分析" onClose={() => { if (!busy) onClose(); }}><div className="analysis-dialog-body">
    <p className="dialog-subtitle">分析范围与选项随项目保留，关闭后可继续设置。结果会先保存为待确认草稿。</p>
    {coverage && <section className="analysis-coverage" aria-label="分析覆盖范围"><b>这次分析能看到多少代码</b><div className="coverage-metrics"><span><strong>{coverage.selected} / {coverage.total}</strong>已选文件</span><span><strong>{coverage.code}</strong>源码片段</span><span><strong>{coverage.truncated}</strong>截断文件</span><span><strong>{coverage.characters.toLocaleString()}</strong>发送字符</span></div><p>{sendCode ? `短文件完整发送，长文件分段抽样${coverage.sourceCharacters == null ? '' : `，所选源文件共 ${coverage.sourceCharacters.toLocaleString()} 字符`}。` : '当前仅发送文件名、导入与符号，无法核查具体实现。'}覆盖范围不等于准确率；结果中的源码引文会逐条核对，关系含义仍需人工检查。</p></section>}
    <div className="ai-connection"><span className={`connection-dot ${config?.configured ? 'ready' : ''}`} /><b>{config ? config.configured ? `已配置 · ${config.model}` : '尚未配置 API Key' : '正在连接本地服务…'}</b><button className="button quiet" disabled={busy} onClick={loadConfig}>刷新连接</button></div>
    {!config?.configured && <div className="notice"><span>{desktop ? '请先关闭此窗口，在右上角“软件设置”中填写 DeepSeek API Key，保存后立即生效。密钥由 Windows 加密保护，不写入项目备份。' : <>在本机将 <code>app/.env.example</code> 复制为 <code>app/.env.local</code>，填写 <code>DEEPSEEK_API_KEY</code> 后重启应用。密钥保留在本地服务中，不写入浏览器或项目备份。</>}</span></div>}
    <fieldset disabled={busy} className="analysis-options"><legend>发送范围</legend><div className="analysis-selection-actions"><b>{files.length} / {architecture.files.length} 个文件</b><button type="button" onClick={() => setSelected(new Set(architecture.files.map((f) => f.path)))}>全选</button><button type="button" onClick={() => setSelected(new Set())}>清空</button><span>每次最多 300 个</span></div>
      <div className="analysis-file-list">{architecture.sources.map((source) => { const members = architecture.files.filter((f) => f.sourceId === source.id); return <details key={source.id} open={architecture.sources.length === 1}><summary><label onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={members.length > 0 && members.every((f) => selected.has(f.path))} onChange={(e) => toggle(members.map((f) => f.path), e.target.checked)} />{source.label} <small>{members.filter((f) => selected.has(f.path)).length} / {members.length}</small></label></summary>{members.map((f) => <label key={f.path}><input type="checkbox" checked={selected.has(f.path)} onChange={(e) => toggle([f.path], e.target.checked)} /><span>{f.path}</span></label>)}</details>; })}</div>
      <label className="check-line"><input type="checkbox" checked={sendCode} onChange={(e) => setSendCode(e.target.checked)} />发送源码片段，帮助理解模块职责</label><p className="field-hint">每个文件最多 6,000 字符，共享 180,000 字符预算；短文件完整发送，长文件抽取文件头、内部定义或调用附近及结尾，并明确标记省略段；路径、导入与符号一并发送。常见密钥会尝试遮盖，请在下方检查实际内容。</p>
      <label className="check-line"><input type="checkbox" checked={sendRecords} onChange={(e) => setSendRecords(e.target.checked)} />同时参考科研记录，生成语义关联建议</label><p className="field-hint">默认只包含最多 100 个研究节点的名称与摘要；勾选后每节点附最近添加的 5 条记录片段，每条最多 1,200 字符。</p>
      <label className="field">分析重点 <span className="optional">选填</span><textarea maxLength={2000} rows={2} placeholder="例如：重点分析训练入口、时间推进模型和评估脚本之间的数据流。" value={intent} onChange={(e) => setIntent(e.target.value)} /></label>
    </fieldset>
    {missing > 0 && <p className="notice">{missing} 个文件的源码不在当前页面内存中。请先回到目录列表“更新”重读，或取消“发送源码片段”仅分析索引。刷新页面后需重新读取源码。</p>}
    {payload && <details className="payload-preview"><summary>检查实际发送内容 · {codeCount} 个源码片段 · {Math.ceil(JSON.stringify(payload).length / 1024)} K 字符</summary><button className="button" onClick={() => downloadText('架构分析请求.json', JSON.stringify(payload, null, 2), 'application/json')}>下载本次请求</button><pre>{JSON.stringify(payload, null, 2)}</pre></details>}
    {(error || preview.error) && <p className="notice error" role="alert">{error || preview.error}</p>}
    <footer className="dialog-actions"><span className="field-hint" role="status">{busy ? `正在分析 · ${elapsed} 秒，关闭软件窗口可继续；中止请点击取消分析。` : '选项自动保留。仅点击开始后发送，按 DeepSeek 账户用量计费。'}</span><button className="button" onClick={() => { controller.current?.abort(); onClose(); }}>{busy ? '取消分析' : '关闭并保留设置'}</button><button className="button primary" disabled={busy || !config?.configured || !payload || missing > 0} onClick={run}>发送并开始分析</button></footer>
  </div></Dialog>;
}
