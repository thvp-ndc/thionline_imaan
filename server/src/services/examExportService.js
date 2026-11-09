const JSZip = require('jszip');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const db = require('../db');
const storageConfig = require('../config/storageConfig');
const { getImageDimensions, parseImageMarkdown, calculateWordEmuSize } = require('./imageUtils');
const { latexToOmml, splitTextAndMath, escapeXml } = require('./latexToOmml');
const htmlparser2 = require('htmlparser2');
const specificationValidator = require('./specificationValidator');
const {
  buildExamSections,
  replacePlaceholders,
  calculateContentAwareColumnWidths,
  hasRealTableInContent,
  ensureHeaderPrefix,
  ensureSchoolPrefix
} = require('../utils/examSectionHelper');

/**
 * Service xuất đề thi sang file Word (.docx) chuẩn cấu trúc đề thi Bộ GD&ĐT
 * Quy chuẩn:
 * - Font: Times New Roman
 * - Cỡ chữ: 12 pt (OpenXML: sz="24", szCs="24")
 * - Khoảng cách dòng: 1.0 (OpenXML: line="240" lineRule="auto")
 * - Khoảng cách đoạn: 0 pt (OpenXML: before="0" after="0")
 * - Lề trên, dưới, trái, phải: 1 cm (OpenXML: top="567" bottom="567" left="567" right="567")
 * - Khổ giấy: A4 (OpenXML: w="11906" h="16838" code="9")
 */
function getSchoolInfo() {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'school_info'").get();
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return {
        school_name: parsed.school_name || 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH',
        department_name: parsed.department_name || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
        academic_year: parsed.academic_year || '2025 - 2026'
      };
    }
  } catch (e) {}
  return {
    school_name: 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH',
    department_name: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
    academic_year: '2025 - 2026'
  };
}

/**
 * Làm sạch hoàn toàn định dạng gạch chân đáp án trong phương án cho bản in học sinh
 */
function cleanOptionHtmlForStudent(txt) {
  if (!txt || typeof txt !== 'string') return '';
  let res = txt;
  res = res.replace(/<u\b[^>]*>(.*?)<\/u>/gi, '$1');
  res = res.replace(/<span\s+style="[^"]*text-decoration:\s*underline[^"]*"[^>]*>(.*?)<\/span>/gi, '$1');
  return res;
}

/**
 * Ước tính độ dài hiển thị của nội dung phương án để quyết định layout in đề
 */
function estimateOptionLength(txt) {
  if (!txt) return 0;
  let c = txt.replace(/!\[.*?\]\(.*?\)/g, '[Hình]');
  c = c.replace(/\$(.*?)\$/g, (m, g1) => g1.replace(/\\[a-zA-Z]+/g, 'X').replace(/[{}_^]/g, ''));
  return c.trim().length;
}

/**
 * Tháo bỏ thẻ bọc đơn lẻ <p>...</p> hoặc <div>...</div> quanh nội dung phương án
 * Tránh tạo thêm paragraph lồng nhau khi render bảng phương án
 */
function unwrapSingleWrappingParagraph(txt) {
  if (!txt || typeof txt !== 'string') return '';
  const trimmed = txt.trim();
  const match = trimmed.match(/^<(p|div)\b[^>]*>([\s\S]*?)<\/\1>$/i);
  if (match) {
    // Chỉ unwrap nếu bên trong không còn thẻ <p> hoặc <div> nào khác
    const inner = match[2];
    if (!/<(p|div)\b/i.test(inner)) {
      return inner.trim();
    }
  }
  return txt;
}

/**
 * Tự động tính toán độ dài các phương án A, B, C, D để bố trí:
 * - 4 Cột (1 Dòng duy nhất) nếu các phương án ngắn (tiết kiệm giấy in tối đa)
 * - 2 Cột (2 Dòng) nếu các phương án độ dài vừa phải
 * - 1 Cột (Mỗi phương án 1 dòng riêng) nếu các phương án dài hoặc có hình/code
 * - Áp dụng quy tắc căn lề ngữ cảnh: 1 cột dài căn đều 2 bên (both), 2/4 cột căn trái (left) tránh giãn chữ
 */
function buildOptionsLayoutXml(options, prefixType, processContentFn, leftIndent = 280, printableWidth = null) {
  if (!options || !Array.isArray(options) || options.length === 0) return '';
  const cleanOpts = options.filter(o => o && (o.text !== undefined || o.id)).map(o => ({
    ...o,
    text: unwrapSingleWrappingParagraph(o.text)
  }));
  if (cleanOpts.length === 0) return '';

  const hasComplex = cleanOpts.some(o => {
    const txt = o.text || '';
    return txt.includes('![') || txt.includes('```') || txt.includes('\n') || txt.includes('\r') ||
      /(^|[^\\])`[^`\n]+`/.test(txt) ||
      /<(table|ul|ol|pre|blockquote)\b/i.test(txt) ||
      (/^\s{2,}|\t/m.test(txt) && /[{};]/.test(txt));
  });

  const lengths = cleanOpts.map(o => estimateOptionLength(o.text));
  const maxL = Math.max(...lengths, 0);
  const totalL = lengths.reduce((a, b) => a + b, 0);

  let cols = 1;
  if (!hasComplex && cleanOpts.length === 4) {
    if (maxL <= 18 && totalL <= 65) {
      cols = 4; // 1 dòng 4 phương án
    } else if (maxL <= 45 && totalL <= 150) {
      cols = 2; // 2 dòng, mỗi dòng 2 phương án
    }
  } else if (!hasComplex && cleanOpts.length === 2) {
    if (maxL <= 45) {
      cols = 2;
    }
  }

  // Trường hợp 1 Cột: Mỗi phương án 1 đoạn riêng biệt
  // Nếu phương án dài (>50 ký tự), căn đều 2 bên (both). Nếu ngắn, căn trái (left) để tránh kéo giãn từ
  if (cols === 1) {
    return cleanOpts.map(opt => {
      const pfx = prefixType === 'upper' ? `   ${opt.id}. ` : `   ${opt.id.toLowerCase()}) `;
      const optLen = estimateOptionLength(opt.text);
      const align = optLen > 50 ? 'both' : 'left';
      return processContentFn(opt.text, pfx, true, leftIndent, align);
    }).join('\n');
  }

  // Trường hợp 4 Cột hoặc 2 Cột: Bảng không viền (Borderless Table)
  // Các ô trong bảng phương án luôn căn trái (left) theo chỉ đạo kỹ thuật để không bị giãn khoảng cách từ
  const totalWidth = printableWidth && printableWidth > 2000 ? Math.round(printableWidth) : 9026;
  const cellWidth = Math.floor(totalWidth / cols);
  const rows = [];

  for (let i = 0; i < cleanOpts.length; i += cols) {
    const chunk = cleanOpts.slice(i, i + cols);
    const cellsXml = chunk.map(opt => {
      const pfx = prefixType === 'upper' ? `${opt.id}. ` : `${opt.id.toLowerCase()}) `;
      const cellContent = processContentFn(opt.text, pfx, true, 0, 'left');
      return `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${cellWidth}" w:type="dxa"/>
          <w:tcMar>
            <w:top w:w="0" w:type="dxa"/>
            <w:bottom w:w="0" w:type="dxa"/>
            <w:left w:w="60" w:type="dxa"/>
            <w:right w:w="60" w:type="dxa"/>
          </w:tcMar>
        </w:tcPr>
        ${cellContent}
      </w:tc>`;
    }).join('');

    let paddingCells = '';
    if (chunk.length < cols) {
      for (let p = 0; p < cols - chunk.length; p++) {
        paddingCells += `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p></w:tc>`;
      }
    }

    rows.push(`<w:tr>${cellsXml}${paddingCells}</w:tr>`);
  }

  const gridCols = Array.from({ length: cols }).map(() => `<w:gridCol w:w="${cellWidth}"/>`).join('');

  return `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${totalWidth}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="none"/>
      <w:left w:val="none"/>
      <w:bottom w:val="none"/>
      <w:right w:val="none"/>
      <w:insideH w:val="none"/>
      <w:insideV w:val="none"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="0" w:type="dxa"/>
      <w:bottom w:w="0" w:type="dxa"/>
      <w:left w:w="40" w:type="dxa"/>
      <w:right w:w="40" w:type="dxa"/>
    </w:tblCellMar>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>${gridCols}</w:tblGrid>
  ${rows.join('\n')}
</w:tbl>`;
}

function parseMarkdownTableForWord(tableStr) {
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

function markdownTableToWordXml(tableStr, renderInlineRunsAndMathFn, maxPrintableWidth = 10772, options = {}) {
  if (typeof renderInlineRunsAndMathFn === 'number') {
    options = maxPrintableWidth && typeof maxPrintableWidth === 'object' ? maxPrintableWidth : {};
    maxPrintableWidth = renderInlineRunsAndMathFn;
    renderInlineRunsAndMathFn = null;
  }
  const parsed = parseMarkdownTableForWord(tableStr);
  if (!parsed) return '';

  const { headers, alignments, rows, isHeaderPurelyData } = parsed;
  const allRows = [headers, ...rows];
  const cols = headers.length;
  if (cols === 0) return '';

  const availableWidth = Number.isFinite(maxPrintableWidth) && maxPrintableWidth > 1000 ? Math.round(maxPrintableWidth) : 10772;

  // Sử dụng thuật toán Content-Aware Autofit Column Width (TBL-01, TBL-02, TBL-AUTO)
  const rowsMeta = allRows.map((r, rIdx) => ({
    isHeader: rIdx === 0 && !isHeaderPurelyData,
    cells: r.map(c => {
      const text = String(c || '');
      const hasCode = /`[^`]+`|<pre>|<code>/.test(text);
      return { contentText: text, hasCode };
    })
  }));
  const colWidths = calculateContentAwareColumnWidths(rowsMeta, availableWidth, options);
  const finalTableWidth = colWidths.tableWidth || availableWidth;
  const gridCols = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('');
  const tableAlign = colWidths.isShortTable ? 'left' : 'center';

  const rowsXml = allRows.map((rowCells, rIdx) => {
    const isHeaderRow = (rIdx === 0 && !isHeaderPurelyData);
    const cellsXml = Array.from({ length: cols }).map((_, cIdx) => {
      const cellText = rowCells[cIdx] || '';
      const cellWidth = colWidths[cIdx] || Math.floor(finalTableWidth / cols);
      const align = alignments[cIdx] || 'center';
      let runs;
      if (renderInlineRunsAndMathFn) {
        runs = renderInlineRunsAndMathFn(cellText, isHeaderRow);
      } else {
        const hasCode = /```|<pre\b|<code>|`[^`]+`/.test(cellText);
        if (hasCode) {
          const cleanCode = cellText
            .replace(/```[a-zA-Z0-9_+-]*\n?([\s\S]*?)```/g, '$1')
            .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, '$1')
            .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/<br\s*\/?>/gi, '\n');
          const codeLines = cleanCode.split(/\r?\n/);
          runs = codeLines.map((line, lIdx) => 
            `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>${lIdx < codeLines.length - 1 ? '<w:r><w:br/></w:r>' : ''}`
          ).join('');
        } else {
          runs = `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(cellText)}</w:t></w:r>`;
        }
      }
      return `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${cellWidth}" w:type="dxa"/>
          <w:vAlign w:val="center"/>
          ${isHeaderRow ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}
        </w:tcPr>
        <w:p>
          <w:pPr>
            <w:jc w:val="${align}"/>
            <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
          </w:pPr>
          ${runs || '<w:r><w:t></w:t></w:r>'}
        </w:p>
      </w:tc>`;
    }).join('');

    return `<w:tr>
      <w:trPr>
        ${isHeaderRow ? '<w:tblHeader/>' : ''}
        <w:cantSplit/>
      </w:trPr>
      ${cellsXml}
    </w:tr>`;
  }).join('\n');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${finalTableWidth}" w:type="dxa"/>
      <w:jc w:val="${tableAlign}"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="80" w:type="dxa"/>
        <w:bottom w:w="80" w:type="dxa"/>
        <w:left w:w="120" w:type="dxa"/>
        <w:right w:w="120" w:type="dxa"/>
      </w:tblCellMar>
      <w:tblLayout w:type="fixed"/>
    </w:tblPr>
    <w:tblGrid>${gridCols}</w:tblGrid>
    ${rowsXml}
  </w:tbl>`;
}

function normalizeTrueFalseAnswers(q) {
  const res = { a: '-', b: '-', c: '-', d: '-' };
  if (!q) return res;

  let raw = q.correct_answers;
  const isCorrupted = !raw || 
    (Array.isArray(raw) && (raw.length === 0 || raw.some(x => typeof x === 'string' && x.includes('[object Object]'))));
    
  if (isCorrupted && q.correct_answers_json) {
    try {
      raw = JSON.parse(q.correct_answers_json);
    } catch (e) {
      raw = null;
    }
  }

  const isTrueVal = (v) => {
    if (v === true || v === 1 || v === '1') return true;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      return s === 't' || s === 'true' || s === 'đ' || s === 'đúng' || s === 'dung';
    }
    return false;
  };

  const isFalseVal = (v) => {
    if (v === false || v === 0 || v === '0') return true;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      return s === 'f' || s === 'false' || s === 's' || s === 'sai';
    }
    return false;
  };

  // 1. Dạng Object: {"a":"T", "b":"F", ...}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    ['a', 'b', 'c', 'd'].forEach(k => {
      const val = raw[k] !== undefined ? raw[k] : raw[k.toUpperCase()];
      if (isTrueVal(val)) res[k] = 'Đ';
      else if (isFalseVal(val)) res[k] = 'S';
      else res[k] = '-';
    });
    return res;
  }

  // 2. Dạng Array
  if (Array.isArray(raw) && raw.length > 0) {
    const hasPair = raw.some(x => typeof x === 'string' && /^[a-dA-D]\s*[:=-]/.test(x.trim()));
    if (hasPair) {
      raw.forEach(item => {
        if (typeof item !== 'string') return;
        const m = item.trim().match(/^([a-dA-D])\s*[:=-]\s*(.*)$/);
        if (m) {
          const k = m[1].toLowerCase();
          const v = m[2].trim();
          if (isTrueVal(v)) res[k] = 'Đ';
          else if (isFalseVal(v)) res[k] = 'S';
        }
      });
      return res;
    }

    const allTfValues = raw.length === 4 && raw.every(x => isTrueVal(x) || isFalseVal(x));
    if (allTfValues) {
      ['a', 'b', 'c', 'd'].forEach((k, idx) => {
        res[k] = isTrueVal(raw[idx]) ? 'Đ' : 'S';
      });
      return res;
    }

    const lowerKeys = raw.map(x => String(x).toLowerCase().trim()).filter(Boolean);
    const validLetters = lowerKeys.filter(x => ['a', 'b', 'c', 'd'].includes(x));
    if (validLetters.length > 0 && lowerKeys.length === validLetters.length) {
      ['a', 'b', 'c', 'd'].forEach(k => {
        res[k] = validLetters.includes(k) ? 'Đ' : 'S';
      });
      return res;
    }
  }

  return res;
}

function htmlToWordRuns(nodes, currentStyles = {}, options = {}) {
  if (!nodes || nodes.length === 0) return [];
  const runs = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      const text = node.data;
      if (!text) continue;
      const parts = splitTextAndMath(text);
      for (const part of parts) {
        if (!part || !part.val) continue;
        if (part.type === 'math') {
          const omml = latexToOmml(part.val);
          if (omml) {
            runs.push({ type: 'math', xml: omml });
          } else {
            runs.push({
              type: 'text',
              xml: `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:iCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(part.val)}</w:t></w:r>`
            });
          }
        } else {
          const hasInlinePlaceholder = part.val.includes('___VNLAN_CODE_INLINE_');
          const hasBacktick = /`[^`\n]+`/.test(part.val);
          if (!currentStyles.code && (hasInlinePlaceholder || hasBacktick)) {
            const codeSplits = part.val.split(/(___VNLAN_CODE_INLINE_\d+___|`[^`\n]+`)/g);
            for (const sub of codeSplits) {
              if (!sub) continue;
              let codeText = null;
              const matchPlaceholder = sub.match(/^___VNLAN_CODE_INLINE_(\d+)___$/);
              if (matchPlaceholder && options.inlineCodeTokens) {
                codeText = options.inlineCodeTokens[parseInt(matchPlaceholder[1], 10)];
              } else if (sub.startsWith('`') && sub.endsWith('`') && sub.length >= 2) {
                codeText = sub.slice(1, -1);
              }
              if (codeText !== null) {
                runs.push({
                  type: 'text',
                  xml: `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="0369A1"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:rPr><w:t xml:space="preserve">${escapeXml(codeText)}</w:t></w:r>`
                });
              } else {
                let rPr = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/>';
                if (currentStyles.b) rPr += '<w:b/><w:bCs/>';
                if (currentStyles.i) rPr += '<w:i/><w:iCs/>';
                if (currentStyles.u) rPr += '<w:u w:val="single"/>';
                if (currentStyles.strike) rPr += '<w:strike/>';
                if (currentStyles.vertAlign) rPr += `<w:vertAlign w:val="${currentStyles.vertAlign}"/>`;
                runs.push({
                  type: 'text',
                  xml: `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${escapeXml(sub)}</w:t></w:r>`
                });
              }
            }
          } else {
            let rPr = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/>';
            if (currentStyles.b) rPr += '<w:b/><w:bCs/>';
            if (currentStyles.i) rPr += '<w:i/><w:iCs/>';
            if (currentStyles.u) rPr += '<w:u w:val="single"/>';
            if (currentStyles.strike) rPr += '<w:strike/>';
            if (currentStyles.vertAlign) rPr += `<w:vertAlign w:val="${currentStyles.vertAlign}"/>`;
            if (currentStyles.code) rPr = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="0369A1"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>';

            runs.push({
              type: 'text',
              xml: `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${escapeXml(part.val)}</w:t></w:r>`
            });
          }
        }
      }
    } else if (node.type === 'tag') {
      const tagName = node.name.toLowerCase();

      // Math inline từ TipTap
      if (tagName === 'span' && node.attribs && (node.attribs['data-type'] === 'math-inline' || (node.attribs['class'] && node.attribs['class'].includes('math')))) {
        const latex = node.attribs['data-latex'] || (node.children && node.children[0] ? node.children[0].data : '').replace(/^\$|\$$/g, '');
        if (latex) {
          const omml = latexToOmml(latex);
          if (omml) {
            runs.push({ type: 'math', xml: omml });
          } else {
            runs.push({
              type: 'text',
              xml: `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:iCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(latex)}</w:t></w:r>`
            });
          }
          continue;
        }
      }

      if (tagName === 'br') {
        runs.push({ type: 'br', xml: '<w:r><w:br/></w:r>' });
        continue;
      }

      const nextStyles = { ...currentStyles };
      if (tagName === 'b' || tagName === 'strong') nextStyles.b = true;
      if (tagName === 'i' || tagName === 'em') nextStyles.i = true;
      if (tagName === 'u') nextStyles.u = true;
      if (tagName === 's' || tagName === 'strike' || tagName === 'del') nextStyles.strike = true;
      if (tagName === 'sup') nextStyles.vertAlign = 'superscript';
      if (tagName === 'sub') nextStyles.vertAlign = 'subscript';
      if (tagName === 'code') nextStyles.code = true;

      const childRuns = htmlToWordRuns(node.children || [], nextStyles, options);
      runs.push(...childRuns);
    }
  }

  return runs;
}

function inspectTableCell(cellNode) {
  let contentText = '';
  let hasCode = false;
  let codeLines = [];

  function collectCode(node) {
    if (!node) return '';
    if (node.type === 'text') return node.data || '';
    if (node.type === 'tag') {
      if (node.name.toLowerCase() === 'br') return '\n';
      return (node.children || []).map(collectCode).join('');
    }
    return '';
  }

  function walk(node) {
    if (!node) return;
    if (node.type === 'text') {
      contentText += node.data || '';
    } else if (node.type === 'tag') {
      const tag = node.name.toLowerCase();
      if (tag === 'pre' || tag === 'code') {
        hasCode = true;
        const rawCode = collectCode(node);
        if (rawCode) {
          const lines = rawCode.split(/\r?\n/);
          codeLines.push(...lines);
          contentText += '\n' + rawCode;
        }
      } else if (tag === 'br') {
        contentText += '\n';
      } else {
        (node.children || []).forEach(walk);
      }
    }
  }

  (cellNode.children || []).forEach(walk);

  if (!hasCode && /```[\s\S]*?```/.test(contentText)) {
    hasCode = true;
    const match = contentText.match(/```(?:\w+)?\r?\n([\s\S]*?)```/);
    if (match) {
      codeLines = match[1].split(/\r?\n/);
    }
  }

  return {
    contentText: contentText.trim(),
    hasCode,
    codeLines: hasCode ? (codeLines.length > 0 ? codeLines : contentText.split(/\r?\n/)) : []
  };
}

function htmlTableToWordXml(tableNode, maxPrintableWidth = 10772, options = {}) {
  if (typeof tableNode === 'string') {
    const doc = htmlparser2.parseDocument(tableNode);
    let foundTable = null;
    function findTbl(n) {
      if (foundTable) return;
      if (n && n.type === 'tag' && n.name && n.name.toLowerCase() === 'table') {
        foundTable = n;
        return;
      }
      if (n && n.children) n.children.forEach(findTbl);
    }
    findTbl(doc);
    tableNode = foundTable;
  }
  if (!tableNode || !tableNode.children) return '';

  const rawRows = [];
  function extractRows(node) {
    if (node.type === 'tag') {
      const tag = node.name.toLowerCase();
      if (tag === 'tr') {
        const cells = (node.children || []).filter(c => c.type === 'tag' && (c.name.toLowerCase() === 'th' || c.name.toLowerCase() === 'td'));
        if (cells.length > 0) {
          rawRows.push({
            cells,
            isHeader: cells.every(c => c.name.toLowerCase() === 'th')
          });
        }
      } else if (['thead', 'tbody', 'table'].includes(tag)) {
        (node.children || []).forEach(extractRows);
      }
    }
  }
  extractRows(tableNode);
  if (rawRows.length === 0) return '';

  // 1. Phân tích cấu trúc ma trận 2D hỗ trợ Colspan và Rowspan (TBL-EDGE-03)
  // Tính tổng số cột logic thực sự của bảng
  let maxCols = 1;
  rawRows.forEach(r => {
    let colCountInRow = 0;
    r.cells.forEach(cell => {
      const cs = parseInt(cell.attribs?.colspan || cell.attribs?.colSpan, 10) || 1;
      colCountInRow += cs;
    });
    if (colCountInRow > maxCols) maxCols = colCountInRow;
  });

  const availableWidth = Number.isFinite(maxPrintableWidth) && maxPrintableWidth > 1000 ? Math.round(maxPrintableWidth) : 10772;

  // 2. Đo đạc từng cell để phục vụ thuật toán Content-Aware Autofit Column Width
  const rowsMeta = rawRows.map(r => ({
    isHeader: r.isHeader,
    cells: r.cells.map(cell => inspectTableCell(cell))
  }));

  const colWidths = calculateContentAwareColumnWidths(rowsMeta, availableWidth, options);
  const finalTableWidth = colWidths.tableWidth || availableWidth;
  const gridCols = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('');
  const tableAlign = colWidths.isShortTable ? 'left' : 'center';

  // 3. Xây dựng bản đồ ô gộp (Rowspan & Colspan Grid Matrix)
  const gridMatrix = Array.from({ length: rawRows.length }, () => Array(maxCols).fill(null));

  rawRows.forEach((r, rIdx) => {
    let currentCIdx = 0;
    r.cells.forEach(cell => {
      // Tìm vị trí cột trống tiếp theo trong hàng
      while (currentCIdx < maxCols && gridMatrix[rIdx][currentCIdx] !== null) {
        currentCIdx++;
      }
      if (currentCIdx >= maxCols) return;

      const cs = Math.max(1, parseInt(cell.attribs?.colspan || cell.attribs?.colSpan, 10) || 1);
      const rs = Math.max(1, parseInt(cell.attribs?.rowspan || cell.attribs?.rowSpan, 10) || 1);

      // Điền ô chính tại (rIdx, currentCIdx)
      gridMatrix[rIdx][currentCIdx] = {
        type: 'cell',
        cell,
        colspan: cs,
        rowspan: rs,
        isHeader: r.isHeader || rIdx === 0
      };

      // Đánh dấu các ô bị chiếm bởi colspan trong hàng hiện tại
      for (let c = 1; c < cs; c++) {
        if (currentCIdx + c < maxCols) {
          gridMatrix[rIdx][currentCIdx + c] = { type: 'consumed_by_colspan' };
        }
      }

      // Đánh dấu các ô bị chiếm bởi rowspan trong các hàng sau
      for (let r = 1; r < rs; r++) {
        if (rIdx + r < rawRows.length) {
          gridMatrix[rIdx + r][currentCIdx] = {
            type: 'vmerge_continue',
            colspan: cs
          };
          for (let c = 1; c < cs; c++) {
            if (currentCIdx + c < maxCols) {
              gridMatrix[rIdx + r][currentCIdx + c] = { type: 'consumed_by_colspan' };
            }
          }
        }
      }

      currentCIdx += cs;
    });
  });

  // 4. Render từng hàng XML
  const rowsXml = rawRows.map((r, rIdx) => {
    const isHeaderRow = r.isHeader || rIdx === 0;

    let hasLongCodeInRow = false;
    for (let cIdx = 0; cIdx < maxCols; cIdx++) {
      const item = gridMatrix[rIdx][cIdx];
      if (item && item.type === 'cell') {
        const meta = inspectTableCell(item.cell);
        if (meta.hasCode && meta.codeLines.length > 12) {
          hasLongCodeInRow = true;
          break;
        }
      }
    }

    const cellsXmlArr = [];
    for (let cIdx = 0; cIdx < maxCols; cIdx++) {
      const item = gridMatrix[rIdx][cIdx];
      if (!item || item.type === 'consumed_by_colspan') {
        continue;
      }

      const cs = item.colspan || 1;
      // Tính toán độ rộng ô gộp bằng tổng độ rộng các cột tương ứng
      let cellWidth = 0;
      for (let k = 0; k < cs; k++) {
        cellWidth += (colWidths[cIdx + k] || Math.floor(finalTableWidth / maxCols));
      }

      const gridSpanXml = cs > 1 ? `<w:gridSpan w:val="${cs}"/>` : '';

      if (item.type === 'vmerge_continue') {
        // Ô kế thừa vMerge từ hàng trên
        cellsXmlArr.push(`<w:tc>
          <w:tcPr>
            <w:tcW w:w="${cellWidth}" w:type="dxa"/>
            ${gridSpanXml}
            <w:vMerge/>
          </w:tcPr>
          <w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>
        </w:tc>`);
        continue;
      }

      const cell = item.cell;
      const cellMeta = inspectTableCell(cell);
      const align = cell.attribs?.align || (isHeaderRow ? 'center' : (cellMeta.hasCode ? 'left' : 'left'));
      const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
      const vMergeXml = item.rowspan > 1 ? '<w:vMerge w:val="restart"/>' : '';

      if (cellMeta.hasCode && cellMeta.codeLines.length > 0) {
        // Render khối code đa dòng với font Consolas, nền F8FAFC, căn trái (CODE-01, CODE-02)
        const codeParas = cellMeta.codeLines.map(line => {
          const formattedLine = line.replace(/\t/g, '    ');
          return `<w:p>
            <w:pPr>
              <w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/>
              <w:jc w:val="left"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>
                <w:sz w:val="20"/><w:szCs w:val="20"/>
                <w:color w:val="1E293B"/>
              </w:rPr>
              <w:t xml:space="preserve">${escapeXml(formattedLine)}</w:t>
            </w:r>
          </w:p>`;
        }).join('');

        cellsXmlArr.push(`<w:tc>
          <w:tcPr>
            <w:tcW w:w="${cellWidth}" w:type="dxa"/>
            ${gridSpanXml}
            ${vMergeXml}
            <w:vAlign w:val="top"/>
            <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
          </w:tcPr>
          ${codeParas}
        </w:tc>`);
      } else {
        // Văn bản / công thức thông thường với spacing 0 pt
        const runs = htmlToWordRuns(cell.children, isHeaderRow ? { b: true } : {});
        const runsXml = runs.map(run => run.xml).join('');

        cellsXmlArr.push(`<w:tc>
          <w:tcPr>
            <w:tcW w:w="${cellWidth}" w:type="dxa"/>
            ${gridSpanXml}
            ${vMergeXml}
            <w:vAlign w:val="center"/>
            ${isHeaderRow ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
              ${alignXml}
            </w:pPr>
            ${runsXml}
          </w:p>
        </w:tc>`);
      }
    }

    return `<w:tr>
      <w:trPr>
        ${isHeaderRow ? '<w:tblHeader/>' : ''}
        ${hasLongCodeInRow ? '' : '<w:cantSplit/>'}
      </w:trPr>
      ${cellsXmlArr.join('\n')}
    </w:tr>`;
  }).join('\n');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${finalTableWidth}" w:type="dxa"/>
      <w:jc w:val="${tableAlign}"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="80" w:type="dxa"/>
        <w:bottom w:w="80" w:type="dxa"/>
        <w:left w:w="120" w:type="dxa"/>
        <w:right w:w="120" w:type="dxa"/>
      </w:tblCellMar>
      <w:tblLayout w:type="fixed"/>
    </w:tblPr>
    <w:tblGrid>${gridCols}</w:tblGrid>
    ${rowsXml}
  </w:tbl>`;
}

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
 * Tạo nội dung tệp word/footer1.xml chuẩn OpenXML hiển thị Mã đề hoặc Nhãn tài liệu và Trang PAGE/NUMPAGES căn giữa
 */
function buildExamFooterXml(variantCode = '', customLabel = '') {
  let labelPrefix = '';
  if (customLabel) {
    labelPrefix = `${escapeXml(customLabel)} - `;
  } else if (variantCode) {
    if (variantCode === 'NGAN_HANG_CAU_HOI') {
      labelPrefix = 'Ngân hàng câu hỏi - ';
    } else if (variantCode === 'HD_CHAM') {
      labelPrefix = 'Hướng dẫn chấm - ';
    } else {
      labelPrefix = `Mã đề ${escapeXml(variantCode)} - `;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="center"/>
      <w:spacing w:before="60" w:after="0" w:line="240" w:lineRule="auto"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="20"/><w:szCs w:val="20"/>
      </w:rPr>
      <w:t xml:space="preserve">${labelPrefix}Trang </w:t>
    </w:r>
    <w:fldSimple w:instr="PAGE">
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
          <w:sz w:val="20"/><w:szCs w:val="20"/>
        </w:rPr>
        <w:t>1</w:t>
      </w:r>
    </w:fldSimple>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="20"/><w:szCs w:val="20"/>
      </w:rPr>
      <w:t>/</w:t>
    </w:r>
    <w:fldSimple w:instr="NUMPAGES">
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
          <w:sz w:val="20"/><w:szCs w:val="20"/>
        </w:rPr>
        <w:t>1</w:t>
      </w:r>
    </w:fldSimple>
  </w:p>
</w:ftr>`;
}

/**
 * Xử lý thẻ HTML minh họa trần và cú pháp Tin học có nhận biết ngữ cảnh:
 * - Bảo vệ 100% mã nguồn Tin học (#include <iostream>, vector<int>, a < b)
 * - Khắc phục lỗi double-encoding của các thẻ Rich Text (&lt;p&gt; -> <p>, &lt;strong&gt; -> <strong>)
 * - Không làm rách các thẻ HTML cấu trúc (p, div, span...) kể cả khi bị mất thẻ đóng trong textarea
 */
function escapeIllustrativeTags(str) {
  if (!str || typeof str !== 'string') return '';

  // 1. Phục hồi các thực thể double-encoded đối với các thẻ layout chuẩn (tránh lộ <p>, <strong> khi lưu từ editor)
  let res = str.replace(/&lt;(\/)?(p|div|span|strong|b|em|i|u|s|strike|sub|sup|br|table|thead|tbody|tr|th|td|ul|ol|li)(\s+[^&]*?)?&gt;/gi,
    (m, slash, tag, attrs) => `<${slash || ''}${tag}${attrs || ''}>`);

  // 2. Bảo vệ các cú pháp lập trình Tin học: #include <header>
  res = res.replace(/(#include\s*)<([^>]+)>/gi, (m, inc, h) => `${inc}&lt;${h}&gt;`);

  // 3. Phân biệt thẻ HTML vs cú pháp code Tin học, so sánh toán học và thẻ minh họa trần
  const tagRegex = /<(\/)?([a-zA-Z][a-zA-Z0-9_.-]*|\b[a-zA-Z0-9_./-]+\.h\b)(\s+[^>]*?)?(\/)?>/g;
  res = res.replace(tagRegex, (fullMatch, isSlash, rawTagName, attrs, selfSlash, offset) => {
    const tagName = rawTagName.toLowerCase();

    // 3.1. Nếu không phải là thẻ HTML chuẩn (vd: iostream, vector, stdio.h, bits/stdc++.h, T, int, float...)
    // => Chắc chắn là mã nguồn Tin học, escape để htmlparser2 coi là text thuần
    if (!KNOWN_HTML_CONTAINERS.has(tagName) && !KNOWN_VOID_TAGS.has(tagName)) {
      return `&lt;${isSlash || ''}${rawTagName}${attrs || ''}${selfSlash || ''}&gt;`;
    }

    // 3.2. Nếu attrs chứa các ký tự toán học hoặc logic (&&, ||, +, -, *, /, %, ==, !=, <, >, ~, ^)
    // => Chắc chắn là biểu thức so sánh / logic (ví dụ: a < b && b > c, 0 < x && x < 10)
    if (attrs && /[&|+=*/%!<>~^]/.test(attrs)) {
      return `&lt;${isSlash || ''}${rawTagName}${attrs || ''}${selfSlash || ''}&gt;`;
    }

    // 3.3. Nếu là các phương án lựa chọn hỏi về thẻ HTML (vd A. <ul>, B. <ol>, C. <p>, D. <table>)
    const trimmed = str.trim();
    const isPureOption = /^([A-D]\.\s*)?<[a-zA-Z0-9]+(\/)?>(\s+[A-D]\.\s*<[a-zA-Z0-9]+(\/)?>)*$/.test(trimmed) ||
                         trimmed === `<${rawTagName}>` ||
                         trimmed === `<${rawTagName}/>` ||
                         trimmed === `&lt;${rawTagName}&gt;`;
    if (isPureOption && tagName !== 'img') {
      return `&lt;${isSlash || ''}${rawTagName}${attrs || ''}${selfSlash || ''}&gt;`;
    }

    // 3.4. Thẻ đơn côi trong câu hỏi (ví dụ: "Phần tử <p> trong văn bản HTML...", "Thẻ <b> dùng để...")
    // Nếu là thẻ mở (không có slash), không phải void tag (như br, img), nhưng trong toàn chuỗi KHÔNG có thẻ đóng </tagName>
    if (!isSlash && !selfSlash && KNOWN_HTML_CONTAINERS.has(tagName) && tagName !== 'span') {
      const closingTagRegex = new RegExp(`</${tagName}\\s*>`, 'i');
      if (!closingTagRegex.test(res)) {
        // Nếu thẻ mở không ở vị trí đầu chuỗi (offset > 0) và có ký tự chữ phía trước
        const beforeText = res.slice(0, offset);
        if (offset > 0 && /\S/.test(beforeText)) {
          return `&lt;${rawTagName}${attrs || ''}&gt;`;
        }
      }
    }

    // 3.5. Các thẻ cấu trúc Rich Text chuẩn (p, div, span, b, i, u, br...):
    // Giữ nguyên dạng thẻ HTML để htmlparser2 phân tích DOM tự nhiên, KHÔNG escape thành text entity.
    return fullMatch;
  });

  return res;
}

/**
 * Xuất Khối Mã Nguồn (Code Block) sang Bảng Word Không Viền 2 Cột chuẩn OpenXML:
 * - Cột 1: Số thứ tự dòng riêng biệt (font Consolas, màu xám, căn phải)
 * - Cột 2: Nội dung mã lệnh (font Consolas, preserve spaces, căn trái)
 * - Viền trái màu xanh sky (#0284C7) tạo điểm neo thị giác như IDE
 * - Khi copy mã từ Word không bị dính số dòng
 */
function codeBlockToWordTableXml(codeBody, lang = '', tableWidth = null) {
  if (!codeBody) return '';
  const lines = codeBody.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  
  // Chiều rộng bảng động theo đúng vùng in thực tế (Printable Content Width)
  // Mặc định chuẩn A4 với lề 1-inch (1440 dxa mỗi bên) là 9026 dxa; nếu cấu hình trang có lề khác thì lấy theo tableWidth
  const totalWidth = tableWidth && tableWidth > 2000 ? Math.round(tableWidth) : 9026;
  const col1Width = 650;
  const col2Width = totalWidth - col1Width;

  const rowsXml = lines.map((line, idx) => {
    const lineNum = idx + 1;
    return `<w:tr>
      <w:trPr><w:cantSplit/></w:trPr>
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="${col1Width}" w:type="dxa"/>
          <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
          <w:tcMar>
            <w:top w:w="20" w:type="dxa"/>
            <w:bottom w:w="20" w:type="dxa"/>
            <w:left w:w="40" w:type="dxa"/>
            <w:right w:w="80" w:type="dxa"/>
          </w:tcMar>
        </w:tcPr>
        <w:p>
          <w:pPr>
            <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
            <w:jc w:val="right"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
              <w:sz w:val="18"/>
              <w:szCs w:val="18"/>
              <w:color w:val="94A3B8"/>
            </w:rPr>
            <w:t>${lineNum}</w:t>
          </w:r>
        </w:p>
      </w:tc>
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="${col2Width}" w:type="dxa"/>
          <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
          <w:tcMar>
            <w:top w:w="20" w:type="dxa"/>
            <w:bottom w:w="20" w:type="dxa"/>
            <w:left w:w="120" w:type="dxa"/>
            <w:right w:w="80" w:type="dxa"/>
          </w:tcMar>
        </w:tcPr>
        <w:p>
          <w:pPr>
            <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
            <w:jc w:val="left"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
              <w:sz w:val="20"/>
              <w:szCs w:val="20"/>
              <w:color w:val="0F172A"/>
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(line || ' ')}</w:t>
          </w:r>
        </w:p>
      </w:tc>
    </w:tr>`;
  }).join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${totalWidth}" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="none"/>
        <w:left w:val="single" w:sz="18" w:space="8" w:color="0284C7"/>
        <w:bottom w:val="none"/>
        <w:right w:val="none"/>
        <w:insideH w:val="none"/>
        <w:insideV w:val="none"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="20" w:type="dxa"/>
        <w:bottom w:w="20" w:type="dxa"/>
        <w:left w:w="60" w:type="dxa"/>
        <w:right w:w="60" w:type="dxa"/>
      </w:tblCellMar>
      <w:tblLayout w:type="fixed"/>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="${col1Width}"/>
      <w:gridCol w:w="${col2Width}"/>
    </w:tblGrid>
    ${rowsXml}
  </w:tbl>`;
}

function htmlToWordParagraphs(content, prefixText = '', isPrefixBold = true, leftIndent = 0, defaultAlign = 'both', options = {}) {
  if (typeof defaultAlign === 'object' && defaultAlign !== null && !options.printableWidth && !options.embedImageFn) {
    options = defaultAlign;
    defaultAlign = options.defaultAlign || 'both';
  }
  if (!content && !prefixText) return '';

  const embedImageFn = options.embedImageFn || null;
  const isTableQuestion = Boolean(options.hasTable || hasRealTableInContent(content));
  const tableOptions = { ...options, hasTable: isTableQuestion };

  const makePrefixRun = (txt) => {
    if (!txt) return '';
    return `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/>${isPrefixBold ? '<w:b/><w:bCs/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(txt)}</w:t></w:r>`;
  };

  const pXml = (runsXml, indent = 0, align = defaultAlign, before = 0, after = 0) => {
    const alignVal = align || defaultAlign || 'both';
    const alignXml = `<w:jc w:val="${alignVal}"/>`;
    const indXml = indent > 0 ? `<w:ind w:left="${indent}"/>` : '';
    // Khi câu hỏi có bảng: Khoảng cách giữa các đoạn văn bản (trước bảng, sau bảng) chuẩn xác 0 pt
    const spBefore = isTableQuestion ? 0 : before;
    const spAfter = isTableQuestion ? 0 : after;
    return `<w:p><w:pPr><w:spacing w:before="${spBefore}" w:after="${spAfter}" w:line="240" w:lineRule="auto"/>${indXml}${alignXml}</w:pPr>${runsXml}</w:p>`;
  };

  const tokenRegex = /(```(?:[a-zA-Z0-9_+-]+)?[\s\S]*?```|<pre[\s\S]*?<\/pre>|<table[\s\S]*?<\/table>|(?:^|\n)(?:[ \t]*\|[^\n]+\|[ \t]*\r?\n[ \t]*\|(?:\s*:?---+:?\s*\|)+[ \t]*(?:\r?\n[ \t]*\|[^\n]+\|[ \t]*)*)|!\[.*?\]\(.*?\))/g;
  const parts = (content || '').split(tokenRegex);
  const paragraphBlocks = [];
  let hasEmittedPrefix = false;

  for (const part of parts) {
    if (!part) continue;
    const trimmedPart = part.trim();

    // 1. Code Block: ```lang\n...``` -> Bảng Word Không Viền 2 Cột (Cột 1: Số dòng, Cột 2: Mã nguồn)
    if (trimmedPart.startsWith('```') && trimmedPart.endsWith('```') && trimmedPart.length >= 6) {
      if (prefixText && !hasEmittedPrefix) {
        paragraphBlocks.push(pXml(makePrefixRun(prefixText), leftIndent, defaultAlign));
        hasEmittedPrefix = true;
      }
      const inner = trimmedPart.slice(3, -3);
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
      paragraphBlocks.push(codeBlockToWordTableXml(codeBody, lang, options.printableWidth));
      continue;
    }

    // 1.5. HTML Code Block: <pre...> -> Bảng Word Không Viền 2 Cột font Consolas, nền F1F5F9
    if (trimmedPart.startsWith('<pre') && trimmedPart.endsWith('</pre>')) {
      if (prefixText && !hasEmittedPrefix) {
        paragraphBlocks.push(pXml(makePrefixRun(prefixText), leftIndent, defaultAlign));
        hasEmittedPrefix = true;
      }
      let inner = trimmedPart.replace(/^<pre[^>]*>/i, '').replace(/<\/pre>$/i, '');
      let lang = 'python';
      const codeMatch = inner.match(/^<code(?:\s+class="language-([a-zA-Z0-9_+-]+)")?[^>]*>([\s\S]*?)<\/code>$/i);
      if (codeMatch) {
        if (codeMatch[1]) lang = codeMatch[1];
        inner = codeMatch[2];
      }
      const codeBody = inner
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/^\r?\n/, '')
        .replace(/\r?\n$/, '');
      paragraphBlocks.push(codeBlockToWordTableXml(codeBody, lang, options.printableWidth));
      continue;
    }

    // 2. HTML Table: <table...> (Autofit Contents & Spacing 0 pt)
    if (trimmedPart.startsWith('<table') && trimmedPart.endsWith('</table>')) {
      if (prefixText && !hasEmittedPrefix) {
        paragraphBlocks.push(pXml(makePrefixRun(prefixText), leftIndent, defaultAlign));
        hasEmittedPrefix = true;
      }
      const tblDom = htmlparser2.parseDocument(trimmedPart);
      const tblNode = tblDom.children.find(c => c.name === 'table');
      if (tblNode) {
        paragraphBlocks.push(htmlTableToWordXml(tblNode, options.printableWidth, tableOptions));
      }
      continue;
    }

    // 2.5. Markdown Table: | ... | (Autofit Contents & Spacing 0 pt)
    if (trimmedPart.startsWith('|') && trimmedPart.includes('---')) {
      const parsedTbl = parseMarkdownTableForWord(trimmedPart);
      if (parsedTbl) {
        if (prefixText && !hasEmittedPrefix) {
          paragraphBlocks.push(pXml(makePrefixRun(prefixText), leftIndent, defaultAlign));
          hasEmittedPrefix = true;
        }
        const tblXml = markdownTableToWordXml(trimmedPart, (cellText, isHeader) => {
          let cleanText = (cellText || '').trim();
          cleanText = cleanText.replace(/(?<![\\\$a-zA-Z0-9])([A-Za-z])\s*\{([0-9a-zA-Z]+)\}(?!\$)/g, '$$$1_{$2}$$');
          cleanText = cleanText.replace(/(?<![\\\$a-zA-Z0-9])([A-Za-z])_\{?([0-9a-zA-Z]+)\}?(?!\$)/g, '$$$1_{$2}$$');
          const doc = htmlparser2.parseDocument(cleanText);
          const runs = htmlToWordRuns(doc.children, isHeader ? { b: true } : {});
          return runs.map(r => r.xml).join('');
        }, options.printableWidth, tableOptions);
        if (tblXml) {
          paragraphBlocks.push(tblXml);
          continue;
        }
      }
    }

    // 3. Markdown Image: ![alt](url)
    if (trimmedPart.startsWith('![') && trimmedPart.includes('](') && trimmedPart.endsWith(')')) {
      if (prefixText && !hasEmittedPrefix) {
        paragraphBlocks.push(pXml(makePrefixRun(prefixText), leftIndent, defaultAlign));
        hasEmittedPrefix = true;
      }
      if (embedImageFn) {
        paragraphBlocks.push(embedImageFn(trimmedPart));
      }
      continue;
    }

    // 4. HTML / Text thông thường: Bảo vệ inline code `...` bằng placeholder trước khi phân tích DOM
    const inlineCodeTokens = [];
    const protectedPart = part.replace(/`([^`\n]+)`/g, (m, code) => {
      const idx = inlineCodeTokens.length;
      inlineCodeTokens.push(code);
      return `___VNLAN_CODE_INLINE_${idx}___`;
    });

    const safePart = escapeIllustrativeTags(protectedPart);
    const dom = htmlparser2.parseDocument(safePart);
    const hasBlockTags = dom.children.some(c => c.type === 'tag' && ['p', 'div', 'table', 'ul', 'ol', 'blockquote'].includes(c.name.toLowerCase()));

    if (hasBlockTags) {
      for (const node of dom.children) {
        if (node.type === 'tag') {
          const tagName = node.name.toLowerCase();

          if (tagName === 'p' || tagName === 'div' || tagName === 'blockquote') {
            const runs = htmlToWordRuns(node.children, {}, { inlineCodeTokens });
            let runsXml = runs.map(r => r.xml).join('');
            if (prefixText && !hasEmittedPrefix) {
              runsXml = makePrefixRun(prefixText) + runsXml;
              paragraphBlocks.push(pXml(runsXml, leftIndent, defaultAlign, 0, 0));
              hasEmittedPrefix = true;
            } else {
              paragraphBlocks.push(pXml(runsXml, leftIndent > 0 ? leftIndent : 280, defaultAlign, 0, 0));
            }
          } else if (tagName === 'table') {
            if (prefixText && !hasEmittedPrefix) {
              paragraphBlocks.push(pXml(makePrefixRun(prefixText), leftIndent, defaultAlign));
              hasEmittedPrefix = true;
            }
            paragraphBlocks.push(htmlTableToWordXml(node, options.printableWidth, tableOptions));
          } else if (tagName === 'ul' || tagName === 'ol') {
            if (prefixText && !hasEmittedPrefix) {
              paragraphBlocks.push(pXml(makePrefixRun(prefixText), leftIndent, defaultAlign));
              hasEmittedPrefix = true;
            }
            (node.children || []).filter(c => c.name === 'li').forEach((li, liIdx) => {
              const liRuns = htmlToWordRuns(li.children, {}, { inlineCodeTokens });
              const liBullet = tagName === 'ul' ? '• ' : `${liIdx + 1}. `;
              const liXml = makePrefixRun(liBullet) + liRuns.map(r => r.xml).join('');
              paragraphBlocks.push(pXml(liXml, 400, defaultAlign, 0, 0));
            });
          }
        } else if (node.type === 'text' && node.data.trim()) {
          const runs = htmlToWordRuns([node], {}, { inlineCodeTokens });
          let runsXml = runs.map(r => r.xml).join('');
          if (prefixText && !hasEmittedPrefix) {
            runsXml = makePrefixRun(prefixText) + runsXml;
            paragraphBlocks.push(pXml(runsXml, leftIndent, defaultAlign, 0, 0));
            hasEmittedPrefix = true;
          } else {
            paragraphBlocks.push(pXml(runsXml, leftIndent > 0 ? leftIndent : 280, defaultAlign, 0, 0));
          }
        }
      }
    } else {
      const lines = safePart.split(/\r?\n/);
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (li === 0 && prefixText && !hasEmittedPrefix) {
          const runs = htmlToWordRuns(htmlparser2.parseDocument(line).children, {}, { inlineCodeTokens });
          const runsXml = makePrefixRun(prefixText) + runs.map(r => r.xml).join('');
          paragraphBlocks.push(pXml(runsXml, leftIndent, defaultAlign, 0, 0));
          hasEmittedPrefix = true;
        } else if (line.trim().length > 0) {
          const runs = htmlToWordRuns(htmlparser2.parseDocument(line).children, {}, { inlineCodeTokens });
          const runsXml = runs.map(r => r.xml).join('');
          paragraphBlocks.push(pXml(runsXml, leftIndent > 0 ? leftIndent : 280, defaultAlign, 0, 0));
        }
      }
    }
  }

  if (prefixText && !hasEmittedPrefix) {
    paragraphBlocks.unshift(pXml(makePrefixRun(prefixText), leftIndent, defaultAlign));
  }

  return paragraphBlocks.join('\n');
}

function buildTrueFalseAnswerTableXml(tfQuestions, startNum = 1) {
  if (!tfQuestions || tfQuestions.length === 0) return '';

  const formatTfVal = (v) => {
    if (v === 'Đ' || v === 'T' || v === true) return 'Đúng (Đ)';
    if (v === 'S' || v === 'F' || v === false) return 'Sai (S)';
    return '-';
  };

  const makeTfCell = (text, width, isBold = false, fill = null, align = 'center') => {
    const fillXml = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
    const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
    return `<w:tc>
      <w:tcPr>
        <w:tcW w:w="${width}" w:type="dxa"/>
        <w:vAlign w:val="center"/>
        ${fillXml}
      </w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/>${alignXml}</w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${isBold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r>
      </w:p>
    </w:tc>`;
  };

  const tfRowsXml = [];
  tfRowsXml.push(`<w:tr>
    <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
    ${makeTfCell('Câu hỏi', 1972, true, 'F1F5F9', 'center')}
    ${makeTfCell('Lệnh a)', 2200, true, 'F1F5F9', 'center')}
    ${makeTfCell('Lệnh b)', 2200, true, 'F1F5F9', 'center')}
    ${makeTfCell('Lệnh c)', 2200, true, 'F1F5F9', 'center')}
    ${makeTfCell('Lệnh d)', 2200, true, 'F1F5F9', 'center')}
  </w:tr>`);

  let qNum = startNum;
  for (const q of tfQuestions) {
    const norm = normalizeTrueFalseAnswers(q);
    const label = q.display_number ? `Câu ${q.display_number}` : `Câu ${qNum}`;

    tfRowsXml.push(`<w:tr>
      <w:trPr><w:cantSplit/></w:trPr>
      ${makeTfCell(label, 1972, true, 'F8FAFC', 'center')}
      ${makeTfCell(formatTfVal(norm.a), 2200, norm.a !== '-', null, 'center')}
      ${makeTfCell(formatTfVal(norm.b), 2200, norm.b !== '-', null, 'center')}
      ${makeTfCell(formatTfVal(norm.c), 2200, norm.c !== '-', null, 'center')}
      ${makeTfCell(formatTfVal(norm.d), 2200, norm.d !== '-', null, 'center')}
    </w:tr>`);
    qNum++;
  }

  return `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="10772" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:left w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:right w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="80" w:type="dxa"/>
      <w:bottom w:w="80" w:type="dxa"/>
      <w:left w:w="120" w:type="dxa"/>
      <w:right w:w="120" w:type="dxa"/>
    </w:tblCellMar>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="1972"/>
    <w:gridCol w:w="2200"/>
    <w:gridCol w:w="2200"/>
    <w:gridCol w:w="2200"/>
    <w:gridCol w:w="2200"/>
  </w:tblGrid>
  ${tfRowsXml.join('\n')}
</w:tbl>`;
}

class ExamExportService {
  async generateExamWordBuffer(examOrId, exportOptions = {}) {
    let exam = null;
    let questions = [];

    if (typeof examOrId === 'string') {
      exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examOrId);
      if (!exam) throw new Error('Không tìm thấy đề thi');

      questions = db.prepare(`
        SELECT * FROM questions 
        WHERE exam_id = ? 
        ORDER BY order_index ASC
      `).all(examOrId).map(q => {
        let options = [];
        let correct_answers = [];
        try {
          options = q.options_json ? JSON.parse(q.options_json) : [];
        } catch (e) {}
        try {
          correct_answers = q.correct_answers_json ? JSON.parse(q.correct_answers_json) : [];
        } catch (e) {}
        return {
          ...q,
          order_index: q.order_index || (idx + 1),
          options,
          correct_answers
        };
      });
    } else if (typeof examOrId === 'object' && examOrId !== null) {
      exam = { ...examOrId };
      questions = (examOrId.questions || []).map((q, idx) => {
        let opts = [];
        if (Array.isArray(q.options)) {
          opts = q.options.map(o => ({ ...o }));
        } else if (q.options_json) {
          try { opts = JSON.parse(q.options_json); } catch (e) {}
        }

        let ca = [];
        if (Array.isArray(q.correct_answers)) {
          ca = [...q.correct_answers];
        } else if (q.correct_answers && typeof q.correct_answers === 'object') {
          ca = { ...q.correct_answers };
        } else if (q.correct_answers_json) {
          try { ca = JSON.parse(q.correct_answers_json); } catch (e) {}
        } else if (q.correct_answers !== undefined && q.correct_answers !== null) {
          ca = q.correct_answers;
        }

        return {
          ...q,
          order_index: q.order_index || (idx + 1),
          options: opts,
          correct_answers: ca
        };
      });
    } else {
      throw new Error('Dữ liệu đề thi không hợp lệ');
    }

    const sourceExam = typeof examOrId === 'object' && examOrId !== null ? examOrId : exam;
    const sourceQuestions = Array.isArray(questions) ? questions : [];
    if (sourceQuestions.length === 0) {
      throw new Error(`[ExamExportService] Không thể xuất đề: Đề thi "${sourceExam?.id || examOrId}" không có câu hỏi hợp lệ.`);
    }

    const isStudentMode = exportOptions.mode === 'student' || exportOptions.includeAnswers === false;
    let exportQuestions = sourceQuestions;
    if (isStudentMode) {
      exportOptions.includeAnswers = false;
      // Áp dụng DTO sạch triệt để cho học sinh (P0) - KHÔNG ĐỘT BIẾN sourceExam hay sourceQuestions
      exportQuestions = sourceQuestions.map((q, idx) => ({
        ...q,
        order_index: q.order_index || (idx + 1),
        options: (q.options || []).map(opt => ({
          id: opt.id,
          text: cleanOptionHtmlForStudent(opt.text || opt.content || '')
        })),
        correct_answers: [],
        correct_answers_json: null,
        short_answer: null,
        rubric_guide: '',
        scoring_config: null,
        scoring_config_json: null
      }));
    }

    const exportExam = {
      ...sourceExam,
      questions: exportQuestions
    };
    questions = exportQuestions;
    exam = exportExam;

    // Phân loại các phần câu hỏi chuẩn
    const part1 = questions.filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
    const part2 = questions.filter(q => q.question_type === 'true_false');
    const part3 = questions.filter(q => q.question_type === 'short_answer');
    const part4 = questions.filter(q => q.question_type === 'essay');

    const zip = new JSZip();
    const mediaRelationships = [];
    const uploadsDir = storageConfig.uploadsDir;
    let imgCounter = 0;

    // Helper chèn hình ảnh vào OpenXML Word
    const embedImage = (imgMarkdown) => {
      const parsed = parseImageMarkdown(imgMarkdown);
      const imgSrc = parsed ? parsed.url : imgMarkdown;
      const explicitWidth = parsed ? parsed.width : null;
      const explicitHeight = parsed ? parsed.height : null;

      const fileName = path.basename(imgSrc);
      const filePath = path.join(uploadsDir, fileName);
      if (!fs.existsSync(filePath)) {
        return `<w:p>
          <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
              <w:sz w:val="24"/><w:szCs w:val="24"/>
              <w:i/>
            </w:rPr>
            <w:t xml:space="preserve">[Hình ảnh: ${escapeXml(fileName)}]</w:t>
          </w:r>
        </w:p>`;
      }

      imgCounter++;
      const rId = `rIdImg${imgCounter}`;
      const ext = path.extname(fileName).toLowerCase().replace('.', '') || 'png';
      const targetZipMedia = `media/image_${imgCounter}.${ext}`;
      const imgBuffer = fs.readFileSync(filePath);
      zip.file(`word/${targetZipMedia}`, imgBuffer);

      mediaRelationships.push({
        id: rId,
        target: targetZipMedia,
        ext
      });

      const dims = getImageDimensions(imgBuffer);
      // Giới hạn max width tương ứng lề 1cm trên A4 (~550 pt)
      const { cx, cy } = calculateWordEmuSize(dims?.width || 500, dims?.height || 350, 550, explicitWidth, explicitHeight);

      return `
<w:p>
  <w:pPr>
    <w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/>
    <w:jc w:val="center"/>
  </w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="${imgCounter}" name="${escapeXml(parsed?.alt || 'Hình ảnh')}"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="${imgCounter}" name="${escapeXml(parsed?.alt || 'Hình ảnh')}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;
    };

    /**
     * Tạo các Run XML và Math OMML cho một đoạn văn bản có chứa Math và Inline Code
     */
    const renderInlineRunsAndMath = (text, isBold = false, isItalic = false) => {
      if (!text) return '';
      const parts = splitTextAndMath(text);
      let xml = '';

      for (const part of parts) {
        if (!part || !part.val) continue;

        if (part.type === 'math') {
          // Render công thức toán học OMML
          const omml = latexToOmml(part.val);
          xml += omml;
        } else {
          // Xử lý inline code trong đoạn text thường: `code`
          const codeSplits = part.val.split(/(`[^`\n]+`)/g);
          for (const sub of codeSplits) {
            if (!sub) continue;
            if (sub.startsWith('`') && sub.endsWith('`') && sub.length >= 2) {
              const codeContent = sub.slice(1, -1);
              xml += `<w:r>
                <w:rPr>
                  <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
                  <w:sz w:val="21"/>
                  <w:szCs w:val="21"/>
                  <w:color w:val="0369A1"/>
                  <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
                </w:rPr>
                <w:t xml:space="preserve">${escapeXml(codeContent)}</w:t>
              </w:r>`;
            } else {
              xml += `<w:r>
                <w:rPr>
                  <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                  <w:sz w:val="24"/>
                  <w:szCs w:val="24"/>
                  ${isBold ? '<w:b/><w:bCs/>' : ''}
                  ${isItalic ? '<w:i/><w:iCs/>' : ''}
                </w:rPr>
                <w:t xml:space="preserve">${escapeXml(sub)}</w:t>
              </w:r>`;
            }
          }
        }
      }
      return xml;
    };

    /**
     * Tạo một Paragraph chuẩn với font Times New Roman, cỡ chữ 12, line 1.0, spacing 0pt
     */
    const p = (text, isBold = false, isItalic = false, align = 'left', spacingBefore = 0, spacingAfter = 0) => {
      const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
      const runsXml = renderInlineRunsAndMath(text, isBold, isItalic);
      return `<w:p>
        <w:pPr>
          <w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}" w:line="240" w:lineRule="auto"/>
          ${alignXml}
        </w:pPr>
        ${runsXml}
      </w:p>`;
    };

    const pWithCustomRuns = (runsXml, align = 'left', spacingBefore = 0, spacingAfter = 0, leftIndent = 0) => {
      const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
      const indXml = leftIndent > 0 ? `<w:ind w:left="${leftIndent}"/>` : '';
      return `<w:p>
        <w:pPr>
          <w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}" w:line="240" w:lineRule="auto"/>
          ${indXml}
          ${alignXml}
        </w:pPr>
        ${runsXml}
      </w:p>`;
    };

    const codeBlockXml = (codeText) => {
      const lines = codeText.split(/\r?\n/);
      return lines.map(line => {
        return `<w:p>
  <w:pPr>
    <w:pBdr>
      <w:left w:val="single" w:sz="18" w:space="8" w:color="0284C7"/>
    </w:pBdr>
    <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
    <w:ind w:left="280" w:right="280"/>
    <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
      <w:sz w:val="21"/>
      <w:szCs w:val="21"/>
      <w:color w:val="0F172A"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(line || ' ')}</w:t>
  </w:r>
</w:p>`;
      }).join('\n');
    };

    // Cấu hình trang & lề in ấn thực tế (Hỗ trợ lề Tiết kiệm giấy 1.0-1.2cm hoặc lề Chuẩn 2.0-2.5cm)
    const pageW = exportOptions.pageW || 11906;
    const pageH = exportOptions.pageH || 16838;
    let defMarginL = 680;  // 1.2cm
    let defMarginR = 567;  // 1.0cm
    let defMarginT = 567;  // 1.0cm
    let defMarginB = 567;  // 1.0cm
    if (exportOptions.margins === 'normal') {
      defMarginL = 1417; // 2.5cm
      defMarginR = 850;  // 1.5cm
      defMarginT = 1134; // 2.0cm
      defMarginB = 1134; // 2.0cm
    }
    const marginL = exportOptions.marginL !== undefined ? exportOptions.marginL : defMarginL;
    const marginR = exportOptions.marginR !== undefined ? exportOptions.marginR : defMarginR;
    const marginT = exportOptions.marginT !== undefined ? exportOptions.marginT : defMarginT;
    const marginB = exportOptions.marginB !== undefined ? exportOptions.marginB : defMarginB;
    const printableWidth = pageW - marginL - marginR;

    /**
     * Xử lý nội dung câu hỏi/phương án có chứa HTML, markdown hình ảnh, code block và text kèm công thức toán
     */
    const processContent = (content, prefix = '', isPrefixBold = true, leftIndent = 0, align = 'both') => {
      return htmlToWordParagraphs(content, prefix, isPrefixBold, leftIndent, align, { embedImageFn: embedImage, printableWidth });
    };

    const emptyLine = () => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve"></w:t></w:r></w:p>`;
    const pageBreak = () => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`;

    const paragraphs = [];

    // ==========================================
    // 1. TIÊU ĐỀ & HEADER ĐỀ THI THEO MẪU BẢNG 2 CỘT 4 HÀNG (TMPL-01, TMPL-02, TMPL-03)
    // Cột 1 (48% ~ 5171 dxa): Tên trường & Số trang động (NUMPAGES), Họ tên HS, Lớp & SBD
    // Cột 2 (52% ~ 5602 dxa): Khung Đề/Năm học/Môn/Khối/[Mã đề]/Thời gian (Gộp dọc qua vMerge)
    // Hàng 4 (Gộp 2 cột): Dòng lưu ý làm bài trên Phiếu trả lời trắc nghiệm (gridSpan="2")
    // ==========================================
    const defaultSchool = getSchoolInfo();
    const rawSchoolName = (exportOptions.schoolName || exam.school_name || defaultSchool.school_name);
    const displaySchoolName = ensureSchoolPrefix(rawSchoolName).toUpperCase();
    const departmentName = (exportOptions.departmentName || defaultSchool.department_name).toUpperCase();
    let cleanExamTitle = (exportOptions.examTitle || exam.title || 'ĐỀ KIỂM TRA ĐÁNH GIÁ').replace(/\s*-\s*Mã đề\s*[^\s-]+/gi, '').trim();
    let displayExamTitle = ensureHeaderPrefix(cleanExamTitle, 'ĐỀ').toUpperCase();
    let subjectName = (exportOptions.subjectName || exam.subject || 'TIN HỌC').trim();
    if (subjectName.includes(' - ')) {
      subjectName = subjectName.split(' - ')[1] || subjectName;
    }
    subjectName = subjectName.toUpperCase();

    const gradeText = exportOptions.gradeName || (exam.grade ? String(exam.grade).replace(/Khối\s*/i, '').trim() : (exam.subject && exam.subject.match(/Khối\s*(\d+)/i) ? exam.subject.match(/Khối\s*(\d+)/i)[1] : '12'));
    const variantCode = exportOptions.variantCode || (exam.title && exam.title.match(/Mã đề\s*([^\s-]+)/i) ? exam.title.match(/Mã đề\s*([^\s-]+)/i)[1] : '101');
    const schoolYear = exportOptions.schoolYear || defaultSchool.academic_year || '2025 - 2026';
    const durationMinutes = exportOptions.durationMinutes || exam.duration_minutes || 45;
    const instructionNote = exportOptions.instructionNote || '(Lưu ý: Thí sinh LÀM BÀI TRÊN PHIẾU TRẢ LỜI TRẮC NGHIỆM)';

    // Tính toán độ rộng vùng in thực tế (mặc định 10773 dxa nếu không ghi đè)
    const totalHeaderWidth = printableWidth || 10773;
    const col1Width = Math.round(totalHeaderWidth * 0.48);
    const col2Width = totalHeaderWidth - col1Width;

    paragraphs.push(`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${totalHeaderWidth}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="none"/><w:left w:val="none"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="auto"/>
      <w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/>
    </w:tblBorders>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="${col1Width}"/>
    <w:gridCol w:w="${col2Width}"/>
  </w:tblGrid>
  <w:tr>
    <w:trPr><w:trHeight w:val="320"/></w:trPr>
    <w:tc>
      <w:tcPr><w:tcW w:w="${col1Width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(displaySchoolName)}</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:spacing w:before="40" w:after="0" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:i/><w:iCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">(Đề có </w:t></w:r>
        <w:fldSimple w:instr="NUMPAGES">
          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:i/><w:iCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>1</w:t></w:r>
        </w:fldSimple>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:i/><w:iCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve"> trang)</w:t></w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="${col2Width}" w:type="dxa"/><w:vMerge w:val="restart"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(displayExamTitle)}</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>NĂM HỌC:  ${escapeXml(schoolYear)}</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:i/><w:iCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Môn: ${escapeXml(subjectName)} - Khối: ${escapeXml(gradeText)}   [${escapeXml(variantCode)}]</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:iCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Thời gian làm bài: ${escapeXml(durationMinutes)} phút.</w:t></w:r>
      </w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:trPr><w:trHeight w:val="417"/></w:trPr>
    <w:tc>
      <w:tcPr><w:tcW w:w="${col1Width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Họ tên HS: ……………………………………………</w:t></w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="${col2Width}" w:type="dxa"/><w:vMerge/></w:tcPr>
      <w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr></w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:trPr><w:trHeight w:val="390"/></w:trPr>
    <w:tc>
      <w:tcPr><w:tcW w:w="${col1Width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Lớp: ………. SBD: ……………………………</w:t></w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="${col2Width}" w:type="dxa"/><w:vMerge/></w:tcPr>
      <w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr></w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:trPr><w:trHeight w:val="359"/></w:trPr>
    <w:tc>
      <w:tcPr><w:tcW w:w="${totalHeaderWidth}" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:before="120" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(instructionNote)}</w:t></w:r>
      </w:p>
    </w:tc>
  </w:tr>
</w:tbl>`);

    if (exportOptions.includeExaminerBox) {
      paragraphs.push(emptyLine());
      paragraphs.push(`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${totalHeaderWidth}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:left w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:right w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
    </w:tblBorders>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="4300"/>
    <w:gridCol w:w="${totalHeaderWidth - 4300}"/>
  </w:tblGrid>
  <w:tr>
    <w:trPr><w:cantSplit/></w:trPr>
    <w:tc>
      <w:tcPr><w:tcW w:w="4300" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>ĐIỂM BÀI THI</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Bằng số: ………………………</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Bằng chữ: ……………………</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="${totalHeaderWidth - 4300}" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Cán bộ chấm thi 1: ……………………………………………</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Cán bộ chấm thi 2: ……………………………………………</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Nhận xét: ………………………………………………………</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>`);
      paragraphs.push(emptyLine());
    }

    // ==========================================
    // 2. PHÂN CHIA VÀ XUẤT CÂU HỎI THEO TỪNG PHẦN (NUM-01, NUM-02, NUM-03, SKIP-01)
    // - Tự động bỏ qua phần rỗng
    // - Mỗi phần bắt đầu lại từ Câu 1 (partOrder)
    // - Giữ nguyên số La Mã I, II, III theo chuẩn Khảo thí Bộ GD&ĐT (không đổi Phần III thành II)
    // - Phần III ẩn dòng đáp án khi showPart3AnswerLines === false (PART3-01, PART3-02)
    // - Cơ chế Fail-Closed kiểm soát toàn vẹn số lượng & không trùng lặp câu hỏi
    // ==========================================
    const sections = buildExamSections(questions, exportOptions);

    if (!Array.isArray(sections) || sections.length === 0) {
      throw new Error(`[ExamExportService] Không thể xuất đề: Không tạo được phần thi từ ${questions.length} câu hỏi.`);
    }

    // KIỂM TRA TOÀN VẸN & BẢO TOÀN DANH TÍNH CÂU HỎI (FAIL-CLOSED)
    let totalRenderedQuestions = 0;
    const renderedQuestionIds = new Set();
    sections.forEach((sec) => {
      sec.questions.forEach((q) => {
        totalRenderedQuestions++;
        const qKey = q.id ? String(q.id) : `q_${sec.partId}_${q.partOrder}`;
        if (renderedQuestionIds.has(qKey)) {
          throw new Error(`[ExamExportService] Lỗi toàn vẹn: Phát hiện câu hỏi trùng lặp "${qKey}" giữa các phần thi.`);
        }
        renderedQuestionIds.add(qKey);
      });
    });

    if (totalRenderedQuestions !== questions.length) {
      throw new Error(`[ExamExportService] Lỗi toàn vẹn: Số câu đưa vào DOCX (${totalRenderedQuestions}) không khớp số câu nguồn (${questions.length}).`);
    }

    sections.forEach((sec) => {
      paragraphs.push(p(sec.fullTitle, true, false, 'left', 80, 20));
      paragraphs.push(p(sec.instruction, false, true, 'left', 0, 40));

      sec.questions.forEach((q) => {
        const qPrefix = sec.partId === 'part4'
          ? `Câu ${q.partOrder} (${q.max_score || 1.0} điểm): `
          : `Câu ${q.partOrder}: `;

        paragraphs.push(processContent(q.content, qPrefix, true, 0));

        if (sec.partId === 'part1') {
          const opts = Array.isArray(q.options) ? q.options : [];
          const optXml = buildOptionsLayoutXml(opts, 'upper', processContent, 280, printableWidth);
          if (optXml) paragraphs.push(optXml);
        } else if (sec.partId === 'part2') {
          const subKeys = ['a', 'b', 'c', 'd'];
          const opts = Array.isArray(q.options) && q.options.length > 0 ? q.options : subKeys.map(k => ({ id: k, text: '' }));
          const optXml = buildOptionsLayoutXml(opts, 'lower', processContent, 280, printableWidth);
          if (optXml) paragraphs.push(optXml);
        } else if (sec.partId === 'part3') {
          // Thống nhất 1 cờ chuẩn showPart3AnswerLines (mặc định false khi in trên phiếu trả lời trắc nghiệm)
          const showP3Lines = exportOptions.showPart3AnswerLines === true || (exportOptions.showPart3AnswerLines === undefined && !exportOptions.omitStudentAnswerSection);
          if (showP3Lines) {
            paragraphs.push(p('   Trả lời: ........................................................................................................................................', false, false, 'left', 0, 20, 280));
          }
        } else if (sec.partId === 'part4') {
          // Phần Tự luận: Giữ nguyên các dòng kẻ làm bài (chỉ ẩn khi omitEssayAnswerSection === true)
          if (!exportOptions.omitEssayAnswerSection) {
            paragraphs.push(p('Bài làm:'));
            paragraphs.push(p('..........................................................................................................................................................................'));
            paragraphs.push(p('..........................................................................................................................................................................'));
            paragraphs.push(p('..........................................................................................................................................................................'));
          }
        }
      });
    });

    paragraphs.push(p('------- Hết ------', true, true, 'center', 140, 60));

    // ==========================================
    // TRANG ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM (CHỈ KÈM KHI includeAnswers !== false)
    // ==========================================
    if (exportOptions.includeAnswers !== false) {
      paragraphs.push(pageBreak());
      paragraphs.push(p('ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM CHI TIẾT', true, false, 'center', 0, 20));
      paragraphs.push(p(`${displayExamTitle} (MÃ ĐỀ: ${variantCode})`, true, false, 'center', 0, 20));
      paragraphs.push(p('-----------------------------------------------------------------------------------------------------------------------------------', false, false, 'center', 0, 60));

      let ansCounter = 1;

      // Đáp án Phần I (Bảng ô lưới 10 câu/hàng)
      if (part1.length > 0) {
        paragraphs.push(p('I. ĐÁP ÁN PHẦN I (TRẮC NGHIỆM NHIỀU LỰA CHỌN):', true, false, 'left', 40, 20));
        const p1Items = part1.map((q) => {
          let ca = 'A';
          if (Array.isArray(q.correct_answers) && q.correct_answers.length > 0) {
            ca = q.correct_answers.join(', ');
          } else if (typeof q.correct_answers === 'string') {
            ca = q.correct_answers;
          } else if (q.correct_answers && typeof q.correct_answers === 'object') {
            ca = Object.values(q.correct_answers).join(', ');
          }
          const item = { qNum: ansCounter, answer: ca };
          ansCounter++;
          return item;
        });

        const chunkSize = 10;
        for (let i = 0; i < p1Items.length; i += chunkSize) {
          const chunk = p1Items.slice(i, i + chunkSize);
          const colW = Math.floor(10772 / chunk.length);

          const headerCells = chunk.map(c => `
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="${colW}" w:type="dxa"/>
                <w:vAlign w:val="center"/>
                <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
              </w:tcPr>
              <w:p>
                <w:pPr><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Câu ${c.qNum}</w:t></w:r>
              </w:p>
            </w:tc>`).join('');

          const dataCells = chunk.map(c => `
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="${colW}" w:type="dxa"/>
                <w:vAlign w:val="center"/>
              </w:tcPr>
              <w:p>
                <w:pPr><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t>${escapeXml(c.answer)}</w:t></w:r>
              </w:p>
            </w:tc>`).join('');

          const gridCols = chunk.map(() => `<w:gridCol w:w="${colW}"/>`).join('');

          paragraphs.push(`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="10772" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:left w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:right w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>
      <w:left w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/>
    </w:tblCellMar>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>${gridCols}</w:tblGrid>
  <w:tr><w:trPr><w:cantSplit/></w:trPr>${headerCells}</w:tr>
  <w:tr><w:trPr><w:cantSplit/></w:trPr>${dataCells}</w:tr>
</w:tbl>`);
          paragraphs.push(emptyLine());
        }
      }

      // Đáp án Phần II (Bảng Trắc nghiệm Đúng / Sai có đầy đủ 4 ý a, b, c, d)
      if (part2.length > 0) {
        paragraphs.push(p('II. ĐÁP ÁN PHẦN II (TRẮC NGHIỆM ĐÚNG / SAI):', true, false, 'left', 40, 20));
        
        const formatTfVal = (v) => {
          if (v === 'T' || v === true || v === 'True' || v === 'Đ' || v === 'Đúng' || v === 'dung') return 'Đúng (Đ)';
          if (v === 'F' || v === false || v === 'False' || v === 'S' || v === 'Sai' || v === 'sai') return 'Sai (S)';
          return '-';
        };

        const makeTfCell = (text, width, isBold = false, fill = null, align = 'center') => {
          const fillXml = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
          const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
          return `<w:tc>
            <w:tcPr>
              <w:tcW w:w="${width}" w:type="dxa"/>
              <w:vAlign w:val="center"/>
              ${fillXml}
            </w:tcPr>
            <w:p>
              <w:pPr><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/>${alignXml}</w:pPr>
              <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${isBold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r>
            </w:p>
          </w:tc>`;
        };

        const tfRowsXml = [];
        tfRowsXml.push(`<w:tr>
          <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
          ${makeTfCell('Câu hỏi', 1972, true, 'F1F5F9', 'center')}
          ${makeTfCell('Lệnh a)', 2200, true, 'F1F5F9', 'center')}
          ${makeTfCell('Lệnh b)', 2200, true, 'F1F5F9', 'center')}
          ${makeTfCell('Lệnh c)', 2200, true, 'F1F5F9', 'center')}
          ${makeTfCell('Lệnh d)', 2200, true, 'F1F5F9', 'center')}
        </w:tr>`);

        for (const q of part2) {
          const norm = normalizeTrueFalseAnswers(q);

          tfRowsXml.push(`<w:tr>
            <w:trPr><w:cantSplit/></w:trPr>
            ${makeTfCell(`Câu ${ansCounter}`, 1972, true, 'F8FAFC', 'center')}
            ${makeTfCell(formatTfVal(norm.a), 2200, norm.a !== '-', null, 'center')}
            ${makeTfCell(formatTfVal(norm.b), 2200, norm.b !== '-', null, 'center')}
            ${makeTfCell(formatTfVal(norm.c), 2200, norm.c !== '-', null, 'center')}
            ${makeTfCell(formatTfVal(norm.d), 2200, norm.d !== '-', null, 'center')}
          </w:tr>`);
          ansCounter++;
        }

        paragraphs.push(`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="10772" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:left w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:right w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>
      <w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/>
    </w:tblCellMar>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="1972"/>
    <w:gridCol w:w="2200"/>
    <w:gridCol w:w="2200"/>
    <w:gridCol w:w="2200"/>
    <w:gridCol w:w="2200"/>
  </w:tblGrid>
  ${tfRowsXml.join('\n')}
</w:tbl>`);
        paragraphs.push(emptyLine());
      }

      // Đáp án Phần III (Bảng Trả lời ngắn)
      if (part3.length > 0) {
        paragraphs.push(p('III. ĐÁP ÁN PHẦN III (TRẢ LỜI NGẮN):', true, false, 'left', 40, 20));
        
        const makeSaCell = (text, width, isBold = false, fill = null, align = 'center') => {
          const fillXml = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
          const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
          return `<w:tc>
            <w:tcPr>
              <w:tcW w:w="${width}" w:type="dxa"/>
              <w:vAlign w:val="center"/>
              ${fillXml}
            </w:tcPr>
            <w:p>
              <w:pPr><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/>${alignXml}</w:pPr>
              <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${isBold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r>
            </w:p>
          </w:tc>`;
        };

        const saRowsXml = [];
        saRowsXml.push(`<w:tr>
          <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
          ${makeSaCell('Câu hỏi', 1972, true, 'F1F5F9', 'center')}
          ${makeSaCell('Đáp án chuẩn', 8800, true, 'F1F5F9', 'center')}
        </w:tr>`);

        for (const q of part3) {
          let val = q.short_answer;
          if (!val && Array.isArray(q.correct_answers) && q.correct_answers.length > 0) {
            val = q.correct_answers[0];
          }
          saRowsXml.push(`<w:tr>
            <w:trPr><w:cantSplit/></w:trPr>
            ${makeSaCell(`Câu ${ansCounter}`, 1972, true, 'F8FAFC', 'center')}
            ${makeSaCell(val || 'Không có đáp án', 8800, false, null, 'left')}
          </w:tr>`);
          ansCounter++;
        }

        paragraphs.push(`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="10772" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:left w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:right w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>
      <w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/>
    </w:tblCellMar>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="1972"/>
    <w:gridCol w:w="8800"/>
  </w:tblGrid>
  ${saRowsXml.join('\n')}
</w:tbl>`);
        paragraphs.push(emptyLine());
      }

      // Hướng dẫn chấm Phần IV
      if (part4.length > 0) {
        paragraphs.push(p('IV. HƯỚNG DẪN CHẤM PHẦN IV (TỰ LUẬN):', true, false, 'left', 40, 20));
        for (const q of part4) {
          paragraphs.push(p(`Câu ${ansCounter} (Tối đa ${q.max_score || 1.0} điểm):`, true, false, 'left', 20, 10));
          paragraphs.push(processContent(q.rubric_guide || 'Chấm điểm theo nội dung trả lời đúng trọng tâm câu hỏi của thí sinh.'));
          ansCounter++;
        }
      }
    }

    // ==========================================
    // KHỞI TẠO CÁC FILE TRONG ZIP THEO CHUẨN OPENXML
    // ==========================================
    const extensionsFound = new Set(['rels', 'xml']);
    mediaRelationships.forEach(m => extensionsFound.add(m.ext));
    const defaultTypes = [...extensionsFound].map(ext => {
      let mime = 'application/xml';
      if (ext === 'rels') mime = 'application/vnd.openxmlformats-package.relationships+xml';
      else if (ext === 'png') mime = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
      else if (ext === 'gif') mime = 'image/gif';
      else if (ext === 'svg') mime = 'image/svg+xml';
      else if (ext === 'bmp') mime = 'image/bmp';
      return `<Default Extension="${ext}" ContentType="${mime}"/>`;
    }).join('\n  ');

    const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:updateFields w:val="true"/>
  <m:mathPr>
    <m:mathFont m:val="Cambria Math"/>
    <m:brkBin m:val="before"/>
    <m:brkBinSub m:val="--"/>
    <m:smallFrac m:val="0"/>
    <m:dispDef/>
    <m:lMargin m:val="0"/>
    <m:rMargin m:val="0"/>
    <m:defJc m:val="centerGroup"/>
    <m:wrapIndent m:val="1440"/>
    <m:intLim m:val="subSup"/>
    <m:naryLim m:val="undOvr"/>
  </m:mathPr>
</w:settings>`;
    zip.file('word/settings.xml', settingsXml);

    zip.file('word/footer1.xml', buildExamFooterXml(variantCode));

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${defaultTypes}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`);

    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  ${mediaRelationships.map(m => `<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.target}"/>`).join('\n  ')}
</Relationships>`;
    zip.file('word/_rels/document.xml.rels', relsXml);

    // File styles.xml cấu hình mặc định font Times New Roman, size 12 (24 half-pt), line spacing 1.0 (240), spacing 0pt
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="vi-VN"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>`;
    zip.file('word/styles.xml', stylesXml);

    // Cấu hình trang Khổ giấy A4 theo đúng cấu hình thực tế
    const sectPrXml = `
<w:sectPr>
  <w:footerReference w:type="default" r:id="rIdFooter1"/>
  <w:pgSz w:w="${pageW}" w:h="${pageH}" w:code="9"/>
  <w:pgMar w:top="${marginT}" w:right="${marginR}" w:bottom="${marginB}" w:left="${marginL}" w:header="283" w:footer="283" w:gutter="0"/>
  <w:cols w:space="720"/>
  <w:docGrid w:linePitch="360"/>
</w:sectPr>`;

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${paragraphs.join('\n')}
    ${sectPrXml}
  </w:body>
</w:document>`;

    zip.file('word/document.xml', docXml);

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    return {
      examTitle: exam.title,
      buffer
    };
  }

  /**
   * Xuất danh sách câu hỏi trong Ngân Hàng Câu Hỏi ra file Word (.docx) chuẩn OMML Math & A4
   */
  async generateQuestionBankWordBuffer(filterCriteria = {}, exportOptionsParam = {}) {
    const criteria = filterCriteria && typeof filterCriteria === 'object' ? filterCriteria : {};
    const suppliedOptions = exportOptionsParam && typeof exportOptionsParam === 'object' ? exportOptionsParam : {};

    const {
      grade_subject_id,
      topic_id,
      lesson_id,
      level,
      question_type,
      search
    } = criteria;

    if (!grade_subject_id) {
      throw new Error('Thiếu tham số bắt buộc grade_subject_id');
    }

    const gs = db.prepare(`
      SELECT gs.*, g.name as grade_name, s.name as subject_name
      FROM grade_subjects gs
      JOIN grades g ON gs.grade_id = g.id
      JOIN subjects s ON gs.subject_id = s.id
      WHERE gs.id = ?
    `).get(grade_subject_id);

    if (!gs) throw new Error('Không tìm thấy môn học');

    let filterDesc = '';
    if (topic_id && topic_id !== 'all') {
      const top = db.prepare('SELECT name FROM topics WHERE id = ?').get(topic_id);
      if (top) filterDesc += ` - ${top.name}`;
    }
    if (lesson_id && lesson_id !== 'all') {
      const les = db.prepare('SELECT name FROM lessons WHERE id = ?').get(lesson_id);
      if (les) filterDesc += ` (${les.name})`;
    }

    const questionBankService = require('./questionBankService');
    const MAX_BANK_EXPORT_LIMIT = 5000;

    const qData = questionBankService.getQuestions({
      grade_subject_id,
      topic_id,
      lesson_id,
      level,
      question_type,
      search,
      page: 1,
      limit: MAX_BANK_EXPORT_LIMIT + 1
    });

    const totalMatching = qData.total || 0;
    if (totalMatching > MAX_BANK_EXPORT_LIMIT) {
      throw new Error(`Phạm vi lọc có ${totalMatching.toLocaleString('vi-VN')} câu hỏi, vượt quá giới hạn an toàn ${MAX_BANK_EXPORT_LIMIT.toLocaleString('vi-VN')} câu/lần xuất. Vui lòng thu hẹp bộ lọc theo Chủ đề hoặc Bài học để xuất trọn vẹn.`);
    }

    if (totalMatching === 0) {
      throw new Error('Không tìm thấy câu hỏi nào phù hợp với bộ lọc trong ngân hàng.');
    }

    const questions = qData.questions || [];
    const zip = new JSZip();
    const mediaRelationships = [];
    const uploadsDir = storageConfig.uploadsDir;
    let imgCounter = 0;

    const embedImage = (imgMarkdown) => {
      const parsed = parseImageMarkdown(imgMarkdown);
      const imgSrc = parsed ? parsed.url : imgMarkdown;
      const explicitWidth = parsed ? parsed.width : null;
      const explicitHeight = parsed ? parsed.height : null;

      const fileName = path.basename(imgSrc);
      const filePath = path.join(uploadsDir, fileName);
      if (!fs.existsSync(filePath)) {
        return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">[Hình ảnh: ${escapeXml(fileName)}]</w:t></w:r></w:p>`;
      }

      imgCounter++;
      const rId = `rIdImg${imgCounter}`;
      const ext = path.extname(fileName).toLowerCase().replace('.', '') || 'png';
      const targetZipMedia = `media/image_${imgCounter}.${ext}`;
      const imgBuffer = fs.readFileSync(filePath);
      zip.file(`word/${targetZipMedia}`, imgBuffer);

      mediaRelationships.push({ id: rId, target: targetZipMedia, ext });
      const dims = getImageDimensions(imgBuffer);
      const { cx, cy } = calculateWordEmuSize(dims?.width || 500, dims?.height || 350, 550, explicitWidth, explicitHeight);

      return `
<w:p>
  <w:pPr><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="${imgCounter}" name="${escapeXml(parsed?.alt || 'Hình ảnh')}"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr><pic:cNvPr id="${imgCounter}" name="${escapeXml(parsed?.alt || 'Hình ảnh')}"/><pic:cNvPicPr/></pic:nvPicPr>
              <pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
              <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;
    };

    const renderInlineRunsAndMath = (text, isBold = false, isItalic = false) => {
      if (!text) return '';
      const parts = splitTextAndMath(text);
      let xml = '';
      for (const part of parts) {
        if (!part || !part.val) continue;
        if (part.type === 'math') {
          xml += latexToOmml(part.val);
        } else {
          xml += `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/>${isBold ? '<w:b/><w:bCs/>' : ''}${isItalic ? '<w:i/><w:iCs/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(part.val)}</w:t></w:r>`;
        }
      }
      return xml;
    };

    const p = (text, isBold = false, isItalic = false, align = 'left', spacingBefore = 0, spacingAfter = 0) => {
      const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
      const runsXml = renderInlineRunsAndMath(text, isBold, isItalic);
      return `<w:p><w:pPr><w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}" w:line="240" w:lineRule="auto"/>${alignXml}</w:pPr>${runsXml}</w:p>`;
    };

    const pWithCustomRuns = (runsXml, align = 'left', spacingBefore = 0, spacingAfter = 0, leftIndent = 0) => {
      const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
      const indXml = leftIndent > 0 ? `<w:ind w:left="${leftIndent}"/>` : '';
      return `<w:p><w:pPr><w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}" w:line="240" w:lineRule="auto"/>${indXml}${alignXml}</w:pPr>${runsXml}</w:p>`;
    };

    // Tách bộ lọc nghiệp vụ khỏi tùy chọn xuất, bảo toàn tương thích ngược
    const allowedOptionKeys = [
      'margins',
      'pageW',
      'pageH',
      'marginL',
      'marginR',
      'marginT',
      'marginB'
    ];

    const exportOptions = {};
    for (const key of allowedOptionKeys) {
      if (Object.prototype.hasOwnProperty.call(criteria, key)) {
        exportOptions[key] = criteria[key];
      }
      if (Object.prototype.hasOwnProperty.call(suppliedOptions, key)) {
        exportOptions[key] = suppliedOptions[key];
      }
    }

    // Chuẩn hóa cấu hình lề và kích thước trang
    exportOptions.margins = exportOptions.margins === 'normal' ? 'normal' : 'narrow';
    const pageW = Number.isFinite(exportOptions.pageW) && exportOptions.pageW > 0 ? exportOptions.pageW : 11906;
    const pageH = Number.isFinite(exportOptions.pageH) && exportOptions.pageH > 0 ? exportOptions.pageH : 16838;

    let defMarginL = 680;  // 1.2cm
    let defMarginR = 567;  // 1.0cm
    let defMarginT = 567;  // 1.0cm
    let defMarginB = 567;  // 1.0cm
    if (exportOptions.margins === 'normal') {
      defMarginL = 1417; // 2.5cm
      defMarginR = 850;  // 1.5cm
      defMarginT = 1134; // 2.0cm
      defMarginB = 1134; // 2.0cm
    }
    const marginL = Number.isFinite(exportOptions.marginL) ? exportOptions.marginL : defMarginL;
    const marginR = Number.isFinite(exportOptions.marginR) ? exportOptions.marginR : defMarginR;
    const marginT = Number.isFinite(exportOptions.marginT) ? exportOptions.marginT : defMarginT;
    const marginB = Number.isFinite(exportOptions.marginB) ? exportOptions.marginB : defMarginB;
    const printableWidth = pageW - marginL - marginR;

    /**
     * Xử lý nội dung câu hỏi/phương án có chứa HTML, markdown hình ảnh, code block và text kèm công thức toán
     */
    const processContent = (content, prefix = '', isPrefixBold = true, leftIndent = 0, align = 'both') => {
      return htmlToWordParagraphs(content, prefix, isPrefixBold, leftIndent, align, { embedImageFn: embedImage, printableWidth });
    };

    const paragraphs = [];
    const docTitle = `NGÂN HÀNG CÂU HỎI: ${gs.subject_name.toUpperCase()} - ${gs.grade_name.toUpperCase()}${filterDesc.toUpperCase()}`;

    // Header Bảng 2 cột chuẩn A4
    paragraphs.push(`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="10772" w:type="dxa"/>
    <w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid><w:gridCol w:w="4772"/><w:gridCol w:w="6000"/></w:tblGrid>
  <w:tr>
    <w:tc>
      <w:tcPr><w:tcW w:w="4772" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(getSchoolInfo().department_name)} • ${escapeXml(getSchoolInfo().school_name)}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>NGÂN HÀNG CÂU HỎI CHUẨN HÓA</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(docTitle)}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>(Tổng số: ${questions.length} câu hỏi)</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>`);

    paragraphs.push(p('-----------------------------------------------------------------------------------------------------------------------------------', false, false, 'center', 0, 60));

    // Duyệt từng câu hỏi
    let qNum = 1;
    for (const q of questions) {
      const levelLabel = q.level === 'biet' ? 'Nhận biết' : (q.level === 'hieu' ? 'Thông hiểu' : 'Vận dụng');
      let typeLabel = 'Trắc nghiệm';
      if (q.question_type === 'true_false') typeLabel = 'Đúng / Sai';
      else if (q.question_type === 'short_answer') typeLabel = 'Trả lời ngắn';
      else if (q.question_type === 'essay') typeLabel = 'Tự luận';

      const prefixTag = `Câu ${qNum} [${levelLabel} - ${typeLabel}${q.topic_name ? ' - ' + q.topic_name : ''}]: `;
      paragraphs.push(processContent(q.content, prefixTag, true, 0));

      if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') {
        const opts = Array.isArray(q.options) ? q.options : [];
        const optXml = buildOptionsLayoutXml(opts, 'upper', processContent, 280, printableWidth);
        if (optXml) paragraphs.push(optXml);
      } else if (q.question_type === 'true_false') {
        const subKeys = ['a', 'b', 'c', 'd'];
        const opts = Array.isArray(q.options) && q.options.length > 0 ? q.options : subKeys.map(k => ({ id: k, text: '' }));
        const optXml = buildOptionsLayoutXml(opts, 'lower', processContent, 280, printableWidth);
        if (optXml) paragraphs.push(optXml);
      } else if (q.question_type === 'short_answer') {
        paragraphs.push(p('   Trả lời: ........................................................................................................................................', false, false, 'left', 0, 10, 280));
      } else if (q.question_type === 'essay') {
        paragraphs.push(p('   Bài làm: ..........................................................................................................................................................................', false, false, 'left', 0, 10, 280));
      }

      qNum++;
    }

    // Trang Đáp án ở cuối
    paragraphs.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`);
    paragraphs.push(p('BẢNG ĐÁP ÁN & HƯỚNG DẪN CHẤM CHI TIẾT', true, false, 'center', 0, 30));
    paragraphs.push(p('-----------------------------------------------------------------------------------------------------------------------------------', false, false, 'center', 0, 60));

    // Gán display_number cho từng câu để Bảng đáp án khớp chính xác số thứ tự câu hỏi trong đề
    questions.forEach((q, idx) => { q.display_number = idx + 1; });

    const part1 = questions.filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
    const part2 = questions.filter(q => q.question_type === 'true_false');
    const part3 = questions.filter(q => q.question_type === 'short_answer');
    const part4 = questions.filter(q => q.question_type === 'essay');

    if (part1.length > 0) {
      paragraphs.push(p('I. ĐÁP ÁN TRẮC NGHIỆM NHIỀU LỰA CHỌN (PHẦN I):', true, false, 'left', 40, 20));
      for (const q of part1) {
        const ca = Array.isArray(q.correct_answers) ? q.correct_answers.join(', ') : (q.correct_answers || 'A');
        paragraphs.push(p(`Câu ${q.display_number}: ${ca}`, false, false, 'left', 0, 10));
      }
    }

    if (part2.length > 0) {
      paragraphs.push(p('II. ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI 4 Ý a, b, c, d (PHẦN II):', true, false, 'left', 40, 20));
      paragraphs.push(buildTrueFalseAnswerTableXml(part2));
    }

    if (part3.length > 0) {
      paragraphs.push(p('III. ĐÁP ÁN TRẢ LỜI NGẮN (PHẦN III):', true, false, 'left', 40, 20));
      for (const q of part3) {
        const sa = q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] : '') || 'Không có đáp án';
        paragraphs.push(p(`Câu ${q.display_number}: ${sa}`, false, false, 'left', 0, 10));
      }
    }

    if (part4.length > 0) {
      paragraphs.push(p('IV. HƯỚNG DẪN CHẤM TỰ LUẬN (PHẦN IV):', true, false, 'left', 40, 20));
      for (const q of part4) {
        paragraphs.push(p(`Câu ${q.display_number}:`, true, false, 'left', 10, 10));
        paragraphs.push(processContent(q.rubric_guide || 'Chấm theo đúng trọng tâm yêu cầu bài làm của thí sinh.'));
      }
    }

    // Zip files
    const extensionsFound = new Set(['rels', 'xml']);
    mediaRelationships.forEach(m => extensionsFound.add(m.ext));
    const defaultTypes = [...extensionsFound].map(ext => {
      let mime = 'application/xml';
      if (ext === 'rels') mime = 'application/vnd.openxmlformats-package.relationships+xml';
      else if (ext === 'png') mime = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
      return `<Default Extension="${ext}" ContentType="${mime}"/>`;
    }).join('\n  ');

    const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:updateFields w:val="true"/>
  <m:mathPr>
    <m:mathFont m:val="Cambria Math"/>
    <m:brkBin m:val="before"/>
    <m:brkBinSub m:val="--"/>
    <m:smallFrac m:val="0"/>
    <m:dispDef/>
    <m:lMargin m:val="0"/>
    <m:rMargin m:val="0"/>
    <m:defJc m:val="centerGroup"/>
    <m:wrapIndent m:val="1440"/>
    <m:intLim m:val="subSup"/>
    <m:naryLim m:val="undOvr"/>
  </m:mathPr>
</w:settings>`;
    zip.file('word/settings.xml', settingsXml);

    zip.file('word/footer1.xml', buildExamFooterXml('', 'Ngân hàng câu hỏi'));

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${defaultTypes}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`);

    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  ${mediaRelationships.map(m => `<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.target}"/>`).join('\n  ')}
</Relationships>`;
    zip.file('word/_rels/document.xml.rels', relsXml);

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
</w:styles>`;
    zip.file('word/styles.xml', stylesXml);

    const sectPrXml = `
<w:sectPr>
  <w:footerReference w:type="default" r:id="rIdFooter1"/>
  <w:pgSz w:w="${pageW}" w:h="${pageH}" w:code="9"/>
  <w:pgMar w:top="${marginT}" w:right="${marginR}" w:bottom="${marginB}" w:left="${marginL}" w:header="283" w:footer="283" w:gutter="0"/>
</w:sectPr>`;

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${paragraphs.join('\n')}
    ${sectPrXml}
  </w:body>
</w:document>`;

    zip.file('word/document.xml', docXml);

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    return {
      title: docTitle,
      buffer
    };
  }

  /**
   * Sinh file Excel bảng ma trận đáp án soi chiếu giữa các mã đề thi
   */
  generateAnswerComparisonExcel(variantsData, examInfo) {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    const wsData = [];
    wsData.push([`BẢNG MA TRẬN ĐÁP ÁN SOI CHIẾU CÁC MÃ ĐỀ`]);
    wsData.push([`Kỳ thi / Bài kiểm tra: ${examInfo.title || ''}`]);
    wsData.push([`Môn học: ${examInfo.subject_name || ''} | Khối: ${examInfo.grade_name || ''} | Thời gian: ${examInfo.duration_minutes || 45} phút`]);
    wsData.push([]);

    const headerRow = ['Câu', 'Phần', 'Dạng câu hỏi', 'Điểm'];
    for (const v of variantsData) {
      headerRow.push(`Mã đề ${v.code}`);
    }
    wsData.push(headerRow);

    const numQuestions = variantsData[0]?.questions?.length || 0;
    for (let i = 0; i < numQuestions; i++) {
      const q1 = variantsData[0].questions[i];
      let partName = 'Phần I';
      let typeName = 'Trắc nghiệm ABCD';
      if (q1.question_type === 'true_false') {
        partName = 'Phần II';
        typeName = 'Đúng / Sai';
      } else if (q1.question_type === 'short_answer') {
        partName = 'Phần III';
        typeName = 'Trả lời ngắn';
      } else if (q1.question_type === 'essay') {
        partName = 'Phần IV';
        typeName = 'Tự luận';
      }

      const row = [
        `Câu ${i + 1}`,
        partName,
        typeName,
        q1.max_score || (q1.question_type === 'true_false' ? 1.0 : (q1.question_type === 'short_answer' ? 0.5 : 0.25))
      ];

      for (const v of variantsData) {
        const q = v.questions[i];
        if (!q) {
          row.push('');
          continue;
        }
        let ansStr = '';
        if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') {
          ansStr = Array.isArray(q.correct_answers) ? q.correct_answers.join(', ') : (q.correct_answers || '');
        } else if (q.question_type === 'true_false') {
          const { normalizeTrueFalseMap, resolveCorrectAnswers } = require('./trueFalseUtils');
          const tfMap = normalizeTrueFalseMap(resolveCorrectAnswers(q), 'F');
          ansStr = ['a', 'b', 'c', 'd'].map(k => `${k}:${tfMap[k] === 'T' ? 'Đ' : 'S'}`).join(' ');
        } else if (q.question_type === 'short_answer') {
          ansStr = q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] : '') || '';
        } else if (q.question_type === 'essay') {
          ansStr = 'Tự luận (theo barem)';
        }
        row.push(ansStr);
      }
      wsData.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const colWidths = [
      { wch: 10 },
      { wch: 12 },
      { wch: 20 },
      { wch: 10 }
    ];
    for (let i = 0; i < variantsData.length; i++) {
      colWidths.push({ wch: 22 });
    }
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Soi Chieu Dap An');

    // SHEET 2: BẢNG TRUY VẾT ÁNH XẠ CÂU HỎI VÀ ĐỐI CHIẾU MÃ ĐỀ (AUDIT TRAIL)
    const auditData = [];
    auditData.push(['BẢNG TRUY VẾT ÁNH XẠ CÂU HỎI VÀ ĐỐI CHIẾU MÃ ĐỀ (AUDIT TRAIL)']);
    auditData.push([`Kỳ thi / Bài kiểm tra: ${examInfo.title || ''}`]);
    auditData.push([`Khóa kiểm toán kỹ thuật: Đối chiếu Question ID gốc, vị trí hoán vị và đáp án tương ứng`]);
    auditData.push([]);

    const hasMaster = Boolean(examInfo.masterExam && Array.isArray(examInfo.masterExam.questions));
    const masterQuestions = hasMaster ? examInfo.masterExam.questions : (variantsData[0]?.questions || []);
    const targetVariants = hasMaster ? variantsData : variantsData.slice(1);

    const auditHeader = ['Mã định danh (ID gốc)', 'Câu ở Đề gốc', 'Phần', 'Dạng câu hỏi', 'Điểm', 'Đáp án Đề gốc'];
    for (const v of targetVariants) {
      auditHeader.push(`Mã đề ${v.code} (Vị trí & Đáp án)`);
    }
    auditData.push(auditHeader);

    for (let i = 0; i < masterQuestions.length; i++) {
      const mq = masterQuestions[i];
      let partName = 'Phần I';
      let typeName = 'Trắc nghiệm ABCD';
      if (mq.question_type === 'true_false') {
        partName = 'Phần II';
        typeName = 'Đúng / Sai';
      } else if (mq.question_type === 'short_answer') {
        partName = 'Phần III';
        typeName = 'Trả lời ngắn';
      } else if (mq.question_type === 'essay') {
        partName = 'Phần IV';
        typeName = 'Tự luận';
      }

      let masterAnsStr = '';
      if (mq.question_type === 'single_choice' || mq.question_type === 'multiple_choice') {
        masterAnsStr = Array.isArray(mq.correct_answers) ? mq.correct_answers.join(', ') : (mq.correct_answers || '');
      } else if (mq.question_type === 'true_false') {
        const { normalizeTrueFalseMap, resolveCorrectAnswers } = require('./trueFalseUtils');
        const tfMap = normalizeTrueFalseMap(resolveCorrectAnswers(mq), 'F');
        masterAnsStr = ['a', 'b', 'c', 'd'].map(k => `${k}:${tfMap[k] === 'T' ? 'Đ' : 'S'}`).join(' ');
      } else if (mq.question_type === 'short_answer') {
        masterAnsStr = mq.short_answer || (Array.isArray(mq.correct_answers) ? mq.correct_answers[0] : '') || '';
      } else if (mq.question_type === 'essay') {
        masterAnsStr = 'Tự luận';
      }

      const auditRow = [
        mq.bank_question_id || mq.id || `q_${i + 1}`,
        `Câu ${i + 1}`,
        partName,
        typeName,
        mq.max_score || (mq.question_type === 'true_false' ? 1.0 : (mq.question_type === 'short_answer' ? 0.5 : 0.25)),
        masterAnsStr
      ];

      for (const v of targetVariants) {
        const vIdx = (v.questions || []).findIndex(vq => vq.id === mq.id || (vq.bank_question_id && vq.bank_question_id === mq.bank_question_id));
        if (vIdx >= 0) {
          const vq = v.questions[vIdx];
          let vAns = '';
          if (vq.question_type === 'single_choice' || vq.question_type === 'multiple_choice') {
            vAns = Array.isArray(vq.correct_answers) ? vq.correct_answers.join(', ') : (vq.correct_answers || '');
          } else if (vq.question_type === 'true_false') {
            const { normalizeTrueFalseMap, resolveCorrectAnswers } = require('./trueFalseUtils');
            const tfMap = normalizeTrueFalseMap(resolveCorrectAnswers(vq), 'F');
            vAns = ['a', 'b', 'c', 'd'].map(k => `${k}:${tfMap[k] === 'T' ? 'Đ' : 'S'}`).join(' ');
          } else if (vq.question_type === 'short_answer') {
            vAns = vq.short_answer || (Array.isArray(vq.correct_answers) ? vq.correct_answers[0] : '') || '';
          } else if (vq.question_type === 'essay') {
            vAns = 'Tự luận';
          }
          auditRow.push(`Câu ${vIdx + 1} -> [${vAns}]`);
        } else {
          auditRow.push('Không tìm thấy');
        }
      }
      auditData.push(auditRow);
    }

    const auditWs = XLSX.utils.aoa_to_sheet(auditData);
    auditWs['!cols'] = [
      { wch: 38 },
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 8 },
      { wch: 22 },
      ...variantsData.slice(1).map(() => ({ wch: 28 }))
    ];
    XLSX.utils.book_append_sheet(wb, auditWs, 'Truy Vet Anh Xa Cau Hoi');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Sinh file Word chứa Bảng Ma Trận & Bản Đặc Tả Đề Thi chuẩn Bộ GD&ĐT 2025
   */
  async generateMatrixAndSpecificationWordBuffer({
    title,
    grade_name,
    subject_name,
    duration_minutes = 45,
    total_score = 10.0,
    matrix_items = [],
    school_name
  }) {
    const zip = new JSZip();

    const pageW = 11906;
    const pageH = 16838;
    const marginT = 567;
    const marginR = 567;
    const marginB = 567;
    const marginL = 567;

    const p = (text, isBold = false, isItalic = false, align = 'left', spacingBefore = 0, spacingAfter = 0) => {
      const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
      return `<w:p>
        <w:pPr>
          <w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}" w:line="240" w:lineRule="auto"/>
          ${alignXml}
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
            <w:sz w:val="24"/><w:szCs w:val="24"/>
            ${isBold ? '<w:b/><w:bCs/>' : ''}
            ${isItalic ? '<w:i/><w:iCs/>' : ''}
          </w:rPr>
          <w:t xml:space="preserve">${escapeXml(text)}</w:t>
        </w:r>
      </w:p>`;
    };

    const emptyLine = () => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>`;
    const pageBreak = () => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`;

    const paragraphs = [];
    const defaultSch = getSchoolInfo();
    const sName = (school_name || `${defaultSch.department_name} • ${defaultSch.school_name}`).toUpperCase();

    // 1. Header 2 cột
    paragraphs.push(`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="10772" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
      <w:insideH w:val="none"/><w:insideV w:val="none"/>
    </w:tblBorders>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="4772"/>
    <w:gridCol w:w="6000"/>
  </w:tblGrid>
  <w:tr>
    <w:tc>
      <w:tcPr><w:tcW w:w="4772" w:type="dxa"/></w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(sName)}</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>TỔ CHUYÊN MÔN</w:t></w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>KHUNG MA TRẬN &amp; BẢN ĐẶC TẢ ĐỀ THI</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>(Theo định dạng chuẩn Bộ GD&amp;ĐT 2025)</w:t></w:r>
      </w:p>
    </w:tc>
  </w:tr>
</w:tbl>`);

    paragraphs.push(emptyLine());
    paragraphs.push(p(`MA TRẬN VÀ BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐÁNH GIÁ ĐỊNH KỲ`, true, false, 'center', 40, 20));
    paragraphs.push(p(`Môn: ${subject_name || 'Tin học'} - Khối: ${grade_name || ''} | Thời gian làm bài: ${duration_minutes} phút | Thang điểm: ${total_score}đ`, true, true, 'center', 0, 40));
    paragraphs.push(p('-----------------------------------------------------------------------------------------------------------------------------------', false, false, 'center', 0, 60));

    // Tổng hợp dữ liệu ma trận theo từng chủ đề / bài học
    const rowMap = new Map();
    let totalBietCount = 0, totalHieuCount = 0, totalVdCount = 0;
    let totalBietScore = 0, totalHieuScore = 0, totalVdScore = 0;
    let grandTotalCount = 0, grandTotalScore = 0;

    for (const item of matrix_items) {
      if (!item.count || item.count <= 0) continue;
      const tId = item.topic_id;
      const lId = item.lesson_id || '__none__';
      const rowKey = `${tId}__${lId}`;

      if (!rowMap.has(rowKey)) {
        let tName = item.topic_name;
        if (!tName || tName === 'Chủ đề' || tName.startsWith('Chủ đề:')) {
          try {
            const tRow = db.prepare('SELECT name FROM topics WHERE id = ?').get(tId);
            if (tRow && tRow.name) tName = tRow.name;
          } catch (e) {}
        }
        if (!tName) tName = `Chủ đề ${tId}`;

        let lName = item.lesson_name;
        let objective = '';
        if (item.lesson_id && item.lesson_id !== '__unassigned__') {
          try {
            const lRow = db.prepare('SELECT name, objectives FROM lessons WHERE id = ?').get(item.lesson_id);
            if (lRow) {
              if (!lName || lName === 'Nội dung chung' || lName === 'Bài học' || lName === 'Câu hỏi chung') {
                lName = lRow.name;
              }
              objective = lRow.objectives || '';
            }
          } catch (e) {}
        }
        if (!lName) {
          lName = item.lesson_id === '__unassigned__' ? 'Câu hỏi chung của chủ đề' : 'Nội dung bài học';
        }

        rowMap.set(rowKey, {
          topic_id: tId,
          topic_name: tName,
          lesson_id: item.lesson_id,
          lesson_name: lName,
          objective,
          levelObjectives: { biet: null, hieu: null, vd: null },
          biet: { mcq: 0, tf: 0, sa: 0, essay: 0 },
          hieu: { mcq: 0, tf: 0, sa: 0, essay: 0 },
          vd: { mcq: 0, tf: 0, sa: 0, essay: 0 },
          totalCount: 0,
          totalScore: 0
        });
      }

      const row = rowMap.get(rowKey);
      const lvlKey = item.level === 'van_dung' ? 'vd' : item.level;

      // Ưu tiên sử dụng yêu cầu cần đạt đã được giáo viên biên soạn/chỉnh sửa trong ma trận
      if (item.custom_objective !== undefined && item.custom_objective !== null) {
        row.levelObjectives[lvlKey] = String(item.custom_objective).trim();
      } else if (item.objective !== undefined && item.objective !== null) {
        row.levelObjectives[lvlKey] = String(item.objective).trim();
      }

      let typeKey = 'mcq';
      if (item.question_type === 'true_false') typeKey = 'tf';
      else if (item.question_type === 'short_answer') typeKey = 'sa';
      else if (item.question_type === 'essay') typeKey = 'essay';

      const c = Number(item.count) || 0;
      const score = c * (Number(item.score_per_question) || 0.25);

      if (row[lvlKey]) {
        row[lvlKey][typeKey] = (row[lvlKey][typeKey] || 0) + c;
      }
      row.totalCount += c;
      row.totalScore += score;

      if (lvlKey === 'biet') { totalBietCount += c; totalBietScore += score; }
      else if (lvlKey === 'hieu') { totalHieuCount += c; totalHieuScore += score; }
      else if (lvlKey === 'vd') { totalVdCount += c; totalVdScore += score; }

      grandTotalCount += c;
      grandTotalScore += score;
    }

    grandTotalScore = Math.round(grandTotalScore * 100) / 100;
    const finalScore = grandTotalScore > 0 ? grandTotalScore : 10.0;

    // Helper tạo ô cell OpenXML
    const makeCell = (text, width, isBold = false, align = 'center', fill = null, gridSpan = 1, vMerge = null) => {
      const spanXml = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : '';
      const mergeXml = vMerge ? (vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '';
      const fillXml = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
      const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';

      return `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${width}" w:type="dxa"/>
          <w:vAlign w:val="center"/>
          ${spanXml}
          ${mergeXml}
          ${fillXml}
        </w:tcPr>
        <w:p>
          <w:pPr>
            <w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/>
            ${alignXml}
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
              <w:sz w:val="19"/><w:szCs w:val="19"/>
              ${isBold ? '<w:b/><w:bCs/>' : ''}
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(String(text !== undefined && text !== null ? text : ''))}</w:t>
          </w:r>
        </w:p>
      </w:tc>`;
    };

    // ==========================================
    // PHẦN I: BẢNG MA TRẬN ĐỀ THI
    // ==========================================
    paragraphs.push(p('I. KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KỲ', true, false, 'left', 60, 20));
    paragraphs.push(p(`(TN: Trắc nghiệm ABCD; ĐS: Trắc nghiệm Đúng/Sai; TLN: Trả lời ngắn; TL: Tự luận)`, false, true, 'left', 0, 40));

    const matrixRowsXml = [];

    // Header 1
    matrixRowsXml.push(`<w:tr>
      <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
      ${makeCell('TT', 500, true, 'center', 'F1F5F9', 1, 'restart')}
      ${makeCell('Chủ đề', 1800, true, 'center', 'F1F5F9', 1, 'restart')}
      ${makeCell('Nội dung / Đơn vị kiến thức', 2000, true, 'center', 'F1F5F9', 1, 'restart')}
      ${makeCell('Nhận biết', 1520, true, 'center', 'F1F5F9', 4)}
      ${makeCell('Thông hiểu', 1520, true, 'center', 'F1F5F9', 4)}
      ${makeCell('Vận dụng', 1520, true, 'center', 'F1F5F9', 4)}
      ${makeCell('Tổng số câu', 700, true, 'center', 'F1F5F9', 1, 'restart')}
      ${makeCell('Điểm', 600, true, 'center', 'F1F5F9', 1, 'restart')}
      ${makeCell('Tỉ lệ %', 612, true, 'center', 'F1F5F9', 1, 'restart')}
    </w:tr>`);

    // Header 2
    matrixRowsXml.push(`<w:tr>
      <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
      ${makeCell('', 500, false, 'center', 'F1F5F9', 1, 'continue')}
      ${makeCell('', 1800, false, 'center', 'F1F5F9', 1, 'continue')}
      ${makeCell('', 2000, false, 'center', 'F1F5F9', 1, 'continue')}
      ${makeCell('TN', 380, true, 'center', 'F1F5F9')}
      ${makeCell('ĐS', 380, true, 'center', 'F1F5F9')}
      ${makeCell('TLN', 380, true, 'center', 'F1F5F9')}
      ${makeCell('TL', 380, true, 'center', 'F1F5F9')}
      ${makeCell('TN', 380, true, 'center', 'F1F5F9')}
      ${makeCell('ĐS', 380, true, 'center', 'F1F5F9')}
      ${makeCell('TLN', 380, true, 'center', 'F1F5F9')}
      ${makeCell('TL', 380, true, 'center', 'F1F5F9')}
      ${makeCell('TN', 380, true, 'center', 'F1F5F9')}
      ${makeCell('ĐS', 380, true, 'center', 'F1F5F9')}
      ${makeCell('TLN', 380, true, 'center', 'F1F5F9')}
      ${makeCell('TL', 380, true, 'center', 'F1F5F9')}
      ${makeCell('', 700, false, 'center', 'F1F5F9', 1, 'continue')}
      ${makeCell('', 600, false, 'center', 'F1F5F9', 1, 'continue')}
      ${makeCell('', 612, false, 'center', 'F1F5F9', 1, 'continue')}
    </w:tr>`);

    // Nhóm theo Chủ đề để thêm dòng Cộng từng chủ đề (Subtotal row)
    const topicGroups = new Map();
    for (const [k, r] of rowMap.entries()) {
      if (!topicGroups.has(r.topic_id)) {
        topicGroups.set(r.topic_id, {
          topic_id: r.topic_id,
          topic_name: r.topic_name,
          rows: [],
          biet: { mcq: 0, tf: 0, sa: 0, essay: 0 },
          hieu: { mcq: 0, tf: 0, sa: 0, essay: 0 },
          vd: { mcq: 0, tf: 0, sa: 0, essay: 0 },
          totalCount: 0,
          totalScore: 0
        });
      }
      const tg = topicGroups.get(r.topic_id);
      tg.rows.push(r);
      for (const tKey of ['mcq', 'tf', 'sa', 'essay']) {
        tg.biet[tKey] += r.biet[tKey] || 0;
        tg.hieu[tKey] += r.hieu[tKey] || 0;
        tg.vd[tKey] += r.vd[tKey] || 0;
      }
      tg.totalCount += r.totalCount;
      tg.totalScore += r.totalScore;
    }

    // Dữ liệu từng dòng bài học và dòng Cộng Chủ Đề
    let stt = 1;
    for (const tg of topicGroups.values()) {
      for (const r of tg.rows) {
        const pct = finalScore > 0 ? `${Math.round((r.totalScore / finalScore) * 100)}%` : '0%';
        matrixRowsXml.push(`<w:tr>
          <w:trPr><w:cantSplit/></w:trPr>
          ${makeCell(stt++, 500, false, 'center')}
          ${makeCell(r.topic_name, 1800, false, 'left')}
          ${makeCell(r.lesson_name, 2000, false, 'left')}
          ${makeCell(r.biet.mcq || '', 380)}
          ${makeCell(r.biet.tf || '', 380)}
          ${makeCell(r.biet.sa || '', 380)}
          ${makeCell(r.biet.essay || '', 380)}
          ${makeCell(r.hieu.mcq || '', 380)}
          ${makeCell(r.hieu.tf || '', 380)}
          ${makeCell(r.hieu.sa || '', 380)}
          ${makeCell(r.hieu.essay || '', 380)}
          ${makeCell(r.vd.mcq || '', 380)}
          ${makeCell(r.vd.tf || '', 380)}
          ${makeCell(r.vd.sa || '', 380)}
          ${makeCell(r.vd.essay || '', 380)}
          ${makeCell(r.totalCount, 700, true)}
          ${makeCell(Math.round(r.totalScore * 100) / 100, 600, true)}
          ${makeCell(pct, 612, true)}
        </w:tr>`);
      }

      // DÒNG CỘNG CHỦ ĐỀ (SUBTOTAL ROW)
      const topicPct = finalScore > 0 ? `${Math.round((tg.totalScore / finalScore) * 100)}%` : '0%';
      matrixRowsXml.push(`<w:tr>
        <w:trPr><w:cantSplit/></w:trPr>
        ${makeCell(`Cộng ${tg.topic_name}`, 4300, true, 'left', 'F8FAFC', 3)}
        ${makeCell(tg.biet.mcq || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.biet.tf || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.biet.sa || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.biet.essay || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.hieu.mcq || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.hieu.tf || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.hieu.sa || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.hieu.essay || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.vd.mcq || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.vd.tf || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.vd.sa || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.vd.essay || '', 380, true, 'center', 'F8FAFC')}
        ${makeCell(tg.totalCount, 700, true, 'center', 'F8FAFC')}
        ${makeCell(Math.round(tg.totalScore * 100) / 100, 600, true, 'center', 'F8FAFC')}
        ${makeCell(topicPct, 612, true, 'center', 'F8FAFC')}
      </w:tr>`);
    }

    // Dòng Tổng Cộng
    const bietPct = finalScore > 0 ? `${Math.round((totalBietScore / finalScore) * 100)}%` : '40%';
    const hieuPct = finalScore > 0 ? `${Math.round((totalHieuScore / finalScore) * 100)}%` : '30%';
    const vdPct = finalScore > 0 ? `${Math.round((totalVdScore / finalScore) * 100)}%` : '30%';

    matrixRowsXml.push(`<w:tr>
      <w:trPr><w:cantSplit/></w:trPr>
      ${makeCell('TỔNG CỘNG', 4300, true, 'center', 'F1F5F9', 3)}
      ${makeCell(totalBietCount, 1520, true, 'center', 'F1F5F9', 4)}
      ${makeCell(totalHieuCount, 1520, true, 'center', 'F1F5F9', 4)}
      ${makeCell(totalVdCount, 1520, true, 'center', 'F1F5F9', 4)}
      ${makeCell(grandTotalCount, 700, true, 'center', 'F1F5F9')}
      ${makeCell(finalScore, 600, true, 'center', 'F1F5F9')}
      ${makeCell('100%', 612, true, 'center', 'F1F5F9')}
    </w:tr>`);

    paragraphs.push(`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="10772" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/>
      <w:left w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/>
    </w:tblCellMar>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="500"/><w:gridCol w:w="1800"/><w:gridCol w:w="2000"/>
    <w:gridCol w:w="380"/><w:gridCol w:w="380"/><w:gridCol w:w="380"/><w:gridCol w:w="380"/>
    <w:gridCol w:w="380"/><w:gridCol w:w="380"/><w:gridCol w:w="380"/><w:gridCol w:w="380"/>
    <w:gridCol w:w="380"/><w:gridCol w:w="380"/><w:gridCol w:w="380"/><w:gridCol w:w="380"/>
    <w:gridCol w:w="700"/><w:gridCol w:w="600"/><w:gridCol w:w="612"/>
  </w:tblGrid>
  ${matrixRowsXml.join('\n')}
</w:tbl>`);

    paragraphs.push(p(`* Tỉ lệ phân bố điểm số: Nhận biết: ${bietPct} • Thông hiểu: ${hieuPct} • Vận dụng: ${vdPct}.`, false, true, 'left', 40, 20));

    // ==========================================
    // PHẦN II: BẢN ĐẶC TẢ MA TRẬN ĐỀ THI
    // ==========================================
    paragraphs.push(pageBreak());
    paragraphs.push(p('II. BẢN ĐẶC TẢ MA TRẬN ĐỀ KIỂM TRA ĐÁNH GIÁ ĐỊNH KỲ', true, false, 'left', 60, 20));
    paragraphs.push(p(`Bản đặc tả chi tiết mức độ đánh giá, yêu cầu cần đạt chuẩn kiến thức kĩ năng tương ứng với các dạng câu hỏi của đề thi.`, false, true, 'left', 0, 40));

    const specRowsXml = [];
    specRowsXml.push(`<w:tr>
      <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
      ${makeCell('TT', 500, true, 'center', 'F1F5F9')}
      ${makeCell('Chủ đề', 1800, true, 'center', 'F1F5F9')}
      ${makeCell('Nội dung / Đơn vị kiến thức', 2000, true, 'center', 'F1F5F9')}
      ${makeCell('Mức độ', 1100, true, 'center', 'F1F5F9')}
      ${makeCell('Yêu cầu cần đạt (Chuẩn KT-KN)', 3972, true, 'center', 'F1F5F9')}
      ${makeCell('Số câu hỏi theo dạng', 1400, true, 'center', 'F1F5F9')}
    </w:tr>`);

    let specStt = 1;
    for (const [k, r] of rowMap.entries()) {
      const levels = [
        { key: 'biet', label: 'Nhận biết', data: r.biet },
        { key: 'hieu', label: 'Thông hiểu', data: r.hieu },
        { key: 'vd', label: 'Vận dụng', data: r.vd }
      ];

      for (const lvl of levels) {
        const parts = [];
        if (lvl.data.mcq > 0) parts.push(`${lvl.data.mcq} TN`);
        if (lvl.data.tf > 0) parts.push(`${lvl.data.tf} Đ/S`);
        if (lvl.data.sa > 0) parts.push(`${lvl.data.sa} TLN`);
        if (lvl.data.essay > 0) parts.push(`${lvl.data.essay} TL`);

        if (parts.length > 0) {
          let desc = r.levelObjectives ? r.levelObjectives[lvl.key] : null;

          // Nếu ma trận chưa có custom_objective, mới tra cứu CSDL bài học gốc
          if (desc === undefined || desc === null) {
            if (r.lesson_id && r.lesson_id !== '__unassigned__') {
              try {
                const lRow = db.prepare('SELECT name, objectives, objectives_by_level_json FROM lessons WHERE id = ?').get(r.lesson_id);
                if (lRow) {
                  const resolved = specificationValidator.resolveLessonObjectiveForLevel(lRow, lvl.key);
                  // Không coi văn bản giữ chỗ là nội dung chính thức
                  if (resolved.status === specificationValidator.SPEC_STATUS.PLACEHOLDER || resolved.status === specificationValidator.SPEC_STATUS.MISSING) {
                    desc = '';
                  } else {
                    desc = resolved.text;
                  }
                }
              } catch (e) {}
            }
          }

          // Kiểm tra lại: nếu chứa văn bản giữ chỗ đã biết thì để trống ô trong Word
          if (specificationValidator.isPlaceholder(desc)) {
            desc = '';
          }

          specRowsXml.push(`<w:tr>
            <w:trPr><w:cantSplit/></w:trPr>
            ${makeCell(specStt++, 500, false, 'center')}
            ${makeCell(r.topic_name, 1800, false, 'left')}
            ${makeCell(r.lesson_name, 2000, false, 'left')}
            ${makeCell(lvl.label, 1100, true, 'center')}
            ${makeCell(desc ? String(desc).trim() : '', 3972, false, 'left')}
            ${makeCell(parts.join(' + '), 1400, true, 'center')}
          </w:tr>`);
        }
      }
    }

    paragraphs.push(`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="10772" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>
      <w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/>
    </w:tblCellMar>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="500"/><w:gridCol w:w="1800"/><w:gridCol w:w="2000"/>
    <w:gridCol w:w="1100"/><w:gridCol w:w="3972"/><w:gridCol w:w="1400"/>
  </w:tblGrid>
  ${specRowsXml.join('\n')}
</w:tbl>`);

    // Standard OpenXML structures
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
</w:styles>`;
    zip.file('word/styles.xml', stylesXml);

    const sectPrXml = `
<w:sectPr>
  <w:pgSz w:w="${pageW}" w:h="${pageH}" w:code="9"/>
  <w:pgMar w:top="${marginT}" w:right="${marginR}" w:bottom="${marginB}" w:left="${marginL}"/>
</w:sectPr>`;

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${paragraphs.join('\n')}
    ${sectPrXml}
  </w:body>
</w:document>`;

    zip.file('word/document.xml', docXml);

    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
  }

  /**
   * Sinh gói in ấn hoàn chỉnh (.zip):
   * - N mã đề Word (.docx) kèm template tiêu đề trường/lớp chuẩn. Bỏ phần làm bài của học sinh P3, P4
   * - 1 file Excel bảng ma trận đáp án soi chiếu
   * - 1 file Word chứa bảng ma trận & bản đặc tả đề thi
   */
  async generateMatrixPrintPackage({
    title,
    grade_subject_id,
    duration_minutes = 45,
    total_score = 10.0,
    variants = 1,
    variant_codes = null,
    matrix_items = [],
    school_name
  }) {
    const matrixGeneratorService = require('./matrixGeneratorService');
    const check = matrixGeneratorService.validateMatrixAvailability(grade_subject_id, matrix_items);
    if (!check.isFullyAvailable) {
      const missingDetails = check.items.filter(i => !i.is_available).map(i => {
        const target = i.lesson_name ? `${i.topic_name} > ${i.lesson_name}` : i.topic_name;
        return `• ${target} (${i.level.toUpperCase()} - ${i.question_type}): Cần ${i.count_required}, có ${i.count_available}`;
      }).join('\n');
      throw new Error(`Kho câu hỏi chưa đủ số lượng để tạo đề theo ma trận:\n${missingDetails}`);
    }

    // Kiểm tra ràng buộc Tổng điểm chuẩn 10.0 ± 0.01 (hoặc theo target_score cấu hình)
    if (total_score === undefined || total_score === null || total_score === '') {
      throw new Error('Thiếu cấu hình tổng điểm (total_score không được để trống).');
    }
    const targetScore = Number(total_score);
    if (!Number.isFinite(targetScore) || targetScore <= 0) {
      throw new Error(`Cấu hình tổng điểm không hợp lệ: "${total_score}". Tổng điểm phải là số thực dương > 0.`);
    }

    const calculatedScore = check.totalScoreCalculated;
    matrixGeneratorService.validateTotalScore(calculatedScore, targetScore, 0.01);

    const gs = db.prepare(`
      SELECT gs.*, g.name as grade_name, s.name as subject_name
      FROM grade_subjects gs
      JOIN grades g ON gs.grade_id = g.id
      JOIN subjects s ON gs.subject_id = s.id
      WHERE gs.id = ?
    `).get(grade_subject_id);

    const subjectStr = gs ? `${gs.grade_name} - ${gs.subject_name}` : 'Chung';
    
    // 1. Xử lý danh sách mã đề tùy biến từ giáo viên
    let codes = [];
    if (Array.isArray(variant_codes) && variant_codes.length > 0) {
      codes = variant_codes.map(c => String(c).trim()).filter(Boolean);
    }
    if (codes.length === 0) {
      const numVariants = Math.max(1, parseInt(variants, 10) || 1);
      codes = Array.from({ length: numVariants }, (_, i) => String(100 + i + 1));
    }

    // 2. Rút mẫu 1 lần duy nhất từ ngân hàng để tạo Đề Gốc chuẩn (Master Exam Paper)
    const masterExam = matrixGeneratorService.buildMasterExamFromMatrix({
      title: title.trim(),
      grade_subject_id,
      duration_minutes,
      total_score,
      matrix_items,
      school_name
    });

    // 3. Sinh các biến thể mã đề hoán vị qua engine chuyên dụng (bước 3)
    const generationId = 'gen_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    const { variants: variantResults } = matrixGeneratorService.generateMatrixVariants({
      masterExam,
      codes,
      generationId,
      options: {
        shuffleQuestions: true,
        shuffleOptions: true,
        shuffleTfOptions: true
      }
    });

    const variantsData = [];
    const masterZip = new JSZip();

    for (const variant of variantResults) {
      const code = variant.code;
      // Sinh file Word Đề thi in: BỎ PHẦN LÀM BÀI CỦA HỌC SINH TRÊN ĐỀ CỦA PHẦN III VÀ PHẦN IV
      const docxResult = await this.generateExamWordBuffer(variant, {
        omitStudentAnswerSection: true,
        variantCode: String(code),
        schoolName: school_name
      });

      masterZip.file(`De_Thi_In/De_Thi_Ma_De_${code}.docx`, docxResult.buffer);

      variantsData.push({
        code,
        title: variant.title,
        questions: variant.questions,
        manifest: variant.manifest
      });
    }

    // Sinh 1 file Excel bảng ma trận đáp án soi chiếu (kèm đối chiếu Đề gốc - Master Exam)
    const excelBuffer = this.generateAnswerComparisonExcel(variantsData, {
      title: title.trim(),
      subject_name: masterExam.subject_name || gs?.subject_name,
      grade_name: masterExam.grade_name || gs?.grade_name,
      duration_minutes,
      masterExam
    });
    masterZip.file('Bang_Dap_An_Soi_Chieu.xlsx', excelBuffer);

    // Sinh 1 file Word chứa bảng ma trận & bản đặc tả đề thi
    const matrixDocxBuffer = await this.generateMatrixAndSpecificationWordBuffer({
      title: title.trim(),
      grade_name: masterExam.grade_name || gs?.grade_name || '',
      subject_name: masterExam.subject_name || gs?.subject_name || '',
      duration_minutes,
      total_score,
      matrix_items,
      school_name
    });
    masterZip.file('Ma_Tran_Va_Ban_Dac_Ta_De_Thi.docx', matrixDocxBuffer);

    const cleanTitle = title.trim().replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g, '_');
    const zipBuffer = await masterZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    return {
      fileName: `Goi_In_An_${cleanTitle}_${codes.length}MaDe.zip`,
      buffer: zipBuffer
    };
  }

  /**
   * Sinh file Word Hướng dẫn chấm & Đáp án chi tiết cho các mã đề hoán vị
   */
  async generateAnswerGuideWordBuffer(masterExam, variants = []) {
    const zip = new JSZip();

    const pageW = 11906;
    const pageH = 16838;
    const marginL = 1417;
    const marginR = 850;
    const marginT = 1134;
    const marginB = 1134;

    const p = (text, isBold = false, isItalic = false, align = 'left', spacingBefore = 0, spacingAfter = 0) => {
      const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
      return `<w:p>
        <w:pPr>
          <w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}" w:line="240" w:lineRule="auto"/>
          ${alignXml}
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
            <w:sz w:val="24"/><w:szCs w:val="24"/>
            ${isBold ? '<w:b/><w:bCs/>' : ''}
            ${isItalic ? '<w:i/><w:iCs/>' : ''}
          </w:rPr>
          <w:t xml:space="preserve">${escapeXml(text)}</w:t>
        </w:r>
      </w:p>`;
    };

    const emptyLine = () => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>`;
    const pageBreak = () => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`;

    const cell = (text, isBold = false, isHeader = false, width = 1500, align = 'center') => {
      const alignXml = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
      const bgXml = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="E2E8F0"/>' : '';
      return `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${width}" w:type="dxa"/>
          ${bgXml}
          <w:tcMar>
            <w:top w:w="80" w:type="dxa"/>
            <w:bottom w:w="80" w:type="dxa"/>
            <w:left w:w="120" w:type="dxa"/>
            <w:right w:w="120" w:type="dxa"/>
          </w:tcMar>
        </w:tcPr>
        <w:p>
          <w:pPr>
            <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
            ${alignXml}
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
              <w:sz w:val="22"/><w:szCs w:val="22"/>
              ${isBold ? '<w:b/><w:bCs/>' : ''}
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(String(text || ''))}</w:t>
          </w:r>
        </w:p>
      </w:tc>`;
    };

    const paragraphs = [];

    // Header Trường & Tiêu đề
    paragraphs.push(p(masterExam.school_name || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO', true, false, 'center', 0, 40));
    paragraphs.push(p(`ĐÁP ÁN & HƯỚNG DẪN CHẤM BÀI KIỂM TRA`, true, false, 'center', 40, 40));
    paragraphs.push(p(`Môn: ${masterExam.subject || 'Chung'} | Khối: ${masterExam.grade || ''} | Thời gian: ${masterExam.duration_minutes || 45} phút`, false, true, 'center', 0, 120));
    paragraphs.push(p(`(Áp dụng cho Đề gốc và các Mã đề hoán vị: ${(variants || []).map(v => v.variant_code).join(', ')})`, false, true, 'center', 0, 160));
    paragraphs.push(emptyLine());

    // 1. BẢNG ĐÁP ÁN TRẮC NGHIỆM PHẦN I
    const allVariantsList = [
      { code: 'Đề gốc', questions: masterExam.questions || [] },
      ...(variants || []).map(v => ({ code: v.variant_code, questions: v.questions || [] }))
    ];

    paragraphs.push(p('PHẦN I. ĐÁP ÁN TRẮC NGHIỆM NHIỀU LỰA CHỌN', true, false, 'left', 120, 60));

    // Lọc các câu Phần I
    const p1Questions = (masterExam.questions || []).filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
    if (p1Questions.length > 0) {
      const totalTblW = 10772;
      const qColW = 1200;
      const numVarCols = allVariantsList.length;
      const remainW = totalTblW - qColW;
      const colW = Math.max(1000, Math.floor(remainW / numVarCols));
      const lastColW = remainW - colW * (numVarCols - 1);

      let tblXml = `<w:tbl>
        <w:tblPr>
          <w:tblW w:w="${totalTblW}" w:type="dxa"/>
          <w:tblLayout w:type="fixed"/>
          <w:tblBorders>
            <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          </w:tblBorders>
        </w:tblPr>
        <w:tblGrid>
          <w:gridCol w:w="${qColW}"/>
          ${allVariantsList.map((_, vIdx) => `<w:gridCol w:w="${vIdx === numVarCols - 1 ? lastColW : colW}"/>`).join('')}
        </w:tblGrid>`;

      // Header row
      tblXml += `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell('Câu', true, true, qColW)}`;
      for (let vIdx = 0; vIdx < numVarCols; vIdx++) {
        const v = allVariantsList[vIdx];
        const w = (vIdx === numVarCols - 1) ? lastColW : colW;
        tblXml += cell(`Mã ${v.code}`, true, true, w);
      }
      tblXml += `</w:tr>`;

      // Rows for each question in Part I
      for (let i = 0; i < p1Questions.length; i++) {
        tblXml += `<w:tr>${cell(String(i + 1), true, false, qColW)}`;
        for (let vIdx = 0; vIdx < numVarCols; vIdx++) {
          const v = allVariantsList[vIdx];
          const w = (vIdx === numVarCols - 1) ? lastColW : colW;
          const vP1 = (v.questions || []).filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
          const q = vP1[i];
          const ca = q ? (Array.isArray(q.correct_answers) ? q.correct_answers.join(', ') : String(q.correct_answers || '')) : '';
          tblXml += cell(ca, false, false, w);
        }
        tblXml += `</w:tr>`;
      }
      tblXml += `</w:tbl>`;
      paragraphs.push(tblXml);
    } else {
      paragraphs.push(p('(Không có câu hỏi trắc nghiệm nhiều lựa chọn)', false, true));
    }
    paragraphs.push(emptyLine());

    // 2. BẢNG ĐÁP ÁN PHẦN II (ĐÚNG / SAI)
    const p2Questions = (masterExam.questions || []).filter(q => q.question_type === 'true_false');
    if (p2Questions.length > 0) {
      paragraphs.push(p('PHẦN II. ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI', true, false, 'left', 120, 60));
      for (const v of allVariantsList) {
        paragraphs.push(p(`• Mã đề ${v.code}:`, true, false, 'left', 60, 20));
        const vP2 = (v.questions || []).filter(q => q.question_type === 'true_false');
        let tfTbl = `<w:tbl>
          <w:tblPr>
            <w:tblW w:w="7600" w:type="dxa"/>
            <w:tblLayout w:type="fixed"/>
            <w:tblBorders>
              <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
              <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
              <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
              <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
              <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
              <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            </w:tblBorders>
          </w:tblPr>
          <w:tblGrid>
            <w:gridCol w:w="1200"/>
            <w:gridCol w:w="1600"/>
            <w:gridCol w:w="1600"/>
            <w:gridCol w:w="1600"/>
            <w:gridCol w:w="1600"/>
          </w:tblGrid>
          <w:tr><w:trPr><w:tblHeader/></w:trPr>
            ${cell('Câu', true, true, 1200)}
            ${cell('Ý a)', true, true, 1600)}
            ${cell('Ý b)', true, true, 1600)}
            ${cell('Ý c)', true, true, 1600)}
            ${cell('Ý d)', true, true, 1600)}
          </w:tr>`;

        const { normalizeTrueFalseMap, resolveCorrectAnswers } = require('./trueFalseUtils');
        vP2.forEach((q, idx) => {
          const tfMap = normalizeTrueFalseMap(resolveCorrectAnswers(q), 'F');
          const valA = tfMap.a === 'T' ? 'Đúng' : 'Sai';
          const valB = tfMap.b === 'T' ? 'Đúng' : 'Sai';
          const valC = tfMap.c === 'T' ? 'Đúng' : 'Sai';
          const valD = tfMap.d === 'T' ? 'Đúng' : 'Sai';

          tfTbl += `<w:tr>
            ${cell(`Câu ${idx + 1}`, true, false, 1200)}
            ${cell(valA, false, false, 1600)}
            ${cell(valB, false, false, 1600)}
            ${cell(valC, false, false, 1600)}
            ${cell(valD, false, false, 1600)}
          </w:tr>`;
        });
        tfTbl += `</w:tbl>`;
        paragraphs.push(tfTbl);
        paragraphs.push(emptyLine());
      }
    }

    // 3. ĐÁP ÁN PHẦN III (TRẢ LỜI NGẮN)
    const p3Questions = (masterExam.questions || []).filter(q => q.question_type === 'short_answer');
    if (p3Questions.length > 0) {
      paragraphs.push(p('PHẦN III. ĐÁP ÁN TRẢ LỜI NGẮN', true, false, 'left', 120, 60));
      for (const v of allVariantsList) {
        paragraphs.push(p(`• Mã đề ${v.code}:`, true, false, 'left', 40, 20));
        const vP3 = (v.questions || []).filter(q => q.question_type === 'short_answer');
        vP3.forEach((q, idx) => {
          const ans = q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] : '') || '';
          const qNum = (idx + 1);
          paragraphs.push(p(`   Câu ${qNum}: Đáp số: ${ans}`, false, false, 'left', 0, 20));
        });
      }
      paragraphs.push(emptyLine());
    }

    // 4. BAREM ĐIỂM PHẦN IV (TỰ LUẬN)
    const p4Questions = (masterExam.questions || []).filter(q => q.question_type === 'essay');
    if (p4Questions.length > 0) {
      paragraphs.push(p('PHẦN IV. HƯỚNG DẪN CHẤM & BAREM ĐIỂM TỰ LUẬN', true, false, 'left', 120, 60));
      p4Questions.forEach((q, idx) => {
        const qNum = q.order_index || q.display_order || (idx + 1);
        paragraphs.push(p(`Câu ${qNum} (${q.max_score || 1.0} điểm):`, true, false, 'left', 40, 20));
        if (q.content) {
          try {
            const contentParas = htmlToWordParagraphs(q.content);
            if (contentParas && contentParas.length > 0) {
              paragraphs.push(contentParas);
            } else {
              paragraphs.push(p(`Đề bài: ${q.content}`, false, true, 'left', 0, 20));
            }
          } catch (e) {
            paragraphs.push(p(`Đề bài: ${q.content}`, false, true, 'left', 0, 20));
          }
        }
        if (q.rubric_guide) {
          paragraphs.push(p(`Hướng dẫn chấm chi tiết:`, true, false, 'left', 0, 20));
          const lines = String(q.rubric_guide).split(/\r?\n/);
          for (const line of lines) {
            paragraphs.push(p(`   ${line}`, false, false, 'left', 0, 10));
          }
        }
        paragraphs.push(emptyLine());
      });
    }

    // Styles & Packaging docx
    zip.file('word/footer1.xml', buildExamFooterXml('HD_CHAM'));

    const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:updateFields w:val="true"/>
</w:settings>`;
    zip.file('word/settings.xml', settingsXml);

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`);

    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`);

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
</w:styles>`;
    zip.file('word/styles.xml', stylesXml);

    const sectPrXml = `
<w:sectPr>
  <w:footerReference w:type="default" r:id="rIdFooter1"/>
  <w:pgSz w:w="${pageW}" w:h="${pageH}" w:code="9"/>
  <w:pgMar w:top="${marginT}" w:right="${marginR}" w:bottom="${marginB}" w:left="${marginL}" w:header="283" w:footer="283" w:gutter="0"/>
</w:sectPr>`;

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${paragraphs.join('\n')}
    ${sectPrXml}
  </w:body>
</w:document>`;

    zip.file('word/document.xml', docXml);

    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
  }

  /**
   * Sinh gói in ấn đề hoán vị từ đề gốc (.ZIP):
   * - 00_De_Goc_Kem_Dap_An.docx
   * - Thư mục De_Thi_In/ chứa các đề thi hoán vị in ấn
   * - Bang_Dap_An_Soi_Chieu.xlsx
   * - Huong_Dan_Cham_Va_Dap_An_Chi_Tiet.docx
   */
  async generateShuffledExamPackageZip({
    masterExamId,
    variantCodes = ['101', '102'],
    options = {}
  }) {
    const examService = require('./examService');
    const { masterExam, variants } = examService.generateExamVariants(masterExamId, variantCodes, options);

    const masterZip = new JSZip();

    // 1. File Đề gốc kèm đáp án & barem chi tiết (.docx)
    const masterDocx = await this.generateExamWordBuffer(masterExam, {
      ...options,
      showPart3AnswerLines: options.showPart3AnswerLines ?? false,
      omitStudentAnswerSection: options.showPart3AnswerLines === false,
      includeAnswers: true,
      variantCode: 'GỐC',
      schoolName: options.schoolName || masterExam.school_name
    });
    masterZip.file('00_De_Goc_Kem_Dap_An.docx', masterDocx.buffer);

    // 2. Thư mục De_Thi_In/ chứa các đề thi hoán vị in ấn (.docx) (KHÔNG kèm đáp án ở cuối đề)
    for (const v of variants) {
      const vDocx = await this.generateExamWordBuffer(v, {
        ...options,
        showPart3AnswerLines: options.showPart3AnswerLines ?? false,
        omitStudentAnswerSection: options.showPart3AnswerLines === false,
        includeAnswers: false,
        variantCode: v.variant_code,
        schoolName: options.schoolName || masterExam.school_name
      });
      masterZip.file(`De_Thi_In/De_Thi_Ma_De_${v.variant_code}.docx`, vDocx.buffer);
    }

    // Kiểm toán xác thực Fail-Closed: Bảo đảm dữ liệu đáp án của tất cả các biến thể còn nguyên vẹn
    for (const v of variants) {
      if (!Array.isArray(v.questions) || v.questions.length === 0) {
        throw new Error(`[ExamExportService] Lỗi dữ liệu: Mã đề hoán vị ${v.variant_code} không có câu hỏi.`);
      }
      for (const q of v.questions) {
        if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') {
          if (!Array.isArray(q.correct_answers) || q.correct_answers.length === 0) {
            throw new Error(`[ExamExportService] Lỗi toàn vẹn (Fail-Closed): Mã đề ${v.variant_code} câu ${q.order_index} bị khuyết đáp án trắc nghiệm.`);
          }
        } else if (q.question_type === 'true_false') {
          const { resolveCorrectAnswers, normalizeTrueFalseMap } = require('./trueFalseUtils');
          const resolved = resolveCorrectAnswers(q);
          const tfMap = normalizeTrueFalseMap(resolved, null);
          if (!tfMap || (tfMap.a === null && tfMap.b === null && tfMap.c === null && tfMap.d === null)) {
            throw new Error(`[ExamExportService] Lỗi toàn vẹn (Fail-Closed): Mã đề ${v.variant_code} câu ${q.order_index} bị khuyết đáp án Đúng/Sai.`);
          }
        } else if (q.question_type === 'short_answer') {
          const ans = q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] : '');
          if (!ans || String(ans).trim() === '') {
            throw new Error(`[ExamExportService] Lỗi toàn vẹn (Fail-Closed): Mã đề ${v.variant_code} câu ${q.order_index} bị khuyết đáp án trả lời ngắn.`);
          }
        }
      }
    }

    // 3. File Excel Bảng ma trận đáp án soi chiếu (.xlsx)
    const variantsData = [
      { code: 'Gốc', title: masterExam.title, questions: masterExam.questions },
      ...variants.map(v => ({ code: v.variant_code, title: v.title, questions: v.questions }))
    ];

    const excelBuffer = this.generateAnswerComparisonExcel(variantsData, {
      title: masterExam.title,
      subject_name: masterExam.subject,
      grade_name: masterExam.grade,
      duration_minutes: masterExam.duration_minutes
    });
    masterZip.file('Bang_Dap_An_Soi_Chieu.xlsx', excelBuffer);

    // 4. File Word Hướng dẫn chấm và đáp án chi tiết (.docx)
    const guideDocx = await this.generateAnswerGuideWordBuffer(masterExam, variants);
    masterZip.file('Huong_Dan_Cham_Va_Dap_An_Chi_Tiet.docx', guideDocx);

    const cleanTitle = (masterExam.title || 'De_Thi').trim().replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g, '_');
    const zipBuffer = await masterZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    return {
      fileName: `Goi_Tron_De_${cleanTitle}_${variants.length}MaDe.zip`,
      buffer: zipBuffer
    };
  }
}

const instance = new ExamExportService();
instance.htmlToWordParagraphs = htmlToWordParagraphs;
instance.htmlToWordRuns = htmlToWordRuns;
instance.htmlTableToWordXml = htmlTableToWordXml;
instance.normalizeTrueFalseAnswers = normalizeTrueFalseAnswers;
instance.buildTrueFalseAnswerTableXml = buildTrueFalseAnswerTableXml;
instance.markdownTableToWordXml = markdownTableToWordXml;
instance.parseMarkdownTableForWord = parseMarkdownTableForWord;
instance.escapeIllustrativeTags = escapeIllustrativeTags;
instance.codeBlockToWordTableXml = codeBlockToWordTableXml;
instance.ensureHeaderPrefix = ensureHeaderPrefix;
instance.ensureSchoolPrefix = ensureSchoolPrefix;

module.exports = instance;
