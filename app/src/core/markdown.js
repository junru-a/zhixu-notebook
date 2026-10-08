// Markdown 与 LaTeX 渲染；公式错误独立显示。
import MarkdownIt from 'markdown-it';
import katex from 'katex';

const ESCAPE_HTML = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 渲染一个公式，失败时给出可见的错误提示而不是抛异常。 */
const renderMath = (tex, displayMode) => {
  const src = String(tex ?? '').trim();
  if (!src) return '';
  try {
    const html = katex.renderToString(src, {
      displayMode,
      throwOnError: false,
      errorColor: '#e11d48',
      strict: false,
      trust: false,
      macros: { '\\rm': '\\mathrm' },
    });
    return html;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<span class="math-error" title="${ESCAPE_HTML(msg)}">公式渲染失败：${ESCAPE_HTML(src.slice(0, 60))}</span>`;
  }
};

export const createRenderer = () => {
  const md = new MarkdownIt({
    html: false,        // 不允许裸 HTML：这是个人记录，不需要，且更安全
    linkify: true,
    breaks: false,      // 标准 markdown 语义；用户记录用空行分段
    typographer: false,
  });

  // ── 块级公式 $$ ... $$ ──────────────────────────────────────────────────────
  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const line = state.src.slice(start, max);

    if (!line.trimStart().startsWith('$$')) return false;
    if (silent) return true;

    const first = line.indexOf('$$');
    const afterOpen = line.slice(first + 2);
    let content = '';
    let nextLine = startLine + 1;
    let closed = false;

    // 单行闭合：$$ ... $$
    if (afterOpen.includes('$$')) {
      content = afterOpen.slice(0, afterOpen.indexOf('$$'));
      closed = true;
    } else {
      content = afterOpen;
      for (; nextLine < endLine; nextLine++) {
        const ls = state.bMarks[nextLine] + state.tShift[nextLine];
        const le = state.eMarks[nextLine];
        const raw = state.src.slice(ls, le);
        const idx = raw.indexOf('$$');
        if (idx >= 0) {
          content += `\n${raw.slice(0, idx)}`;
          closed = true;
          nextLine++;
          break;
        }
        content += `\n${raw}`;
      }
    }
    if (!closed) return false;

    state.line = nextLine;
    const token = state.push('math_block', 'math', 0);
    token.content = content.trim();
    token.map = [startLine, nextLine];
    token.markup = '$$';
    return true;
  });

  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math-block">${renderMath(tokens[idx].content, true)}</div>\n`;

  // ── 行内公式 $ ... $ ────────────────────────────────────────────────────────
  md.inline.ruler.before('emphasis', 'math_inline', (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== '$') return false;
    // 排除 $$（那是块级，且这里遇到双写直接放弃以免抢走块级）
    if (state.src[start + 1] === '$') return false;

    const end = state.src.indexOf('$', start + 1);
    if (end < 0) return false;
    // 不允许跨行
    const inner = state.src.slice(start + 1, end);
    if (inner.includes('\n')) return false;
    // `$ ... $` 不能以空格紧邻（避免把 "价格 $5 和 $6" 当公式）
    if (!inner.trim() || inner !== inner.trim()) return false;
    // 反斜杠转义的 \$ 不当公式
    if (state.src[start - 1] === '\\') return false;

    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.content = inner;
      token.markup = '$';
    }
    state.pos = end + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx].content, false);

  // ── 表格、任务列表增强（用户记录里有大量表格）──────────────────────────────
  // markdown-it 默认支持表格，但样式需要容器 class；这里给表格包一层便于横向滚动
  const defaultTableOpen = md.renderer.rules.table_open
    ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.table_open = (tokens, idx, opts, env, self) =>
    `<div class="table-wrap">${defaultTableOpen(tokens, idx, opts, env, self)}`;
  const defaultTableClose = md.renderer.rules.table_close
    ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.table_close = (tokens, idx, opts, env, self) =>
    `${defaultTableClose(tokens, idx, opts, env, self)}</div>`;

  md.inline.ruler.before('link', 'wiki_link', (state, silent) => {
    const embed = state.src.slice(state.pos, state.pos + 3) === '![[';
    if (silent || state.linkLevel || (!embed && state.src.slice(state.pos, state.pos + 2) !== '[[')) return false;
    const opening = embed ? 3 : 2;
    const end = state.src.indexOf(']]', state.pos + opening);
    if (end < 0 || end + 2 > state.posMax) return false;
    const value = state.src.slice(state.pos + opening, end);
    if (!value.trim() || /[\n\r\[\]]/.test(value)) return false;
    const [target, ...alias] = value.split('|');
    if (!target.trim()) return false;
    if (!silent) {
      const token = state.push('wiki_link', '', 0);
      token.meta = { target: target.trim(), embed };
      token.content = alias.join('|').trim() || target.trim();
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wiki_link = (tokens, index, _options, env) => {
    const token = tokens[index], escape = md.utils.escapeHtml;
    let id = env.resolveWiki?.(token.meta.target);
    const fragment = env.fragment?.(token.meta.target) || '';
    if (id && env.referenceExists && !env.referenceExists(id, fragment)) id = null;
    const attrs = `data-record-id="${escape(id || '')}" data-fragment="${escape(fragment)}" title="${escape(env.linkTitle?.(id, fragment) || token.content)}"`;
    if (id && token.meta.embed && env.embedPreview) return `<span class="wiki-embed"><button type="button" class="wiki-link" ${attrs}>${escape(token.content)} ↗</button><span class="wiki-embed-content">${escape(env.embedPreview(id, fragment))}</span></span>`;
    return id ? `<button type="button" class="wiki-link" ${attrs}>${escape(token.content)}</button>`
      : `<button type="button" class="wiki-link unresolved" data-wiki-target="${escape(token.meta.target)}" title="链接未解析，点击选择目标或创建记录">${escape(token.content)}</button>`;
  };
  md.core.ruler.after('inline', 'reference_anchors', state => {
    for (let i = 0; i < state.tokens.length - 1; i++) {
      const open = state.tokens[i], inline = state.tokens[i + 1];
      if (inline.type !== 'inline') continue;
      if (open.type === 'heading_open') open.attrSet('data-heading', inline.children.map(child => child.content || '').join('').replace(/[*_`]/g, '').trim());
      if (open.type === 'paragraph_open') {
        const block = inline.content.match(/(?:^|\s)\^([A-Za-z0-9-]+)\s*$/);
        if (block) {
          open.attrSet('data-block-id', block[1]);
          const last = inline.children.at(-1); if (last?.type === 'text') last.content = last.content.replace(/(?:^|\s)\^[A-Za-z0-9-]+\s*$/, '');
          if (inline.content.trim() === '^' + block[1]) {
            for (let j = i - 1; j >= 0; j--) if (state.tokens[j].type === 'paragraph_open') { state.tokens[j].attrSet('data-block-id', block[1]); break; }
          }
        }
      }
    }
  });
  return md;
};

const shared = createRenderer();

/**
 * 渲染 markdown 为 HTML 字符串。
 * 每次都新建 renderer 太浪费，共享一个即可（markdown-it 是纯函数式的，无状态泄漏）。
 */
export const renderMarkdown = (text, env = {}) => {
  if (!text) return '';
  try {
    return shared.render(String(text), env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<p class="render-error">渲染出错：${ESCAPE_HTML(msg)}</p>`;
  }
};

export const extractWikiTargets = (text) => [...new Set(shared.parse(String(text || ''), {})
  .flatMap((token) => token.children || []).filter((token) => token.type === 'wiki_link').map((token) => token.meta.target))];

/**
 * 预览用：把 markdown/LaTeX 正文压成一行纯文本摘要。
 *
 * 刻意剥掉公式：公式不是"内容摘要"，它既占长度又读不懂
 * （一条记录里可能十几个 `$...$`，摘要全变成公式碎片就没意义了）。
 * 同理剥掉表格行 —— 数值对照表也不是好摘要。
 */
export const plainPreview = (text, n = 120) => String(text ?? '')
  .replace(/```[\s\S]*?```/g, ' ')                // 流程图与代码块不进入卡片摘要
  .split(/\r?\n/)
  .filter((line) => !/^\s*\|/.test(line))          // 丢掉表格行
  .join('\n')
  .replace(/\$\$[\s\S]*?\$\$/g, ' ')               // 块级公式
  .replace(/\$[^$\n]+\$/g, ' ')                    // 行内公式
  .replace(/\\\[[\s\S]*?\\\]/g, ' ')               // 尚未转换的块级
  .replace(/\\\([^)]*?\\\)/g, ' ')                 // 尚未转换的行内
  .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')            // 标题标记
  .replace(/\*\*([^*]+)\*\*/g, '$1')               // 加粗 -> 保留文字
  .replace(/`([^`]+)`/g, '$1')                     // 行内代码
  .replace(/[*_>#]/g, '')                          // 其余标记
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{2,}/g, '\n')
  .trim()
  .replace(/\s+/g, ' ')
  .slice(0, n);

/**
 * 列表里显示的一行说明。
 *
 * 优先用导入时留存的原首句（`leadSentence`）—— 那正是用户自己写的结论句；
 * 手动创建的阶段没有这个字段，退回正文纯文本预览；都没有则返回空串。
 */
export const listHint = (stage, n = 96) => {
  const lead = String(stage?.leadSentence ?? '').trim();
  if (lead) return lead.length > n ? `${lead.slice(0, n)}…` : lead;
  return plainPreview(stage?.body ?? '', n);
};

export default renderMarkdown;
