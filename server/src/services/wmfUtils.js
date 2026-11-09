/**
 * wmfUtils.js
 * Module xử lý định dạng tệp MathType và Windows Metafile (WMF / EMF):
 * 1. Giải mã MathType Equation Format (MTEF v3, v5) từ luồng nhị phân OLE (oleObject*.bin) và ảnh WMF sang KaTeX LaTeX ($...$).
 * 2. Trích xuất trực tiếp chuỗi 'TeX Input Language' siêu chuẩn của MathType 6/7.
 * 3. Chuyển đổi tệp ảnh WMF vector/bitmap (đồ thị, hình vẽ hình học) sang PNG độ phân giải cao hoặc BMP/SVG cho web.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const GREEK_MAP = {
  0x03B1: '\\alpha', 0x03B2: '\\beta', 0x03B3: '\\gamma', 0x03B4: '\\delta', 0x03B5: '\\epsilon',
  0x03B6: '\\zeta', 0x03B7: '\\eta', 0x03B8: '\\theta', 0x03B9: '\\iota', 0x03BA: '\\kappa',
  0x03BB: '\\lambda', 0x03BC: '\\mu', 0x03BD: '\\nu', 0x03BE: '\\xi', 0x03C0: '\\pi',
  0x03C1: '\\rho', 0x03C3: '\\sigma', 0x03C4: '\\tau', 0x03C5: '\\upsilon', 0x03C6: '\\phi',
  0x03C7: '\\chi', 0x03C8: '\\psi', 0x03C9: '\\omega', 0x03D5: '\\varphi', 0x03D6: '\\varpi',
  0x0391: 'A', 0x0392: 'B', 0x0393: '\\Gamma', 0x0394: '\\Delta', 0x0395: 'E',
  0x0396: 'Z', 0x0397: 'H', 0x0398: '\\Theta', 0x0399: 'I', 0x039A: 'K',
  0x039B: '\\Lambda', 0x039C: 'M', 0x039D: 'N', 0x039E: '\\Xi', 0x03A0: '\\Pi',
  0x03A1: 'P', 0x03A3: '\\Sigma', 0x03A4: 'T', 0x03A5: '\\Upsilon', 0x03A6: '\\Phi',
  0x03A7: 'X', 0x03A8: '\\Psi', 0x03A9: '\\Omega'
};

const SYMBOL_FALLBACK_MAP = {
  0x61: '\\alpha', 0x62: '\\beta', 0x63: '\\chi', 0x64: '\\delta', 0x65: '\\epsilon',
  0x66: '\\phi', 0x67: '\\gamma', 0x68: '\\eta', 0x69: '\\iota', 0x6A: '\\varphi',
  0x6B: '\\kappa', 0x6C: '\\lambda', 0x6D: '\\mu', 0x6E: '\\nu', 0x70: '\\pi',
  0x71: '\\theta', 0x72: '\\rho', 0x73: '\\sigma', 0x74: '\\tau', 0x75: '\\upsilon',
  0x76: '\\varpi', 0x77: '\\omega', 0x78: '\\xi', 0x79: '\\psi', 0x7A: '\\zeta',
  0x41: 'A', 0x42: 'B', 0x43: 'X', 0x44: '\\Delta', 0x45: 'E', 0x46: '\\Phi',
  0x47: '\\Gamma', 0x48: 'H', 0x49: 'I', 0x4B: 'K', 0x4C: '\\Lambda', 0x4D: 'M',
  0x4E: 'N', 0x50: '\\Pi', 0x51: '\\Theta', 0x52: 'P', 0x53: '\\Sigma', 0x54: 'T',
  0x55: '\\Upsilon', 0x57: '\\Omega', 0x58: '\\Xi', 0x59: '\\Psi', 0x5A: 'Z',
  0xA3: ' \\le ', 0xB3: ' \\ge ', 0xB9: ' \\ne ', 0xB1: ' \\pm ', 0xB4: ' \\times ',
  0xB8: ' \\div ', 0xBD: ' \\Leftrightarrow ', 0xDC: ' \\Rightarrow ', 0xD8: ' \\to ',
  0xC0: ' \\aleph ', 0xC6: ' \\emptyset ', 0xC7: ' \\cap ', 0xC8: ' \\cup ',
  0xC9: ' \\supset ', 0xCA: ' \\supseteq ', 0xCB: ' \\not\\subset ', 0xCC: ' \\subset ',
  0xCD: ' \\subseteq ', 0xCE: ' \\in ', 0xCF: ' \\notin ', 0xD0: ' \\angle ',
  0xD1: ' \\nabla ', 0xD5: ' \\prod ', 0xD6: ' \\sqrt{} ', 0xD7: ' \\cdot ',
  0xD9: ' \\wedge ', 0xDA: ' \\vee ', 0xE5: ' \\sum ', 0xF2: ' \\int ', 0xA5: '\\infty',
  0x2D: ' - '
};

/**
 * Trích xuất luồng nhị phân từ Microsoft Compound File Binary Format (CFBF / OLE2)
 */
function extractOleStream(buffer, targetName) {
  if (!buffer || buffer.length < 512 || buffer.readUInt32LE(0) !== 0xe011cfd0) return null;

  try {
    const sectorShift = buffer.readUInt16LE(30);
    const sectorSize = 1 << sectorShift;
    const miniSectorShift = buffer.readUInt16LE(32);
    const miniSectorSize = 1 << miniSectorShift;
    const numFatSectors = buffer.readUInt32LE(44);
    const firstDirSector = buffer.readUInt32LE(48);
    const miniStreamCutoff = buffer.readUInt32LE(56);
    const firstMiniFatSector = buffer.readUInt32LE(60);

    const fat = [];
    for (let i = 0; i < 109 && i < numFatSectors; i++) {
      const secNum = buffer.readUInt32LE(76 + i * 4);
      if (secNum >= 0xfffffffe) break;
      const offset = (secNum + 1) * sectorSize;
      for (let j = 0; j < sectorSize / 4; j++) fat.push(buffer.readUInt32LE(offset + j * 4));
    }

    const dirBufs = [];
    let dirSec = firstDirSector;
    while (dirSec < 0xfffffffe && dirSec < fat.length && dirBufs.length < 500) {
      const offset = (dirSec + 1) * sectorSize;
      dirBufs.push(buffer.slice(offset, offset + sectorSize));
      dirSec = fat[dirSec];
    }
    const dirBuffer = Buffer.concat(dirBufs);

    const rootEntry = dirBuffer.slice(0, 128);
    const rootStartSec = rootEntry.readUInt32LE(116);
    const rootSize = rootEntry.readUInt32LE(120);
    const miniStreamBufs = [];
    let mSec = rootStartSec;
    while (mSec < 0xfffffffe && mSec < fat.length && miniStreamBufs.length * sectorSize < rootSize && miniStreamBufs.length < 1000) {
      const offset = (mSec + 1) * sectorSize;
      miniStreamBufs.push(buffer.slice(offset, offset + sectorSize));
      mSec = fat[mSec];
    }
    const miniStreamBuffer = Buffer.concat(miniStreamBufs);

    const miniFat = [];
    let mfSec = firstMiniFatSector;
    while (mfSec < 0xfffffffe && mfSec < fat.length && miniFat.length < 5000) {
      const offset = (mfSec + 1) * sectorSize;
      for (let j = 0; j < sectorSize / 4; j++) miniFat.push(buffer.readUInt32LE(offset + j * 4));
      mfSec = fat[mfSec];
    }

    for (let i = 0; i < dirBuffer.length; i += 128) {
      const entry = dirBuffer.slice(i, i + 128);
      const nameLen = entry.readUInt16LE(64);
      if (nameLen <= 0) continue;
      const name = entry.slice(0, nameLen - 2).toString('utf16le');
      const startSec = entry.readUInt32LE(116);
      const size = entry.readUInt32LE(120);

      if (name.toLowerCase().includes(targetName.toLowerCase())) {
        if (size < miniStreamCutoff && miniStreamBuffer.length > 0 && miniFat.length > 0) {
          const outBufs = [];
          let cur = startSec;
          let read = 0;
          while (cur < 0xfffffffe && cur < miniFat.length && read < size && outBufs.length < 2000) {
            const offset = cur * miniSectorSize;
            const take = Math.min(miniSectorSize, size - read);
            outBufs.push(miniStreamBuffer.slice(offset, offset + take));
            read += take;
            cur = miniFat[cur];
          }
          return Buffer.concat(outBufs);
        } else {
          const outBufs = [];
          let cur = startSec;
          let read = 0;
          while (cur < 0xfffffffe && cur < fat.length && read < size && outBufs.length < 2000) {
            const offset = (cur + 1) * sectorSize;
            const take = Math.min(sectorSize, size - read);
            outBufs.push(buffer.slice(offset, offset + take));
            read += take;
            cur = fat[cur];
          }
          return Buffer.concat(outBufs);
        }
      }
    }
  } catch (err) {
    // ignore parse error
  }
  return null;
}

/**
 * Trích xuất và chuẩn hóa chuỗi TeX Input Language từ MathType (OLE Equation Native hoặc WMF header)
 */
function extractTexFromStream(buffer) {
  if (!buffer || buffer.length < 25) return null;
  const marker = Buffer.from('TeX Input Language');
  const idx = buffer.indexOf(marker);
  if (idx === -1) return null;

  let p = idx + marker.length;
  // Bỏ qua các byte null hoặc khoảng trắng đầu
  while (p < buffer.length && (buffer[p] === 0 || buffer[p] === 10 || buffer[p] === 13 || buffer[p] === 32)) {
    p++;
  }
  let end = p;
  while (end < buffer.length && buffer[end] !== 0) {
    end++;
  }
  if (end <= p) return null;

  let str = buffer.toString('utf8', p, end).trim();
  if (!str) return null;

  // 1. MathType ~ (dấu cách không ngắt / đơn vị): {600 {~kg}} -> 600\text{ kg}
  str = str.replace(/\{\s*~([a-zA-Z]+)\s*\}/g, '\\text{ $1}');
  str = str.replace(/~\s*([a-zA-Z]+)/g, '\\text{ $1}');
  str = str.replace(/~/g, '\\, ');

  // 2. Vector: \overrightarrow{A B} -> \overrightarrow{AB}
  str = str.replace(/\\overrightarrow\{\s*([A-Za-z]+)\s+([A-Za-z]+)\s*\}/g, '\\overrightarrow{$1$2}');
  str = str.replace(/\\vec\{\s*([A-Za-z]+)\s+([A-Za-z]+)\s*\}/g, '\\vec{$1$2}');

  // 3. Điểm / Đoạn thẳng / Tam giác: {A B C} -> ABC, {A B} -> AB
  str = str.replace(/\{([A-Z])\s+([A-Z])\s+([A-Z])\}/g, '$1$2$3');
  str = str.replace(/\{([A-Z])\s+([A-Z])\}/g, '$1$2');
  str = str.replace(/\b([A-Z])\s+([A-Z])\b/g, '$1$2');

  // 4. Đơn vị micromet / nanomet: \mu {m} -> \mu\text{m}
  str = str.replace(/\\mu\s*\{m\}/g, '\\mu\\text{m}');
  str = str.replace(/\\mu\s+m\b/g, '\\mu\\text{m}');

  // 5. Loại bỏ cặp ngoặc ngoài cùng { ... } nếu bao trùm toàn bộ
  if (str.startsWith('{') && str.endsWith('}')) {
    let depth = 0;
    let canUnwrap = true;
    for (let i = 0; i < str.length - 1; i++) {
      if (str[i] === '{') depth++;
      else if (str[i] === '}') depth--;
      if (depth === 0) {
        canUnwrap = false;
        break;
      }
    }
    if (canUnwrap) {
      str = str.substring(1, str.length - 1).trim();
    }
  }

  // 6. Vector sau khi un-wrap
  str = str.replace(/\\overrightarrow\{\s*([A-Za-z]+)\s+([A-Za-z]+)\s*\}/g, '\\overrightarrow{$1$2}');

  // 7. Chuẩn hóa hàm lượng giác và toán học sang lệnh KaTeX
  str = str.replace(/\b(sin|cos|tan|cot|arcsin|arccos|arctan|ln|log|lim|max|min|det)\b/g, '\\$1');

  str = str.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1');
  return str.trim();
}

/**
 * Giải mã luồng MTEF v3, v4, v5 sang KaTeX LaTeX
 */
function parseMtefStreamToLatex(buffer) {
  if (!buffer || buffer.length < 5) return null;

  // 0. Ưu tiên kiểm tra chuỗi TeX Input Language có sẵn trong luồng
  const texDirect = extractTexFromStream(buffer);
  if (texDirect && texDirect.length > 0) {
    return texDirect;
  }

  try {
    let offset = 0;
    // 1. Kiểm tra header length nếu là OLE Equation Stream (thường là 28 byte)
    if (buffer.length >= 4) {
      const hLen = buffer.readUInt32LE(0);
      if (hLen >= 4 && hLen <= 64 && buffer.length > hLen + 5) {
        offset = hLen;
      }
    }

    // 2. Tìm chữ ký MTEF (0x05 0x01, 0x03 0x01, 0x1B 0x05)
    let foundSig = false;
    for (let i = offset; i < Math.min(offset + 128, buffer.length - 4); i++) {
      if ((buffer[i] === 0x05 || buffer[i] === 0x03) && (buffer[i + 1] === 0x01 || buffer[i + 1] === 0x00)) {
        offset = i;
        foundSig = true;
        break;
      } else if (buffer[i] === 0x1B && (buffer[i + 1] === 0x05 || buffer[i + 1] === 0x03)) {
        offset = i + 1;
        foundSig = true;
        break;
      }
    }

    if (!foundSig && offset === 0) {
      return null;
    }

    // 3. Tìm vị trí bản ghi LINE gốc (0x0A 0x01 hoặc 0x01 0x00)
    let rootLineOffset = -1;
    for (let i = offset; i < Math.min(offset + 256, buffer.length - 2); i++) {
      if (buffer[i] === 0x0A && buffer[i + 1] === 0x01 && (buffer[i + 2] === 0x00 || buffer[i + 2] === 0x01 || buffer[i + 2] === 0x02)) {
        rootLineOffset = i + 2;
        if (buffer[rootLineOffset] === 0x00) rootLineOffset++;
        break;
      } else if (buffer[i] === 0x01 && buffer[i + 1] === 0x00 && buffer[i + 2] === 0x02 && i > offset + 5) {
        rootLineOffset = i + 2;
        break;
      }
    }

    if (rootLineOffset === -1) {
      rootLineOffset = offset + 5;
    }
    offset = rootLineOffset;

    let opCount = 0;
    const MAX_OPS = 2500;

    function readByte() { return offset < buffer.length ? buffer[offset++] : 0; }
    function readUInt16() {
      if (offset + 1 >= buffer.length) return 0;
      const v = buffer.readUInt16LE(offset);
      offset += 2;
      return v;
    }

    function parseSlot(depth = 0) {
      if (offset >= buffer.length || depth > 15 || ++opCount > MAX_OPS) return '';
      if (buffer[offset] >= 0x10 && offset + 1 < buffer.length && (buffer[offset + 1] === 0x00 || buffer[offset + 1] === 0x01 || buffer[offset + 1] === 0x0A)) {
        offset++;
      }
      while (offset < buffer.length && buffer[offset] === 0x00 && offset + 1 < buffer.length && buffer[offset + 1] === 0x00) {
        offset++;
      }
      if (buffer[offset] === 0x00 && offset + 1 < buffer.length && (buffer[offset + 1] === 0x02 || buffer[offset + 1] === 0x03 || buffer[offset + 1] === 0x01 || buffer[offset + 1] === 0x0A)) {
        offset++;
      }
      const peek = buffer[offset];
      if (peek === 1 || peek === 0x0A) {
        offset++;
        while (offset < buffer.length && buffer[offset] === 0x00 && offset + 1 < buffer.length && (buffer[offset + 1] === 0x01 || buffer[offset + 1] === 0x0A || buffer[offset + 1] === 0x02 || buffer[offset + 1] === 0x03)) {
          offset++;
        }
      }
      return parseStream(depth + 1);
    }

    function parseChar() {
      const fPos = readByte();
      const style = readByte();
      const code = readUInt16();
      let fallback = 0;
      if (fPos === 4 || ((style & 0x04) !== 0 && fPos !== 0 && fPos !== 2)) {
        fallback = readByte();
      }

      if (code === 0x2212 || fallback === 0x2D) return ' - ';
      if (GREEK_MAP[code]) return GREEK_MAP[code];
      if (SYMBOL_FALLBACK_MAP[fallback]) return SYMBOL_FALLBACK_MAP[fallback];
      if (code === 0x221E || code === 0x00A5 || fallback === 0xA5) return '\\infty';
      if (code === 0x2264 || fallback === 0xA3) return ' \\le ';
      if (code === 0x2265 || fallback === 0xB3) return ' \\ge ';
      if (code === 0x2260 || fallback === 0xB9) return ' \\ne ';
      if (code === 0x00B1 || fallback === 0xB1) return ' \\pm ';
      if (code === 0x00D7 || fallback === 0xB4) return ' \\times ';
      if (code === 0x2208 || fallback === 0xCE) return ' \\in ';
      if (code >= 0x20 && code <= 0x7E) return String.fromCharCode(code);
      return '';
    }

    function parseStream(depth = 0) {
      if (depth > 15 || ++opCount > MAX_OPS) return '';
      let out = '';
      while (offset < buffer.length && opCount < MAX_OPS) {
        const b = readByte();
        if (b === 0) break;

        const tag = b & 0x0F;

        if (tag === 1 || tag === 0x0A) {
          if (buffer[offset] === 0x00) offset++;
          const lineRes = parseStream(depth + 1);
          if (lineRes && lineRes.trim()) {
            const trimmedOut = out.trim();
            if (trimmedOut.length > 0 && !trimmedOut.endsWith('\\\\')) {
              out += ' \\\\ ';
            }
            out += lineRes;
          }
        } else if (tag === 2) { // CHAR
          out += parseChar();
        } else if (tag === 3) { // TMPL
          const sel = readByte();
          const varId = readByte();

          if (sel === 1 || (sel === 0 && varId === 11)) { // Fraction
            const num = parseSlot(depth + 1);
            const den = parseSlot(depth + 1);
            out += `\\frac{${num}}{${den}}`;
          } else if (sel === 2 || (sel === 0 && varId === 12)) { // Square root
            const rad = parseSlot(depth + 1);
            out += `\\sqrt{${rad}}`;
          } else if (sel === 0 || sel === 10) { // Parenthesis / Fence
            let inner = parseSlot(depth + 1);
            inner = inner.replace(/\\left\(|\\right\)/g, '').replace(/\(\s*\)/g, '').trim();
            if (inner.includes('\\\\')) {
              out += `\\begin{cases} ${inner} \\end{cases}`;
            } else if (inner.startsWith('(') && inner.endsWith(')')) {
              out += inner;
            } else {
              out += `(${inner})`;
            }
          } else if (sel === 8) { // Bracket [ ... ]
            let inner = parseSlot(depth + 1);
            inner = inner.replace(/\[\s*\]/g, '').trim();
            if (inner.startsWith('[') && inner.endsWith(']')) {
              out += inner;
            } else {
              out += `[${inner}]`;
            }
          } else if (sel === 9) { // Cases / Brace { ... }
            let inner = parseSlot(depth + 1);
            out += inner.includes('\\\\') ? `\\begin{cases} ${inner} \\end{cases}` : `\\{${inner}\\}`;
          } else if (sel === 11) { // Bar | ... |
            let inner = parseSlot(depth + 1);
            out += `|${inner}|`;
          } else if (sel === 12) { // Sub / Sup
            const sub = (varId & 0x01) ? parseSlot(depth + 1) : '';
            const sup = (varId & 0x02) ? parseSlot(depth + 1) : '';
            if (sub) out += `_{${sub}}`;
            if (sup) out += `^{${sup}}`;
          } else {
            out += parseSlot(depth + 1);
          }
        } else if (tag === 4) { // PILE
          const lines = [];
          let pileSteps = 0;
          while (offset < buffer.length && pileSteps++ < 20) {
            if (buffer[offset] === 0) { offset++; break; }
            const prevOff = offset;
            const l = parseSlot(depth + 1);
            if (l && l.trim()) lines.push(l.trim());
            if (offset === prevOff) offset++;
          }
          if (lines.length > 1) {
            out += lines.join(' \\\\ ');
          } else if (lines.length === 1) {
            out += lines[0];
          }
        } else if (tag === 5) { // MATRIX
          const rows = Math.min(readByte() || 2, 10);
          const cols = Math.min(readByte() || 2, 10);
          const rowList = [];
          for (let r = 0; r < rows; r++) {
            const cells = [];
            for (let c = 0; c < cols; c++) {
              const prevOff = offset;
              cells.push(parseSlot(depth + 1));
              if (offset === prevOff) offset++;
            }
            rowList.push(cells.join(' & '));
          }
          out += `\\begin{pmatrix} ${rowList.join(' \\\\ ')} \\end{pmatrix}`;
        } else if (tag === 6) {
          readByte();
        }
      }
      return out;
    }

    let latex = parseStream(0);
    if (!latex) return null;

    // Chuẩn hóa và làm sạch cấu trúc toán học
    latex = latex.replace(/\(\s*\)/g, '');
    latex = latex.replace(/\[\s*\]/g, '');
    latex = latex.replace(/\{\s*\}/g, '');
    latex = latex.replace(/\(\(([^()]+)\)\)/g, '($1)');
    latex = latex.replace(/\[\[([^\[\]]+)\]\]/g, '[$1]');
    latex = latex.replace(/\{\s*\.\s*$/g, '').trim();

    // Dọn dẹp khoảng trống và dấu ngoặc khi có đa dòng
    if (latex.includes('\\\\')) {
      latex = latex.replace(/\{\s*$/g, '').replace(/^\s*\{/g, '').trim();
      latex = latex.replace(/^\s*\\\\\s*/, '').replace(/\\\\\s*$/, '');
      if (!latex.includes('\\begin{cases}')) {
        latex = `\\begin{cases} ${latex} \\end{cases}`;
      }
    }

    // Bỏ dấu \\ thừa ở đầu cases
    latex = latex.replace(/\\begin\{cases\}\s*\\\\\s*/g, '\\begin{cases} ');

    // Chuẩn hóa ngoặc đôi trong tọa độ e.g. ((- \frac{1}{2}); 9) -> (-\frac{1}{2}; 9)
    latex = latex.replace(/\(\(([^()]+)\)\s*;\s*([^()]+)\)/g, '($1; $2)');
    latex = latex.replace(/\(([^()]+)\s*;\s*\(([^()]+)\)\)/g, '($1; $2)');

    // Chuẩn hóa ngoặc nửa khoảng e.g. (a; b)(] -> (a; b] hoặc (a; b)[) -> [a; b)
    latex = latex.replace(/\(([^()\[\]]+)\)\s*\(\s*\]/g, '($1]');
    latex = latex.replace(/\(([^()\[\]]+)\)\s*\[\s*\)/g, '[$1)');
    latex = latex.replace(/\(([^()\[\]]+)\)\s*\[\s*\]/g, '[$1]');
    latex = latex.replace(/\(([^()\[\]]+)\s*\(\s*\]/g, '($1]');
    latex = latex.replace(/\(([^()\[\]]+)\s*\[\s*\)/g, '[$1)');
    latex = latex.replace(/\(([^()\[\]]+)\s*\[\s*\]/g, '[$1]');

    // Chuẩn hóa dấu âm liền kề số: - 3 -> -3 sau dấu = / ( / > / < / ; / \le / \ge / \\
    latex = latex.replace(/([=(><;]|\\le|\\ge|\\\\)\s*-\s+(\d+)/g, '$1 -$2');
    latex = latex.replace(/^-\s+(\d+)/g, '-$1');

    // Tự động chuẩn hóa hàm lượng giác và toán học sang lệnh LaTeX KaTeX
    latex = latex.replace(/\b(sin|cos|tan|cot|arcsin|arccos|arctan|ln|log|lim|max|min|det)\b/g, '\\$1');

    latex = latex.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1');
    return latex.trim();
  } catch (e) {
    return null;
  }
}

/**
 * Trích xuất công thức MathType từ Buffer tệp (.bin, .wmf, .emf) sang dạng KaTeX LaTeX ($...$)
 */
function extractMathTypeToLatex(buffer) {
  if (!buffer || buffer.length < 10) return null;

  // 0. Bỏ qua các định dạng ảnh raster thông thường (PNG, JPEG, GIF, WEBP, PDF, ZIP)
  if (
    (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) || // PNG
    (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) || // JPEG
    (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) || // GIF
    (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) || // PK zip
    (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46)    // PDF
  ) {
    return null;
  }

  try {
    // 1. Kiểm tra đối tượng nhúng OLE CFBF (oleObject*.bin)
    if (buffer.length >= 512 && buffer.readUInt32LE(0) === 0xe011cfd0) {
      const stream = extractOleStream(buffer, 'Equation Native');
      if (stream) {
        const tex = extractTexFromStream(stream);
        if (tex && tex.length > 0) return `$${tex}$`;
        const latex = parseMtefStreamToLatex(stream);
        if (latex && latex.length > 0) return `$${latex}$`;
      }
      // Quét trực tiếp toàn bộ OLE buffer nếu extractOleStream không thấy
      const directTex = extractTexFromStream(buffer);
      if (directTex && directTex.length > 0) return `$${directTex}$`;
      return null;
    }

    // 2. Kiểm tra nếu buffer có chứa chuỗi TeX Input Language (kể cả trong WMF)
    const directTex = extractTexFromStream(buffer);
    if (directTex && directTex.length > 0) {
      return `$${directTex}$`;
    }

    // 3. Kiểm tra tệp WMF chứa MathType comment records 'DSMT' (header MTEF Windows)
    const dsmtPos = buffer.indexOf(Buffer.from('DSMT'));
    if (dsmtPos >= 5) {
      const latex = parseMtefStreamToLatex(buffer.slice(dsmtPos - 5));
      if (latex && latex.length > 0) return `$${latex}$`;
    }

    // 4. Kiểm tra nếu luồng bắt đầu trực tiếp bằng chữ ký MTEF (0x05 0x01, 0x03 0x01)
    if (
      (buffer[0] === 0x05 && buffer[1] === 0x01) ||
      (buffer[0] === 0x03 && buffer[1] === 0x01) ||
      (buffer.length >= 28 && (buffer[28] === 0x05 || buffer[28] === 0x03) && buffer[29] === 0x01)
    ) {
      const rawLatex = parseMtefStreamToLatex(buffer);
      if (rawLatex && rawLatex.length > 0) return `$${rawLatex}$`;
    }

    // 5. Kiểm tra tệp WMF chứa MathType comment records (quét header hoặc toàn bộ buffer)
    const scanLimit = Math.min(buffer.length - 4, 4096);
    for (let i = 0; i < scanLimit; i++) {
      if ((buffer[i] === 0x05 || buffer[i] === 0x03) && buffer[i + 1] === 0x01) {
        const latex = parseMtefStreamToLatex(buffer.slice(i));
        if (latex && latex.length > 0) return `$${latex}$`;
      } else if (buffer[i] === 0x1B && (buffer[i + 1] === 0x03 || buffer[i + 1] === 0x05 || buffer[i + 1] === 0x01)) {
        const latex = parseMtefStreamToLatex(buffer.slice(i));
        if (latex && latex.length > 0) return `$${latex}$`;
      }
    }
  } catch (err) {
    // ignore
  }

  return null;
}

/**
 * Chuyển đổi tệp ảnh WMF vector sang PNG bằng Windows GDI+
 */
function convertWmfToPngWithGdi(wmfBuffer) {
  if (process.platform !== 'win32' || !wmfBuffer || wmfBuffer.length < 40) return null;
  const tmpDir = os.tmpdir();
  const tmpWmf = path.join(tmpDir, `wmf_${Date.now()}_${Math.random().toString(36).substring(7)}.wmf`);
  const tmpPng = path.join(tmpDir, `png_${Date.now()}_${Math.random().toString(36).substring(7)}.png`);

  try {
    fs.writeFileSync(tmpWmf, wmfBuffer);
    const psScript = `
      Add-Type -AssemblyName System.Drawing
      try {
        $img = [System.Drawing.Imaging.Metafile]::new('${tmpWmf.replace(/\\/g, '/')}')
        $w = [Math]::Max(100, [Math]::Min(3000, [int]$img.Width))
        $h = [Math]::Max(100, [Math]::Min(3000, [int]$img.Height))
        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.Clear([System.Drawing.Color]::White)
        $g.DrawImage($img, 0, 0, $w, $h)
        $bmp.Save('${tmpPng.replace(/\\/g, '/')}', [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose()
        $bmp.Dispose()
        $img.Dispose()
        Write-Output "OK:\${w}:\${h}"
      } catch {
        Write-Output "ERR:$($_.Exception.Message)"
      }
    `;

    const out = execFileSync('powershell', ['-NoProfile', '-Command', psScript], {
      timeout: 5000,
      encoding: 'utf8',
      windowsHide: true
    }).trim();

    if (out.startsWith('OK:') && fs.existsSync(tmpPng)) {
      const parts = out.split(':');
      const width = parseInt(parts[1], 10) || 400;
      const height = parseInt(parts[2], 10) || 250;
      const pngBuffer = fs.readFileSync(tmpPng);
      return { buffer: pngBuffer, ext: 'png', width, height };
    }
  } catch (err) {
    // fallback
  } finally {
    try { if (fs.existsSync(tmpWmf)) fs.unlinkSync(tmpWmf); } catch (e) {}
    try { if (fs.existsSync(tmpPng)) fs.unlinkSync(tmpPng); } catch (e) {}
  }
  return null;
}

/**
 * Chuyển đổi tệp ảnh WMF vector / bitmap (đồ thị, hình vẽ) sang PNG/BMP/SVG để trình duyệt web hiển thị
 */
function convertWmfToWebImage(wmfBuffer) {
  if (!wmfBuffer || wmfBuffer.length < 40) return null;

  try {
    // 1. Kiểm tra nếu WMF chứa bitmap DIB nhúng (0x28 0x00 0x00 0x00 = BITMAPINFOHEADER)
    for (let i = 0; i < wmfBuffer.length - 40; i++) {
      if (wmfBuffer[i] === 0x28 && wmfBuffer[i + 1] === 0x00 && wmfBuffer[i + 2] === 0x00 && wmfBuffer[i + 3] === 0x00) {
        const biWidth = wmfBuffer.readInt32LE(i + 4);
        const biHeight = wmfBuffer.readInt32LE(i + 8);
        const biPlanes = wmfBuffer.readUInt16LE(i + 12);
        const biBitCount = wmfBuffer.readUInt16LE(i + 14);

        if (biWidth > 0 && biHeight !== 0 && biPlanes === 1 && (biBitCount === 1 || biBitCount === 4 || biBitCount === 8 || biBitCount === 16 || biBitCount === 24 || biBitCount === 32)) {
          const bmpDataSize = wmfBuffer.length - i;
          const fileSize = 14 + bmpDataSize;
          const bmpHeader = Buffer.alloc(14);
          bmpHeader.write('BM', 0);
          bmpHeader.writeUInt32LE(fileSize, 2);
          bmpHeader.writeUInt32LE(0, 6);
          const offsetToBits = 14 + 40 + (biBitCount <= 8 ? (1 << biBitCount) * 4 : 0);
          bmpHeader.writeUInt32LE(offsetToBits, 10);

          const bmpBuffer = Buffer.concat([bmpHeader, wmfBuffer.slice(i)]);
          return {
            buffer: bmpBuffer,
            ext: 'bmp',
            width: biWidth,
            height: Math.abs(biHeight)
          };
        }
      }
    }

    // 2. Vector WMF: Render sang PNG sắc nét bằng Windows GDI+
    if (process.platform === 'win32') {
      const gdiRes = convertWmfToPngWithGdi(wmfBuffer);
      if (gdiRes) return gdiRes;
    }

    // 3. Fallback: Kích thước từ Placeable Header (0x9AC6CDD7)
    let width = 400;
    let height = 250;
    if (wmfBuffer.readUInt32LE(0) === 0x9AC6CDD7) {
      const left = wmfBuffer.readInt16LE(6);
      const top = wmfBuffer.readInt16LE(8);
      const right = wmfBuffer.readInt16LE(10);
      const bottom = wmfBuffer.readInt16LE(12);
      const inch = wmfBuffer.readUInt16LE(14) || 1440;
      width = Math.round(Math.abs(right - left) * 96 / inch) || 400;
      height = Math.round(Math.abs(bottom - top) * 96 / inch) || 250;
    }

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" rx="4"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="13" fill="#64748b" text-anchor="middle" dominant-baseline="middle">
    [Hình vẽ đồ thị / Sơ đồ WMF (${width}x${height})]
  </text>
</svg>`;

    return {
      buffer: Buffer.from(svgContent, 'utf8'),
      ext: 'svg',
      width,
      height
    };
  } catch (e) {
    return null;
  }
}

module.exports = {
  extractMathTypeToLatex,
  parseMtefStreamToLatex,
  extractOleStream,
  extractTexFromStream,
  convertWmfToWebImage
};
