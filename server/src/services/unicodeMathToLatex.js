/**
 * unicodeMathToLatex.js
 * Tự động chuyển đổi các ký hiệu Toán học Unicode và biểu thức toán gõ tự nhiên
 * sang chuẩn LaTeX để KaTeX hiển thị đẹp mắt và chính xác 100% Offline.
 */

const SUPERSCRIPTS = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
  'ⁿ': 'n', 'ⁱ': 'i', 'ˣ': 'x', 'ʸ': 'y', 'ᵃ': 'a',
  'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ᵏ': 'k', 'ᵐ': 'm'
};

const SUBSCRIPTS = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
  'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j',
  'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o',
  'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x'
};

const MATH_SYMBOLS = {
  '≤': ' \\le ',
  '≥': ' \\ge ',
  '≠': ' \\ne ',
  '±': ' \\pm ',
  '∓': ' \\mp ',
  '×': ' \\times ',
  '÷': ' \\div ',
  '≈': ' \\approx ',
  '≡': ' \\equiv ',
  '∼': ' \\sim ',
  '≅': ' \\cong ',
  '∞': ' \\infty ',
  '∈': ' \\in ',
  '∉': ' \\notin ',
  '⊂': ' \\subset ',
  '⊃': ' \\supset ',
  '⊆': ' \\subseteq ',
  '⊇': ' \\supseteq ',
  '∅': ' \\emptyset ',
  '∪': ' \\cup ',
  '∩': ' \\cap ',
  '∀': ' \\forall ',
  '∃': ' \\exists ',
  '∄': ' \\nexists ',
  '⇒': ' \\Rightarrow ',
  '⇔': ' \\Leftrightarrow ',
  '→': ' \\to ',
  '←': ' \\leftarrow ',
  '↔': ' \\leftrightarrow ',
  '↦': ' \\mapsto ',
  '⊥': ' \\perp ',
  '∥': ' \\parallel ',
  '∠': ' \\angle ',
  '°': '^{\\circ}',
  '\u02DA': '^{\\circ}',
  '\u00BA': '^{\\circ}',
  '\u2218': '^{\\circ}',
  '′': "'",
  '″': "''",
  'π': ' \\pi ',
  'α': ' \\alpha ',
  'β': ' \\beta ',
  'γ': ' \\gamma ',
  'δ': ' \\delta ',
  'ε': ' \\epsilon ',
  'θ': ' \\theta ',
  'λ': ' \\lambda ',
  'μ': ' \\mu ',
  'σ': ' \\sigma ',
  'ω': ' \\omega ',
  'Δ': ' \\Delta ',
  'Ω': ' \\Omega ',
  'Σ': ' \\Sigma ',
  'Φ': ' \\Phi '
};

function normalizeMathString(str) {
  if (!str) return '';
  let res = str;

  // 1. Chuyển đổi số mũ Unicode
  const supKeys = Object.keys(SUPERSCRIPTS).join('');
  const supRegex = new RegExp('([a-zA-Z0-9)\\x5D\\x7D])([' + supKeys + ']+)', 'g');
  res = res.replace(supRegex, (match, base, sups) => {
    const val = (sups || '').split('').map(c => SUPERSCRIPTS[c] || c).join('');
    return base + '^{' + val + '}';
  });

  const soloSupRegex = new RegExp('([' + supKeys + ']+)', 'g');
  res = res.replace(soloSupRegex, (match, sups) => {
    const val = (sups || '').split('').map(c => SUPERSCRIPTS[c] || c).join('');
    return '^{' + val + '}';
  });

  // 2. Chuyển đổi chỉ số dưới Unicode
  const subKeys = Object.keys(SUBSCRIPTS).join('');
  const subRegex = new RegExp('([a-zA-Z0-9)\\x5D\\x7D])([' + subKeys + ']+)', 'g');
  res = res.replace(subRegex, (match, base, subs) => {
    const val = (subs || '').split('').map(c => SUBSCRIPTS[c] || c).join('');
    return base + '_{' + val + '}';
  });

  const soloSubRegex = new RegExp('([' + subKeys + ']+)', 'g');
  res = res.replace(soloSubRegex, (match, subs) => {
    const val = (subs || '').split('').map(c => SUBSCRIPTS[c] || c).join('');
    return '_{' + val + '}';
  });

  // 3. Căn bậc hai
  res = res.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
  res = res.replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}');

  // Bảo vệ đơn vị nhiệt độ °C / °F trong văn bản thường không bị biến thành LaTeX trần
  res = res.replace(/\(\s*[°\u02DA\u00BA\u2218]\s*([CcFf])\s*\)/g, (m, g1) => `@@PAREN_DEG_${g1}@@`);
  res = res.replace(/(\d+(?:[.,]\d+)?)\s*[°\u02DA\u00BA\u2218]\s*([CcFf])\b/g, (m, g1, g2) => `@@NUM_DEG_${g1}_${g2}@@`);

  // 4. Ký hiệu toán học
  for (const [sym, latex] of Object.entries(MATH_SYMBOLS)) {
    if (res.includes(sym)) {
      res = res.split(sym).join(latex);
    }
  }

  // Khôi phục đơn vị nhiệt độ chuẩn UTF-8
  res = res.replace(/@@PAREN_DEG_([A-Za-z])@@/g, (m, g1) => `(°${g1})`);
  res = res.replace(/@@NUM_DEG_([0-9.,]+)_([A-Za-z])@@/g, (m, g1, g2) => `${g1}°${g2}`);

  // Chuẩn hóa nếu công thức LaTeX có chứa ký hiệu độ C
  res = res.replace(/\^\{\\circ\}\s*([Cc])\b/g, '^{\\circ}\\mathrm{C}');
  res = res.replace(/\^\{\\circ\}\s*([Ff])\b/g, '^{\\circ}\\mathrm{F}');

  return res;
}

function autoFormatMathInContent(text) {
  if (!text) return '';

  const tokenRegex = /(```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]+?\$\$|\$(?:\\\$|[^\$])+?\$|!\[.*?\]\(.*?\))/g;
  const parts = text.split(tokenRegex);

  return parts.map(part => {
    if (!part) return '';
    // Nếu là công thức inline math $...$
    if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
      let mathBody = part.slice(1, -1);
      // Chuẩn hóa nhiệt độ trong Math Mode: $20C$ hoặc $20^\circ C$ -> $20^{\circ}\mathrm{C}$
      mathBody = mathBody.replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*C\b/g, (m, num) => `${num}^{\\circ}\\mathrm{C}`);
      mathBody = mathBody.replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*F\b/g, (m, num) => `${num}^{\\circ}\\mathrm{F}`);
      return `$${mathBody}$`;
    }
    if (part.startsWith('`') || part.startsWith('![') || part.startsWith('$$')) {
      return part;
    }
    return normalizeTextWithMathSymbols(part);
  }).join('');
}

function normalizeTextWithMathSymbols(text) {
  if (!text) return '';
  const hasMathChars = /[²³⁴⁵⁶⁷⁸⁹⁰⁺⁻ⁿⁱˣʸ₁₂₃₄₅₆₇₈₉₀ₙᵢ≤≥≠±∓×÷≈≡∼≅∞∈∉⊂⊃⊆⊇∅∪∩∀∃⇒⇔→⊥∥∠°′″πραγδεθλμσωΔΩΣΦ√]/.test(text);
  if (!hasMathChars) {
    return text;
  }
  return normalizeMathString(text);
}

module.exports = {
  SUPERSCRIPTS,
  SUBSCRIPTS,
  MATH_SYMBOLS,
  normalizeMathString,
  autoFormatMathInContent
};
