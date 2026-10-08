import { describe, expect, it } from 'vitest';
import { renderMarkdown, plainPreview } from './markdown.js';

it('卡片摘要保留观察文字，不暴露 Mermaid 或源码块', () => {
  const body = '记录观察。\n```mermaid\nflowchart TD\n A --> B\n```\n下一步复核。\n```python\nprint(1)\n```';
  expect(plainPreview(body)).toBe('记录观察。 下一步复核。');
});

// KaTeX 的 HTML 输出里有 katex 类名，用这个判断"是否真的渲染了公式"
const hasKatex = (html) => /class="katex/.test(html);
// 计数要用每公式只出现一次的特征：KaTeX 会为每个公式输出
// MathML + HTML 两套渲染，所以 `class="katex` 一个公式会出现 3 次，不能用来计数。
const countMath = (html) => (html.match(/<annotation encoding="application\/x-tex">/g) || []).length;

describe('行内公式 $ ... $', () => {
  it('渲染成 KaTeX 而不是原样文本', () => {
    const html = renderMarkdown('虚构测量变化约 $5.00\\%$。');
    console.log('【行内】', html.slice(0, 220));
    expect(hasKatex(html)).toBe(true);
    expect(html).not.toContain('$5.00');
  });

  it('多个行内公式都渲染', () => {
    const html = renderMarkdown('$a$ 与 $b$ 与 $c$');
    expect(countMath(html)).toBe(3);
  });

  it('不把价格当公式（紧邻空格的不认）', () => {
    const html = renderMarkdown('价格 $ 5 元和 6 元');
    expect(hasKatex(html)).toBe(false);
  });

  it('单独的 $ 不报错也不渲染', () => {
    const html = renderMarkdown('成本是 $ 但没有闭合');
    expect(hasKatex(html)).toBe(false);
  });

  it('转义的 \\$ 不当公式', () => {
    const html = renderMarkdown('美元符号 \\$100');
    expect(hasKatex(html)).toBe(false);
  });
});

describe('独立公式 $$ ... $$', () => {
  it('单行形式渲染为块级 KaTeX', () => {
    const html = renderMarkdown('$$y=ax+b$$');
    console.log('【块级·单行】', html.slice(0, 260));
    expect(hasKatex(html)).toBe(true);
    expect(html).toContain('math-block');
    expect(html).toContain('katex-display');
  });

  it('三行形式（$$ 独占一行）渲染为块级', () => {
    const src = ['$$', 'q=a+b+c.', '$$'].join('\n');
    const html = renderMarkdown(src);
    console.log('【块级·三行】', html.slice(0, 260));
    expect(hasKatex(html)).toBe(true);
    expect(html).toContain('math-block');
  });

  it('多行公式内容被完整吃进去（含换行）', () => {
    const src = ['$$', 'a = b \\\\', 'c = d', '$$'].join('\n');
    const html = renderMarkdown(src);
    expect(hasKatex(html)).toBe(true);
  });

  it('未闭合的 $$ 不吞掉后面所有内容', () => {
    const html = renderMarkdown('$$ 没有闭合\n\n后面的段落还在');
    expect(html).toContain('后面的段落还在');
  });
});

describe('公式写坏时不崩、不白屏', () => {
  it('非法 LaTeX 给出可见错误而不是抛异常', () => {
    const html = renderMarkdown('$\\frac{1}{$');
    console.log('【坏公式】', html.slice(0, 200));
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('throwOnError=false 让 KaTeX 自己标红而不是抛出', () => {
    const html = renderMarkdown('$\\undefinedcommand{x}$');
    expect(html).toMatch(/katex|math-error/);
  });
});

describe('Markdown 其余能力', () => {
  it('标题', () => {
    expect(renderMarkdown('## 结论')).toContain('data-heading="结论">结论</h2>');
  });

  it('加粗与行内代码', () => {
    const html = renderMarkdown('**重点** 和 `code`');
    expect(html).toContain('<strong>重点</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('表格被包进可横向滚动的容器（数值对照表会很长）', () => {
    const md = ['| 窗口 | 方案A | 方案B |', '|---|---:|---:|', '| 样本A | 12.00% | 13.00% |'].join('\n');
    const html = renderMarkdown(md);
    expect(html).toContain('<table>');
    expect(html).toContain('table-wrap');
    expect(html).toContain('样本A');
  });

  it('列表', () => {
    expect(renderMarkdown('- 一\n- 二')).toContain('<li>一</li>');
  });

  it('引用块', () => {
    expect(renderMarkdown('> 台账规则')).toContain('<blockquote>');
  });

  it('表格里的行内公式也渲染', () => {
    const md = ['| 量 | 说明 |', '|---|---|', '| $H$ | 原生间隔 |'].join('\n');
    const html = renderMarkdown(md);
    expect(hasKatex(html)).toBe(true);
  });

  it('不执行裸 HTML（安全）', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
  });

  it('空输入返回空字符串而不报错', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
  });

  it('链接会被渲染', () => {
    const html = renderMarkdown('[SUNDIALS](https://sundials.readthedocs.io/)');
    expect(html).toContain('href="https://sundials.readthedocs.io/"');
  });
});


describe('synthetic formula examples', () => {
    it('renders subscripts', () => expect(hasKatex(renderMarkdown('$a_{i+1}=a_i+1$'))).toBe(true));
    it('renders underbrace blocks', () => expect(hasKatex(renderMarkdown('$$\\underbrace{a+b}_{\\text{示例}}=c$$'))).toBe(true));
    it('mixes Chinese and formulas', () => expect(countMath(renderMarkdown('虚构样例包含 $a$、$b$ 和 $c$。'))).toBe(3));
  });
