import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// KaTeX 的样式表是必须的：没有它，公式虽然生成了 MathML/HTML 结构，
// 但排版全乱（分数不叠、上下标错位、根号不成形）。
import 'katex/dist/katex.min.css';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
