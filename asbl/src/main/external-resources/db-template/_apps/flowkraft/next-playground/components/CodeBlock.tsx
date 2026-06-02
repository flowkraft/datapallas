'use client';

import { useMemo } from 'react';
import Prism from 'prismjs';

// Import Prism languages
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-groovy';

// Import Prism theme
import 'prismjs/themes/prism-tomorrow.css';

interface CodeBlockProps {
  code: string;
  language: 'groovy' | 'html' | 'javascript' | 'markup';
  style?: React.CSSProperties;
}

export function CodeBlock({ code, language, style }: CodeBlockProps) {
  const highlightedHtml = useMemo(() => {
    const grammar = Prism.languages[language];
    if (!grammar || !code) return code || '';
    return Prism.highlight(code, grammar, language);
  }, [code, language]);

  return (
    <div className="overflow-auto bg-base-300 rounded-lg" style={style}>
      <pre className="m-0 p-6 text-sm" style={{ background: 'transparent' }}>
        <code
          className={`language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}
