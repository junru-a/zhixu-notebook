import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { analyzeWithDeepSeek, architectureMiddleware } from './architecture.js';
const payload = { projectTitle: '测试项目', intent: '', files: [{ path: 'src/main.py', imports: [], symbols: [] }], topics: [] };
const graph = { title: '程序', summary: '', nodes: [{ id: 'm1', label: '入口', kind: 'entry', summary: '函数入口', files: ['src/main.py'] }], edges: [], suggestions: [], warnings: [] };
const response = (content = graph, finish = 'stop') => ({ ok: true, json: async () => ({ choices: [{ finish_reason: finish, message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) });
describe('DeepSeek 服务器代理', () => {
  it('官方地址、仅服务器凭据、JSON 输出经校验后返回', async () => {
    const fetchImpl = vi.fn(async () => response());
    const result = await analyzeWithDeepSeek(payload, { apiKey: 'test-not-real', fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
    const options = fetchImpl.mock.calls[0][1]; expect(options.headers.Authorization).toBe('Bearer test-not-real');
    expect(JSON.parse(options.body).response_format.type).toBe('json_object'); expect(JSON.stringify(result)).not.toContain('test-not-real'); expect(result.nodes).toHaveLength(1);
  });
  it('没有凭据或请求不合规范时不调用上游', async () => {
    const fetchImpl = vi.fn(); await expect(analyzeWithDeepSeek(payload, { fetchImpl })).rejects.toThrow('API Key');
    await expect(analyzeWithDeepSeek({ files: [] }, { apiKey: 'test', fetchImpl })).rejects.toThrow(); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('拒绝截断、无效 JSON 和幻觉路径，不覆盖可用结果', async () => {
    await expect(analyzeWithDeepSeek(payload, { apiKey: 'test', fetchImpl: async () => response(graph, 'length') })).rejects.toThrow('完整');
    await expect(analyzeWithDeepSeek(payload, { apiKey: 'test', fetchImpl: async () => response('not json') })).rejects.toThrow('解析');
    const invalid = structuredClone(graph); invalid.nodes[0].files = ['invented.py'];
    await expect(analyzeWithDeepSeek(payload, { apiKey: 'test', fetchImpl: async () => response(invalid) })).rejects.toThrow('范围之外');
  });
  it.each([401, 402, 429, 500])('把上游 %i 错误转成可操作信息且不回显正文', async (status) => {
    await expect(analyzeWithDeepSeek(payload, { apiKey: 'test', fetchImpl: async () => ({ ok: false, status }) })).rejects.toThrow(/DeepSeek/);
  });
  it('HTTP 接口保护凭据、校验同源与令牌，允许合法请求', async () => {
    const fetchImpl = vi.fn(async () => response());
    const middleware = architectureMiddleware({ apiKey: 'test-never-export', fetchImpl });
    const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const config = await (await fetch(`${base}/api/architecture/config`)).json(); expect(config.configured).toBe(true); expect(JSON.stringify(config)).not.toContain('test-never-export');
      const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notebook-Token': config.token }, body: JSON.stringify(payload) };
      const denied = await fetch(`${base}/api/architecture/analyze`, { ...options, headers: { ...options.headers, Origin: 'https://other.invalid' } }); expect(denied.status).toBe(403);
      const noToken = await fetch(`${base}/api/architecture/analyze`, { ...options, headers: { 'Content-Type': 'application/json' } }); expect(noToken.status).toBe(403);
      const success = await fetch(`${base}/api/architecture/analyze`, options); expect(success.status).toBe(200); expect((await success.json()).nodes[0].label).toBe('入口'); expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });
});
