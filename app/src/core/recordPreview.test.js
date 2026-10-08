import { describe, it, expect } from 'vitest';
import { summarizeRecord } from './recordPreview.js';

describe('authored record previews', () => {
  it('keeps authored sections and extracts explicitly listed unresolved questions', () => {
    const result = summarizeRecord({ body: '## 本轮观察\n误差未下降。\n\n## 待定位问题\n- 导数项是否稳定\n- 参考解是否一致' });
    expect(result.sections).toEqual([{ title: '本轮观察', text: '误差未下降。' }, { title: '待定位问题', text: '导数项是否稳定 参考解是否一致' }]);
    expect(result.questions).toEqual(['导数项是否稳定', '参考解是否一致']);
  });
  it('does not treat headings inside code, formulas or table data as research problems', () => {
    const result = summarizeRecord({ body: '```md\n## 待定位问题\n- 代码样例\n```\n\n$$\nE = mc^2\n$$\n\n| 指标 | 值 |\n| --- | --- |\n| 误差 | 0.1 |' });
    expect(result).toEqual({ sections: [], questions: [] });
  });
  it('uses a supplied lead sentence without fabricating a conclusion or question', () => {
    expect(summarizeRecord({ leadSentence: '原始结论', body: '尚待验证。' })).toEqual({ sections: [{ title: '记录摘要', text: '原始结论' }], questions: [] });
  });
});
