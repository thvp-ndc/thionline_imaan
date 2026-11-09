import React, { useState } from 'react';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { ZoomIn, X } from 'lucide-react';
import CodeBlock from './CodeBlock';

function parseMarkdownTable(tableStr) {
  const lines = tableStr.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const parseRow = (line) => {
    const trimmed = line.replace(/^\||\|$/g, '');
    return trimmed.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  };

  const headers = parseRow(lines[0]);
  const sepLine = lines[1];
  const isSeparator = /^\|?(\s*:?---+:?\s*\|?)+$/.test(sepLine);
  if (!isSeparator) return null;

  const sepCells = parseRow(sepLine);
  const alignments = sepCells.map(c => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return 'center';
  });

  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    rows.push(parseRow(lines[i]));
  }

  const isHeaderPurelyData = headers.length > 0 && headers.every(cell => {
    const t = cell.trim();
    return /^[0-9]+(?:[,.][0-9]+)?$/.test(t) || t === '';
  });

  return { headers, alignments, rows, isHeaderPurelyData };
}

function MarkdownTableRenderer({ tableContent }) {
  const parsed = parseMarkdownTable(tableContent);
  if (!parsed) {
    return <pre className="font-mono text-xs overflow-x-auto p-2 bg-slate-100 dark:bg-slate-800 rounded">{tableContent}</pre>;
  }

  const { headers, alignments, rows, isHeaderPurelyData } = parsed;

  const getAlignClass = (align) => {
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  return (
    <div className="table-wrapper-block block w-full my-1 clear-both overflow-x-auto">
      <div className="rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden shadow-2xs inline-block w-max max-w-full">
        <table className="border-collapse text-xs md:text-sm divide-y divide-slate-300 dark:divide-slate-700 w-max max-w-full table-auto">
          {!isHeaderPurelyData && (
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100">
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className={`border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-bold ${getAlignClass(alignments[i] || 'center')} whitespace-nowrap`}
                  >
                    <MathContent content={h} zoomable={false} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60 bg-white dark:bg-slate-900">
            {isHeaderPurelyData && (
              <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                {headers.map((h, i) => (
                  <td
                    key={i}
                    className={`border border-slate-300 dark:border-slate-700 px-3 py-1.5 ${getAlignClass(alignments[i] || 'center')} text-slate-800 dark:text-slate-200 whitespace-nowrap font-medium`}
                  >
                    <MathContent content={h} zoomable={false} />
                  </td>
                ))}
              </tr>
            )}
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={rIdx % 2 === 0 ? 'bg-white dark:bg-slate-900 hover:bg-sky-50/50 dark:hover:bg-slate-800/50' : 'bg-slate-50/80 dark:bg-slate-800/40 hover:bg-sky-50/50 dark:hover:bg-slate-800/50'}
              >
                {row.map((cell, cIdx) => {
                  const hasCode = /`|<pre>|<code>|\n/.test(cell);
                  return (
                    <td
                      key={cIdx}
                      className={`border border-slate-300 dark:border-slate-700 px-3 py-1.5 ${hasCode ? 'text-left whitespace-pre-wrap font-mono' : `${getAlignClass(alignments[cIdx] || 'center')} whitespace-nowrap`} text-slate-700 dark:text-slate-300`}
                    >
                      <MathContent content={cell} zoomable={false} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'sub', 'sup', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr',
    'th', 'td', 'img', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'div'
  ],
  ALLOWED_ATTR: [
    'data-type', 'data-latex', 'class', 'src', 'alt',
    'width', 'height', 'colspan', 'rowspan', 'align'
  ],
  ALLOW_DATA_ATTR: true,
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)|data:image\/|blob:|\/)/i
};

const KNOWN_HTML_CONTAINERS = new Set([
  'p', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'sub', 'sup', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr',
  'th', 'td', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'div', 'a'
]);

const KNOWN_VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link'
]);

/**
 * Xử lý thẻ HTML minh họa trần (ví dụ A. <ol>, B. <ul>, C. <li>, #include <iostream>, vector<int>)
 * Bảo đảm chỉ escape đúng một lần tại ranh giới hiển thị, không double-escape,
 * và bảo toàn cấu trúc HTML định dạng thật của hệ thống.
 */
function escapeIllustrativeTags(str) {
  if (!str || typeof str !== 'string') return '';

  const openTagCounts = {};
  const closeTagCounts = {};
  
  const tagRegex = /<(\/)?([a-zA-Z][a-zA-Z0-9_.-]*|\b[a-zA-Z0-9_./-]+\.h\b)(?:\s+[^>]*?)?(\/)?>/g;
  let match;
  while ((match = tagRegex.exec(str)) !== null) {
    const isClosing = !!match[1];
    const isSelfClosing = !!match[3];
    const tagName = match[2].toLowerCase();

    if (isClosing) {
      closeTagCounts[tagName] = (closeTagCounts[tagName] || 0) + 1;
    } else if (!isSelfClosing) {
      openTagCounts[tagName] = (openTagCounts[tagName] || 0) + 1;
    }
  }

  return str.replace(/<(\/)?([a-zA-Z][a-zA-Z0-9_.-]*|\b[a-zA-Z0-9_./-]+\.h\b)(\s*[^>]*?)?(\/)?>/g, (fullMatch, isSlash, rawTagName, attrs, selfSlash) => {
    const tagName = rawTagName.toLowerCase();

    // 1. Nếu không phải là thẻ HTML chuẩn (vd: iostream, vector, stdio.h, bits/stdc++.h, T, int...)
    if (!KNOWN_HTML_CONTAINERS.has(tagName) && !KNOWN_VOID_TAGS.has(tagName)) {
      return `&lt;${isSlash || ''}${rawTagName}${attrs || ''}${selfSlash || ''}&gt;`;
    }

    // 2. Nếu là thẻ container nhưng không có cặp thẻ đóng/mở cân bằng trong chuỗi (vd A. <ul> B. <ol>)
    if (KNOWN_HTML_CONTAINERS.has(tagName)) {
      const opens = openTagCounts[tagName] || 0;
      const closes = closeTagCounts[tagName] || 0;
      if (opens !== closes || closes === 0) {
        return `&lt;${isSlash || ''}${rawTagName}${attrs || ''}${selfSlash || ''}&gt;`;
      }
    }

    // 3. Nếu là void tag nhưng đứng dưới dạng phương án trắc nghiệm hoặc không có thuộc tính định dạng
    if (KNOWN_VOID_TAGS.has(tagName)) {
      const trimmed = str.trim();
      const isPureOption = /^([A-D]\.\s*)?<[a-zA-Z0-9]+(\/)?>(\s+[A-D]\.\s*<[a-zA-Z0-9]+(\/)?>)*$/.test(trimmed) ||
                           trimmed === `<${rawTagName}>` ||
                           trimmed === `<${rawTagName}/>`;
      if (isPureOption && tagName !== 'img') {
        return `&lt;${isSlash || ''}${rawTagName}${attrs || ''}${selfSlash || ''}&gt;`;
      }
    }

    return fullMatch;
  });
}

function normalizeDegreeMath(latex) {
  if (!latex || typeof latex !== 'string') return '';
  return latex
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*C\b/g, '$1^{\\circ}\\mathrm{C}')
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*F\b/g, '$1^{\\circ}\\mathrm{F}');
}

/**
 * Xử lý chuỗi HTML/Text nguyên khối theo cây DOM:
 * 1. Làm sạch bằng DOMPurify với Whitelist bảo mật
 * 2. Phân tích thành cây DOM qua DOMParser
 * 3. Thay thế node span[data-type="math-inline"] bằng KaTeX an toàn
 * 4. Quét TextNode xử lý $...$ hoặc $$...$$ gõ tay (loại trừ code/pre/math)
 */
function processHtmlWithMathDom(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') return '';

  // 0. Xử lý inline code `code` thành thẻ <code> với escape an toàn
  let preparedHtml = htmlString.replace(/(^|[^\\])`([^`\n]+)`/g, (m, pfx, code) => {
    const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `${pfx}<code class="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700/80">${esc}</code>`;
  });

  // 0.5. Escape có ngữ cảnh các thẻ minh họa trần để DOMPurify không nuốt mất
  preparedHtml = escapeIllustrativeTags(preparedHtml);

  // 1. Sanitize HTML nguyên khối với Whitelist nghiêm ngặt
  const cleanHtml = DOMPurify.sanitize(preparedHtml, DOMPURIFY_CONFIG);

  // 2. Phân tích thành cấu trúc DOM qua DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanHtml, 'text/html');

  // 3. Duyệt và thay thế từng node span[data-type="math-inline"]
  const mathSpans = doc.querySelectorAll('span[data-type="math-inline"]');
  mathSpans.forEach(node => {
    let latex = node.getAttribute('data-latex') || node.textContent.replace(/^\$|\$$/g, '');
    latex = normalizeDegreeMath(latex);
    try {
      const renderedHtml = katex.renderToString(latex, { displayMode: false, throwOnError: false });
      const span = doc.createElement('span');
      span.className = 'inline-math px-0.5';
      span.innerHTML = DOMPurify.sanitize(renderedHtml);
      node.replaceWith(span);
    } catch (e) {
      const fallback = doc.createElement('span');
      fallback.className = 'text-rose-500 font-mono text-xs px-0.5';
      fallback.textContent = `$${latex}$`;
      node.replaceWith(fallback);
    }
  });

  // 4. Duyệt các TextNode chứa $...$ gõ tay (Loại trừ code, pre, math)
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement && node.parentElement.closest('.inline-math, .katex, code, pre, script, style')) {
      continue;
    }
    if (node.nodeValue && /\$/.test(node.nodeValue)) {
      textNodes.push(node);
    }
  }

  textNodes.forEach(node => {
    const text = node.nodeValue;
    const mathRegex = /(\$\$[\s\S]+?\$\$|\$(?:\\\$|[^\$])+?\$)/g;
    if (mathRegex.test(text)) {
      const frag = doc.createDocumentFragment();
      const parts = text.split(mathRegex);
      parts.forEach(part => {
        if (!part) return;
        if ((part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) ||
            (part.startsWith('$') && part.endsWith('$') && part.length >= 2)) {
          const isDisplay = part.startsWith('$$');
          let latex = isDisplay ? part.slice(2, -2) : part.slice(1, -1);
          latex = normalizeDegreeMath(latex.trim());
          try {
            const renderedHtml = katex.renderToString(latex, { displayMode: isDisplay, throwOnError: false });
            const span = doc.createElement('span');
            span.className = isDisplay ? 'display-math block my-2 text-center' : 'inline-math px-0.5';
            span.innerHTML = DOMPurify.sanitize(renderedHtml);
            frag.appendChild(span);
          } catch (e) {
            const fallback = doc.createElement('span');
            fallback.className = 'text-rose-500 font-mono text-xs px-0.5';
            fallback.textContent = part;
            frag.appendChild(fallback);
          }
        } else {
          frag.appendChild(doc.createTextNode(part));
        }
      });
      node.replaceWith(frag);
    }
  });

  return doc.body.innerHTML;
}

/**
 * MathContent Component
 * Render công thức toán học KaTeX ($...$, $$...$$, \(...\), \[...\]),
 * hình ảnh Markdown (![alt|WxH](url)) với kích thước chính xác,
 * khối mã nguồn Tin học (Python, HTML...) với Syntax Highlighting,
 * và Bảng số liệu biểu đồ (Markdown Table, HTML Table) với cấu trúc hàng/cột nguyên vẹn.
 * Hoạt động 100% Offline trên mạng LAN không cần kết nối Internet.
 */
function checkHasRealTable(content) {
  if (!content || typeof content !== 'string') return false;
  // Markdown table check
  if (/(?:^|\n)\|[^\n]+\|\r?\n\|(?:\s*:?---+:?\s*\|)+/.test(content)) return true;
  // HTML table check (loại trừ nội dung trong pre/code)
  const stripped = content.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return /<table\b[^>]*>[\s\S]*?<\/table>/i.test(stripped);
}

export default function MathContent({ content = '', className = '', zoomable = true }) {
  const [zoomedImage, setZoomedImage] = useState(null);

  if (!content) return null;

  const hasTable = checkHasRealTable(content);

  // Tách riêng các khối Markdown cấp cao (Code block, bảng markdown, ảnh Markdown)
  // để bảo toàn PrismJS code highlighting và Modal phóng to ảnh.
  // Mọi phần còn lại (HTML, văn bản, inline math) đi qua DOM-Aware pipeline nguyên khối.
  const rootTokenRegex = /(```(?:[a-zA-Z0-9_+-]+)?[\s\S]*?```|(?:^|\n)(?:\|[^\n]+\|\r?\n\|(?:\s*:?---+:?\s*\|)+(?:\r?\n\|[^\n]+\|)*)|!\[.*?\]\(.*?\))/g;
  const parts = content.split(rootTokenRegex);

  return (
    <>
      <div className={`math-content block w-full text-inherit ${hasTable ? 'has-table-content' : ''} ${className}`}>
        {parts.map((part, index) => {
          if (!part) return null;

          // 1. Khối Mã Nguồn (Code Block): ```lang\n...```
          if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
            const inner = part.slice(3, -3);
            const firstLineBreak = inner.indexOf('\n');
            let lang = 'python';
            let codeBody = inner;

            if (firstLineBreak !== -1) {
              const firstLine = inner.slice(0, firstLineBreak).trim();
              if (firstLine && /^[a-zA-Z0-9_+-]+$/.test(firstLine)) {
                lang = firstLine;
                codeBody = inner.slice(firstLineBreak + 1);
              }
            }

            codeBody = codeBody.replace(/^\r?\n/, '').replace(/\r?\n$/, '');

            return (
              <CodeBlock
                key={index}
                code={codeBody}
                language={lang}
                showLineNumbers={true}
              />
            );
          }

          // 2. Bảng Markdown: | ... |
          if (part.trim().startsWith('|') && part.includes('---')) {
            return (
              <MarkdownTableRenderer
                key={index}
                tableContent={part}
              />
            );
          }

          // 3. Markdown Image: ![alt|WxH](url) hoặc ![alt](url) (Bảo toàn 100% Modal phóng to ảnh)
          if (part.startsWith('![') && part.includes('](') && part.endsWith(')')) {
            const imgMatch = part.match(/^!\[(.*?)\]\((.*?)\)$/);
            if (imgMatch) {
              const rawAlt = imgMatch[1] || '';
              const src = imgMatch[2];
              let alt = rawAlt;
              let customWidth = null;
              let customHeight = null;

              if (rawAlt.includes('|')) {
                const altParts = rawAlt.split('|');
                alt = altParts[0].trim();
                const dimStr = altParts[1].trim();
                const dimMatch = dimStr.match(/^(\d+(?:\.\d+)?)[xX*](\d+(?:\.\d+)?)$/);
                if (dimMatch) {
                  customWidth = parseFloat(dimMatch[1]);
                  customHeight = parseFloat(dimMatch[2]);
                } else {
                  const wMatch = dimStr.match(/(?:width|w)\s*[:=]\s*(\d+(?:\.\d+)?)/i);
                  const hMatch = dimStr.match(/(?:height|h)\s*[:=]\s*(\d+(?:\.\d+)?)/i);
                  if (wMatch) customWidth = parseFloat(wMatch[1]);
                  if (hMatch) customHeight = parseFloat(hMatch[1]);
                }
              }

              return (
                <div key={index} className="my-2 text-center group relative inline-block max-w-full">
                  <div className="p-1.5 bg-white/95 rounded-xl border border-slate-700/60 shadow-md inline-block max-w-full overflow-hidden">
                    <img
                      src={src}
                      alt={alt || 'Hình ảnh câu hỏi'}
                      style={{
                        width: customWidth ? `${customWidth}px` : 'auto',
                        height: customHeight ? `${customHeight}px` : 'auto',
                        maxWidth: '100%'
                      }}
                      onClick={() => zoomable && setZoomedImage({ src, alt })}
                      className={`h-auto max-h-[500px] object-contain rounded-lg inline-block ${
                        zoomable ? 'cursor-pointer hover:opacity-95 transition-all' : ''
                      }`}
                      loading="lazy"
                    />
                  </div>
                  {zoomable && (
                    <button
                      type="button"
                      onClick={() => setZoomedImage({ src, alt })}
                      className="absolute bottom-3 right-3 bg-slate-900/90 hover:bg-sky-600 text-white px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shadow-lg backdrop-blur-sm border border-slate-700/80"
                      title="Nhấn để phóng to hình ảnh độ phân giải cao"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Phóng to</span>
                    </button>
                  )}
                </div>
              );
            }
          }

          // 4. Nội dung HTML / Text / MathInline / LaTeX: Xử lý qua DOM-Aware Pipeline nguyên khối
          return (
            <span
              key={index}
              dangerouslySetInnerHTML={{ __html: processHtmlWithMathDom(part) }}
            />
          );
        })}
      </div>

      {/* Modal phóng to ảnh */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn"
          onClick={() => setZoomedImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-between items-center pb-2 mb-2 border-b border-slate-800 text-slate-300 text-sm">
              <span className="font-medium truncate max-w-md">{zoomedImage.alt || 'Xem chi tiết hình ảnh'}</span>
              <button
                onClick={() => setZoomedImage(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Đóng (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto max-h-[80vh] w-full flex items-center justify-center p-3 bg-white/95 rounded-lg border border-slate-700">
              <img
                src={zoomedImage.src}
                alt={zoomedImage.alt}
                className="max-w-full max-h-[75vh] object-contain rounded shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
