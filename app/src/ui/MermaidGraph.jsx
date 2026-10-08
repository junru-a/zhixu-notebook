import { useEffect, useRef, useState } from 'react';
import { Mermaid } from './Markdown.jsx';
import GraphViewport from './GraphViewport.jsx';

export default function MermaidGraph({ source, expanded, onExpandedChange }) {
  const ref = useRef(null), [size, setSize] = useState({ width: 800, height: 480 });
  useEffect(() => {
    const measure = () => {
      const bounds = ref.current?.querySelector('svg')?.viewBox.baseVal;
      if (bounds?.width > 0 && bounds?.height > 0) setSize((old) => old.width === bounds.width && old.height === bounds.height ? old : { width: bounds.width, height: bounds.height });
    };
    const observer = new MutationObserver(measure);
    observer.observe(ref.current, { childList: true, subtree: true }); measure();
    return () => observer.disconnect();
  }, [source]);
  return <GraphViewport {...size} resetKey={source} label="Mermaid 图" expanded={expanded} onExpandedChange={onExpandedChange}><div ref={ref} className="mermaid-zoom-content" style={size}><Mermaid source={source} /></div></GraphViewport>;
}
