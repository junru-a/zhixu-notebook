import { describe, expect, it } from 'vitest';
import { applyKnowledge, buildKnowledgeRequest, deleteRecord, inferProgress, pinWikiLinks, recordKey, recordLinks, resolveWiki, setLinkDecision, validateKnowledgeRequest, validateKnowledgeResult } from './recordKnowledge.js';
import { newProject, normalizeProject, topicRecords, progressOf } from './workspace.js';
import { createPhase, createStage } from './model.js';
import { extractWikiTargets, renderMarkdown } from './markdown.js';

const fixture = () => {
  const doc = newProject('Test');
  doc.phases.push(createPhase(doc.research.id, '时间推进'));
  doc.stages = [createStage(doc.phases[0].id, '基线'), createStage(doc.phases[0].id, '实验')];
  doc.stages[1].body = '本轮已完成，复核基线实验，归入时间推进。';
  return doc;
};
describe('记录状态识别', () => {
  it.each([['已完成', 'done'], ['本轮未完成', 'active'], ['尚未开始', 'todo'], ['此结果需勘误', 'blocked'], ['没有发现问题', 'todo'], ['无需勘误', 'todo'], ['尚未完成', 'active'], ['下一步：完成全部实验', 'todo']])('%s -> %s', (body, value) => expect(inferProgress({ body }).value).toBe(value));
  it('区分当前阶段与后续计划，不将科学判定自动改写', () => {
    const r = { stageId: 'TIME-01', body: 'TIME-01 已通过，可以结项：第二阶段还没有完成重复测量。下一项应先检查样本。', status: 'not_started', worked: false };
    expect(inferProgress(r).value).toBe('done'); expect(r.status).toBe('not_started'); expect(r.worked).toBe(false);
    expect(inferProgress({ ...r, progress: 'blocked' }).value).toBe('blocked');
    expect(inferProgress({ ...r, status: 'failed', worked: true }).value).toBe('blocked');
  });
  it('汇总手动四色和自动状态', () => { expect(progressOf([{ body: '本轮已完成' }])).toBe('done'); expect(progressOf([{ progress: 'done' }, { progress: 'blocked' }])).toBe('blocked'); });
  it.each(['上一轮已完成', '不确定是否已完成', '并非已完成', '不能说已完成'])('不将引述或否定当成本轮完成：%s', (body) => expect(inferProgress({ body }).value).toBe('todo'));
});
describe('正文链接', () => {
  it('忽略代码、公式和普通 Markdown 链接内的伪引用', () => {
    expect(extractWikiTargets('[[甲|显示文字]] `[[乙]]`\n```js\n[[丙]]\n```\n$[[丁]]$\n[链接 [[戊]]](https://example.com)')).toEqual(['甲']);
  });
  it('重名不猜测，绑定编号后重命名仍可用，删除不串到同名记录', () => {
    const records = [{ id: 'a', title: '甲' }, { id: 'b', title: '甲' }];
    expect(resolveWiki('甲', records)).toBe(null);
    const links = pinWikiLinks({ id: 'c', body: '[[a]]' }, records);
    expect(resolveWiki('a', [{ id: 'a', title: '新标题' }], links)).toBe('a');
    expect(resolveWiki('a', [{ id: 'b', title: 'a' }], links)).toBe(null);
  });
  it('渲染安全按钮和未解析提示，不允许 HTML 注入', () => {
    const html = renderMarkdown('[[甲|<img src=x onerror=alert(1)>]]', { resolveWiki: () => 'x" onclick="bad' });
    expect(html).toContain('&lt;img'); expect(html).toContain('&quot;'); expect(html).not.toContain('<img');
    expect(renderMarkdown('[[不存在]]')).toContain('unresolved');
  });
});
describe('AI 关联及生命周期', () => {
  const resultFor = (doc) => ({ summary: '匹配到研究方向和前期记录', progress: { value: 'done', confidence: .96, reason: '明确完成', evidence: '本轮已完成' }, links: [{ type: 'topic', targetId: doc.phases[1].id, confidence: .96, reason: '显式归属方向', evidence: '归入时间推进', targetEvidence: '时间推进' }, { type: 'record', targetId: doc.stages[0].id, confidence: .7, reason: '提到前期基线', evidence: '基线实验' }] });
  it('只将高置信度且具有原文证据的关联自动接入树', () => {
    const doc = fixture(), record = doc.stages[1], request = buildKnowledgeRequest(record, doc);
    const result = validateKnowledgeResult(resultFor(doc), request);
    expect(result.links.map((l) => l.decision)).toEqual(['accepted', 'suggested']);
    const next = applyKnowledge(doc, record.id, recordKey(record), result);
    expect(topicRecords(next, doc.phases[1].id).map((r) => r.id)).toEqual([record.id]);
    expect(recordLinks(next.stages[1], next).some((l) => l.type === 'record')).toBe(false);
    expect(normalizeProject(next).stages[1].knowledge.links).toHaveLength(2);
  });
  it('伪造 evidence 降为建议；无效/跨项目目标或重复项拒绝', () => {
    const doc = fixture(), req = buildKnowledgeRequest(doc.stages[1], doc), raw = resultFor(doc);
    raw.links[0].evidence = '不存在于记录中的证据'; expect(validateKnowledgeResult(raw, req).links[0].decision).toBe('suggested');
    raw.links[0].targetId = 'another-project'; expect(() => validateKnowledgeResult(raw, req)).toThrow();
    raw.links = [raw.links[1], raw.links[1]]; expect(() => validateKnowledgeResult(raw, req)).toThrow();
  });
  it('旧回复不能覆盖新内容或复活已删除记录', () => {
    const doc = fixture(), r = doc.stages[1], key = recordKey(r), result = validateKnowledgeResult(resultFor(doc), buildKnowledgeRequest(r, doc));
    doc.stages[1] = { ...r, body: '新一轮实验' };
    expect(applyKnowledge(doc, r.id, key, result)).toBe(doc);
    const removed = deleteRecord(doc, r.id); expect(applyKnowledge(removed, r.id, key, result)).toBe(removed);
  });
  it('手动确认跨内容修改保留；移除的 AI 建议不在下一次自动恢复', () => {
    let doc = fixture(), r = doc.stages[1];
    const result = validateKnowledgeResult(resultFor(doc), buildKnowledgeRequest(r, doc));
    doc = applyKnowledge(doc, r.id, recordKey(r), result); r = doc.stages[1];
    r = setLinkDecision(r, result.links[1], 'accepted');
    r = setLinkDecision(r, result.links[0], 'dismissed');
    doc.stages[1] = { ...r, body: `${r.body}\n更多观察。` };
    expect(recordLinks(doc.stages[1], doc).some((l) => l.type === 'record')).toBe(true);
    doc = applyKnowledge(doc, r.id, recordKey(doc.stages[1]), result);
    expect(doc.stages[1].knowledge.links[0].decision).toBe('dismissed');
  });
  it('删除目标清理手动和 AI 引用，保留正文', () => {
    let doc = fixture(); doc.stages[1].relatedIds = [doc.stages[0].id]; doc.stages[1].body = '[[基线]]'; doc.stages[1].wikiLinks = pinWikiLinks(doc.stages[1], doc.stages);
    const removed = deleteRecord(doc, doc.stages[0].id);
    expect(recordLinks(removed.stages[0], removed).filter((l) => l.type === 'record')).toHaveLength(0);
    expect(removed.stages[0].body).toBe('[[基线]]');
  });
  it('未调用 AI 也能手动建立、保存和重新加载关联', () => {
    const doc = fixture();
    doc.stages[1] = setLinkDecision(doc.stages[1], { type: 'topic', targetId: doc.phases[1].id }, 'accepted');
    const restored = normalizeProject(JSON.parse(JSON.stringify(doc)));
    expect(topicRecords(restored, doc.phases[1].id)).toHaveLength(1);
  });
  it('限制候选与输入长度并脱敏；损坏备份不进入渲染', () => {
    const doc = fixture(); doc.stages[1].body = `api_key = 'sk-testsecret1234567890123456789'\n${'x'.repeat(45000)}`;
    const req = buildKnowledgeRequest(doc.stages[1], doc);
    expect(req.record.text.length).toBeLessThanOrEqual(40000); expect(req.record.text).not.toContain('sk-testsecret');
    expect(() => validateKnowledgeRequest(req)).not.toThrow();
    expect(() => validateKnowledgeRequest({ ...req, modules: [{}] })).toThrow();
    doc.stages[1].knowledge = { contentKey: 'x', summary: '', links: 'broken' }; expect(() => normalizeProject(doc)).toThrow('AI 关联');
  });
});
