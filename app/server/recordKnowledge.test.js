import { expect, it, vi } from 'vitest';
import { analyzeRecordWithDeepSeek } from './recordKnowledge.js';
import { architectureMiddleware } from './architecture.js';
import { createServer } from 'node:http';
const payload = { record: { id: 'r1', title: '实验', text: '本轮已完成', phaseId: 't1' }, topics: [{ id: 't1', title: '方向', summary: '' }], records: [], modules: [] };
const result = { summary: '已完成', progress: { value: 'done', confidence: .95, reason: '原文明确', evidence: '本轮已完成' }, links: [] };
const response = (finish_reason = 'stop') => ({ ok: true, json: async () => ({ choices: [{ finish_reason, message: { content: JSON.stringify(result) } }] }) });
it('没有密钥不调用上游，截断输出不写入', async () => {
  const fetchImpl = vi.fn(); await expect(analyzeRecordWithDeepSeek(payload, { fetchImpl })).rejects.toThrow('API Key'); expect(fetchImpl).not.toHaveBeenCalled();
  await expect(analyzeRecordWithDeepSeek(payload, { apiKey: 'test', fetchImpl: async () => response('length') })).rejects.toThrow('截断');
});
it('记录接口复用本机令牌保护，返回结构化状态不回传密钥', async () => {
  const fetchImpl = vi.fn(async () => response());
  const middleware = architectureMiddleware({ apiKey: 'test-server-only', fetchImpl });
  const server = createServer((req, res) => middleware(req, res, () => res.end()));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const config = await (await fetch(`${base}/api/architecture/config`)).json();
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notebook-Token': config.token }, body: JSON.stringify(payload) };
    expect((await fetch(`${base}/api/architecture/record`, { ...options, headers: { ...options.headers, Origin: 'https://bad.invalid' } })).status).toBe(403);
    const res = await fetch(`${base}/api/architecture/record`, options); expect(res.status).toBe(200);
    const text = await res.text(); expect(text).not.toContain('test-server-only'); expect(JSON.parse(text).progress.decision).toBe('accepted');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
