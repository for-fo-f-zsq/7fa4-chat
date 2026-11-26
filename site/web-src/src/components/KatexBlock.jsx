import { useMemo } from 'react';
import katex from 'katex';

export default function KatexBlock({ tex, displayMode = true, className = '' }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode,
        throwOnError: false,
        strict: false
      });
    } catch {
      return tex;
    }
  }, [tex, displayMode]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
