/**
 * ommlToLatex.js
 * Chuyển đổi công thức toán học từ chuẩn Office Math Markup Language (OMML)
 * sang chuẩn LaTeX để KaTeX render trên giao diện (hỗ trợ 100% Offline).
 */

function parseOMMLNode(node) {
  if (!node) return '';
  if (node.nodeType === 3) { // Text node
    return cleanMathText(node.nodeValue || '');
  }
  if (node.nodeType !== 1) return ''; // Element node only

  const tag = node.localName || node.nodeName.split(':').pop();

  switch (tag) {
    case 'oMathPara': {
      const parts = [];
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const str = parseOMMLNode(child);
        if (str) parts.push(str);
      }
      return parts.join(' ');
    }

    case 'oMath': {
      const mathParts = [];
      for (let child = node.firstChild; child; child = child.nextSibling) {
        mathParts.push(parseOMMLNode(child));
      }
      let mathStr = mathParts.join('').trim();
      mathStr = mathStr.replace(/\s+/g, ' ');
      // Chuẩn hóa nếu công thức là giá trị nhiệt độ (như 20C hoặc 20^\circ C -> 20^{\circ}\mathrm{C})
      mathStr = mathStr.replace(/^(\d+(?:[.,]\d+)?)\s*C$/i, '$1^{\\circ}\\mathrm{C}');
      mathStr = mathStr.replace(/^(\d+(?:[.,]\d+)?)\s*\^\{\\circ\}\s*C$/i, '$1^{\\circ}\\mathrm{C}');
      mathStr = mathStr.replace(/^(\d+(?:[.,]\d+)?)\s*\^\\circ\s*C$/i, '$1^{\\circ}\\mathrm{C}');
      return mathStr ? `$${mathStr}$` : '';
    }

    case 'r': { // Run
      let text = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 't') {
          text += child.textContent || '';
        }
      }
      return cleanMathText(text);
    }

    case 'f': { // Fraction
      let num = '';
      let den = '';
      let isSkewed = false;
      let isNoBar = false;

      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'fPr') {
          for (let pr = child.firstChild; pr; pr = pr.nextSibling) {
            const prTag = pr.localName || pr.nodeName.split(':').pop();
            if (prTag === 'type') {
              const val = pr.getAttribute('m:val') || pr.getAttribute('val');
              if (val === 'skw' || val === 'lin') isSkewed = true;
              else if (val === 'noBar') isNoBar = true;
            }
          }
        } else if (childTag === 'num') {
          num = parseOMMLChildren(child);
        } else if (childTag === 'den') {
          den = parseOMMLChildren(child);
        }
      }

      if (isSkewed) {
        return `${num.trim()}/${den.trim()}`;
      }
      if (isNoBar) {
        return `\\binom{${num.trim()}}{${den.trim()}}`;
      }
      return `\\frac{${num.trim()}}{${den.trim()}}`;
    }

    case 'rad': { // Radical / Root
      let deg = '';
      let base = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'deg') {
          deg = parseOMMLChildren(child).trim();
        } else if (childTag === 'e') {
          base = parseOMMLChildren(child).trim();
        }
      }
      if (deg && deg.length > 0) {
        return `\\sqrt[${deg}]{${base}}`;
      }
      return `\\sqrt{${base}}`;
    }

    case 'sSup': { // Superscript
      let base = '';
      let sup = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'e') {
          base = parseOMMLChildren(child).trim();
        } else if (childTag === 'sup') {
          sup = parseOMMLChildren(child).trim();
        }
      }
      return `{${base}}^{${sup}}`;
    }

    case 'sSub': { // Subscript
      let base = '';
      let sub = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'e') {
          base = parseOMMLChildren(child).trim();
        } else if (childTag === 'sub') {
          sub = parseOMMLChildren(child).trim();
        }
      }
      return `{${base}}_{${sub}}`;
    }

    case 'sSubSup': { // Sub-Superscript
      let base = '';
      let sub = '';
      let sup = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'e') {
          base = parseOMMLChildren(child).trim();
        } else if (childTag === 'sub') {
          sub = parseOMMLChildren(child).trim();
        } else if (childTag === 'sup') {
          sup = parseOMMLChildren(child).trim();
        }
      }
      return `{${base}}_{${sub}}^{${sup}}`;
    }

    case 'sPre': { // Prescript
      let base = '';
      let sub = '';
      let sup = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'e') {
          base = parseOMMLChildren(child).trim();
        } else if (childTag === 'sub') {
          sub = parseOMMLChildren(child).trim();
        } else if (childTag === 'sup') {
          sup = parseOMMLChildren(child).trim();
        }
      }
      return `{}_{${sub}}^{${sup}}{${base}}`;
    }

    case 'd': { // Delimiter
      let begChr = '(';
      let endChr = ')';
      let hasCustomBeg = false;
      let hasCustomEnd = false;
      const elements = [];

      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'dPr') {
          for (let pr = child.firstChild; pr; pr = pr.nextSibling) {
            const prTag = pr.localName || pr.nodeName.split(':').pop();
            if (prTag === 'begChr') {
              begChr = pr.getAttribute('m:val') ?? pr.getAttribute('val') ?? '(';
              hasCustomBeg = true;
            } else if (prTag === 'endChr') {
              endChr = pr.getAttribute('m:val') ?? pr.getAttribute('val') ?? ')';
              hasCustomEnd = true;
            }
          }
        } else if (childTag === 'e') {
          elements.push(parseOMMLChildren(child).trim());
        }
      }

      // Xử lý hệ phương trình: begChr là '{' và endChr không có hoặc để trống
      if (begChr === '{' && (!hasCustomEnd || !endChr || endChr === '' || endChr === '|' || endChr === '.' || endChr === ')')) {
        return `\\begin{cases} ${elements.join(' \\\\ ')} \\end{cases}`;
      }

      if (begChr === '[' && endChr === ']') {
        return `\\left[ ${elements.join(', ')} \\right]`;
      }
      if (begChr === '{' && endChr === '}') {
        return `\\left\\{ ${elements.join(', ')} \\right\\}`;
      }
      if (begChr === '|' && endChr === '|') {
        return `\\left| ${elements.join(', ')} \\right|`;
      }

      const left = begChr === '{' ? '\\left\\{' : (begChr ? `\\left${begChr}` : '\\left.');
      const right = endChr === '}' ? '\\right\\}' : (endChr ? `\\right${endChr}` : '\\right.');
      return `${left}${elements.join(', ')}${right}`;
    }

    case 'nary': { // N-ary (Integral, Sum, Product)
      let chr = '\\int';
      let sub = '';
      let sup = '';
      let e = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'naryPr') {
          for (let pr = child.firstChild; pr; pr = pr.nextSibling) {
            const prTag = pr.localName || pr.nodeName.split(':').pop();
            if (prTag === 'chr') {
              const val = pr.getAttribute('m:val') || pr.getAttribute('val');
              if (val === '∑' || val === '\u2211') chr = '\\sum';
              else if (val === '∏' || val === '\u220F') chr = '\\prod';
              else if (val === '∐' || val === '\u2210') chr = '\\coprod';
              else if (val === '∮' || val === '\u222E') chr = '\\oint';
              else if (val === '∬' || val === '\u222C') chr = '\\iint';
              else if (val === '∭' || val === '\u222D') chr = '\\iiint';
              else if (val === '∫' || val === '\u222B') chr = '\\int';
            }
          }
        } else if (childTag === 'sub') {
          sub = parseOMMLChildren(child).trim();
        } else if (childTag === 'sup') {
          sup = parseOMMLChildren(child).trim();
        } else if (childTag === 'e') {
          e = parseOMMLChildren(child).trim();
        }
      }
      let res = chr;
      if (sub) res += `_{${sub}}`;
      if (sup) res += `^{${sup}}`;
      if (e) res += ` ${e}`;
      return res;
    }

    case 'limLow': { // Limit / Min / Max
      let e = '\\lim';
      let lim = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'e') e = parseOMMLChildren(child).trim();
        else if (childTag === 'lim') lim = parseOMMLChildren(child).trim();
      }
      if (e === 'max' || e === 'min' || e === 'sup' || e === 'inf') {
        return `\\${e}_{${lim}}`;
      }
      return `${e}_{${lim}}`;
    }

    case 'limUpp': {
      let e = '\\lim';
      let lim = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'e') e = parseOMMLChildren(child).trim();
        else if (childTag === 'lim') lim = parseOMMLChildren(child).trim();
      }
      return `${e}^{${lim}}`;
    }

    case 'func': {
      let fName = '';
      let e = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'fName') fName = parseOMMLChildren(child).trim();
        else if (childTag === 'e') e = parseOMMLChildren(child).trim();
      }
      return `${fName} ${e}`;
    }

    case 'acc': { // Accent / Vector / Hat / Dot
      let e = '';
      let chr = '\u20D7';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'accPr') {
          for (let pr = child.firstChild; pr; pr = pr.nextSibling) {
            const prTag = pr.localName || pr.nodeName.split(':').pop();
            if (prTag === 'chr') chr = pr.getAttribute('m:val') || pr.getAttribute('val');
          }
        } else if (childTag === 'e') {
          e = parseOMMLChildren(child).trim();
        }
      }
      if (chr === '^' || chr === '̂') return `\\hat{${e}}`;
      if (chr === '.' || chr === '\u02D9' || chr === '̇') return `\\dot{${e}}`;
      if (chr === '..' || chr === '̈') return `\\ddot{${e}}`;
      if (chr === '\u0304' || chr === '_' || chr === '̄') return `\\bar{${e}}`;
      if (chr === '~' || chr === '̃') return `\\tilde{${e}}`;
      if (e.length > 2) return `\\overrightarrow{${e}}`;
      return `\\vec{${e}}`;
    }

    case 'bar': {
      let e = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'e') e = parseOMMLChildren(child).trim();
      }
      return `\\overline{${e}}`;
    }

    case 'm': { // Matrix
      const rows = [];
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'mr') {
          const cells = [];
          for (let cell = child.firstChild; cell; cell = cell.nextSibling) {
            const cellTag = cell.localName || cell.nodeName.split(':').pop();
            if (cellTag === 'e') cells.push(parseOMMLChildren(cell).trim());
          }
          rows.push(cells.join(' & '));
        }
      }
      return `\\begin{pmatrix} ${rows.join(' \\\\ ')} \\end{pmatrix}`;
    }

    case 'eqArr': {
      const rows = [];
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'e') {
          rows.push(parseOMMLChildren(child).trim());
        }
      }
      return `\\begin{aligned} ${rows.join(' \\\\ ')} \\end{aligned}`;
    }

    case 'borderBox': {
      return `\\boxed{${parseOMMLChildren(node).trim()}}`;
    }

    case 'box': {
      return parseOMMLChildren(node);
    }

    case 'groupChr': {
      let e = '';
      let pos = 'bot';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childTag = child.localName || child.nodeName.split(':').pop();
        if (childTag === 'groupChrPr') {
          for (let pr = child.firstChild; pr; pr = pr.nextSibling) {
            const prTag = pr.localName || pr.nodeName.split(':').pop();
            if (prTag === 'pos') pos = pr.getAttribute('m:val') || pr.getAttribute('val') || 'bot';
          }
        } else if (childTag === 'e') {
          e = parseOMMLChildren(child).trim();
        }
      }
      return pos === 'top' ? `\\overbrace{${e}}` : `\\underbrace{${e}}`;
    }

    default: {
      return parseOMMLChildren(node);
    }
  }
}

function parseOMMLChildren(node) {
  let res = '';
  for (let child = node.firstChild; child; child = child.nextSibling) {
    res += parseOMMLNode(child);
  }
  return res;
}

function cleanMathText(text) {
  if (!text) return '';
  
  // Kiểm tra nếu đoạn chữ có chứa tiếng Việt có dấu thì bọc vào \text{...}
  const hasVietnamese = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(text);
  if (hasVietnamese && !text.includes('\\text{')) {
    return ` \\text{${text.trim()}} `;
  }

  return text
    .replace(/\u2212/g, '-')
    .replace(/\u00D7/g, ' \\times ')
    .replace(/\u00F7/g, ' \\div ')
    .replace(/\u00B1/g, ' \\pm ')
    .replace(/\u2264/g, ' \\le ')
    .replace(/\u2265/g, ' \\ge ')
    .replace(/\u2260/g, ' \\ne ')
    .replace(/\u2248/g, ' \\approx ')
    .replace(/\u221E/g, ' \\infty ')
    .replace(/\u2208/g, ' \\in ')
    .replace(/\u2209/g, ' \\notin ')
    .replace(/\u2282/g, ' \\subset ')
    .replace(/\u2283/g, ' \\supset ')
    .replace(/\u2286/g, ' \\subseteq ')
    .replace(/\u2287/g, ' \\supseteq ')
    .replace(/\u2205/g, ' \\emptyset ')
    .replace(/\u222A/g, ' \\cup ')
    .replace(/\u2229/g, ' \\cap ')
    .replace(/\u2200/g, ' \\forall ')
    .replace(/\u2203/g, ' \\exists ')
    .replace(/\u2192/g, ' \\to ')
    .replace(/\u21D2/g, ' \\Rightarrow ')
    .replace(/\u21D4/g, ' \\Leftrightarrow ')
    .replace(/\u22A5/g, ' \\perp ')
    .replace(/\u2225/g, ' \\parallel ')
    .replace(/\u2220/g, ' \\angle ')
    .replace(/[\u00B0\u02DA\u00BA\u2218]/g, '^{\\circ}')
    .replace(/\^\{\\circ\}\s*([Cc])\b/g, '^{\\circ}\\mathrm{C}')
    .replace(/\^\{\\circ\}\s*([Ff])\b/g, '^{\\circ}\\mathrm{F}')
    .replace(/\u2032/g, "'")
    .replace(/\u2033/g, "''")
    .replace(/\u03C0/g, ' \\pi ')
    .replace(/\u03B1/g, ' \\alpha ')
    .replace(/\u03B2/g, ' \\beta ')
    .replace(/\u03B3/g, ' \\gamma ')
    .replace(/\u03B4/g, ' \\delta ')
    .replace(/\u03B5/g, ' \\epsilon ')
    .replace(/\u03B8/g, ' \\theta ')
    .replace(/\u03BB/g, ' \\lambda ')
    .replace(/\u03BC/g, ' \\mu ')
    .replace(/\u03C3/g, ' \\sigma ')
    .replace(/\u03C9/g, ' \\omega ')
    .replace(/\u0394/g, ' \\Delta ')
    .replace(/\u03A9/g, ' \\Omega ')
    .replace(/\u03A3/g, ' \\Sigma ')
    .replace(/\u03A6/g, ' \\Phi ');
}

module.exports = {
  parseOMMLNode,
  cleanMathText
};
