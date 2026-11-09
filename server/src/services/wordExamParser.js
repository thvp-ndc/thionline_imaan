const mammoth = require('mammoth');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const storageConfig = require('../config/storageConfig');
const { parseOMMLNode } = require('./ommlToLatex');
const { autoFormatMathInContent } = require('./unicodeMathToLatex');
const { normalizeTrueFalseMap } = require('./trueFalseUtils');
const { extractMathTypeToLatex, convertWmfToWebImage } = require('./wmfUtils');
const { formatImageMarkdown } = require('./imageUtils');

/**
 * Phân tách nhiều đáp án tương đương bằng State Machine nhận biết độ sâu ngoặc và dấu nháy
 * Bảo toàn tập hợp S = {2; 3}, mã lệnh print("a | b"), biểu thức f(g(x)), v.v.
 * Không cắt vụn chuỗi khi dấu phân cách nằm trong {}, [], (), "", '', ``
 */
function splitAlternativeAnswers(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  // Chuẩn hóa ký tự gạch ngang/dấu trừ unicode (en-dash \u2013, em-dash \u2014, minus \u2212)
  let text = rawText.replace(/[\u2013\u2014\u2212]/g, '-').trim();
  if (!text) return [];

  const tokens = [];
  let current = '';
  let nestingDepth = 0;
  let quoteChar = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prevCh = i > 0 ? text[i - 1] : '';

    // Xử lý dấu nháy ("", '', ``)
    if (quoteChar) {
      current += ch;
      if (ch === quoteChar && prevCh !== '\\') {
        quoteChar = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quoteChar = ch;
      current += ch;
      continue;
    }

    // Xử lý độ sâu ngoặc {}, [], ()
    if (ch === '{' || ch === '[' || ch === '(') {
      nestingDepth++;
      current += ch;
      continue;
    }

    if (ch === '}' || ch === ']' || ch === ')') {
      if (nestingDepth > 0) nestingDepth--;
      current += ch;
      continue;
    }

    // Nếu đang ở cấp ngoài cùng (depth == 0, không trong quote)
    if (nestingDepth === 0) {
      // 1. Phân tách theo dấu | hoặc ;
      if (ch === '|' || ch === ';') {
        if (current.trim()) tokens.push(current.trim());
        current = '';
        continue;
      }

      // 2. Phân tách theo từ khóa 'hoặc là', 'hoặc', 'or'
      const remaining = text.slice(i);
      const wordMatch = remaining.match(/^(\s+(?:hoặc\s+là|hoặc|or)\s+)/i);
      if (wordMatch) {
        if (current.trim()) tokens.push(current.trim());
        current = '';
        i += wordMatch[1].length - 1; // nhảy qua từ khóa
        continue;
      }
    }

    current += ch;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  // Khử trùng lặp và loại bỏ dấu bao quanh nếu có
  const unique = [];
  tokens.forEach(tok => {
    let t = tok.trim();
    // Chỉ lột bỏ quote ngoài cùng nếu token được bao quanh hoàn toàn bởi cùng 1 loại quote và không phải chuỗi code
    if ((t.startsWith('"') && t.endsWith('"') && t.length >= 2 && !t.slice(1, -1).includes('"')) ||
        (t.startsWith("'") && t.endsWith("'") && t.length >= 2 && !t.slice(1, -1).includes("'"))) {
      t = t.slice(1, -1).trim();
    }
    if (t && !unique.includes(t)) {
      unique.push(t);
    }
  });

  return unique;
}

/**
 * Loại bỏ tiền tố có kiểm soát (Guarded Prefix Stripping)
 * Không tự tiện xóa 'x =', 'S =' nếu không phải số thuần túy hoặc nếu là môn Tin học/chuỗi.
 */
function cleanShortAnswerPrefix(rawStr, isCodeOrText = false) {
  if (!rawStr || typeof rawStr !== 'string') return { value: '', raw: rawStr, wasStripped: false, prefix: null };
  const s = rawStr.trim();
  if (isCodeOrText) {
    return { value: s, raw: s, wasStripped: false, prefix: null };
  }

  const prefixMatch = s.match(/^(?:x\s*=\s*|y\s*=\s*|s\s*=\s*|kq\s*[:=]\s*|kết\s*quả\s*[:=]\s*|đáp\s*số\s*[:=]\s*|đáp\s*án\s*[:=]\s*)/i);
  if (prefixMatch) {
    const remainder = s.slice(prefixMatch[0].length).trim();
    // Chỉ loại bỏ tiền tố khi phần còn lại là số thuần túy (Toán / KHTN)
    if (/^-?\d+([.,]\d+)?$/.test(remainder)) {
      return {
        value: remainder,
        raw: s,
        wasStripped: true,
        prefix: prefixMatch[0].trim()
      };
    }
  }

  return { value: s, raw: s, wasStripped: false, prefix: null };
}

/**
 * Nhận diện dòng gán biến / biểu thức lập trình (Assignment statement)
 * Bao gồm: A = 10, B = 20, A[i] = x, A += 1, B *= 2, v.v.
 */
function isAssignmentLine(text) {
  const s = String(text || '').trim();
  return /^(?:[A-Za-z_]\w*(?:\[[^\]\r\n]+\])?)\s*(?:\+=|-=|\*=|\/=|%=|=(?!=))\s*.+$/.test(s);
}

/**
 * Nhận diện dòng gọi phương thức trên đối tượng (Method invocation)
 * Bao gồm: A.append(x), B.sort(), list.push(1), v.v. (không có khoảng trắng sau dấu chấm)
 */
function isMethodCallLine(text) {
  const s = String(text || '').trim();
  return /^[A-Za-z_]\w*(?:\[[^\]\r\n]+\])?\.[A-Za-z_]\w*\s*\(.*\)\s*;?$/.test(s);
}

/**
 * Nhận diện câu lệnh điều khiển, lặp hoặc định nghĩa code (Control flow / Keyword statement)
 * Bao gồm: if A == 10:, for i in range:, while ..., def ..., class ..., return ..., print(...)
 */
function isControlFlowLine(text) {
  const s = String(text || '').trim();
  return /^(?:if|elif|else|for|while|def|class|return|import|from|print|#|console\.|System\.out)\b/i.test(s);
}

/**
 * Kiểm tra tổng thể xem dòng văn bản có phải cú pháp code Tin học không
 */
function isCodeSyntaxLine(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return isAssignmentLine(trimmed) || isMethodCallLine(trimmed) || isControlFlowLine(trimmed);
}

/**
 * Trích xuất nhiều đáp án tương đương từ dòng text đáp án trả lời ngắn
 * Tích hợp State Machine Tokenizer và Guarded Prefix Stripping
 */
function extractShortAnswersFromRaw(rawText, isCodeOrText = false) {
  if (!rawText || typeof rawText !== 'string') return { answers: [], raw: rawText, prefixStripped: null };
  const tokens = splitAlternativeAnswers(rawText);
  const answers = [];
  let prefixStripped = null;

  tokens.forEach(tok => {
    const { value, wasStripped, prefix } = cleanShortAnswerPrefix(tok, isCodeOrText);
    if (wasStripped && !prefixStripped) {
      prefixStripped = prefix;
    }
    if (value && !answers.includes(value)) {
      answers.push(value);
    }
  });

  return {
    answers,
    raw: rawText,
    prefixStripped
  };
}

/**
 * Tự động phát hiện cấu hình scoring_config cho câu hỏi Trả lời ngắn theo Kiến trúc 3 lớp V2.0 Hardened:
 * 1. answer_format (định dạng dữ liệu: integer, decimal, text, expression)
 * 2. grading_policy (chính sách so khớp: allow_comma_dot_equivalence, case_sensitive, trim_whitespace, numeric_equivalence)
 * 3. exam_constraints (ràng buộc phòng thi: mode, max_characters, allowed_characters)
 */
function detectShortAnswerScoringConfig(answers) {
  const config = {
    answer_format: 'decimal',
    grading_policy: {
      allow_comma_dot_equivalence: true,
      case_sensitive: false,
      trim_whitespace: true,
      numeric_equivalence: false
    },
    exam_constraints: {
      mode: 'free',
      max_characters: null,
      allowed_characters: null
    },
    // Flattened keys để tương thích hoàn toàn ngược với engine chấm cũ
    allow_comma_dot_equivalence: true,
    case_sensitive: false,
    trim_whitespace: true,
    numeric_equivalence: false,
    max_characters: null
  };

  if (!answers || answers.length === 0) return config;

  const isAllInteger = answers.every(a => /^-?\d+$/.test(a.trim()));
  const isAllDecimal = answers.every(a => /^-?\d+([.,]\d+)?$/.test(a.trim()));
  const hasBracketsOrCode = answers.some(a => /[{}[\]()=><"']|\b(?:print|def|return|import)\b/i.test(a.trim()));

  if (isAllInteger) {
    config.answer_format = 'integer';
    config.grading_policy.allow_comma_dot_equivalence = false;
    config.allow_comma_dot_equivalence = false;
  } else if (isAllDecimal) {
    config.answer_format = 'decimal';
    config.grading_policy.allow_comma_dot_equivalence = true;
    config.allow_comma_dot_equivalence = true;
  } else if (hasBracketsOrCode) {
    config.answer_format = 'expression';
    config.grading_policy.allow_comma_dot_equivalence = false;
    config.allow_comma_dot_equivalence = false;
    config.grading_policy.case_sensitive = true;
    config.case_sensitive = true;
  } else {
    config.answer_format = 'text';
    config.grading_policy.allow_comma_dot_equivalence = false;
    config.allow_comma_dot_equivalence = false;
  }

  // Tương thích phiếu thi THPT (≤ 4 ký tự và chỉ chứa ký tự số, dấu trừ, phẩy, chấm)
  const isExamSheetCompatible = answers.every(a => a.trim().length <= 4 && /^[0-9,.\-]+$/.test(a.trim()));
  if (isExamSheetCompatible && (isAllInteger || isAllDecimal)) {
    config.exam_constraints.mode = 'exam_sheet_4';
    config.exam_constraints.max_characters = 4;
    config.exam_constraints.allowed_characters = '^[0-9,.-]+$';
    config.max_characters = 4;
  }

  return config;
}

/**
 * Service bóc tách đề thi từ file Word (.docx)
 * Hỗ trợ nhận diện tự động chuẩn McMIX (MX-mic) & Bộ GD&ĐT 2025:
 * - PHẦN I: Trắc nghiệm nhiều lựa chọn (A, B, C, D) & Câu hỏi checklist (chọn nhiều đáp án)
 * - PHẦN II: Trắc nghiệm Đúng/Sai (4 ý a, b, c, d; đáp án Đ/S hoặc đánh dấu *)
 * - PHẦN III: Tự luận (kèm điểm số và barem chấm)
 * - Quy ước McMIX: Gạch chân đáp án đúng (Ctrl + U), Dấu sao (*), Bảng đáp án ở cuối đề
 * - Thẻ McMIX: Cố định câu hỏi (<c>), Cố định phương án (<o>), Nhóm đoạn văn đọc hiểu (<g>)
 * - Bóc tách công thức toán học Word Equation (OMML sang LaTeX)
 * - Bóc tách công thức MathType (MTEF sang LaTeX)
 * - Bóc tách hình ảnh nhúng và kích thước hiển thị chính xác (EMU / pt / px)
 */
function detectCodeLanguage(codeStr, defaultLang = 'plaintext') {
  if (!codeStr || typeof codeStr !== 'string') return defaultLang;
  const trimmed = codeStr.trim();

  // 1. Nhận diện mã C++ / C
  const isCpp = /(?:#include\s*<[a-zA-Z0-9_./]+>|using\s+namespace\s+std\s*;|\bint\s+main\s*\(|\bcout\s*<<|\bcin\s*>>|\bprintf\s*\(|\bscanf\s*\(|\bstd::|\b(?:int|long|float|double|char|bool|void)\s+[a-zA-Z0-9_]+\s*\(|#define\s+[A-Z0-9_]+)/.test(trimmed);
  if (isCpp) return 'cpp';

  // 2. Nhận diện mã HTML / XML
  const isHtml = /(?:<!DOCTYPE\s+html|<html[\s>]|<body[\s>]|<div[\s>]|<table[\s>]|<form[\s>]|<style[\s>]|<script[\s>]|<\/(?:html|body|div|table|form|ul|ol)>)/i.test(trimmed);
  if (isHtml) return 'html';

  // 3. Nhận diện mã Python
  const isPy = /(?:^\s*(?:def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+|import\s+[a-zA-Z0-9_]+|from\s+[a-zA-Z0-9_]+\s+import|for\s+[a-zA-Z0-9_]+\s+in\s+|while\s+|if\s+.*:|elif\s+.*:|else:|print\(|input\()|\b(?:True|False|None)\b|\b(?:range|len|append)\()/m.test(trimmed);
  if (isPy) return 'python';

  // 4. Nếu có dấu chấm phẩy cuối dòng và khối ngoặc nhọn -> C++
  if (/;\s*$/m.test(trimmed) && /[{}]/.test(trimmed)) return 'cpp';

  // 5. Nếu có thụt lề 4 khoảng trắng hoặc tab -> Python
  if (/^\s{4}|\t/m.test(trimmed)) return 'python';

  return defaultLang;
}

class WordExamParser {
  async parseWordBuffer(buffer, options = {}) {
    const context = options.context ?? 'exam';
    if (!['bank', 'exam'].includes(context)) {
      throw new Error('INVALID_IMPORT_CONTEXT: Ngữ cảnh nhập phải là "bank" hoặc "exam".');
    }

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('INVALID_DOCX_BUFFER: Dữ liệu file Word rỗng hoặc không hợp lệ.');
    }
    if (buffer.length > 50 * 1024 * 1024) {
      throw new Error('DOCX_TOO_LARGE: Kích thước file Word vượt quá giới hạn an toàn 50MB.');
    }
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error('INVALID_DOCX_FORMAT: File không phải là định dạng Word (.docx) hợp lệ (Thiếu chữ ký PK).');
    }

    try {
      const parsed = await this.parseDocxWithOmmlAndMedia(buffer, options);
      if (parsed && parsed.questions && parsed.questions.length > 0) {
        return parsed;
      }
    } catch (err) {
      const securityCodes = ['ZIP_BOMB_DETECTED', 'SUSPICIOUS_DOCX_ARCHIVE', 'DOCX_TOO_LARGE', 'INVALID_DOCX_XML', 'INVALID_DOCX_BUFFER', 'INVALID_DOCX_FORMAT', 'INVALID_IMPORT_CONTEXT'];
      if (securityCodes.some(code => err.message.includes(code))) {
        throw err;
      }
      console.warn('[WordExamParser] parseDocx failed, falling back to mammoth:', err.message);
    }

    const result = await mammoth.extractRawText({ buffer });
    const fullText = result.value || '';
    return this.parseExamText(fullText, options);
  }

  async parseDocxWithOmmlAndMedia(buffer, options = {}) {
    let zip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (zipErr) {
      throw new Error('INVALID_DOCX_FORMAT: Không thể giải nén cấu trúc file .docx: ' + zipErr.message);
    }

    const entries = Object.keys(zip.files);
    if (entries.length > 2000) {
      throw new Error('SUSPICIOUS_DOCX_ARCHIVE: File Word chứa số lượng tệp con bất thường (>2000 files).');
    }

    let totalUncompressedSize = 0;
    for (const name of entries) {
      const f = zip.files[name];
      if (f && f._data && f._data.uncompressedSize) {
        totalUncompressedSize += f._data.uncompressedSize;
      }
    }
    if (totalUncompressedSize > 250 * 1024 * 1024) {
      throw new Error('ZIP_BOMB_DETECTED: Kích thước giải nén tài liệu Word vượt ngưỡng an toàn (250MB).');
    }

    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('word/document.xml không tồn tại trong file .docx');
    }

    // 1. Trích xuất quan hệ hình ảnh & đối tượng nhúng từ word/_rels/document.xml.rels
    const relMap = {};
    const relsFile = zip.file('word/_rels/document.xml.rels');
    const uploadsDir = storageConfig.uploadsDir;
    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
    } catch (err) {
      console.warn('[WordExamParser] Warning creating uploadsDir:', err.message);
    }

    if (relsFile) {
      try {
        const relsXml = await relsFile.async('text');
        const relsDom = new DOMParser().parseFromString(relsXml, 'text/xml');
        const relElements = relsDom.getElementsByTagName('Relationship');

        for (let i = 0; i < relElements.length; i++) {
          const rel = relElements[i];
          const type = rel.getAttribute('Type') || '';
          const rId = rel.getAttribute('Id') || '';
          let target = rel.getAttribute('Target') || '';
          const targetMode = rel.getAttribute('TargetMode') || '';

          if (!rId || !target) continue;

          // Chống SSRF / Local File Inclusion: Bỏ qua TargetMode External hoặc các giao thức file/http/ftp/gopher
          if (targetMode === 'External' || /^(?:file|http|https|ftp|gopher):/i.test(target)) {
            continue;
          }

          let zipPath = target;
          if (zipPath.startsWith('../')) {
            zipPath = zipPath.replace(/^\.\.\//, 'word/');
          } else if (!zipPath.startsWith('word/')) {
            zipPath = 'word/' + zipPath.replace(/^\//, '');
          }
          
          try {
            const fileInZip = zip.file(zipPath);
            if (!fileInZip) continue;

            const fileBuffer = await fileInZip.async('nodebuffer');
            let ext = path.extname(zipPath).toLowerCase().replace('.', '') || 'png';
            const isMathCandidate = ext === 'bin' || ext === 'wmf' || ext === 'emf' || zipPath.includes('embeddings') || zipPath.includes('oleObject');

            // A. Kiểm tra nếu là tệp nhúng MathType OLE (.bin) hoặc WMF/EMF chứa công thức
            let mathTypeLatex = null;
            if (isMathCandidate) {
              mathTypeLatex = extractMathTypeToLatex(fileBuffer);
            }

            if (mathTypeLatex) {
              relMap[rId] = { isMath: true, latex: mathTypeLatex };
              continue;
            }

            // B. Xử lý ảnh thông thường hoặc chuyển đổi WMF/EMF sang định dạng web
            let finalBuffer = fileBuffer;

            if (ext === 'wmf' || ext === 'emf') {
              const converted = convertWmfToWebImage(fileBuffer);
              if (converted && converted.buffer) {
                finalBuffer = converted.buffer;
                ext = converted.ext;
              }
            }

            const hash = crypto.createHash('md5').update(finalBuffer).digest('hex').substring(0, 8);
            const fileName = `word_${Date.now()}_${hash}.${ext}`;
            const filePath = path.join(uploadsDir, fileName);
            fs.writeFileSync(filePath, finalBuffer);

            relMap[rId] = {
              isMath: false,
              fileName,
              url: `/uploads/images/${fileName}`,
              ext
            };
          } catch (err) {
            console.warn(`[WordExamParser] Không thể trích xuất tệp đính kèm ${target}:`, err.message);
          }
        }
      } catch (err) {
        console.warn('[WordExamParser] Lỗi đọc _rels/document.xml.rels:', err.message);
      }
    }

    // 2. Phân tích nội dung văn bản & công thức OMML / MathType / Hình ảnh trong word/document.xml
    const docXml = await docXmlFile.async('text');
    const docDom = new DOMParser({
      errorHandler: {
        warning: () => {},
        error: (m) => console.warn('[WordExamParser] document.xml warning:', m),
        fatalError: (m) => { throw new Error('INVALID_DOCX_XML: Cấu trúc XML trong word/document.xml bị hỏng: ' + m); }
      }
    }).parseFromString(docXml, 'text/xml');

    const parserErrors = docDom.getElementsByTagName('parsererror');
    if (parserErrors && parserErrors.length > 0) {
      throw new Error('INVALID_DOCX_XML: Cấu trúc XML word/document.xml không hợp lệ.');
    }

    const bodyNode = docDom.getElementsByTagName('w:body')[0] || docDom.documentElement;
    const rawParagraphs = [];

    this.collectParagraphs(bodyNode, rawParagraphs, relMap);

    const paragraphs = this.processCollectedParagraphs(rawParagraphs);

    const fullExamText = paragraphs.join('\n');
    return this.parseExamText(fullExamText, options);
  }

  isCodeParagraph(pNode) {
    if (!pNode) return false;

    // 1. Kiểm tra text thô: nếu bắt đầu bằng Câu / Bài / Phần / Phương án -> Không phải code block
    const rawText = pNode.textContent || '';
    if (/^\s*(?:(?:Câu|CÂU|Bài|BÀI)\s*\d+|(?:PHẦN|Phần)\s+[IVX]+|(?:[*]?\s*[A-D]\s*[.)\:]))/i.test(rawText)) {
      return false;
    }

    // 2. Kiểm tra paragraph-level properties: <w:pPr> (shading hoặc left border ở cấp paragraph)
    let pPr = null;
    for (let child = pNode.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1 && (child.localName === 'pPr' || child.nodeName.split(':').pop() === 'pPr')) {
        pPr = child;
        break;
      }
    }

    if (pPr) {
      for (let c = pPr.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1) {
          const cTag = c.localName || c.nodeName.split(':').pop();
          if (cTag === 'shd') {
            const fill = (c.getAttribute('w:fill') || c.getAttribute('fill') || '').toLowerCase();
            if (fill && fill !== 'auto' && fill !== 'none' && fill !== 'ffffff' && fill !== 'transparent') {
              return true;
            }
          }
          if (cTag === 'pBdr') {
            const leftBdr = c.getElementsByTagName('w:left');
            if (leftBdr && leftBdr.length > 0) {
              const val = (leftBdr[0].getAttribute('w:val') || leftBdr[0].getAttribute('val') || '').toLowerCase();
              if (val && val !== 'none' && val !== 'nil') return true;
            }
          }
        }
      }
    }

    // 3. Nếu không có paragraph shading/border: kiểm tra tỷ lệ ký tự monospace trong toàn bộ đoạn
    const runs = pNode.getElementsByTagName('w:r');
    if (runs.length === 0) return false;

    let monoChars = 0;
    let totalChars = 0;

    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      const t = r.textContent || '';
      totalChars += t.length;

      const rfList = r.getElementsByTagName('w:rFonts');
      let isMono = false;
      if (rfList.length > 0) {
        const ascii = rfList[0].getAttribute('w:ascii') || rfList[0].getAttribute('ascii') || '';
        const hAnsi = rfList[0].getAttribute('w:hAnsi') || rfList[0].getAttribute('hAnsi') || '';
        if (/consolas|courier|monospace|fira|source code|lucida console/i.test(ascii) ||
            /consolas|courier|monospace|fira|source code|lucida console/i.test(hAnsi)) {
          isMono = true;
        }
      }
      if (isMono) monoChars += t.length;
    }

    return totalChars > 0 && (monoChars / totalChars) >= 0.85;
  }

  collectParagraphs(node, rawParagraphs, relMap) {
    if (!node) return;

    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      const tag = child.localName || child.nodeName.split(':').pop();

      if (tag === 'p' || tag === 'oMathPara' || tag === 'oMath') {
        const isCode = tag === 'p' ? this.isCodeParagraph(child) : false;
        let pText = this.extractNodeText(child, relMap).trimEnd();
        // Bảo toàn thụt lề đoạn văn bản (Word Indentation) cho khối mã nguồn
        if (isCode && pText.trim() && !pText.startsWith(' ') && !pText.startsWith('\t')) {
          const indList = child.getElementsByTagName('w:ind');
          if (indList.length > 0) {
            const leftVal = parseInt(indList[0].getAttribute('w:left') || indList[0].getAttribute('left') || '0', 10);
            if (leftVal >= 360) {
              const numSpaces = Math.max(2, Math.round(leftVal / 360) * 2);
              pText = ' '.repeat(numSpaces) + pText;
            }
          }
        }
        if (pText.trim()) {
          rawParagraphs.push({ text: pText, isCode });
        }
      } else if (tag === 'tbl') {
        this.processWordTable(child, rawParagraphs, relMap);
      } else {
        this.collectParagraphs(child, rawParagraphs, relMap);
      }
    }
  }

  processWordTable(tblNode, rawParagraphs, relMap) {
    const rows = tblNode.getElementsByTagName('w:tr');
    if (!rows || rows.length === 0) return;

    // 1. Trích xuất dữ liệu của từng ô trong bảng
    const tableMatrix = [];
    let allCellsText = [];

    for (let r = 0; r < rows.length; r++) {
      const rowCells = [];
      const cells = rows[r].getElementsByTagName('w:tc');
      for (let c = 0; c < cells.length; c++) {
        const cellPs = cells[c].getElementsByTagName('w:p');
        const cellParts = [];
        for (let cp = 0; cp < cellPs.length; cp++) {
          const cpText = this.extractNodeText(cellPs[cp], relMap).trim();
          if (cpText) cellParts.push(cpText);
        }
        const cellText = cellParts.join('\n');
        rowCells.push(cellText);
        if (cellText) allCellsText.push(cellText);
      }
      if (rowCells.length > 0) {
        tableMatrix.push(rowCells);
      }
    }

    if (tableMatrix.length === 0 || allCellsText.length === 0) return;

    // 2. Kiểm tra xem có phải là Bảng Tiêu Đề Đề Thi (Header Table) ở đầu tài liệu không
    const hasHeaderKeywords = allCellsText.some(t => 
      /(?:TRƯỜNG|THPT|THCS|SỞ|PHÒNG|ĐỀ\s*(?:KIỂM\s*TRA|THI)|Họ\s*(?:và\s*)?tên|Lớp[:\s]|Số\s*báo\s*danh|Môn[:\s]|NĂM\s*HỌC)/i.test(t)
    );
    const hasStartedQuestions = rawParagraphs.some(p => /^(?:Câu|CÂU|Bài|BÀI)\s*\d+/i.test(p.text));

    if (hasHeaderKeywords && !hasStartedQuestions) {
      for (let r = 0; r < rows.length; r++) {
        const cells = rows[r].getElementsByTagName('w:tc');
        for (let c = 0; c < cells.length; c++) {
          const cellPs = cells[c].getElementsByTagName('w:p');
          for (let cp = 0; cp < cellPs.length; cp++) {
            const isCode = this.isCodeParagraph(cellPs[cp]);
            const cpText = this.extractNodeText(cellPs[cp], relMap).trimEnd();
            if (cpText.trim()) rawParagraphs.push({ text: cpText, isCode });
          }
        }
      }
      return;
    }

    // 3. Kiểm tra xem có phải là Bảng Phương Án Trắc Nghiệm (Options Layout Grid A, B, C, D)
    const mcqPattern = /^(?:<u>\s*)?([*]?[A-D][*]?|[A-D]\*|\([A-D]\)|\[[A-D]\])(?:<\/u>)?(?:\s*<u>)?(?:[.):\-]|(?<=\])|(?<=\)))(?:<\/u>)?\s*/;
    const tfPattern = /^(?:<u>\s*)?([*]?[a-d][*]?|[a-d]\*|\([a-d]\)|\[[a-d]\])(?:<\/u>)?(?:\s*<u>)?(?:[.):\-]|(?<=\])|(?<=\)))(?:<\/u>)?\s*/;
    const optionMatches = allCellsText.filter(t => mcqPattern.test(t) || tfPattern.test(t));

    if (optionMatches.length >= 2) {
      for (let r = 0; r < rows.length; r++) {
        const cells = rows[r].getElementsByTagName('w:tc');
        for (let c = 0; c < cells.length; c++) {
          const cellPs = cells[c].getElementsByTagName('w:p');
          for (let cp = 0; cp < cellPs.length; cp++) {
            const isCode = this.isCodeParagraph(cellPs[cp]);
            const cpText = this.extractNodeText(cellPs[cp], relMap).trimEnd();
            if (cpText.trim()) rawParagraphs.push({ text: cpText, isCode });
          }
        }
      }
      return;
    }

    // 4. Kiểm tra xem có phải là Bảng Đáp Án (Answer Key Table) ở cuối tài liệu
    const answerKeyCellCount = allCellsText.filter(t => /^\s*\d+\s*[.:\/-]\s*([A-D]|[a-d]:[ĐS]|[ĐS]|[-+]?[0-9]*\.?[0-9]+)\s*$/i.test(t)).length;
    const hasAnswerHeader = allCellsText.some(t => /^\s*(?:BẢNG\s*ĐÁP\s*ÁN|ĐÁP\s*ÁN|KEY|ANSWER\s*KEY)\b/i.test(t));

    if (hasAnswerHeader || (answerKeyCellCount >= 3 && answerKeyCellCount >= allCellsText.length * 0.4)) {
      rawParagraphs.push({ text: 'BẢNG ĐÁP ÁN', isCode: false });
      if (tableMatrix.length === 2 && tableMatrix[0].length >= 2) {
        const row0 = tableMatrix[0];
        const row1 = tableMatrix[1];
        for (let c = 0; c < Math.min(row0.length, row1.length); c++) {
          const qVal = row0[c].replace(/[^0-9]/g, '');
          const aVal = row1[c].trim();
          if (qVal && aVal) {
            rawParagraphs.push({ text: `${qVal}. ${aVal}`, isCode: false });
          }
        }
        return;
      }
      for (const cell of allCellsText) {
        rawParagraphs.push({ text: cell, isCode: false });
      }
      return;
    }

    // 4.5. Kiểm tra xem có phải là Bảng Khối Mã Nguồn (Code Block Table: 2 cột)
    // Áp dụng bộ lọc đa tín hiệu chặt chẽ (Hardened Multi-Signal Heuristics):
    // - Cột 1: Bắt buộc là dãy số thứ tự 1, 2, 3... (Không có header chữ như STT, ID, Số...)
    // - Cột 1 BẮT BUỘC là cột số dòng hẹp (<= 1200 dxa) HOẶC bảng có viền trái xanh (#0284C7)
    // - Cột 2 có font Consolas/Monospace HOẶC chứa cú pháp lập trình rõ ràng
    // Tránh tuyệt đối nhận nhầm Bảng Dữ Liệu có cột 1 đánh số liên tiếp thành khối mã!
    if (tableMatrix.length >= 1 && tableMatrix.every(row => row.length === 2)) {
      const firstCell0 = (tableMatrix[0][0] || '').trim().toLowerCase();
      const hasDataHeader = /^(stt|số\s*tt|stt\.|no\.?|id|thứ\s*tự|mã)$/i.test(firstCell0);

      const isSequentialLineNumbers = !hasDataHeader && tableMatrix.every((row, idx) => {
        const num = parseInt(row[0].trim(), 10);
        return num === idx + 1;
      });

      if (isSequentialLineNumbers) {
        // Tín hiệu 1: Kiểm tra độ rộng cột 1 (chuẩn số dòng code: 650 dxa, <= 1200 dxa)
        let isNarrowCol1 = false;
        const gridCols = tblNode.getElementsByTagName('w:gridCol');
        if (gridCols && gridCols.length >= 2) {
          const col1W = parseInt(gridCols[0].getAttribute('w:w') || '0', 10);
          if (col1W > 0 && col1W <= 1200) {
            isNarrowCol1 = true;
          }
        }

        // Tín hiệu 2: Viền trái code block (#0284C7)
        let hasLeftBorder = false;
        const leftBorders = tblNode.getElementsByTagName('w:left');
        for (let i = 0; i < leftBorders.length; i++) {
          const bColor = (leftBorders[i].getAttribute('w:color') || '').toUpperCase();
          if (bColor === '0284C7' || bColor === '0369A1' || bColor === '38BDF8') {
            hasLeftBorder = true;
            break;
          }
        }

        // ĐIỀU KIỆN TIÊN QUYẾT: Cột 1 phải hẹp hoặc bảng có viền trái code
        // Nếu cột 1 rộng (ví dụ bảng dữ liệu chia 50-50 ~ 5000 dxa mỗi cột) -> Chắc chắn là Bảng Dữ Liệu!
        if (isNarrowCol1 || hasLeftBorder) {
          // Tín hiệu 3: Cột 2 có Font Consolas hoặc Monospace
          let col2HasConsolas = false;
          const rFontsList = tblNode.getElementsByTagName('w:rFonts');
          for (let i = 0; i < rFontsList.length; i++) {
            const ascii = (rFontsList[i].getAttribute('w:ascii') || '').toLowerCase();
            const hAnsi = (rFontsList[i].getAttribute('w:hAnsi') || '').toLowerCase();
            if (/consolas|courier|monospace|fira|source code/i.test(ascii) || /consolas|courier|monospace/i.test(hAnsi)) {
              col2HasConsolas = true;
              break;
            }
          }

          // Thu thập nội dung Cột 2
          const col2RawTexts = [];
          for (let r = 0; r < rows.length; r++) {
            const cells = rows[r].getElementsByTagName('w:tc');
            if (cells.length >= 2) {
              const cellPs = cells[1].getElementsByTagName('w:p');
              const pParts = [];
              for (let cp = 0; cp < cellPs.length; cp++) {
                pParts.push(this.extractNodeText(cellPs[cp], relMap));
              }
              col2RawTexts.push(pParts.join('\n'));
            }
          }
          const joinedCode = col2RawTexts.join('\n');
          const detectedLang = detectCodeLanguage(joinedCode, 'plaintext');
          const hasCodeSyntax = detectedLang !== 'plaintext' ||
                                /(?:#include\s*<|\bdef\s+[a-zA-Z0-9_]+\s*\(|\bclass\s+[a-zA-Z0-9_]+|\bfor\s+[a-zA-Z0-9_]+\s+in|\bcout\s*<<|\bcin\s*>>|\bprint\(|\bimport\s+|[{};]|^\s{2,}|\t)/m.test(joinedCode);

          if (col2HasConsolas || hasCodeSyntax) {
            const finalLang = detectedLang !== 'plaintext' ? detectedLang : 'python';
            rawParagraphs.push({ text: `\`\`\`${finalLang}\n${joinedCode}\n\`\`\``, isCode: true });
            return;
          }
        }
      }
    }

    // 5. Bảng Dữ Liệu Đề Thi (Data Table / Question Content Table):
    // Giữ nguyên ma trận các hàng và cột bằng định dạng Markdown Table chuẩn
    const maxCols = Math.max(...tableMatrix.map(row => row.length));
    if (maxCols === 0) return;

    const sanitizedMatrix = tableMatrix.map(row => {
      const sanitizedRow = [];
      for (let c = 0; c < maxCols; c++) {
        const rawCell = row[c] || '';
        let cellStr = rawCell.replace(/\r?\n/g, '<br/>').trim();
        cellStr = cellStr.replace(/(?<!\\)\|/g, '\\|');
        sanitizedRow.push(cellStr);
      }
      return sanitizedRow;
    });

    const headerRow = sanitizedMatrix[0];
    const separatorRow = Array(maxCols).fill(':---:');
    const dataRows = sanitizedMatrix.slice(1);

    const mdLines = [];
    mdLines.push(`| ${headerRow.join(' | ')} |`);
    mdLines.push(`| ${separatorRow.join(' | ')} |`);
    for (const dRow of dataRows) {
      mdLines.push(`| ${dRow.join(' | ')} |`);
    }

    const mdTable = mdLines.join('\n');
    rawParagraphs.push({ text: mdTable, isCode: false });
  }

  processCollectedParagraphs(rawParagraphs) {
    const finalParagraphs = [];
    let codeBuffer = [];

    const flushCodeBuffer = () => {
      if (codeBuffer.length === 0) return;
      const joinedCode = codeBuffer.join('\n');
      codeBuffer = [];

      if (joinedCode.trim().startsWith('```') && joinedCode.trim().endsWith('```')) {
        finalParagraphs.push(joinedCode);
        return;
      }

      const lang = detectCodeLanguage(joinedCode);
      finalParagraphs.push(`\`\`\`${lang}\n${joinedCode}\n\`\`\``);
    };

    for (let i = 0; i < rawParagraphs.length; i++) {
      const item = rawParagraphs[i];
      if (item.isCode) {
        codeBuffer.push(item.text);
      } else {
        flushCodeBuffer();
        finalParagraphs.push(item.text);
      }
    }
    flushCodeBuffer();

    return finalParagraphs;
  }

  findAllEmbedIds(element) {
    const ids = [];
    if (!element) return ids;

    const traverse = (el) => {
      if (el.attributes) {
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          const name = (attr.name || attr.localName || '').toLowerCase();
          if (
            name === 'r:embed' ||
            name === 'embed' ||
            name === 'r:id' ||
            name === 'id' ||
            name === 'o:relid' ||
            name === 'relid'
          ) {
            if (attr.value && (attr.value.startsWith('rId') || attr.value.startsWith('RId') || attr.value.startsWith('rIdImg'))) {
              if (!ids.includes(attr.value)) ids.push(attr.value);
            }
          }
        }
      }
      for (let child = el.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) traverse(child);
      }
    };
    traverse(element);
    return ids;
  }

  extractNodeText(node, relMap) {
    if (!node) return '';
    // Only return textContent if inside <w:t>
    if (node.nodeType === 3) {
      const pNode = node.parentNode;
      const pTag = pNode ? (pNode.localName || pNode.nodeName.split(':').pop()) : '';
      if (pTag === 't') return node.nodeValue || '';
      return '';
    }
    if (node.nodeType !== 1) return '';

    const tag = node.localName || node.nodeName.split(':').pop();

    // 1. Công thức Word OMML
    if (tag === 'oMath' || tag === 'oMathPara') {
      const latex = parseOMMLNode(node);
      return latex ? ` ${latex} ` : '';
    }

    // 2. Hình ảnh hoặc đối tượng nhúng MathType OLE / DrawingML / VML
    if (tag === 'drawing' || tag === 'pict' || tag === 'object' || tag === 'shape' || tag === 'imagedata' || tag === 'graphic') {
      const embedIds = this.findAllEmbedIds(node);
      for (const rId of embedIds) {
        if (relMap && relMap[rId] && relMap[rId].isMath && relMap[rId].latex) {
          return ` ${relMap[rId].latex} `;
        }
      }

      for (const rId of embedIds) {
        if (relMap && relMap[rId] && !relMap[rId].isMath) {
          const mediaInfo = relMap[rId];
          const dims = this.extractImageDisplayDimensions(node);
          const imgMd = formatImageMarkdown('Hình ảnh', mediaInfo.url, dims.width, dims.height);
          return `\n${imgMd}\n`;
        }
      }
    }

    // 3. Xử lý đoạn chạy chữ (Run - <w:r>): Quét thuộc tính gạch chân McMIX (w:u) và chỉ số trên/dưới (w:vertAlign)
    if (tag === 'r') {
      let isUnderlined = false;
      let vertAlign = null; // 'superscript' | 'subscript'
      let rText = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType !== 1) continue;
        const cTag = child.localName || child.nodeName.split(':').pop();
        if (cTag === 'rPr') {
          for (let u = child.firstChild; u; u = u.nextSibling) {
            if (u.nodeType === 1) {
              const uTag = u.localName || u.nodeName.split(':').pop();
              if (uTag === 'u') {
                const val = (u.getAttribute('w:val') || u.getAttribute('val') || 'single').toLowerCase();
                if (val !== 'none' && val !== '0' && val !== 'false') {
                  isUnderlined = true;
                }
              } else if (uTag === 'vertAlign') {
                const val = (u.getAttribute('w:val') || u.getAttribute('val') || '').toLowerCase();
                if (val === 'superscript' || val === 'subscript') {
                  vertAlign = val;
                }
              }
            }
          }
        } else {
          rText += this.extractNodeText(child, relMap);
        }
      }

      if (vertAlign === 'superscript' && rText) {
        rText = this.formatSuperscript(rText);
      } else if (vertAlign === 'subscript' && rText) {
        rText = this.formatSubscript(rText);
      }

      if (isUnderlined && rText.trim()) {
        return `<u>${rText}</u>`;
      }
      return rText;
    }

    if (tag === 't') {
      return node.textContent || '';
    }

    if (tag === 'tab') {
      return '    ';
    }

    if (tag === 'br' || tag === 'cr') {
      return '\n';
    }

    let text = '';
    for (let child = node.firstChild; child; child = child.nextSibling) {
      text += this.extractNodeText(child, relMap);
    }
    return text;
  }

  extractImageDisplayDimensions(element) {
    let width = null;
    let height = null;
    if (!element) return { width, height };

    // 1. DrawingML: <wp:extent cx="..." cy="..."/>
    const extElements = element.getElementsByTagName('wp:extent');
    if (extElements.length > 0) {
      const cx = parseInt(extElements[0].getAttribute('cx'), 10);
      const cy = parseInt(extElements[0].getAttribute('cy'), 10);
      if (cx > 0 && cy > 0) {
        width = Math.round(cx / 9525);
        height = Math.round(cy / 9525);
        return { width, height };
      }
    }

    // 2. DrawingML a:ext: <a:ext cx="..." cy="..."/>
    const aExtElements = element.getElementsByTagName('a:ext');
    if (aExtElements.length > 0) {
      const cx = parseInt(aExtElements[0].getAttribute('cx'), 10);
      const cy = parseInt(aExtElements[0].getAttribute('cy'), 10);
      if (cx > 0 && cy > 0) {
        width = Math.round(cx / 9525);
        height = Math.round(cy / 9525);
        return { width, height };
      }
    }

    // 3. VML style: Kiểm tra thuộc tính style
    const findStyleAttr = (el) => {
      if (!el) return null;
      if (el.getAttribute && el.getAttribute('style')) {
        const st = el.getAttribute('style');
        if (/width|height/i.test(st)) return st;
      }
      for (let c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1) {
          const res = findStyleAttr(c);
          if (res) return res;
        }
      }
      return null;
    };

    const styleStr = findStyleAttr(element);
    if (styleStr) {
      const wMatch = styleStr.match(/widths*:s*([d.]+)s*(pt|px|in|cm)?/i);
      const hMatch = styleStr.match(/heights*:s*([d.]+)s*(pt|px|in|cm)?/i);
      if (wMatch && hMatch) {
        const parseUnit = (val, unit) => {
          const num = parseFloat(val);
          if (isNaN(num)) return null;
          if (unit === 'pt') return num * 1.3333;
          if (unit === 'in') return num * 96;
          if (unit === 'cm') return num * 37.8;
          return num;
        };
        width = Math.round(parseUnit(wMatch[1], wMatch[2]?.toLowerCase()));
        height = Math.round(parseUnit(hMatch[1], hMatch[2]?.toLowerCase()));
      }
    }

    return { width, height };
  }

  /**
   * Trích xuất Bảng Đáp Án ở cuối file Word (Chuẩn McMIX & truyền thống & Bộ GD&ĐT 2025)
   * Nhận diện phân tách theo từng phần thi: BẢNG ĐÁP ÁN PHẦN I, PHẦN II, PHẦN III, PHẦN IV
   * Ngăn chặn xung đột số thứ tự câu giữa các phần (TC-13)
   */
  extractAnswerKeys(lines) {
    const answerKeyMap = {
      part1: {},
      part2: {},
      part3: {},
      part4: {},
      general: {}
    };
    const filteredLines = [];
    let insideAnswerKeySection = false;
    let currentKeySection = 'general';

    const answerKeyHeaderRegex = /^\s*(?:BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+(?:CHI\s+TIẾT|CÁC\s+CÂU|ĐỀ\s+THI)?|ANSWER\s+KEY|KEY)[\s:.-]*$/i;
    const part1HeaderRegex = /^\s*(?:BẢNG\s+ĐÁP\s+ÁN\s+)?(?:PHẦN|Phần)\s*(?:I|1|A)\b/i;
    const part2HeaderRegex = /^\s*(?:BẢNG\s+ĐÁP\s+ÁN\s+)?(?:PHẦN|Phần)\s*(?:II|2|B)\b/i;
    const part3HeaderRegex = /^\s*(?:BẢNG\s+ĐÁP\s+ÁN\s+)?(?:PHẦN|Phần)\s*(?:III|3|C)\b/i;
    const part4HeaderRegex = /^\s*(?:BẢNG\s+ĐÁP\s+ÁN\s+)?(?:PHẦN|Phần)\s*(?:IV|4|D)\b/i;

    const pairRegex = /(?:^|[\s\t,;]+)(\d+)[\s.:\/-]+([A-D](?:\s*,\s*[A-D])*|[a-d]:[ĐSđsTFtf]|[ĐSđsTFtf]|[-+]?[0-9]*\.?[0-9]+|[^\s,;]+)/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (answerKeyHeaderRegex.test(line)) {
        insideAnswerKeySection = true;
        continue;
      }

      if (insideAnswerKeySection) {
        if (part4HeaderRegex.test(line)) {
          currentKeySection = 'part4';
          continue;
        }
        if (part3HeaderRegex.test(line)) {
          currentKeySection = 'part3';
          continue;
        }
        if (part2HeaderRegex.test(line)) {
          currentKeySection = 'part2';
          continue;
        }
        if (part1HeaderRegex.test(line)) {
          currentKeySection = 'part1';
          continue;
        }

        // Nếu đang ở Phần III (Trả lời ngắn): dòng có thể chứa công thức, ngoặc, hoặc 'print("Hello")'
        if (currentKeySection === 'part3') {
          // Bắt các mẫu: "Câu 1: 5 | 5.0" hoặc "1: 2.5 | 2,5" hoặc "6: S = {2; 3}"
          const part3LinePattern = /(?:^|\s{2,}|\t)(?:(?:Câu|CÂU|Bài|BÀI)\s*)?(\d+)[\s.:\/-]+(.+?)(?=(?:\s{2,}|\t)(?:(?:Câu|CÂU|Bài|BÀI)\s*)?\d+[\s.:\/-]+|$)/gi;
          const matches = [...line.matchAll(part3LinePattern)];
          if (matches.length > 0) {
            matches.forEach(m => {
              const qNum = parseInt(m[1], 10);
              const rawVal = m[2].trim();
              const tokens = splitAlternativeAnswers(rawVal);
              const answers = tokens.length > 0 ? tokens : (rawVal ? [rawVal] : []);
              answerKeyMap.part3[qNum] = answers;
              answerKeyMap.general[qNum] = answers;
              answerKeyMap[qNum] = answers;
            });
            continue;
          }
        }

        // Bắt MCQ & True/False thông thường
        const matches = [...line.matchAll(pairRegex)];
        if (matches.length > 0) {
          matches.forEach(m => {
            const qNum = parseInt(m[1], 10);
            const rawVal = m[2].trim();
            const upper = rawVal.toUpperCase();

            let targetVal = null;
            if (upper.includes(',')) {
              targetVal = upper.split(',').map(x => x.trim());
            } else if (['A', 'B', 'C', 'D'].includes(upper)) {
              targetVal = [upper];
            } else if (upper.includes(':')) {
              const [sub, val] = upper.split(':');
              const tfObj = answerKeyMap[currentKeySection]?.[qNum] || answerKeyMap[qNum] || {};
              tfObj[sub.toLowerCase()] = (val.startsWith('Đ') || val.startsWith('T') || val.startsWith('D')) ? 'T' : 'F';
              targetVal = tfObj;
            } else if (upper === 'Đ' || upper === 'T' || upper === 'D') {
              targetVal = 'T';
            } else if (upper === 'S' || upper === 'F') {
              targetVal = 'F';
            } else {
              targetVal = splitAlternativeAnswers(rawVal);
            }

            if (currentKeySection && answerKeyMap[currentKeySection]) {
              answerKeyMap[currentKeySection][qNum] = targetVal;
            }
            answerKeyMap.general[qNum] = targetVal;
            answerKeyMap[qNum] = targetVal;
          });
          continue;
        }
      }

      filteredLines.push(lines[i]);
    }

    return { answerKeyMap, lines: filteredLines };
  }

  extractHeaderMetadata(lines) {
    const info = {
      departmentName: '',
      schoolName: '',
      schoolYear: '',
      grade: '',
      subjectName: '',
      duration: '45 phút',
      durationMinutes: 45,
      examTitle: 'Đề Thi Nhập Từ File Word',
      note: '',
      partScores: { part1: 3.0, part2: 2.0, part3: 2.0, part4: 3.0 }
    };

    const headerLines = lines.slice(0, 25);
    for (const l of headerLines) {
      const text = l.trim();
      if (!text || text.startsWith('```')) continue;

      if (/^(?:SỞ|SO|PHÒNG|PHONG)\s+(?:GD|GIÁO DỤC)/i.test(text)) {
        info.departmentName = text.replace(/[:\-–]/g, '').trim();
      } else if (/(?:TRƯỜNG|TRUONG|THPT|THCS)/i.test(text)) {
        info.schoolName = text.replace(/[:\-–]/g, '').trim();
      } else if (/(?:KIỂM TRA|THI HỌC KỲ|KHẢO SÁT|ĐỀ THI|ĐỀ KIỂM TRA)/i.test(text) && !/^(?:Câu|CÂU|Bài|BÀI)/i.test(text)) {
        info.examTitle = text.replace(/^ĐỀ\s+/i, '').replace(/[:\-–]/g, '').trim();
      } else if (/(?:NĂM\s*HỌC|Nam\s*hoc)/i.test(text)) {
        const m = text.match(/(?:NĂM\s*HỌC|Nam\s*hoc)[:\s]+([\d\s\-–]+)/i);
        if (m) info.schoolYear = m[1].trim();
      } else if (/(?:MÔN|Môn|MON)/i.test(text)) {
        const mSub = text.match(/(?:MÔN|Môn|MON)[:\s]+([^(\n\-\]]+)/i);
        if (mSub && mSub[1]) info.subjectName = mSub[1].trim();
        const mGrade = text.match(/(?:Khối|Khoi)[:\s]+(\d+)/i);
        if (mGrade && mGrade[1]) info.grade = mGrade[1].trim();
      } else if (/(?:Thời gian|Thoi gian|THỜI GIAN)/i.test(text)) {
        const m = text.match(/(\d+)\s*(?:phút|phut|p\b)/i);
        if (m && m[1]) {
          info.duration = `${m[1]} phút`;
          info.durationMinutes = parseInt(m[1], 10);
        }
      } else if (/(?:Lưu ý|Luu y)/i.test(text)) {
        info.note = text.trim();
      }
    }

    return info;
  }

  parseExamText(text, options = {}) {
    const context = options.context ?? 'exam';
    if (!['bank', 'exam'].includes(context)) {
      throw new Error('INVALID_IMPORT_CONTEXT: Ngữ cảnh nhập phải là "bank" hoặc "exam".');
    }

    const allLines = text.split(/\r?\n/).map(l => l.trimEnd());
    // Giữ nguyên dòng trống nếu nằm trong khối mã nguồn (code block ```...```)
    // Chỉ loại bỏ các dòng trống thừa ở bên ngoài văn bản thường
    const rawLines = [];
    let insideCode = false;
    for (const l of allLines) {
      if (l.trim().startsWith('```')) {
        insideCode = !insideCode;
        rawLines.push(l);
        continue;
      }
      if (insideCode) {
        rawLines.push(l);
      } else if (l.trim().length > 0) {
        rawLines.push(l);
      }
    }
    if (rawLines.length === 0) {
      throw new Error('File Word rỗng hoặc không có văn bản');
    }

    // 1. Tách Bảng Đáp Án ở cuối tài liệu nếu có
    const { answerKeyMap, lines: cleanedRawLines } = this.extractAnswerKeys(rawLines);

    const lines = [];
    let insidePreFence = false;
    for (const line of cleanedRawLines) {
      if (line.trim().startsWith('```')) {
        insidePreFence = !insidePreFence;
        lines.push(line);
        continue;
      }
      if (insidePreFence) {
        lines.push(line);
        continue;
      }
      const inlineSplit = this.splitInlineOptions(line);
      lines.push(...inlineSplit);
    }

    // Trích xuất metadata thông tin đề thi
    const meta = this.extractHeaderMetadata(lines);
    let examTitle = meta.examTitle || 'Đề Thi Nhập Từ File Word';
    if (lines[0] && !lines[0].match(/^(?:Câu|CÂU|Bài|BÀI)\s+\d+/i) && !lines[0].startsWith('```')) {
      const topTitle = lines[0].replace(/^[\s#*_-]+/, '').trim();
      if (topTitle.length > 5 && !/(?:SỞ|PHÒNG|TRƯỜNG)/i.test(topTitle)) {
        examTitle = topTitle;
      }
    }

    const questions = [];
    let currentQ = null;
    let currentSection = 'single_choice'; // 'single_choice', 'true_false', 'short_answer', 'essay'
    let insideCodeFence = false;

    let insideGroup = false;
    let currentGroupId = 0;
    let currentTopicTitle = null;
    let currentLessonTitle = null;

    const topicRegex = /^\s*(?:#|\[)?\s*(?:chủ\s*đề|chương|topic|chapter)\b\s*([0-9A-Za-z_.-]+)?[\s:\]-]+(.*)/i;
    const lessonRegex = /^\s*(?:##|\[)?\s*(?:bài|lesson)\b\s*([0-9A-Za-z_.-]+)?[\s:\]-]+(.*)/i;

    const extractPartScore = (str) => {
      const m = str.match(/\((\d+(?:[,.]\d+)?)\s*(?:điểm|đ|d)\)/i);
      return m ? parseFloat(m[1].replace(',', '.')) : null;
    };

    // Regex nhận diện 4 PHẦN chuẩn Bộ GD&ĐT 2025 (Ưu tiên theo thứ tự: IV -> III -> II -> I)
    const part4Regex = /^\s*(?:PHẦN|Phần)\s*(?:IV|4|D)\b|^\s*(?:PHẦN|Phần).*?(?:tự\s*luận|tu\s*luan)/i;
    const part3Regex = /^\s*(?:PHẦN|Phần)\s*(?:III|3|C)\b|^\s*(?:PHẦN|Phần).*?(?:trả\s*lời\s*ngắn|ngắn|ngan)/i;
    const part2Regex = /^\s*(?:PHẦN|Phần)\s*(?:II|2|B)\b|^\s*(?:PHẦN|Phần).*?(?:đúng\s*sai|dung\s*sai)/i;
    const part1Regex = /^\s*(?:PHẦN|Phần)\s*(?:I|1|A)\b|^\s*(?:PHẦN|Phần).*?(?:nhiều\s*lựa\s*chọn|nhiều\s*phương\s*án|nhiều|nhieu)/i;

    const groupStartRegex = /^\s*(?:<g>|\[<g>\]|\[g\]|\[\[GROUP_START(?::[a-zA-Z0-9_-]+)?\]\])/i;
    const groupEndRegex = /^\s*(?:<\/g>|\[<\/g>\]|\[\/g\]|\[\[GROUP_END(?::[a-zA-Z0-9_-]+)?\]\])/i;

    const questionHeaderRegex = /^\s*(?:(?:\[|\()(?:\s*(?:NB|TH|VD|VDC|Biết|Hiểu|Vận\s*dụng(?:\s*cao)?)\s*)(?:\]|\))\s*)?(?:Câu|CÂU|Bài|BÀI)\s*(\d+)[\s:.-]+(.*)/i;
    
    // MCQ Option: Chữ hoa A-D (Hỗ trợ gạch chân <u>, dấu sao *, ngoặc đơn/vuông, kể cả khi dấu chấm được gạch chân riêng)
    const mcqOptionRegex = /^(?:<u>\s*)?([*]?[A-D][*]?|[A-D]\*|\([A-D]\)|\[[A-D]\])(?:<\/u>)?(?:\s*<u>)?(?:[.):\-]|(?<=\])|(?<=\)))(?:<\/u>)?\s*(.*)$/;
    
    // True/False Option: Chữ thường a-d (Hỗ trợ gạch chân <u>, dấu sao *, ngoặc đơn/vuông, kể cả khi dấu chấm được gạch chân riêng)
    const tfSubItemRegex = /^(?:<u>\s*)?([*]?[a-d][*]?|[a-d]\*|\([a-d]\)|\[[a-d]\])(?:<\/u>)?(?:\s*<u>)?(?:[.):\-]|(?<=\])|(?<=\)))(?:<\/u>)?\s*(.*)$/;
    
    const shortAnswerTagRegex = /^\s*(?:Đáp án|Đáp số|Trả lời|Key|KQ)[\s:.-]+(.*)/i;
    const answerTagRegex = /^\s*(?:Đáp án|ĐA|Đáp án đúng|ĐÁP ÁN)[\s:.-]*(.*)/i;
    const scoreRegex = /\((\d+(?:[,.]\d+)?)\s*(?:điểm|đ|d)\)/i;

    const partScores = meta.partScores || { part1: 3.0, part2: 2.0, part3: 2.0, part4: 3.0 };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      let line = rawLine.trim();

      // Xử lý thẻ nhóm câu hỏi McMIX <g>...</g>
      if (groupStartRegex.test(line)) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions, answerKeyMap);
          currentQ = null;
        }
        insideGroup = true;
        currentGroupId++;
        continue;
      }
      if (groupEndRegex.test(line)) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions, answerKeyMap);
          currentQ = null;
        }
        insideGroup = false;
        continue;
      }

      if (line.startsWith('```')) {
        insideCodeFence = !insideCodeFence;
        if (currentQ) {
          if (currentQ.options.length === 0 && !currentQ.rubric_guide) {
            currentQ.content += (currentQ.content ? '\n' : '') + rawLine;
          } else if (currentQ.options.length > 0 && !currentQ.rubric_guide && currentQ.question_type !== 'essay') {
            const lastOpt = currentQ.options[currentQ.options.length - 1];
            lastOpt.text += (lastOpt.text ? '\n' : '') + rawLine;
          } else if (currentQ.rubric_guide) {
            currentQ.rubric_guide += rawLine + '\n';
          }
        }
        continue;
      }

      if (insideCodeFence && currentQ) {
        if (currentQ.options.length === 0 && !currentQ.rubric_guide) {
          currentQ.content += (currentQ.content ? '\n' : '') + rawLine;
        } else if (currentQ.options.length > 0 && !currentQ.rubric_guide && currentQ.question_type !== 'essay') {
          const lastOpt = currentQ.options[currentQ.options.length - 1];
          lastOpt.text += (lastOpt.text ? '\n' : '') + rawLine;
        } else if (currentQ.rubric_guide) {
          currentQ.rubric_guide += rawLine + '\n';
        }
        continue;
      }

      // Nhận diện Chủ đề và Bài học (Hỗ trợ thẻ [[TOPIC: ...]], [[LESSON: ...]], Markdown # Chủ đề, ## Bài)
      const topicTagMatch = line.match(/^\[\[TOPIC\s*:\s*(.*?)\]\]/i);
      const isTopicLine = topicTagMatch || (/^\s*(?:#|\[)?\s*(?:chủ\s*đề|chương|topic|chapter)/i.test(line) && !/^(?:Câu|CÂU|Bài|BÀI)\s*\d+/i.test(line));
      if (isTopicLine) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions, answerKeyMap);
          currentQ = null;
        }
        if (topicTagMatch) {
          currentTopicTitle = topicTagMatch[1].trim();
        } else {
          currentTopicTitle = line.replace(/^\s*(?:#|\[)?\s*(?:chủ\s*đề|chương|topic|chapter)[\s:.\-\]]*/i, '').trim();
        }
        currentLessonTitle = null;
        continue;
      }

      const lessonTagMatch = line.match(/^\[\[LESSON\s*:\s*(.*?)\]\]/i);
      const isLessonLine = lessonTagMatch || (/^\s*(?:##|\[)?\s*(?:bài|lesson)/i.test(line) && !/^(?:Câu|CÂU)\s*\d+/i.test(line));
      if (isLessonLine) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions, answerKeyMap);
          currentQ = null;
        }
        if (lessonTagMatch) {
          currentLessonTitle = lessonTagMatch[1].trim();
        } else {
          currentLessonTitle = line.replace(/^\s*(?:##|\[)?\s*(?:bài|lesson)[\s:.\-\]]*/i, '').trim();
        }
        continue;
      }

      // Nhận diện 4 PHẦN (Ưu tiên: IV -> III -> II -> I)
      if (part4Regex.test(line)) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions, answerKeyMap);
          currentQ = null;
        }
        currentSection = 'essay';
        const sc = extractPartScore(line);
        if (sc !== null) partScores.part4 = sc;
        continue;
      }
      if (part3Regex.test(line)) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions, answerKeyMap);
          currentQ = null;
        }
        // Kiểm tra xem Phần III này là tự luận hay trả lời ngắn
        if (/(?:tự\s*luận|tu\s*luan)/i.test(line)) {
          currentSection = 'essay';
          const sc = extractPartScore(line);
          if (sc !== null) partScores.part4 = sc;
        } else {
          currentSection = 'short_answer';
          const sc = extractPartScore(line);
          if (sc !== null) partScores.part3 = sc;
        }
        continue;
      }
      if (part2Regex.test(line)) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions, answerKeyMap);
          currentQ = null;
        }
        currentSection = 'true_false';
        const sc = extractPartScore(line);
        if (sc !== null) partScores.part2 = sc;
        continue;
      }
      if (part1Regex.test(line)) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions, answerKeyMap);
          currentQ = null;
        }
        currentSection = 'single_choice';
        const sc = extractPartScore(line);
        if (sc !== null) partScores.part1 = sc;
        continue;
      }

      const qMatch = line.match(questionHeaderRegex);
      if (qMatch) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions, answerKeyMap);
        }

        const qNum = parseInt(qMatch[1], 10);
        let content = qMatch[2].trim();

        // Nhận diện Mức độ nhận thức: [Biết], [Hiểu], [Vận dụng], [Vận dụng cao]
        let detectedLevel = 'biet';
        const levelBietRegex = /(?:\[|\()(?:Biết|Nhận\s*biết|NB)(?:\]|\))/i;
        const levelHieuRegex = /(?:\[|\()(?:Hiểu|Thông\s*hiểu|TH)(?:\]|\))/i;
        const levelVanDungCaoRegex = /(?:\[|\()(?:Vận\s*dụng\s*cao|VDC)(?:\]|\))/i;
        const levelVanDungRegex = /(?:\[|\()(?:Vận\s*dụng|VD)(?:\]|\))/i;

        if (levelVanDungCaoRegex.test(content) || levelVanDungCaoRegex.test(line)) {
          detectedLevel = 'van_dung_cao';
          content = content.replace(levelVanDungCaoRegex, '').trim();
        } else if (levelVanDungRegex.test(content) || levelVanDungRegex.test(line)) {
          detectedLevel = 'van_dung';
          content = content.replace(levelVanDungRegex, '').trim();
        } else if (levelHieuRegex.test(content) || levelHieuRegex.test(line)) {
          detectedLevel = 'hieu';
          content = content.replace(levelHieuRegex, '').trim();
        } else if (levelBietRegex.test(content) || levelBietRegex.test(line)) {
          detectedLevel = 'biet';
          content = content.replace(levelBietRegex, '').trim();
        }

        // Kiểm tra thẻ cố định câu hỏi McMIX <c> hoặc [[FIX_QUESTION]]
        let isFixedOrder = 0;
        if (/(?:<c>|\[<c>\]|\[c\]|\[\[FIX_QUESTION\]\])/i.test(content) || /(?:<c>|\[<c>\]|\[c\]|\[\[FIX_QUESTION\]\])/i.test(line)) {
          isFixedOrder = 1;
          content = content.replace(/(?:<c>|\[<c>\]|\[c\]|\[\[FIX_QUESTION\]\])/gi, '').trim();
        }

        let maxScore = null;
        let hasExplicitScore = false;
        const scoreMatch = content.match(scoreRegex) || line.match(scoreRegex);
        if (scoreMatch) {
          maxScore = parseFloat(scoreMatch[1].replace(',', '.'));
          hasExplicitScore = true;
          content = content.replace(scoreRegex, '').trim();
        }

        const isExplicitEssay = /tự luận|TL/i.test(line);
        const isExplicitTF = /đúng[\s/]*sai|Đ\/S/i.test(line);
        const isExplicitShort = /trả\s*lời\s*ngắn|ngắn/i.test(line);

        let qType = currentSection;
        if (isExplicitEssay) qType = 'essay';
        else if (isExplicitTF) qType = 'true_false';
        else if (isExplicitShort) qType = 'short_answer';

        if (maxScore === null) {
          if (qType === 'essay') maxScore = 2.5;
          else if (qType === 'true_false') maxScore = 1.0;
          else if (qType === 'short_answer') maxScore = 0.5;
          else maxScore = 0.25;
        }

        currentQ = {
          order_index: qNum || (questions.length + 1),
          question_type: qType,
          part_key: (qType === 'single_choice' || qType === 'multiple_choice') ? 'part1' : (qType === 'true_false' ? 'part2' : (qType === 'short_answer' ? 'part3' : 'part4')),
          level: detectedLevel,
          topic_title: currentTopicTitle,
          lesson_title: currentLessonTitle,
          content: content,
          max_score: maxScore,
          suggested_score: hasExplicitScore ? maxScore : null,
          has_explicit_score: hasExplicitScore,
          is_fixed: isFixedOrder,
          group_id: insideGroup ? currentGroupId : null,
          options: [],
          correct_answers: qType === 'true_false' ? { a: 'F', b: 'F', c: 'F', d: 'F' } : [],
          short_answer: '',
          prefix_stripped: null,
          raw_answer_detected: null,
          has_conflict: false,
          conflict_inline: null,
          conflict_key: null,
          rubric_guide: '',
          raw_lines: []
        };
        continue;
      }

      if (!currentQ) continue;

      // Trích xuất thẻ cố định phương án McMIX <o> hoặc [[FIX_OPTION]]
      let isFixedOpt = false;
      if (/(?:<o>|\[<o>\]|\[o\]|\[\[FIX_OPTION\]\])/i.test(line)) {
        isFixedOpt = true;
        line = line.replace(/(?:<o>|\[<o>\]|\[o\]|\[\[FIX_OPTION\]\])/gi, '').trim();
      }

      // 1. Kiểm tra Phương án Trắc nghiệm MCQ (A, B, C, D)
      // BẢO VỆ CODE TIN HỌC: Chống nhận nhầm cú pháp gán (A = 10, B = 20, A[i] = x, A += 1), method (A.append, B.sort) hoặc control flow (if A == 10) thành phương án
      const isCodeLine = isCodeSyntaxLine(line) || isCodeSyntaxLine(rawLine);
      const mcqMatch = !isCodeLine && !insideCodeFence && line.match(mcqOptionRegex);
      if (mcqMatch && currentQ.question_type !== 'essay' && currentQ.question_type !== 'true_false' && currentQ.question_type !== 'short_answer') {
        let optPrefix = mcqMatch[1];
        let optText = (mcqMatch[2] || '').trim();
        let isCorrect = false;

        if (optPrefix.includes('*') || line.startsWith('<u>') || line.includes('<u>') || optPrefix.includes('<u>')) {
          isCorrect = true;
          optPrefix = optPrefix.replace(/\*/g, '');
        }

        optText = optText.replace(/<\/?u>/g, '').trim();
        // BẢO TOÀN NGUYÊN BẢN: Tuyệt đối không tự ý thêm dấu '.' vào cuối optText

        const cleanOptId = optPrefix.replace(/[^A-D]/g, '');
        if (cleanOptId) {
          currentQ.options.push({
            id: cleanOptId,
            text: optText,
            is_fixed: isFixedOpt
          });

          if (isCorrect) {
            if (!Array.isArray(currentQ.correct_answers)) currentQ.correct_answers = [];
            if (!currentQ.correct_answers.includes(cleanOptId)) {
              currentQ.correct_answers.push(cleanOptId);
            }
          }
        }
        continue;
      }

      // 2. Kiểm tra Ý Đúng/Sai (a, b, c, d)
      const tfMatch = !insideCodeFence && line.match(tfSubItemRegex);
      if (tfMatch && currentQ.question_type !== 'essay' && currentQ.question_type !== 'short_answer') {
        currentQ.question_type = 'true_false';
        currentQ.part_key = 'part2';
        if (!currentQ.correct_answers || Array.isArray(currentQ.correct_answers)) {
          currentQ.correct_answers = {};
        }

        let prefix = tfMatch[1];
        let subText = (tfMatch[2] || '').trim();
        let isCorrect = null; // null = chưa có nhãn xác định

        // Nhận diện nhãn rõ ràng: [Đ], [S], (Đ), (S), [True], [False], [D], [T], [F]
        const isTrueLabel = /\[\s*(?:Đ|D|Đúng|Dung|True|T)\s*\]/i.test(subText) || /\(\s*(?:Đ|D|Đúng|Dung|True|T)\s*\)/i.test(subText) || /(?:^|\s+)\[?(?:Đ|D)\]?(?:\s+|$)/i.test(subText);
        const isFalseLabel = /\[\s*(?:S|Sai|False|F)\s*\]/i.test(subText) || /\(\s*(?:S|Sai|False|F)\s*\)/i.test(subText) || /(?:^|\s+)\[?(?:S|Sai)\]?(?:\s+|$)/i.test(subText);
        const isUnderlined = /<u>/i.test(line.substring(0, 25)) || /<u>/i.test(prefix);

        if (isTrueLabel) {
          isCorrect = true;
        } else if (isFalseLabel) {
          isCorrect = false;
        } else if (prefix.includes('*') || isUnderlined) {
          isCorrect = true;
        }

        prefix = prefix.replace(/\*/g, '');
        subText = subText.replace(/\[\s*(?:Đ|D|Đúng|Dung|True|T|S|Sai|False|F)\s*\]/gi, '')
                         .replace(/\(\s*(?:Đ|D|Đúng|Dung|True|T|S|Sai|False|F)\s*\)/gi, '')
                         .replace(/(?:^|\s+)\[?(?:Đ|D|S)\]?(?:\s+|$)/gi, ' ')
                         .replace(/<\/?u>/gi, '')
                         .trim();
        // BẢO TOÀN NGUYÊN BẢN: Tuyệt đối không tự ý thêm dấu '.' vào cuối subText

        const subId = prefix.toLowerCase().replace(/[^a-d]/g, '');
        if (subId) {
          currentQ.options.push({
            id: subId,
            text: subText
          });
          if (isCorrect !== null) {
            currentQ.correct_answers[subId] = isCorrect ? 'T' : 'F';
          } else {
            // Ghi nhận ý chưa có nhãn để đối soát với bảng đáp án hoặc cảnh báo
            currentQ.unverified_tf_items = currentQ.unverified_tf_items || [];
            currentQ.unverified_tf_items.push(subId);
          }
        }
        continue;
      }

      // 3. Xử lý Trả lời ngắn Dạng 3 (short_answer)
      const isLineInsideTableOrCode = line.startsWith('|') || line.includes('<table') || line.includes('<pre') || line.includes('<code');

      if (currentQ.question_type === 'short_answer' && !isLineInsideTableOrCode) {
        const shortMatch = line.match(shortAnswerTagRegex);
        if (shortMatch) {
          // Chốt chặn 4: Tránh nhận nhầm khi câu hỏi dài hoặc chứa từ nghi vấn
          const isAmbiguous = line.length > 120 || /(?:hãy\s*chọn|tại\s*sao|là\s*gì|bạn\s*hãy)/i.test(line);
          if (isAmbiguous) {
            currentQ.content += (currentQ.content ? '\n' : '') + line;
            currentQ.warning = 'possible_ambiguous_answer_tag';
            continue;
          }

          const rawAns = shortMatch[1].trim();
          const isCode = currentQ.content.includes('```') || /python|code|print|def|lập trình|biến|thư viện/i.test(currentQ.content);
          const res = extractShortAnswersFromRaw(rawAns, isCode);
          currentQ.short_answer = rawAns;
          currentQ.correct_answers = res.answers.length > 0 ? res.answers : (rawAns ? [rawAns] : []);
          if (res.prefixStripped) currentQ.prefix_stripped = res.prefixStripped;
          currentQ.raw_answer_detected = res.raw;
          continue;
        }
      }

      // 4. Nhận diện thẻ Đáp án chung
      const ansMatch = !isLineInsideTableOrCode ? line.match(answerTagRegex) : null;
      if (ansMatch && currentQ.question_type !== 'essay') {
        // Chốt chặn 4: Tránh nhận nhầm khi câu hỏi dài hoặc chứa từ nghi vấn
        const isAmbiguous = line.length > 120 || /(?:hãy\s*chọn|tại\s*sao|là\s*gì|bạn\s*hãy)/i.test(line);
        if (isAmbiguous) {
          currentQ.content += (currentQ.content ? '\n' : '') + line;
          currentQ.warning = 'possible_ambiguous_answer_tag';
          continue;
        }

        const ansRaw = ansMatch[1].trim();
        const tfPairRegex = /([a-d])[\s:.-]+([ĐSđsTFtf]|Đúng|Sai|True|False)/gi;
        const matches = [...ansRaw.matchAll(tfPairRegex)];

        if (matches.length > 0 || currentQ.question_type === 'true_false') {
          currentQ.question_type = 'true_false';
          currentQ.part_key = 'part2';
          if (!currentQ.correct_answers || Array.isArray(currentQ.correct_answers)) {
            currentQ.correct_answers = { a: 'F', b: 'F', c: 'F', d: 'F' };
          }
          matches.forEach(m => {
            const subKey = m[1].toLowerCase();
            const valStr = m[2].toUpperCase();
            const isT = valStr.startsWith('Đ') || valStr.startsWith('D') || valStr.startsWith('T');
            currentQ.correct_answers[subKey] = isT ? 'T' : 'F';
          });
        } else if (currentQ.question_type === 'short_answer') {
          const isCode = currentQ.content.includes('```') || /python|code|print|def|lập trình|biến|thư viện/i.test(currentQ.content);
          const res = extractShortAnswersFromRaw(ansRaw, isCode);
          currentQ.short_answer = ansRaw;
          currentQ.correct_answers = res.answers.length > 0 ? res.answers : (ansRaw ? [ansRaw] : []);
          if (res.prefixStripped) currentQ.prefix_stripped = res.prefixStripped;
          currentQ.raw_answer_detected = res.raw;
        } else {
          const correctLetters = ansRaw.replace(/[^A-D]/g, '').split('');
          if (correctLetters.length > 0) {
            currentQ.correct_answers = correctLetters;
          }
        }
        continue;
      }

      // 5. Hướng dẫn chấm tự luận
      if (currentQ.question_type === 'essay' && /^(?:Hướng dẫn chấm|Barem|Đáp án mẫu|Gợi ý)[\s:.-]/i.test(line)) {
        currentQ.rubric_guide += line + '\n';
        continue;
      }

      // 6. Ghép nội dung và bảo toàn thụt đầu dòng (indentation) Python
      const lineToAppend = /^(?:\s{2,}|\t)/.test(rawLine) ? rawLine : line;
      if (currentQ.options.length === 0 && !currentQ.rubric_guide) {
        currentQ.content += (currentQ.content ? '\n' : '') + lineToAppend;
      } else if (currentQ.options.length > 0 && !currentQ.rubric_guide && currentQ.question_type !== 'essay' && currentQ.question_type !== 'short_answer') {
        const lastOpt = currentQ.options[currentQ.options.length - 1];
        lastOpt.text += (lastOpt.text ? '\n' : '') + lineToAppend;
      } else if (currentQ.rubric_guide) {
        currentQ.rubric_guide += lineToAppend + '\n';
      }
    }

    if (currentQ) {
      this.finalizeQuestion(currentQ, questions, answerKeyMap);
    }

    if (questions.length === 0) {
      throw new Error('Không thể nhận diện câu hỏi từ file Word. Vui lòng đảm bảo các câu hỏi bắt đầu bằng "Câu 1:", "Câu 2:"');
    }

    // Áp dụng bảng đáp án từ answerKeyMap nếu câu hỏi chưa có đáp án (và KHÔNG đang xung đột)
    questions.forEach((q, idx) => {
      if (q.has_conflict) return;
      const qNum = q.order_index || (idx + 1);
      const partKey = q.part_key || 'part1';
      const keyAns = answerKeyMap[partKey]?.[qNum] || answerKeyMap.general?.[qNum] || answerKeyMap[qNum];
      if (keyAns) {
        if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') {
          if ((!q.correct_answers || q.correct_answers.length === 0) && Array.isArray(keyAns) && keyAns.length > 0) {
            q.correct_answers = keyAns;
            if (keyAns.length > 1) {
              q.question_type = 'multiple_choice';
            }
          }
        } else if (q.question_type === 'true_false' && typeof keyAns === 'object') {
          q.correct_answers = Object.assign(q.correct_answers || {}, keyAns);
        }
      }
    });

    // Phân biệt chính sách điểm theo context
    if (context === 'exam') {
      const partCounts = {
        part1: questions.filter(q => q.part_key === 'part1').length,
        part2: questions.filter(q => q.part_key === 'part2').length,
        part3: questions.filter(q => q.part_key === 'part3').length,
        part4: questions.filter(q => q.part_key === 'part4').length
      };

      questions.forEach(q => {
        // Điểm số đã ghi rõ trong tài liệu ([1.0 điểm]...) -> Giữ nguyên
        if (q.has_explicit_score) {
          return;
        }
        const pKey = q.part_key || 'part1';
        const count = partCounts[pKey] || 1;
        const totalPartScore = partScores[pKey] !== undefined ? partScores[pKey] : 2.5;
        if (count > 0) {
          q.max_score = Number((totalPartScore / count).toFixed(2));
        }
      });
    } else {
      // context === 'bank': Không ép buộc chia điểm theo phần đề thi
      questions.forEach(q => {
        if (!q.has_explicit_score) {
          q.suggested_score = null;
        }
      });
    }

    const computedTotalScore = Math.round(questions.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100;

    // Tổng hợp cảnh báo phân tích (Warnings)
    const warnings = [];
    if (!meta.examTitle && context === 'exam') {
      warnings.push({ code: 'MISSING_EXAM_TITLE', message: 'Tệp không ghi rõ tiêu đề đề thi (có thể nhập trực tiếp trên giao diện).' });
    }
    if (!meta.durationMinutes && context === 'exam') {
      warnings.push({ code: 'MISSING_DURATION', message: 'Tệp không ghi rõ thời gian làm bài (mặc định 45 phút, có thể điều chỉnh).' });
    }
    if (context === 'exam' && Math.abs(computedTotalScore - 10.0) > 0.05) {
      warnings.push({
        code: 'TOTAL_SCORE_MISMATCH',
        message: `Tổng điểm các câu hỏi hiện là ${computedTotalScore}đ (khác thang điểm chuẩn 10.0đ). Giáo viên có thể dùng công cụ cân đối hoặc giữ nguyên.`
      });
    }

    return {
      context,
      title: examTitle,
      meta,
      partScores,
      total_questions: questions.length,
      computed_total_score: computedTotalScore,
      score_scale: meta.scoreScale || 10.0,
      questions,
      warnings
    };
  }

  splitInlineOptions(line) {
    const trimmed = line.trim();
    // Bảo toàn code Python & Markdown Table: Không tách dòng nếu là dòng trống, thẻ code block, thụt dòng code, cú pháp lập trình, toán tử gán (A = 10), method (A.append), control flow hoặc bảng Markdown
    if (!trimmed || trimmed.startsWith('```') || trimmed.startsWith('|') || isCodeSyntaxLine(line) || isCodeSyntaxLine(trimmed) || /^(?:def|class|import|from|for|while|if|elif|else|print|return|#|\s{2,}|\t)/i.test(line)) {
      return [line];
    }

    const pattern = /(?:^|[\s\t]+)((?:<u>\s*[*]?\s*[A-D][*]?\s*<\/u>|[*]?\s*[A-D][*]?|[A-D]\*|\([A-D]\)|\[[A-D]\])(?:(?:\s*<u>)?[.):\-](?:<\/u>)?)?)\s+/g;
    const matches = [...line.matchAll(pattern)];

    if (matches.length >= 2 && matches[0].index === line.search(/\S/)) {
      const parts = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = (i + 1 < matches.length) ? matches[i + 1].index : line.length;
        parts.push(line.substring(start, end).trim());
      }
      return parts;
    }

    return [line];
  }

  autoFenceCodeInText(text) {
    if (!text || text.includes('```')) return text;

    const htmlBlockRegex = /(<(?:table|form|html|body|div|ul|ol)[\s\S]*?<\/(?:table|form|html|body|div|ul|ol)>)/i;
    if (htmlBlockRegex.test(text)) {
      return text.replace(htmlBlockRegex, '\n```html\n$1\n```\n');
    }

    const lines = text.split('\n');
    const newLines = [];
    let codeBlock = [];
    let inCode = false;
    let detectedLang = 'python';

    const flushCode = () => {
      if (codeBlock.length > 0) {
        if (codeBlock.length >= 2 || /^\s*(?:def |class |for .* in |while |import |from .* import |#include |int main)/i.test(codeBlock[0])) {
          newLines.push(`\`\`\`${detectedLang}`);
          newLines.push(...codeBlock);
          newLines.push('```');
        } else {
          newLines.push(...codeBlock);
        }
        codeBlock = [];
      }
      inCode = false;
      detectedLang = 'python';
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isCppStart = /^\s*(?:#include\s*<|using\s+namespace\s+std\s*;|int\s+main\s*\()/.test(line);
      const isPyStart = /^\s*(?:def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+|for\s+[a-zA-Z0-9_]+\s+in\s+|while\s+|import\s+[a-zA-Z0-9_]+|from\s+[a-zA-Z0-9_]+\s+import)/.test(line);
      const isIndented = /^(?: {2,}|\t)/.test(line);
      const isCodeKeyword = /^\s*(?:if\s+.*:|elif\s+.*:|else:|return\b|print\(|input\(|cout\s*<<|cin\s*>>|#include|int\s+|float\s+|double\s+|void\s+|for\s*\(|while\s*\(|return\s+0;)/.test(line);

      if (isCppStart || isPyStart) {
        if (!inCode) {
          flushCode();
          inCode = true;
          detectedLang = isCppStart ? 'cpp' : 'python';
        }
        codeBlock.push(line);
      } else if (inCode && (isIndented || isCodeKeyword || line.trim() === '')) {
        codeBlock.push(line);
      } else {
        flushCode();
        newLines.push(line);
      }
    }
    flushCode();

    return newLines.join('\n');
  }

  finalizeQuestion(q, questionsList, answerKeyMap = {}) {
    const partKey = q.part_key || 'part1';
    const partIndex = questionsList.filter(item => item.part_key === partKey).length + 1;
    const qNum = q.order_index;

    // Tìm đáp án trong bảng cuối đề theo thứ tự ưu tiên:
    // 1. Theo part_key và qNum
    // 2. Theo part_key và partIndex (số thứ tự trong phần - TC-13)
    // 3. Theo general/top-level và qNum
    let tableKeyVal = null;
    if (answerKeyMap[partKey] && answerKeyMap[partKey][qNum] !== undefined) {
      tableKeyVal = answerKeyMap[partKey][qNum];
    } else if (answerKeyMap[partKey] && answerKeyMap[partKey][partIndex] !== undefined) {
      tableKeyVal = answerKeyMap[partKey][partIndex];
    } else if (answerKeyMap.general && answerKeyMap.general[qNum] !== undefined) {
      tableKeyVal = answerKeyMap.general[qNum];
    } else if (answerKeyMap[qNum] !== undefined) {
      tableKeyVal = answerKeyMap[qNum];
    }

    if (q.question_type === 'short_answer') {
      // Dạng 3: Trả lời ngắn
      const isCode = q.content.includes('```') || /python|code|print|def|lập trình|biến|thư viện/i.test(q.content);
      let inlineList = [];
      if (Array.isArray(q.correct_answers) && q.correct_answers.length > 0) {
        inlineList = q.correct_answers;
      } else if (q.short_answer) {
        const res = extractShortAnswersFromRaw(q.short_answer, isCode);
        inlineList = res.answers.length > 0 ? res.answers : [q.short_answer.trim()];
      }

      let keyList = [];
      if (tableKeyVal) {
        if (Array.isArray(tableKeyVal)) {
          keyList = tableKeyVal;
        } else {
          const res = extractShortAnswersFromRaw(String(tableKeyVal), isCode);
          keyList = res.answers.length > 0 ? res.answers : [String(tableKeyVal).trim()];
        }
      }

      // Xử lý xung đột giữa Inline và Bảng cuối đề (TC-14)
      if (inlineList.length > 0 && keyList.length > 0) {
        const normInline = inlineList.map(x => x.replace(',', '.').toLowerCase().trim()).sort().join(';;');
        const normKey = keyList.map(x => x.replace(',', '.').toLowerCase().trim()).sort().join(';;');
        if (normInline !== normKey) {
          q.has_conflict = true;
          q.conflict_inline = inlineList;
          q.conflict_key = keyList;
          q.warning = 'conflict_answer';
          q.status = 'pending_review';
          q.warning_message = `Xung đột đáp án trả lời ngắn: Trong câu ghi [${inlineList.join(', ')}] nhưng Bảng đáp án ghi [${keyList.join(', ')}].`;
          q.correct_answers = [];
          q.short_answer = '';
        } else {
          q.has_conflict = false;
          const merged = [];
          [...inlineList, ...keyList].forEach(item => {
            if (!merged.includes(item)) merged.push(item);
          });
          q.correct_answers = merged;
          q.short_answer = merged[0] || '';
        }
      } else if (keyList.length > 0) {
        q.has_conflict = false;
        q.correct_answers = keyList;
        q.short_answer = keyList[0] || '';
      } else if (inlineList.length > 0) {
        q.has_conflict = false;
        q.correct_answers = inlineList;
        q.short_answer = inlineList[0] || '';
      } else {
        // Hoàn toàn không có đáp án (TC-15)
        q.has_conflict = false;
        q.correct_answers = [];
        q.short_answer = '';
        q.warning = 'missing_answer';
      }

      q.scoring_config = detectShortAnswerScoringConfig(q.correct_answers);

      // Kiểm tra ràng buộc phiếu thi THPT (TC-10)
      if (q.scoring_config?.answer_format === 'exam_sheet' || q.scoring_config?.exam_constraints?.mode === 'exam_sheet_4') {
        const hasViolated = q.correct_answers.some(a => String(a).length > 4 || !/^[0-9,.\-]+$/.test(String(a)));
        if (hasViolated) {
          q.warning = 'exam_sheet_length_exceeded';
          q.is_sheet_invalid = true;
        }
      }
    } else if (q.question_type === 'true_false') {
      if (tableKeyVal && typeof tableKeyVal === 'object' && !Array.isArray(tableKeyVal)) {
        q.correct_answers = Object.assign(q.correct_answers || {}, tableKeyVal);
      }
      const subKeys = (q.options || []).map(o => String(o.id || '').toLowerCase().trim());
      const expectedSubKeys = ['a', 'b', 'c', 'd'];
      const uniqueSubKeys = new Set(subKeys);
      const hasEmptySub = (q.options || []).some(o => (o.text || '').replace(/<[^>]+>/g, '').trim().length === 0);

      if (!q.options || q.options.length !== 4) {
        q.warning = 'invalid_option_count';
        q.status = 'pending_review';
        q.warning_message = `Câu hỏi Đúng/Sai [Câu ${q.order_index}] có ${q.options ? q.options.length : 0} ý hỏi con. Chuẩn Bộ GD&ĐT 2025 yêu cầu đủ 4 ý a, b, c, d.`;
      } else if (uniqueSubKeys.size !== 4 || !expectedSubKeys.every(k => uniqueSubKeys.has(k))) {
        q.warning = 'invalid_option_labels';
        q.status = 'pending_review';
        q.warning_message = `Câu hỏi Đúng/Sai [Câu ${q.order_index}] có nhãn ý không hợp lệ hoặc bị trùng nhãn: [${subKeys.join(', ')}]. Yêu cầu đủ 4 ý {a, b, c, d}.`;
      } else if (hasEmptySub) {
        q.warning = 'empty_option_content';
        q.status = 'pending_review';
        q.warning_message = `Câu hỏi Đúng/Sai [Câu ${q.order_index}] có ý hỏi bị rỗng nội dung.`;
      } else {
        q.correct_answers = normalizeTrueFalseMap(q.correct_answers);
        // Kiểm tra xem có ý nào hoàn toàn không được xác định Đúng/Sai không
        const unverified = subKeys.filter(k => q.correct_answers[k] === undefined);
        if (unverified.length > 0) {
          q.warning = 'unverified_true_false';
          q.status = 'pending_review';
          q.warning_message = `Câu hỏi Đúng/Sai [Câu ${q.order_index}] chưa được xác định rõ nhãn Đúng hoặc Sai cho các ý: [${unverified.join(', ')}].`;
        }
      }
    } else if (q.question_type !== 'essay') {
      let inlineCorrect = Array.isArray(q.correct_answers) ? [...q.correct_answers] : [];
      let keyCorrect = Array.isArray(tableKeyVal) ? [...tableKeyVal] : (tableKeyVal ? [String(tableKeyVal).toUpperCase().trim()] : []);

      // 1. Kiểm tra số lượng và tính hợp lệ của phương án trắc nghiệm Phần I (single_choice & multiple_choice)
      const opts = Array.isArray(q.options) ? q.options : [];
      const optLabels = opts.map(o => String(o.id || '').toUpperCase().trim()).filter(Boolean);
      const uniqueLabels = new Set(optLabels);
      const expectedLabels = ['A', 'B', 'C', 'D'];
      const hasEmptyOpt = opts.some(o => (o.text || '').replace(/<[^>]+>/g, '').trim().length === 0);

      if (opts.length !== 4) {
        q.warning = 'missing_options';
        q.status = 'pending_review';
        q.warning_message = `Lỗi nhập đề từ Word: Câu hỏi trắc nghiệm [Câu ${q.order_index}] chỉ có ${opts.length} phương án (thiếu phương án C hoặc D). Chuẩn Bộ GD&ĐT 2025 yêu cầu đủ 4 phương án A, B, C, D.`;
      } else if (uniqueLabels.size !== 4 || !expectedLabels.every(l => uniqueLabels.has(l))) {
        q.warning = 'invalid_option_labels';
        q.status = 'pending_review';
        q.warning_message = `Câu hỏi trắc nghiệm [Câu ${q.order_index}] có tập nhãn phương án không hợp lệ hoặc bị trùng nhãn: [${optLabels.join(', ')}]. Yêu cầu đủ 4 phương án {A, B, C, D}.`;
      } else if (hasEmptyOpt) {
        q.warning = 'empty_option_content';
        q.status = 'pending_review';
        q.warning_message = `Câu hỏi trắc nghiệm [Câu ${q.order_index}] có phương án bị rỗng nội dung.`;
      }

      // 2. Đối soát xung đột giữa Inline và Bảng đáp án cuối đề
      if (inlineCorrect.length > 0 && keyCorrect.length > 0) {
        const strInline = [...inlineCorrect].sort().join(',');
        const strKey = [...keyCorrect].sort().join(',');
        if (strInline !== strKey) {
          q.has_conflict = true;
          q.conflict_inline = inlineCorrect;
          q.conflict_key = keyCorrect;
          q.warning = 'conflict_answer';
          q.status = 'pending_review';
          q.warning_message = `Xung đột đáp án: Trong câu gạch chân/đánh dấu [${strInline}] nhưng Bảng đáp án cuối đề ghi [${strKey}].`;
          q.correct_answers = []; // Zero-Guesswork: Tuyệt đối không tự ý gán đáp án khi đang xung đột
        } else {
          q.has_conflict = false;
          q.answer_source = 'verified_match';
          q.correct_answers = inlineCorrect;
        }
      } else if (keyCorrect.length > 0) {
        q.has_conflict = false;
        q.correct_answers = keyCorrect;
        q.answer_source = 'answer_key_table';
      } else if (inlineCorrect.length > 0) {
        q.has_conflict = false;
        q.correct_answers = inlineCorrect;
        q.answer_source = 'inline_mark';
      } else {
        // KHÔNG CÓ ĐÁP ÁN: TUYỆT ĐỐI KHÔNG GÁN BỪA ['A']!
        q.has_conflict = false;
        q.correct_answers = [];
        if (!q.warning) {
          q.warning = 'missing_answer';
          q.warning_message = `Câu ${q.order_index} chưa được chọn đáp án đúng.`;
        }
        q.status = 'pending_review';
      }

      // 3. Phân biệt nhiều lựa chọn và trắc nghiệm đơn
      if (q.correct_answers.length > 1) {
        const isExplicitChecklist = /nhiều\s*lựa\s*chọn|chọn\s*nhiều|checklist/i.test(q.content);
        if (isExplicitChecklist) {
          q.question_type = 'multiple_choice';
        } else {
          q.question_type = 'multiple_choice';
          q.warning = q.warning || 'multiple_answers_in_single_choice';
          q.warning_message = q.warning_message || `Phát hiện ${q.correct_answers.length} đáp án đúng [${q.correct_answers.join(', ')}]. Hệ thống chuyển sang Nhiều lựa chọn (Checklist). Vui lòng xác nhận.`;
        }
      }

      // 4. Kiểm tra đáp án đúng có tham chiếu tới phương án hợp lệ hay không
      if (q.question_type === 'single_choice' && Array.isArray(q.correct_answers) && q.correct_answers.length > 0) {
        const ans = String(q.correct_answers[0]).toUpperCase().trim();
        if (optLabels.length > 0 && !uniqueLabels.has(ans)) {
          q.warning = 'invalid_correct_answer';
          q.status = 'pending_review';
          q.warning_message = `Câu hỏi trắc nghiệm [Câu ${q.order_index}] có đáp án đúng [${ans}] không thuộc danh sách các phương án [${optLabels.join(', ')}].`;
        }
      }
    }

    // Bóc tách sạch sẽ toàn bộ thẻ kỹ thuật trước khi lưu vào CSDL hoặc hiển thị cho học sinh
    const cleanTechnicalTags = (str) => {
      if (!str || typeof str !== 'string') return str;
      return str
        .replace(/\[\[FIX_QUESTION\]\]/gi, '')
        .replace(/\[\[FIX_OPTION\]\]/gi, '')
        .replace(/\[\[GROUP_START(?::[a-zA-Z0-9_-]+)?\]\]/gi, '')
        .replace(/\[\[GROUP_END(?::[a-zA-Z0-9_-]+)?\]\]/gi, '')
        .replace(/(?:<c>|\[<c>\]|\[c\])/gi, '')
        .replace(/(?:<o>|\[<o>\]|\[o\])/gi, '')
        .replace(/(?:<g>|\[<g>\]|\[g\]|<\/g>|\[<\/g>\]|\[\/g\])/gi, '')
        .trim();
    };

    q.content = cleanTechnicalTags(this.cleanAndNormalizeExamText(this.autoFenceCodeInText(autoFormatMathInContent(q.content.trim()))));
    if (q.rubric_guide) q.rubric_guide = cleanTechnicalTags(this.cleanAndNormalizeExamText(this.autoFenceCodeInText(autoFormatMathInContent(q.rubric_guide.trim()))));
    if (Array.isArray(q.options)) {
      q.options.forEach(opt => {
        if (opt.text) opt.text = cleanTechnicalTags(this.cleanAndNormalizeExamText(autoFormatMathInContent(opt.text.trim())));
      });
    }

    if (!q.scoring_config || typeof q.scoring_config !== 'object') {
      q.scoring_config = {};
    }
    q.scoring_config.is_fixed = Boolean(q.is_fixed);
    q.scoring_config.group_id = q.group_id || null;

    // Đối với câu nhiều lựa chọn: giữ nguyên max_score tổng thể, không tự ý chia đều khi chưa có barem
    if (q.question_type === 'multiple_choice' && !q.scoring_config.partial_policy) {
      q.scoring_config.partial_policy = 'manual_review';
    }

    questionsList.push(q);
  }

  formatSuperscript(text) {
    if (!text) return '';
    const SUPERSCRIPTS = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
      'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ', 'a': 'ᵃ',
      'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'k': 'ᵏ', 'm': 'ᵐ',
      'o': '°', 'O': '°'
    };
    const canConvertAll = text.split('').every(ch => SUPERSCRIPTS[ch] !== undefined);
    if (canConvertAll) {
      return text.split('').map(ch => SUPERSCRIPTS[ch]).join('');
    }
    return `<sup>${text}</sup>`;
  }

  formatSubscript(text) {
    if (!text) return '';
    const SUBSCRIPTS = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
      '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
      'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
      'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
      'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
    };
    const canConvertAll = text.split('').every(ch => SUBSCRIPTS[ch] !== undefined);
    if (canConvertAll) {
      return text.split('').map(ch => SUBSCRIPTS[ch]).join('');
    }
    return `<sub>${text}</sub>`;
  }

  cleanAndNormalizeExamText(text) {
    if (!text) return '';
    let res = text;
    // 1. Chuẩn hóa số đo nhiệt độ kèm độ C: 21⁰C hoặc 21^0C hoặc 21°C -> 21°C
    res = res.replace(/(\d+(?:[.,]\d+)?)\s*[⁰ºoO]\s*([Cc])\b/g, '$1°$2');
    // 2. Chuẩn hóa tiêu đề bảng hoặc đơn vị đóng ngoặc: (0C) hoặc (⁰C) -> (°C)
    res = res.replace(/\(\s*[0⁰ºoO]\s*([Cc])\s*\)/g, '(°$1)');
    // 3. Chuẩn hóa khoảng cách quanh dấu độ C/F
    res = res.replace(/(\d+(?:[.,]\d+)?)\s*°\s*([CcFf])\b/g, '$1°$2');
    return res;
  }
}

const parserInstance = new WordExamParser();
parserInstance.splitAlternativeAnswers = splitAlternativeAnswers;
parserInstance.cleanShortAnswerPrefix = cleanShortAnswerPrefix;
parserInstance.extractShortAnswersFromRaw = extractShortAnswersFromRaw;
parserInstance.detectShortAnswerScoringConfig = detectShortAnswerScoringConfig;
parserInstance.detectCodeLanguage = detectCodeLanguage;

module.exports = parserInstance;
module.exports.WordExamParser = WordExamParser;
module.exports.detectCodeLanguage = detectCodeLanguage;
module.exports.splitAlternativeAnswers = splitAlternativeAnswers;
module.exports.cleanShortAnswerPrefix = cleanShortAnswerPrefix;
module.exports.extractShortAnswersFromRaw = extractShortAnswersFromRaw;
module.exports.detectShortAnswerScoringConfig = detectShortAnswerScoringConfig;
