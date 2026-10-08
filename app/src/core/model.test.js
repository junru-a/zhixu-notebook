import { describe, expect, it } from 'vitest';
import {
  STATUS, FLOW, STATUS_KEYS, FLOW_KEYS, OPEN_STATUS_KEYS, CLOSED_STATUS_KEYS,
  createStage, createDocument, createPhase, validateStage,
  groupByPhase, openStages, closedStages, stagesByFlow, summarize,
  stageSortKey, splitRounds, convertMath, stageIdsOf, importRawRecord,
  pickStage, mergeDocument,
} from './model.js';

const NOW = new Date(2026, 9, 7, 10, 0, 0);

describe('三条轴：判定 / 工作 / 流程 必须互相独立', () => {
  it('判定词表含 未认证 与 尚未认证 且语义分开', () => {
    console.log('【判定词表】', STATUS_KEYS.join(' / '));
    expect(STATUS_KEYS).toContain('unverified');   // 未认证
    expect(STATUS_KEYS).toContain('not_yet');      // 尚未认证
    // 关键：两者含义不同，不能合并
    expect(STATUS.unverified.note).toContain('不成立');
    expect(STATUS.not_yet.note).toContain('不是否定');
    // 未认证是终态（已被检验否定）；尚未认证不是终态（还要验）
    expect(STATUS.unverified.terminal).toBe(true);
    expect(STATUS.not_yet.terminal).toBe(false);
  });

  it('流程轴与判定轴没有重叠的语义（一个管服务器，一个管候选）', () => {
    const overlap = STATUS_KEYS.filter((k) => FLOW_KEYS.includes(k));
    expect(overlap).toEqual([]);
  });

  it('新建阶段默认：未开始 + 未做完 + 无需上传（三个默认各属一条轴）', () => {
    const s = createStage('pha_1', '测试');
    expect(s.status).toBe('not_started');
    expect(s.worked).toBe(false);
    expect(s.flow).toBe('no_upload');
  });

  it('"做完了但尚未认证"是合法且可统计的状态（不是异常）', () => {
    const doc = createDocument('t', { now: NOW });
    const id = doc.phases[0].id;
    doc.stages = [
      { ...createStage(id, 'A'), status: 'not_yet', worked: true },
      { ...createStage(id, 'B'), status: 'running', worked: true },
      { ...createStage(id, 'C'), status: 'passed', worked: true },
    ];
    const s = summarize(doc);
    console.log('【摘要】', JSON.stringify(s));
    // A、B 是"做完但没结论"；C 已通过不算
    expect(s.workedButUnresolved).toBe(2);
  });
});

describe('校验', () => {
  it('合法阶段无错误', () => {
    expect(validateStage(createStage('pha_1', 'x'))).toEqual([]);
  });
  it('非法 status 被拒', () => {
    expect(validateStage({ ...createStage('p', 'x'), status: '也许' }).join()).toContain('status');
  });
  it('worked 必须是布尔值而不是"true"字符串', () => {
    expect(validateStage({ ...createStage('p', 'x'), worked: 'true' }).join()).toContain('worked');
  });
  it('非法 flow 被拒', () => {
    expect(validateStage({ ...createStage('p', 'x'), flow: '随便' }).join()).toContain('flow');
  });
});

describe('阶段编号排序：TIME-2 要排在 TIME-10 前面', () => {
  it('数字部分按数值而不是字典序', () => {
    const ids = ['TIME-10', 'TIME-2', 'TIME-01', 'TIME-13', 'STEP-3'];
    const sorted = [...ids].sort((a, b) => stageSortKey(a).localeCompare(stageSortKey(b)));
    console.log('【排序】', sorted.join(' → '));
    expect(sorted.indexOf('TIME-2')).toBeLessThan(sorted.indexOf('TIME-10'));
    expect(sorted.indexOf('TIME-01')).toBeLessThan(sorted.indexOf('TIME-13'));
  });

  it('无编号的排最后', () => {
    const ids = ['TIME-01', '', 'TIME-02'];
    const sorted = [...ids].sort((a, b) => stageSortKey(a).localeCompare(stageSortKey(b)));
    expect(sorted[sorted.length - 1]).toBe('');
  });
});

describe('分组与筛选', () => {
  const doc = createDocument('研究', { now: NOW });
  const p1 = doc.phases[0].id;
  const p2 = createPhase(doc.research.id, '阶段二', { id: 'pha_2', order: 1 });
  doc.phases = [...doc.phases, p2];
  doc.stages = [
    { ...createStage(p1, 'A', { stageId: 'TIME-01' }), status: 'passed' },
    { ...createStage(p1, 'B', { stageId: 'TIME-02' }), status: 'running' },
    { ...createStage(p2.id, 'C', { stageId: 'TIME-03' }), status: 'failed' },
    { ...createStage(p2.id, 'D', { stageId: 'TIME-04' }), status: 'not_yet', flow: 'to_return' },
  ];

  it('按时期分组且组内按编号排序', () => {
    const g = groupByPhase(doc);
    console.log('【分组】', g.map((x) => `${x.phase.title}:${x.stages.map((s) => s.stageId).join(',')}`).join(' | '));
    expect(g.length).toBe(2);
    expect(g[0].stages.map((s) => s.stageId)).toEqual(['TIME-01', 'TIME-02']);
    expect(g[1].stages.map((s) => s.stageId)).toEqual(['TIME-03', 'TIME-04']);
  });

  it('"还没结论"与"已否掉"两组不重叠、覆盖恰当', () => {
    expect(openStages(doc).map((s) => s.title).sort()).toEqual(['B', 'D']);
    expect(closedStages(doc).map((s) => s.title).sort()).toEqual(['A', 'C']);
    const ids = new Set([...openStages(doc), ...closedStages(doc)].map((s) => s.id));
    expect(ids.size).toBe(4); // 无重复
  });

  it('按流程筛选（哪些还在等回传）', () => {
    expect(stagesByFlow(doc, 'to_return').map((s) => s.title)).toEqual(['D']);
  });

  it('分组保持时期的 order', () => {
    doc.phases = [p2, doc.phases[0]]; // 故意打乱存储顺序
    const g = groupByPhase(doc);
    expect(g[0].phase.title).toBe('阶段一'); // order 0 在前
  });
});

describe('原始记录拆分：边界是连续 >=3 空行', () => {
  it('单轮文本不拆', () => {
    expect(splitRounds('只有一轮\n\n内容').length).toBe(1);
  });

  it('3 个空行分轮，2 个不分', () => {
    const two = '第一轮\n\n\n\n第二轮';
    const one = '第一轮\n\n\n第二轮';   // 2 个空行
    console.log('【拆分】3空行→', splitRounds(two).length, '段; 2空行→', splitRounds(one).length, '段');
    expect(splitRounds(two).length).toBe(2);
    expect(splitRounds(one).length).toBe(1);
  });

  it('不把"加粗句开头"当边界（这正是第一版的 bug）', () => {
    // 同一轮里有多个加粗句，若用加粗当边界会被切成多段
    const text = '**第一句结论。** 说明一。\n\n**第二句结论。** 说明二。\n\n**第三句结论。** 说明三。';
    expect(splitRounds(text).length).toBe(1);
  });

  it('空输入返回空数组', () => {
    expect(splitRounds('')).toEqual([]);
    expect(splitRounds(null)).toEqual([]);
  });
});

describe('公式分隔符转换（\( \) 与 \[ \] → Obsidian/KaTeX 认的 $$ 与 $）', () => {
  it('独立公式转成 $$ 独占一行的三行式', () => {
    const out = convertMath('\\[\nx=1\n\\]');
    console.log('【块级转换】', JSON.stringify(out));
    expect(out).toBe('$$\nx=1\n$$');
  });

  it('行内公式转成 $...$ 且去掉内部换行', () => {
    const out = convertMath('设 \\(a +\nb\\) 为和');
    console.log('【行内转换】', JSON.stringify(out));
    expect(out).toBe('设 $a + b$ 为和');
  });

  it('空公式块不残留空行', () => {
    expect(convertMath('\\[\n\\]')).toBe('');
  });

  it('已经是 $ 形式的不受影响', () => {
    const s = '行内 $x$ 与块级\n$$\ny\n$$';
    expect(convertMath(s)).toBe(s);
  });
});

describe('阶段编号提取', () => {
  it('抓取所有出现的 TIME-xx 并去重', () => {
    const ids = stageIdsOf('本轮完成 TIME-07，接续 TIME-06 与 TIME-07');
    console.log('【提取】', ids.join(','));
    expect(ids).toEqual(['TIME-07', 'TIME-06']);
  });

  it('容忍不同写法', () => {
    expect(stageIdsOf('TIME 12')).toEqual(['TIME-12']);
    expect(stageIdsOf('TIME-3')).toEqual(['TIME-03']);
  });

  it('没有编号时返回空数组（不猜测）', () => {
    expect(stageIdsOf('这轮只是诊断收尾')).toEqual([]);
  });
});

describe('导入虚构测试文本', () => {
  const sample = [
    '**TIME-01 已通过。** 说明文字。',
    '',
    '含公式 \\(x_{k+1}=x_k\\) 与块级：',
    '',
    '\\[',
    'Q(x)=x+1',
    '\\]',
    '',
    '',
    '',
    '**本轮完成 TIME-03。** 第二阶段仍未完成。',
    '',
    '### 表格',
    '',
    '| 窗口 | 阶 |',
    '|---|---:|',
    '| 示例A | 0.50 |',
  ].join('\n');

  it('按空行组拆成 2 轮', () => {
    const doc = importRawRecord(sample, { researchTitle: 'T' });
    console.log('【导入】轮数 =', doc.stages.length);
    expect(doc.stages.length).toBe(2);
  });

  it('标题按轮次命名（不用 40 字长句当标题）', () => {
    const doc = importRawRecord(sample, { researchTitle: 'T' });
    console.log('【标题】', doc.stages.map((s) => s.title).join(' | '));
    expect(doc.stages[0].title).toBe('第 1 轮');
  });

  it('stageId 取该轮正文里最后一个 TIME 编号', () => {
    const doc = importRawRecord(sample, { researchTitle: 'T' });
    // 第 1 轮只提到 TIME-01；第 2 轮提到 TIME-03
    expect(doc.stages[0].stageId).toBe('TIME-01');
    expect(doc.stages[1].stageId).toBe('TIME-03');
  });

  it('公式已转换为 KaTeX 可渲染形式', () => {
    const doc = importRawRecord(sample, { researchTitle: 'T' });
    const body = doc.stages[0].body;
    console.log('【公式】', body.slice(0, 120).replace(/\n/g, '⏎'));
    expect(body).toContain('$x_{k+1}=x_k$');
    expect(body).toContain('$$\nQ(x)');
    expect(body).not.toContain('\\[');
    expect(body).not.toContain('\\(');
  });

  it('保留原文提到的全部编号（用于后续交叉引用）', () => {
    const doc = importRawRecord(sample, { researchTitle: 'T' });
    expect(doc.stages[0].mentionedStageIds).toEqual(['TIME-01']);
  });

  it('导入后每轮都是"未开始 + 未做完"（判定不替用户猜）', () => {
    const doc = importRawRecord(sample, { researchTitle: 'T' });
    for (const s of doc.stages) {
      expect(s.status).toBe('not_started');
      expect(s.worked).toBe(false);
    }
  });

  it('导入的阶段能通过校验', () => {
    const doc = importRawRecord(sample, { researchTitle: 'T' });
    for (const s of doc.stages) expect(validateStage(s)).toEqual([]);
  });
});

describe('合并（用于导入 JSON 不覆盖）', () => {
  it('同 id 取 updatedAt 较新者', () => {
    const a = { id: 'x', updatedAt: '2026-10-01T00:00:00Z', title: 'old' };
    const b = { id: 'x', updatedAt: '2026-10-02T00:00:00Z', title: 'new' };
    expect(pickStage(a, b).title).toBe('new');
    expect(pickStage(b, a).title).toBe('new');
  });

  it('updatedAt 并列时结果与顺序无关', () => {
    const a = { id: 'aaa', updatedAt: 'T', title: 'a' };
    const b = { id: 'bbb', updatedAt: 'T', title: 'b' };
    expect(pickStage(a, b).id).toBe(pickStage(b, a).id);
  });

  it('合并保留两侧独有的阶段', () => {
    const local = createDocument('L', { now: NOW });
    local.stages = [{ ...createStage(local.phases[0].id, 'local'), id: 's1', updatedAt: 'T1' }];
    const incoming = createDocument('R', { now: NOW });
    incoming.stages = [{ ...createStage(incoming.phases[0].id, 'remote'), id: 's2', updatedAt: 'T2' }];
    const merged = mergeDocument(local, incoming);
    console.log('【合并】', merged.stages.map((s) => s.id).join(','));
    expect(merged.stages.length).toBe(2);
  });

  it('合并是幂等的', () => {
    const a = createDocument('A', { now: NOW });
    a.stages = [{ ...createStage(a.phases[0].id, 'x'), id: 's1', updatedAt: 'T' }];
    const once = mergeDocument(a, a);
    const twice = mergeDocument(once, once);
    expect(twice.stages.length).toBe(once.stages.length);
  });
});
