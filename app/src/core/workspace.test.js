import { describe, it, expect } from 'vitest';
import { createDocument, createStage, createPhase } from './model.js';
import { loadWorkspace, saveWorkspace, parseWorkspace, mergeWorkspaces, WORKSPACE_KEY, LEGACY_KEY, descendantIds, topicRecords, progressOf, chronological, createDemoProject } from './workspace.js';
import { analyzeFiles, matchingSuggestions } from './codeAnalysis.js';

const storage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};
const recordDoc = () => { const doc = createDocument('实验'); doc.stages.push(createStage(doc.phases[0].id, '基线实验')); return doc; };
describe('项目数据迁移、隔离和恢复', () => {
  it('迁移旧版单项目，不更改原始存储', () => {
    const s = storage(), doc = recordDoc(), raw = JSON.stringify(doc); s.setItem(LEGACY_KEY, raw);
    const loaded = loadWorkspace(s); expect(loaded.workspace.projects[0].stages[0].id).toBe(doc.stages[0].id);
    saveWorkspace(s, loaded.workspace); expect(s.getItem(LEGACY_KEY)).toBe(raw);
    expect(loadWorkspace(s).workspace.projects).toHaveLength(1);
  });
  it('损坏数据不被空项目覆盖', () => {
    const s = storage(); s.setItem(WORKSPACE_KEY, 'broken');
    expect(loadWorkspace(s).workspace).toBeNull(); expect(s.getItem(WORKSPACE_KEY)).toBe('broken');
  });
  it('恢复时不把损坏主文件写进恢复快照', () => {
    const s = storage(), data = { version: 2, projects: [recordDoc()] }; const raw = JSON.stringify(data);
    s.setItem(`${WORKSPACE_KEY}:prev`, raw); s.setItem(WORKSPACE_KEY, 'broken');
    expect(saveWorkspace(s, data)).toBe(''); expect(s.getItem(`${WORKSPACE_KEY}:prev`)).toBe(raw);
  });
  it('配额失败明确报告，不返回保存成功', () => {
    const s = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(saveWorkspace(s, { version: 2, projects: [] })).toContain('保存失败');
  });
  it('不同项目导入时保持隔离，同项目合并较新记录', () => {
    const a = recordDoc(), b = recordDoc(); const c = structuredClone(a); c.stages[0].title = '修订实验'; c.stages[0].updatedAt = '2099-01-01';
    const merged = mergeWorkspaces({ version: 2, projects: [a] }, { version: 2, projects: [b, c] });
    expect(merged.projects).toHaveLength(2); expect(merged.projects[0].stages[0].title).toBe('修订实验'); expect(merged.projects[1].stages[0].title).toBe('基线实验');
  });
  it('拒绝孤儿记录和循环父节点，避免记录丢失或递归崩溃', () => {
    const doc = recordDoc(); doc.stages[0].phaseId = 'missing'; expect(() => parseWorkspace(doc)).toThrow('所属节点');
    doc.stages[0].phaseId = doc.phases[0].id; doc.phases[0].parentId = doc.phases[0].id; expect(() => parseWorkspace(doc)).toThrow('循环');
  });
  it('导入导出保留程序结构、手动状态与代码关联', () => {
    const doc = recordDoc(); doc.phases[0].progress = 'done'; doc.phases[0].codePaths = ['src/train.py']; doc.architecture = { root: 'src', files: [] };
    const result = parseWorkspace(JSON.stringify({ version: 2, projects: [doc] })).projects[0];
    expect(result.architecture).toEqual(doc.architecture); expect(result.phases[0].codePaths).toEqual(['src/train.py']); expect(result.phases[0].progress).toBe('done');
  });
});
describe('树和时间线共用同一套记录', () => {
  it('父节点包括后代记录，其他分支不被混入', () => {
    const doc = recordDoc(), parent = doc.phases[0], child = { ...createPhase(doc.research.id, '子实验'), parentId: parent.id }, other = createPhase(doc.research.id, '其他实验');
    doc.phases.push(child, other); doc.stages.push(createStage(child.id, '子记录'), createStage(other.id, '其他记录'));
    expect(descendantIds(doc.phases, parent.id).size).toBe(2); expect(topicRecords(doc, parent.id).map((r) => r.title)).toEqual(['基线实验', '子记录']);
  });
  it('完成工作不覆盖失败结论，也允许手动指定节点进展', () => {
    expect(progressOf([{ worked: true, status: 'failed' }])).toBe('blocked'); expect(progressOf([{ worked: true, status: 'not_yet' }])).toBe('done'); expect(progressOf([], 'active')).toBe('active');
  });
  it('时间排序遵循记录日期，不用编号或编辑时间替代', () => {
    const records = [{ id: 'b', recordedAt: '2026-10-01', createdAt: '2026-10-07' }, { id: 'a', createdAt: '2026-10-04' }];
    expect(chronological(records).map((r) => r.id)).toEqual(['b', 'a']); expect(records[0].id).toBe('b');
  });
  it('演示项目内容显式标记，包含四种进展状态且可导出恢复', () => {
    const doc = createDemoProject(); expect(doc.research.demo).toBe(true); expect(new Set(doc.phases.map((p) => p.progress)).size).toBe(4); expect(parseWorkspace(doc).projects[0].stages).toHaveLength(4);
  });
});
describe('本地源码读取和可确认的匹配', () => {
  const file = (path, content, size = content.length) => ({ webkitRelativePath: path, name: path.split('/').pop(), size, text: async () => content });
  it('跳过依赖、密钥、过大文件，提取 Python 和 JS 导入线索', async () => {
    const scan = await analyzeFiles([file('test/src/train.py', 'import torch\nfrom models.net import Net\ndef train_model(): pass'), file('test/src/main.ts', 'import { x } from "./x";\nexport function main() {}'), file('test/node_modules/mod/index.js', ''), file('test/.env.json', 'private'), file('test/big.py', '', 600000)]);
    expect(scan.files).toHaveLength(2); expect(scan.skipped).toBe(1); expect(scan.files[0].imports).toContain('models.net'); expect(scan.files[1].imports).toContain('./x'); expect(scan.files[0].symbols).toContain('train_model');
  });
  it('给出依据明确的建议，已确认的关联不重复出现', async () => {
    const doc = recordDoc(); doc.stages[0].body = '检查 train_model 的收敛结果'; doc.architecture = await analyzeFiles([file('src/train.py', 'def train_model(): pass')]);
    expect(matchingSuggestions(doc)[0].reason).toContain('train_model'); doc.phases[0].codePaths = ['src/train.py']; expect(matchingSuggestions(doc)).toHaveLength(0);
  });
});
