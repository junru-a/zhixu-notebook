export const ANALYSIS_LIMITS = { files: 300, characters: 180000, excerpt: 6000, nodes: 30, edges: 60 };
export function analysisCoverage(payload, files, total) {
  const known = files.every((f) => Number.isInteger(f.characterCount) && f.characterCount >= 0);
  return { selected: files.length, total, code: payload.files.filter((f) => f.excerpt != null).length,
    truncated: payload.files.filter((f) => f.truncated).length,
    characters: payload.files.reduce((sum, f) => sum + (f.excerpt?.length || 0), 0),
    sourceCharacters: known ? files.reduce((sum, f) => sum + f.characterCount, 0) : null,
    records: payload.topics.reduce((sum, t) => sum + t.records.length, 0) };
}

export function analysisOptions(architecture) {
  const saved = architecture.analysisDraft;
  return { selectedPaths: saved ? saved.selectedPaths.filter((path) => architecture.files.some((f) => f.path === path)) : architecture.files.map((f) => f.path),
    sendCode: saved?.sendCode ?? true, sendRecords: saved?.sendRecords ?? false, intent: saved?.intent || '' };
}
const text = (value, max, field, allowEmpty = false) => {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new Error(`${field}格式有误`);
  return value.trim();
};
const list = (value, max, field) => {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${field}数量或格式有误`);
  return value;
};

// Best effort only; the user can inspect the exact outgoing JSON before sending.
export function redactSecrets(content) {
  return content.replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, '[已遮盖密钥]')
    .replace(/((?:api[_-]?key|secret|password|access[_-]?token)\s*["']?\s*[:=]\s*["'])[^"'\n]+(["'])/gi, '$1[已遮盖]$2')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, value => '[已遮盖私钥]' + '\n'.repeat((value.match(/\n/g) || []).length));
}

export function sourceExcerpt(content, quota, onRanges = () => {}) {
  // ponytail: heuristic windows omit code; replace with syntax-aware dependency retrieval when full call tracing is required.
  const safe = redactSecrets(content);
  const report = ranges => onRanges(ranges.filter(([start, end]) => end > start).map(([start, end]) => ({ startLine: safe.slice(0, start).split('\n').length, endLine: safe.slice(0, end - 1).split('\n').length })));
  if (safe.length <= quota) { report([[0, safe.length]]); return safe; }
  const lines = safe.split('\n');
  if (lines.length < 4 || quota < 160) { report([[0, quota]]); return safe.slice(0, quota); }
  const marker = '\n… [中间源码省略，不代表连续执行] …\n';
  const budget = quota - marker.length * 2;
  const head = Math.floor(budget * .3), tail = Math.floor(budget * .2), middle = budget - head - tail;
  // Preserve a meaningful interior definition/call window, instead of spending
  // all of a large project's budget on file headers and imports.
  const pattern = /(?:^\s*(?:async\s+)?(?:def|class|function|subroutine|program|module)\s|if\s+__name__|\b(?:forward|train|step|solve|predict|backward)\s*\()/im;
  const interior = safe.slice(head, safe.length - tail);
  const match = pattern.exec(interior);
  const start = match ? Math.max(0, match.index - 80) : Math.max(0, Math.floor((interior.length - middle) / 2));
  report([[0, head], [head + start, Math.min(head + start + middle, safe.length - tail)], [safe.length - tail, safe.length]]);
  return (safe.slice(0, head) + marker + interior.slice(start, start + middle) + marker + safe.slice(-tail)).slice(0, quota);
}

export function buildAnalysisRequest(doc, files, contents, { sendCode = true, sendRecords = false, intent = '' } = {}) {
  if (!files.length) throw new Error('请至少选择一个文件。');
  if (files.length > ANALYSIS_LIMITS.files) throw new Error('单次最多分析 300 个文件，请取消部分文件后分批分析。');
  const quotas = new Map(); let remaining = ANALYSIS_LIMITS.characters;
  const available = files.filter((f) => typeof contents.get(f.path) === 'string').sort((a, b) => contents.get(a.path).length - contents.get(b.path).length);
  available.forEach((file, i) => { const quota = Math.min(ANALYSIS_LIMITS.excerpt, contents.get(file.path).length, Math.floor(remaining / (available.length - i))); quotas.set(file.path, quota); remaining -= quota; });
  const payload = {
    projectTitle: doc.research.title.slice(0, 200), intent: intent.slice(0, 2000),
    files: files.map((file) => {
      const content = contents.get(file.path);
      const quota = quotas.get(file.path) || 0;
      const excerptRanges = [];
      const excerpt = sendCode && typeof content === 'string' ? sourceExcerpt(content, quota, ranges => excerptRanges.push(...ranges)) : null;
      return { path: file.path, imports: file.imports, symbols: file.symbols,
        ...(excerpt != null ? { excerpt, excerptRanges, truncated: content.length > quota } : {}) };
    }),
    topics: doc.phases.slice(0, 100).map((phase) => ({ id: phase.id, title: phase.title.slice(0, 200), summary: (phase.summary || '').slice(0, 800),
      records: sendRecords ? doc.stages.filter((s) => s.phaseId === phase.id).slice(-5).map((s) => ({ title: s.title.slice(0, 200), body: redactSecrets(s.body.slice(0, 1200)) })) : [] })),
  };
  return validateAnalysisRequest(payload);
}

export function validateAnalysisRequest(value) {
  const files = list(value?.files, 300, '文件').map((file) => ({
    path: text(file?.path, 600, '路径'),
    imports: list(file.imports, 40, '导入').map((s) => text(s, 600, '导入项', true)),
    symbols: list(file.symbols, 40, '符号').map((s) => text(s, 200, '符号', true)),
    ...(file.excerpt != null ? { excerpt: text(file.excerpt, 6000, '源码片段', true), truncated: !!file.truncated,
      ...(file.excerptRanges ? { excerptRanges: list(file.excerptRanges, 3, '源码行号').map(range => { if (!Number.isInteger(range.startLine) || !Number.isInteger(range.endLine) || range.startLine < 1 || range.endLine < range.startLine) throw new Error('源码行号格式有误'); return range; }) } : {}) } : {}),
  }));
  if (!files.length || new Set(files.map((f) => f.path)).size !== files.length) throw new Error('请选择有效且不重复的文件。');
  if (files.reduce((sum, f) => sum + (f.excerpt?.length || 0), 0) > 180000) throw new Error('源码片段总量超过限制。');
  const topics = list(value.topics, 100, '研究节点').map((p) => ({ id: text(p?.id, 200, '节点编号'), title: text(p.title, 200, '节点标题'), summary: text(p.summary, 800, '节点摘要', true), records: list(p.records, 5, '记录').map((r) => ({ title: text(r?.title, 200, '记录标题'), body: text(r.body, 1200, '记录正文', true) })) }));
  return { projectTitle: text(value.projectTitle, 200, '项目名称'), intent: text(value.intent, 2000, '分析重点', true), files, topics };
}

export function validateAnalysisResult(value, request) {
  const paths = new Set(request.files.map((f) => f.path));
  const phaseIds = new Set(request.topics.map((p) => p.id));
  const ids = new Set();
  const nodes = list(value?.nodes, 30, '模块').map((node) => {
    const id = text(node?.id, 80, '模块编号');
    if (ids.has(id)) throw new Error('AI 返回了重复模块编号。');
    ids.add(id);
    const files = [...new Set(list(node.files, 100, '模块依据').map((path) => text(path, 600, '文件依据')))];
    if (!files.length || files.some((path) => !paths.has(path))) throw new Error('AI 引用了本次分析范围之外的文件，请重试。');
    const kind = ['entry', 'data', 'model', 'training', 'evaluation', 'other'].includes(node.kind) ? node.kind : 'other';
    return { id, label: text(node.label, 80, '模块名称'), summary: text(node.summary, 1500, '模块说明', true), kind, files };
  });
  if (!nodes.length) throw new Error('AI 未返回可用模块。');
  const edges = list(value.edges, 60, '连线').map((edge) => {
    if (!ids.has(edge?.source) || !ids.has(edge?.target) || edge.source === edge.target) throw new Error('AI 返回了无效的模块连线。');
    const normalize = (s) => s.replace(/\s+/g, ' ').trim();
    const involved = new Set(nodes.filter((n) => n.id === edge.source || n.id === edge.target).flatMap((n) => n.files));
    const citations = list(edge.citations || [], 6, '源码引文').map((citation) => {
      const path = text(citation?.path, 600, '引文路径'), quote = text(citation?.quote, 800, '源码引文');
      const source = request.files.find((f) => f.path === path)?.excerpt;
      const verified = involved.has(path) && normalize(quote).length >= 8 && typeof source === 'string' && normalize(source).includes(normalize(quote));
      return { path, quote, verified };
    });
    // A matching quotation proves that the text exists, not that the inferred
    // relationship is semantically correct. Never use a model's own confidence
    // as an accuracy score.
    return { source: edge.source, target: edge.target, label: text(edge.label, 100, '连线说明'), evidence: text(edge.evidence, 1000, '关系依据', true), citations,
      confidence: edge.confidence === 'supported' && citations.some((c) => c.verified) ? 'supported' : 'inferred' };
  });
  const suggestions = list(value.suggestions, 60, '研究关联建议').map((s) => {
    if (!ids.has(s?.nodeId) || !phaseIds.has(s?.phaseId)) throw new Error('AI 返回了无效的研究关联。');
    return { nodeId: s.nodeId, phaseId: s.phaseId, reason: text(s.reason, 800, '关联原因') };
  });
  return { title: text(value.title, 200, '图谱标题'), summary: text(value.summary, 3000, '架构概述', true), nodes, edges, suggestions, warnings: list(value.warnings, 20, '不确定项').map((s) => text(s, 1000, '不确定项')) };
}

export function graphMermaid(graph) {
  const escape = (value) => String(value).replace(/[&<>"\[\]{}|`#\\\r\n]/g, (c) => `#${c.charCodeAt(0)};`);
  const ids = new Map(graph.nodes.map((node, i) => [node.id, `n${i}`]));
  return ['flowchart LR', ...graph.nodes.map((node) => `  ${ids.get(node.id)}["${escape(node.label)}"]`), ...graph.edges.map((edge) => `  ${ids.get(edge.source)} ${edge.confidence === 'inferred' ? '-.' : '--'} "${escape(edge.label)}" ${edge.confidence === 'inferred' ? '.->' : '-->'} ${ids.get(edge.target)}`)].join('\n');
}
