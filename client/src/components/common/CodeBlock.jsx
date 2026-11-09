import React, { useState, useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import { Check, Copy, Code2 } from 'lucide-react';

/**
 * CodeBlock Component
 * Hiển thị khối mã nguồn (Python, HTML, CSS, JS...) với tô màu cú pháp (Syntax Highlighting)
 * Đánh số dòng, sao chép mã, giữ nguyên 100% thụt lề Indentation.
 * Hoạt động 100% Offline.
 */
export default function CodeBlock({ code = '', language = 'python', showLineNumbers = true, className = '' }) {
  const [copied, setCopied] = useState(false);

  // Chuẩn hóa tên ngôn ngữ
  const langKey = useMemo(() => {
    const raw = (language || 'python').toLowerCase().trim();
    if (raw === 'py') return 'python';
    if (raw === 'cpp' || raw === 'c++' || raw === 'c') return 'cpp';
    if (raw === 'html' || raw === 'htm' || raw === 'xml') return 'markup';
    if (raw === 'js') return 'javascript';
    return raw;
  }, [language]);

  const displayLangName = useMemo(() => {
    if (langKey === 'markup') return 'HTML';
    if (langKey === 'python') return 'PYTHON';
    if (langKey === 'cpp') return 'C++';
    if (langKey === 'javascript') return 'JAVASCRIPT';
    return langKey.toUpperCase();
  }, [langKey]);

  // Tô màu cú pháp bằng Prism
  const highlightedHtml = useMemo(() => {
    if (!code) return '';
    try {
      const grammar = Prism.languages[langKey] || Prism.languages.markup;
      return Prism.highlight(code, grammar, langKey);
    } catch (e) {
      // Fallback nếu có lỗi cú pháp
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, [code, langKey]);

  const lineCount = useMemo(() => {
    if (!code) return 0;
    return code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').length;
  }, [code]);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  if (!code) return null;

  return (
    <div className={`my-3 rounded-xl border border-slate-700/80 bg-slate-950 shadow-md overflow-hidden text-left ${className}`}>
      {/* Code Header Bar */}
      <div className="px-3.5 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-sky-400" />
          <span className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
            langKey === 'python'
              ? 'bg-blue-950 text-blue-300 border border-blue-800/60'
              : langKey === 'cpp'
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
              : langKey === 'markup'
              ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
              : 'bg-slate-800 text-slate-300 border border-slate-700'
          }`}>
            {displayLangName}
          </span>
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
            {lineCount} dòng
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Sao chép toàn bộ mã nguồn"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Đã chép</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Sao chép</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body with Line Numbers */}
      <div className="p-3 overflow-x-auto flex font-mono text-xs leading-5">
        {showLineNumbers && lineCount > 0 && (
          <div
            className="select-none text-slate-600 text-right pr-3 mr-3 border-r border-slate-800 font-mono text-xs leading-5 flex-shrink-0"
            aria-hidden="true"
          >
            {Array.from({ length: lineCount }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}

        <pre
          className="flex-1 overflow-x-auto m-0 p-0 font-mono text-xs leading-5 text-slate-200"
          style={{ background: 'transparent', tabSize: 4 }}
        >
          <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        </pre>
      </div>
    </div>
  );
}
