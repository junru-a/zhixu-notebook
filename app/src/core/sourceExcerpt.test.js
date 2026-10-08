import { it, expect } from 'vitest';
import { sourceExcerpt, buildAnalysisRequest } from './architectureAI.js';
it('samples long-file interior and tail without pretending omitted lines are continuous', () => {
  const source = '# header\n' + '# unrelated header\n'.repeat(100) + 'def forward(x):\n    return model(x)\n' + '# body\n'.repeat(300) + 'if __name__ == "__main__":\n    train()';
  const excerpt = sourceExcerpt(source, 1200);
  expect(excerpt.length).toBeLessThanOrEqual(1200);
  expect(excerpt).toContain('def forward'); expect(excerpt).toContain('train()'); expect(excerpt).toContain('中间源码省略');
});
it('redistributes unused short-file budget without exceeding total or per-file limits', () => {
  const files = Array.from({ length: 200 }, (_, i) => ({ path: `${i}.py`, imports: [], symbols: [] }));
  const contents = new Map(files.map((f, i) => [f.path, i < 190 ? 'a'.repeat(10) : 'b'.repeat(9000)]));
  const payload = buildAnalysisRequest({ research: { title: 'test' }, phases: [] }, files, contents);
  expect(payload.files.at(-1).excerpt.length).toBe(6000);
  expect(payload.files.reduce((sum, f) => sum + f.excerpt.length, 0)).toBeLessThanOrEqual(180000);
  expect(payload.files[0].truncated).toBe(false);
});
it('redacts full secrets before selecting windows', () => {
  expect(sourceExcerpt('password="secret-text"\n' + 'a\n'.repeat(1000), 300)).not.toContain('secret-text');
});
