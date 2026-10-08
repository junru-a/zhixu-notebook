import { createRenderer } from './markdown.js';

const parser = createRenderer();
const inlineText = (token) => (token.children || [])
  .map((child) => child.type === 'text' || child.type === 'code_inline' ? child.content : child.type === 'softbreak' || child.type === 'hardbreak' ? ' ' : '')
  .join('').trim();

// Extract only text the author wrote. Fences, math and table cells are left for
// the full editor; headings in code samples never become research questions.
export function summarizeRecord(record) {
  const sections = [];
  let current = { title: '', lines: [] };
  let inTable = false;
  const tokens = parser.parse(record.body || '', {});
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'table_open') inTable = true;
    if (token.type === 'table_close') inTable = false;
    if (token.type === 'heading_open') {
      if (current.lines.length) sections.push(current);
      current = { title: inlineText(tokens[++i]), lines: [] };
    } else if (token.type === 'inline' && !inTable) {
      const text = inlineText(token);
      if (text) current.lines.push(text);
    }
  }
  if (current.lines.length) sections.push(current);
  const questions = sections.filter((section) => /待.*(问题|定位|验证|确认)|未解决/.test(section.title)).flatMap((section) => section.lines);
  const preview = record.leadSentence?.trim()
    ? [{ title: '记录摘要', lines: [record.leadSentence.trim()] }]
    : sections.slice(0, 2);
  return { sections: preview.map((s) => ({ title: s.title, text: s.lines.join(' ') })), questions };
}
