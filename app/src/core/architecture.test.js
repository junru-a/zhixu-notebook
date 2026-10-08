import { describe, it, expect } from 'vitest';
import { analyzeFiles, mergeSource, removeSource, withSources } from './codeAnalysis.js';
import { buildAnalysisRequest, validateAnalysisResult, redactSecrets, graphMermaid, analysisOptions, analysisCoverage } from './architectureAI.js';
import { createDemoProject, parseWorkspace } from './workspace.js';
const file = (path, content = 'def train_model(): pass') => ({ webkitRelativePath: path, size: content.length, text: async () => content });
export const requestFixture = { projectTitle: '测试', intent: '', files: [{ path: 'models/net.py', imports: [], symbols: ['Net'], excerpt: 'class Net: pass', truncated: false }, { path: 'training/train.py', imports: ['models.net'], symbols: [] }], topics: [{ id: 'p1', title: '训练验证', summary: '', records: [] }] };
export const resultFixture = { title: '训练流程', summary: '模型与训练入口', nodes: [{ id: 'm1', label: '模型', kind: 'model', summary: '网络定义', files: ['models/net.py'] }, { id: 'm2', label: '训练', kind: 'training', summary: '训练入口', files: ['training/train.py'] }], edges: [{ source: 'm2', target: 'm1', label: '导入', evidence: 'models.net', confidence: 'supported' }], suggestions: [{ nodeId: 'm2', phaseId: 'p1', reason: '训练节点' }], warnings: ['未执行代码'] };
describe('多目录索引兼容性', () => {
  it('增加目录不会替换已有目录，同名根目录保持不同路径', async () => {
    const scan = await analyzeFiles([file('models/net.py')]);
    const a = mergeSource(null, scan, 'a'); const b = mergeSource(a, scan, 'b');
    expect(b.sources.map((s) => s.label)).toEqual(['models', 'models (2)']);
    expect(b.files.map((f) => f.path)).toEqual(['models/net.py', 'models (2)/net.py']); expect(a.files).toHaveLength(1);
  });
  it('更新目录保留路径标识与其他目录；删除的文件退出索引', async () => {
    const a = mergeSource(null, await analyzeFiles([file('models/old.py'), file('models/net.py')]), 'a');
    const b = mergeSource(a, await analyzeFiles([file('train/main.py')]), 'b');
    const c = mergeSource(b, await analyzeFiles([file('models/net.py', 'class NewNet: pass')]), 'a', true);
    expect(c.files.map((f) => f.path)).toEqual(['train/main.py', 'models/net.py']);
    expect(c.files[1].hash).not.toBe(a.files[1].hash); expect(c.revision).toBe(3);
  });
  it('更新时选错根目录不会覆盖现有索引', async () => {
    const a = mergeSource(null, await analyzeFiles([file('models/net.py')]), 'a');
    expect(() => mergeSource(a, { root: 'train', files: [] }, 'a', true)).toThrow('原目录');
  });
  it('重新读取未变更的目录不会把图谱标记为过期', async () => {
    const scan = await analyzeFiles([file('models/net.py')]);
    const a = mergeSource(null, scan, 'a');
    expect(mergeSource(a, scan, 'a', true).revision).toBe(a.revision);
  });
  it('旧版索引与研究关联路径不变，移除可用原快照恢复', async () => {
    const legacy = await analyzeFiles([file('models/net.py')]);
    const migrated = withSources(legacy); expect(migrated.files[0].path).toBe('models/net.py');
    const a = mergeSource(migrated, await analyzeFiles([file('train/main.py')]), 'new');
    const removed = removeSource(a, 'legacy'); expect(removed.files[0].path).toBe('train/main.py'); expect(a.files).toHaveLength(2);
  });
  it('只保存摘要和哈希；私密文件被跳过', async () => {
    const contents = [];
    const a = await analyzeFiles([file('src/main.py', 'print("SOURCE_SENTINEL")'), file('src/secrets.json', 'sensitive'), file('src/.env.json', 'secret')], (_, content) => contents.push(content));
    expect(a.files).toHaveLength(1); expect(contents[0]).toContain('SOURCE_SENTINEL'); expect(JSON.stringify(a)).not.toContain('SOURCE_SENTINEL'); expect(a.files[0].hash).toHaveLength(64);
  });
});
describe('可审查的 AI 请求和结构校验', () => {
  it('按项目恢复选项，保留主动清空，过滤已移除路径且不扩大范围', () => {
    const architecture = { files: requestFixture.files, analysisDraft: { selectedPaths: ['models/net.py', 'deleted.py'], sendCode: false, sendRecords: true, intent: '检查训练链路' } };
    expect(analysisOptions(architecture)).toEqual({ selectedPaths: ['models/net.py'], sendCode: false, sendRecords: true, intent: '检查训练链路' });
    architecture.analysisDraft.selectedPaths = [];
    expect(analysisOptions(architecture).selectedPaths).toEqual([]);
  });
  it('源码覆盖量不等同于文件总数；旧索引未知字数不能伪造', () => {
    const files = [{ ...requestFixture.files[0], characterCount: 9000 }];
    const payload = buildAnalysisRequest(createDemoProject(), files, new Map([['models/net.py', 'x'.repeat(6001)]]));
    expect(analysisCoverage(payload, files, 20)).toMatchObject({ selected: 1, total: 20, code: 1, truncated: 1, characters: 6000, sourceCharacters: 9000 });
    expect(analysisCoverage(payload, requestFixture.files, 2).sourceCharacters).toBeNull();
  });
  it('模型的 supported 声明不能代替证据，伪造引文不能通过', () => {
    const graph = structuredClone(resultFixture);
    expect(validateAnalysisResult(graph, requestFixture).edges[0].confidence).toBe('inferred');
    graph.edges[0].citations = [{ path: 'models/net.py', quote: 'class ImaginaryModel: pass', verified: true }];
    const edge = validateAnalysisResult(graph, requestFixture).edges[0];
    expect(edge.confidence).toBe('inferred'); expect(edge.citations[0].verified).toBe(false);
  });
  it('仅匹配本次发送的实际源码引文，并拒绝凭路径或短词自称匹配', () => {
    const graph = structuredClone(resultFixture);
    graph.edges[0].citations = [{ path: 'models/net.py', quote: 'class Net: pass' }, { path: 'training/train.py', quote: 'models.net' }, { path: 'models/net.py', quote: 'Net' }];
    const edge = validateAnalysisResult(graph, requestFixture).edges[0];
    expect(edge.citations.map((c) => c.verified)).toEqual([true, false, false]); expect(edge.confidence).toBe('supported');
  });
  it('选项和结果草稿可随备份恢复，非法选项不会破坏工作区', async () => {
    const doc = createDemoProject(); doc.architecture = mergeSource(null, await analyzeFiles([file('models/net.py')]), 'a');
    doc.architecture.analysisDraft = { selectedPaths: ['models/net.py'], sendCode: false, sendRecords: true, intent: '关注误差传播' };
    expect(parseWorkspace(JSON.stringify(doc)).projects[0].architecture.analysisDraft).toEqual(doc.architecture.analysisDraft);
    doc.architecture.analysisDraft.selectedPaths = 'not-an-array'; expect(() => parseWorkspace(doc)).toThrow('分析选项');
  });
  it('默认不发送科研记录，源码有预算并标明截断', () => {
    const doc = createDemoProject();
    const payload = buildAnalysisRequest(doc, requestFixture.files, new Map([['models/net.py', 'x'.repeat(8000)]]));
    expect(payload.topics.every((p) => p.records.length === 0)).toBe(true); expect(payload.files[0].excerpt).toHaveLength(6000); expect(payload.files[0].truncated).toBe(true); expect(payload.files[1].excerpt).toBeUndefined();
  });
  it('可完全关闭源码发送；按需包含科研记录', () => {
    const payload = buildAnalysisRequest(createDemoProject(), requestFixture.files, new Map([['models/net.py', 'SENTINEL']]), { sendCode: false, sendRecords: true });
    expect(JSON.stringify(payload)).not.toContain('SENTINEL'); expect(payload.topics.some((p) => p.records.length)).toBe(true);
  });
  it('超限不静默丢弃文件', () => {
    expect(() => buildAnalysisRequest(createDemoProject(), Array.from({ length: 301 }, (_, i) => ({ ...requestFixture.files[0], path: `${i}.py` })), new Map())).toThrow('300');
  });
  it('遮盖常见凭据文字', () => {
    const result = redactSecrets('api_key = "fake_secret_value"\nPASSWORD: \'sensitive\'\nsk-123456789012345678');
    expect(result).not.toMatch(/fake_secret|sensitive|123456/);
  });
  it('拒绝不存在的依据文件、节点、研究分类和截断结构', () => {
    const absentFile = structuredClone(resultFixture); absentFile.nodes[0].files = ['secret/file.py']; expect(() => validateAnalysisResult(absentFile, requestFixture)).toThrow('范围之外');
    const absentNode = structuredClone(resultFixture); absentNode.edges[0].target = 'fake'; expect(() => validateAnalysisResult(absentNode, requestFixture)).toThrow('连线');
    const absentPhase = structuredClone(resultFixture); absentPhase.suggestions[0].phaseId = 'fake'; expect(() => validateAnalysisResult(absentPhase, requestFixture)).toThrow('研究关联');
    expect(() => validateAnalysisResult({ nodes: [] }, requestFixture)).toThrow('可用模块');
  });
  it('手动编辑后的图谱及来源快照可备份恢复，异常图谱拒绝导入', async () => {
    const doc = createDemoProject();
    doc.architecture = mergeSource(null, await analyzeFiles([file('models/net.py')]), 'a');
    doc.architecture.analysis = { ...resultFixture, revision: 1, fileSnapshot: requestFixture.files.map((f) => ({ path: f.path })), topicSnapshot: requestFixture.topics.map((p) => ({ id: p.id })) };
    const restored = parseWorkspace(JSON.stringify(doc)).projects[0]; expect(restored.architecture.analysis.nodes[0].label).toBe('模型');
    doc.architecture.analysis.edges[0].target = 'missing'; expect(() => parseWorkspace(doc)).toThrow('连线');
  });
  it('Mermaid 使用内部编号并转义模型文本，无法插入新指令', () => {
    const result = structuredClone(resultFixture); result.nodes[0].label = 'x"]\nclick n1 "javascript:bad"';
    const source = graphMermaid(result); expect(source.split('\n')).toHaveLength(4); expect(source).not.toContain('\nclick');
  });
});
