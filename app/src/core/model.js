// 科研记录模型：工作完成与科学判定分别记录。
export const SCHEMA_VERSION = 1;

// ── 判定：候选是否通过 ────────────────────────────────────────────────────────
export const STATUS = {
  not_started: { label: '未开始', tone: 'slate', terminal: false },
  running: { label: '进行中', tone: 'blue', terminal: false },
  passed: { label: '已通过', tone: 'green', terminal: true },
  partial: { label: '部分通过', tone: 'teal', terminal: false },
  unverified: { label: '未认证', tone: 'amber', terminal: true, note: '该性质已被检验，不成立' },
  not_yet: { label: '尚未认证', tone: 'orange', terminal: false, note: '还没验，不是否定' },
  deferred: { label: '暂缓', tone: 'purple', terminal: false },
  failed: { label: '未通过', tone: 'red', terminal: true },
  stopped: { label: '停止', tone: 'rose', terminal: true },
};

// ── 流程：服务器/交付走到哪（与判定完全无关的一条轴）──────────────────────────
export const FLOW = {
  no_upload: { label: '无需上传', tone: 'slate' },
  to_upload: { label: '待上传', tone: 'amber' },
  to_run: { label: '待运行', tone: 'blue' },
  to_return: { label: '待回传', tone: 'purple' },
  reviewed: { label: '已复核', tone: 'green' },
};

export const STATUS_KEYS = Object.keys(STATUS);
export const FLOW_KEYS = Object.keys(FLOW);

/** 通用科研记录辅助函数；不包含私人台账。 */
export const OPEN_STATUS_KEYS = ['not_started', 'running', 'partial', 'not_yet', 'deferred'];
/** 已终结、但必须保留的判定（失败/停止/否定）。 */
export const CLOSED_STATUS_KEYS = ['failed', 'stopped', 'unverified', 'passed'];

export const statusLabel = (k) => STATUS[k]?.label ?? k ?? '未开始';
export const flowLabel = (k) => FLOW[k]?.label ?? k ?? '无需上传';
export const statusTone = (k) => STATUS[k]?.tone ?? 'slate';

// ── id ────────────────────────────────────────────────────────────────────────
const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const makeId = (prefix, rand = Math.random) => {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHA[Math.floor(rand() * ALPHA.length)];
  return `${prefix}_${s}`;
};

// ── 阶段编号排序：TIME-02 要排在 TIME-10 前面 ─────────────────────────────────
export const stageSortKey = (stageId = '') => {
  const m = /([A-Za-z]+)[-_ ]?(\d+)/.exec(stageId);
  // 无编号的排最后：用 \uFFFF 而不是 \u0000 —— 后者会排到最前，
  // 让"没编号的草稿"抢在正式阶段之前，正好是反效果。
  if (!m) return `\uFFFF${stageId}`;
  return `${m[1].toUpperCase()}-${String(Number(m[2])).padStart(4, '0')}`;
};

// ── 构造 ──────────────────────────────────────────────────────────────────────
export const createResearch = (title, { id, now = new Date() } = {}) => ({
  id: id ?? makeId('res'),
  title,
  createdAt: now.toISOString(),
});

export const createPhase = (researchId, title, { id, order = 0, now = new Date() } = {}) => ({
  id: id ?? makeId('pha'),
  researchId,
  title,
  order,
  createdAt: now.toISOString(),
});

/** 通用科研记录辅助函数；不包含私人台账。 */
export const createStage = (phaseId, title, { id, stageId = '', now = new Date() } = {}) => ({
  id: id ?? makeId('stg'),
  phaseId,
  stageId,
  title,
  status: 'not_started',
  worked: false,
  flow: 'no_upload',
  body: '',
  nextStep: '',
  scope: '',          // 适用范围
  cannotInfer: '',    // 不能推出的结论
  gate: '',           // 准入条件 / 门控
  concluded: '',      // 结论日期
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

// ── 校验 ──────────────────────────────────────────────────────────────────────
export const validateStage = (s) => {
  const errors = [];
  if (!s || typeof s !== 'object') return ['stage 必须是对象'];
  if (!s.id) errors.push('id 缺失');
  if (!s.phaseId) errors.push('phaseId 缺失');
  if (typeof s.title !== 'string') errors.push('title 必须是字符串');
  if (!STATUS_KEYS.includes(s.status)) errors.push(`status 非法：${s.status}`);
  if (typeof s.worked !== 'boolean') errors.push('worked 必须是布尔值');
  if (!FLOW_KEYS.includes(s.flow)) errors.push(`flow 非法：${s.flow}`);
  return errors;
};

// ── 文档结构 ──────────────────────────────────────────────────────────────────
export const createDocument = (title = '我的研究', { now = new Date() } = {}) => {
  const research = createResearch(title, { now });
  const phase = createPhase(research.id, '阶段一', { now });
  return {
    schemaVersion: SCHEMA_VERSION,
    research,
    phases: [phase],
    stages: [],
  };
};

/** 按 id 合并两份 stage（取 updatedAt 较新者；并列时取 id 较大者，保证确定性）。 */
export const pickStage = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const ta = a.updatedAt ?? '';
  const tb = b.updatedAt ?? '';
  if (ta !== tb) return ta > tb ? a : b;
  return a.id >= b.id ? a : b;
};

export const mergeDocument = (local, incoming) => {
  if (!local) return incoming;
  if (!incoming) return local;
  const byId = new Map();
  for (const s of [...(local.stages ?? []), ...(incoming.stages ?? [])]) {
    if (!s?.id) continue;
    byId.set(s.id, pickStage(byId.get(s.id), s));
  }
  const phaseById = new Map();
  for (const p of [...(local.phases ?? []), ...(incoming.phases ?? [])]) {
    if (!p?.id) continue;
    if (!phaseById.has(p.id)) phaseById.set(p.id, p);
  }
  // research 取本地（标题以当前设备为准）
  return {
    schemaVersion: SCHEMA_VERSION,
    research: local.research ?? incoming.research,
    phases: [...phaseById.values()],
    stages: [...byId.values()],
  };
};

// ── 查询（界面的总览就是靠这些）───────────────────────────────────────────────
/** 把阶段按 phase 分组，组内按 stageId 排序。 */
export const groupByPhase = (doc) => {
  const { phases = [], stages = [] } = doc ?? {};
  return [...phases]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p) => ({
      phase: p,
      stages: stages
        .filter((s) => s.phaseId === p.id)
        .sort((a, b) => stageSortKey(a.stageId).localeCompare(stageSortKey(b.stageId))),
    }));
};

/** 需要盯的（还没结论的）。 */
export const openStages = (doc) =>
  (doc?.stages ?? []).filter((s) => OPEN_STATUS_KEYS.includes(s.status));

/** 已终结但必须保留的（失败/停止/否定/已通过）。 */
export const closedStages = (doc) =>
  (doc?.stages ?? []).filter((s) => CLOSED_STATUS_KEYS.includes(s.status));

/** 按流程状态筛选（"哪些还等着回传"）。 */
export const stagesByFlow = (doc, flowKey) =>
  (doc?.stages ?? []).filter((s) => s.flow === flowKey);

/** 总览统计：给仪表盘用。 */
export const summarize = (doc) => {
  const stages = doc?.stages ?? [];
  const byStatus = {};
  const byFlow = {};
  let worked = 0;
  for (const s of stages) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    byFlow[s.flow] = (byFlow[s.flow] ?? 0) + 1;
    if (s.worked) worked++;
  }
  return {
    total: stages.length,
    worked,
    notWorked: stages.length - worked,
    byStatus,
    byFlow,
    open: openStages(doc).length,
    closed: closedStages(doc).length,
    // "做了但还没结论" —— 这个数字是用户最该看的
    workedButUnresolved: stages.filter(
      (s) => s.worked && !STATUS[s.status]?.terminal,
    ).length,
  };
};

// ── 导入用户的原始记录 ────────────────────────────────────────────────────────
/** 通用科研记录辅助函数；不包含私人台账。 */
export const splitRounds = (text) => {
  const lines = String(text ?? '').split(/\r?\n/);
  const rounds = [];
  let buf = [];
  let blankRun = 0;
  const flush = () => {
    while (buf.length && buf[buf.length - 1].trim() === '') buf.pop();
    if (buf.some((x) => x.trim() !== '')) rounds.push(buf.join('\n'));
    buf = [];
  };
  for (const line of lines) {
    if (line.trim() === '') { blankRun++; buf.push(line); continue; }
    if (blankRun >= 3) flush();
    blankRun = 0;
    buf.push(line);
  }
  flush();
  return rounds;
};

/** 公式分隔符转换：LaTeX 标准 \[ \] \( \) → Obsidian/KaTeX 认的 $$ 与 $。 */
export const convertMath = (s) => String(s ?? '')
  .replace(/\\\[([\s\S]*?)\\\]/g, (_, body) => {
    const inner = body.trim();
    return inner ? `$$\n${inner}\n$$` : '';
  })
  .replace(/\\\(([\s\S]*?)\\\)/g, (_, body) => `$${body.replace(/\s+/g, ' ').trim()}$`);

/** 通用科研记录辅助函数；不包含私人台账。 */
export const stageIdsOf = (body) =>
  [...new Set(
    [...String(body).matchAll(/TIME[-–]?\s?(\d{1,2})/g)]
      .map((m) => `TIME-${String(Number(m[1])).padStart(2, '0')}`),
  )];

/** 取摘要：第一个加粗句，或首行。 */
export const summaryOf = (body) => {
  const b = String(body).match(/\*\*([^*]{8,})\*\*/);
  const raw = (b ? b[1] : String(body).split('\n')[0] ?? '').replace(/\s+/g, ' ').trim();
  return raw.length > 40 ? raw.slice(0, 40) + '…' : raw;
};

/**
 * 给导入的轮次起名。
 *
 * 刻意**不**用正文首句当标题 —— 那会得到 40 字的长标题，在树上被截断后
 * 每一轮看起来都一样。改为按"轮次 + 时期"命名，反而一眼能定位；
 * 真正的内容在正文里，点开就看得到。
 */
export const roundTitle = (round) => `第 ${round} 轮`;

/**
 * 把整份原始记录导入成文档：每轮一个 stage，全部放进一个新 phase。
 *
 * `stageId` 只在该轮正文里确实提到 TIME-xx 时才填，且取**最后一个**而不是第一个：
 * 一轮的记录通常以"本轮完成了 TIME-xx"收尾，末尾的编号才是这一轮对应的那一个。
 */
export const importRawRecord = (text, { researchTitle, phaseTitle = '导入记录', now = new Date() } = {}) => {
  const doc = createDocument(researchTitle ?? '导入的研究项目', { now });
  doc.phases[0].title = phaseTitle;
  const phaseId = doc.phases[0].id;
  doc.stages = splitRounds(text).map((raw, i) => {
    const round = i + 1;
    const body = convertMath(raw).trim();
    const ids = stageIdsOf(body);
    const st = createStage(phaseId, roundTitle(round), {
      id: `stg_import_${String(round).padStart(2, '0')}`,
      stageId: ids.length ? ids[ids.length - 1] : '',
      now,
    });
    st.body = body;
    st.importedFrom = '导入文本';
    st.round = round;
    st.mentionedStageIds = ids;
    // 把原首句留作备注线索，但不塞进标题
    st.leadSentence = summaryOf(body);
    return st;
  });
  return doc;
};
