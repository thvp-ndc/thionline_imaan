import React, { useState, useEffect } from 'react';
import { X, Check, Search, Sparkles } from 'lucide-react';
import katex from 'katex';

const MATH_CATEGORIES = [
  {
    id: 'algebra',
    name: 'Đại số & Cơ bản',
    items: [
      { label: 'Phân số', latex: '\\frac{a}{b}', display: '\\frac{a}{b}' },
      { label: 'Căn bậc 2', latex: '\\sqrt{x}', display: '\\sqrt{x}' },
      { label: 'Căn bậc n', latex: '\\sqrt[n]{x}', display: '\\sqrt[n]{x}' },
      { label: 'Số mũ', latex: 'x^{2}', display: 'x^{2}' },
      { label: 'Chỉ số dưới', latex: 'x_{1}', display: 'x_{1}' },
      { label: 'Mũ & Chỉ số', latex: 'x_{1}^{2}', display: 'x_{1}^{2}' },
      { label: 'Cộng trừ', latex: '\\pm', display: '\\pm' },
      { label: 'Nhân', latex: '\\times', display: '\\times' },
      { label: 'Chia', latex: '\\div', display: '\\div' },
      { label: 'Khác', latex: '\\neq', display: '\\neq' },
      { label: 'Xấp xỉ', latex: '\\approx', display: '\\approx' },
      { label: 'Nhỏ hơn bằng', latex: '\\le', display: '\\le' },
      { label: 'Lớn hơn bằng', latex: '\\ge', display: '\\ge' },
      { label: 'Vô cực', latex: '\\infty', display: '\\infty' },
    ]
  },
  {
    id: 'calculus',
    name: 'Giải tích & Lượng giác',
    items: [
      { label: 'Tích phân xác định', latex: '\\int_{a}^{b} f(x)dx', display: '\\int_{a}^{b} f(x)dx' },
      { label: 'Tích phân bất định', latex: '\\int f(x)dx', display: '\\int f(x)dx' },
      { label: 'Giới hạn', latex: '\\lim_{x \\to x_0} f(x)', display: '\\lim_{x \\to x_0} f(x)' },
      { label: 'Tổng Sigma', latex: '\\sum_{i=1}^{n} a_i', display: '\\sum_{i=1}^{n} a_i' },
      { label: 'Đạo hàm', latex: "f'(x)", display: "f'(x)" },
      { label: 'Đạo hàm cấp 2', latex: "f''(x)", display: "f''(x)" },
      { label: 'Sin', latex: '\\sin(x)', display: '\\sin(x)' },
      { label: 'Cos', latex: '\\cos(x)', display: '\\cos(x)' },
      { label: 'Tan', latex: '\\tan(x)', display: '\\tan(x)' },
      { label: 'Logarit tự nhiên', latex: '\\ln(x)', display: '\\ln(x)' },
      { label: 'Logarit cơ số a', latex: '\\log_a(b)', display: '\\log_a(b)' },
    ]
  },
  {
    id: 'geometry',
    name: 'Hình học & Vector',
    items: [
      { label: 'Vector u', latex: '\\vec{u}', display: '\\vec{u}' },
      { label: 'Vector AB', latex: '\\vec{AB}', display: '\\vec{AB}' },
      { label: 'Độ dài vector', latex: '|\\vec{u}|', display: '|\\vec{u}|' },
      { label: 'Góc ABC', latex: '\\widehat{ABC}', display: '\\widehat{ABC}' },
      { label: 'Ký hiệu Độ (°)', latex: '^{\\circ}', display: '^{\\circ}' },
      { label: 'Vuông góc', latex: '\\perp', display: '\\perp' },
      { label: 'Song song', latex: '\\parallel', display: '\\parallel' },
      { label: 'Tam giác ABC', latex: '\\Delta ABC', display: '\\Delta ABC' },
    ]
  },
  {
    id: 'sets',
    name: 'Tập hợp & Logic',
    items: [
      { label: 'Thuộc', latex: '\\in', display: '\\in' },
      { label: 'Không thuộc', latex: '\\notin', display: '\\notin' },
      { label: 'Tập con', latex: '\\subset', display: '\\subset' },
      { label: 'Hợp', latex: '\\cup', display: '\\cup' },
      { label: 'Giao', latex: '\\cap', display: '\\cap' },
      { label: 'Tập rỗng', latex: '\\emptyset', display: '\\emptyset' },
      { label: 'Tập số thực R', latex: '\\mathbb{R}', display: '\\mathbb{R}' },
      { label: 'Tập số nguyên Z', latex: '\\mathbb{Z}', display: '\\mathbb{Z}' },
      { label: 'Tập tự nhiên N', latex: '\\mathbb{N}', display: '\\mathbb{N}' },
      { label: 'Mọi (với mọi)', latex: '\\forall', display: '\\forall' },
      { label: 'Tồn tại', latex: '\\exists', display: '\\exists' },
      { label: 'Suy ra (kéo theo)', latex: '\\Rightarrow', display: '\\Rightarrow' },
      { label: 'Tương đương', latex: '\\Leftrightarrow', display: '\\Leftrightarrow' },
    ]
  },
  {
    id: 'greek',
    name: 'Ký tự Hy Lạp',
    items: [
      { label: 'Alpha', latex: '\\alpha', display: '\\alpha' },
      { label: 'Beta', latex: '\\beta', display: '\\beta' },
      { label: 'Gamma', latex: '\\gamma', display: '\\gamma' },
      { label: 'Delta nhỏ', latex: '\\delta', display: '\\delta' },
      { label: 'Delta lớn', latex: '\\Delta', display: '\\Delta' },
      { label: 'Pi', latex: '\\pi', display: '\\pi' },
      { label: 'Theta', latex: '\\theta', display: '\\theta' },
      { label: 'Lambda', latex: '\\lambda', display: '\\lambda' },
      { label: 'Omega', latex: '\\omega', display: '\\omega' },
      { label: 'Omega lớn', latex: '\\Omega', display: '\\Omega' },
    ]
  },
  {
    id: 'systems',
    name: 'Hệ phương trình & Ngoặc',
    items: [
      { label: 'Hệ 2 phương trình', latex: '\\begin{cases} x + y = 1 \\\\ x - y = 0 \\end{cases}', display: '\\begin{cases} a \\\\ b \\end{cases}' },
      { label: 'Hệ 3 phương trình', latex: '\\begin{cases} x + y + z = 1 \\\\ 2x - y + z = 2 \\\\ x - 2y - z = 0 \\end{cases}', display: '\\begin{cases} a \\\\ b \\\\ c \\end{cases}' },
      { label: 'Khoảng [a; b]', latex: '\\left[ a; b \\right]', display: '\\left[ a; b \\right]' },
      { label: 'Khoảng (a; b)', latex: '\\left( a; b \\right)', display: '\\left( a; b \\right)' },
      { label: 'Nửa khoảng [a; b)', latex: '\\left[ a; b \\right)', display: '\\left[ a; b \\right)' },
      { label: 'Tập hợp {a; b; c}', latex: '\\left\\{ a; b; c \\right\\}', display: '\\left\\{ a; b; c \\right\\}' },
    ]
  }
];

export default function MathToolbarModal({ isOpen, onClose, onInsert, onInsertMath }) {
  const [activeTab, setActiveTab] = useState('algebra');
  const [latexInput, setLatexInput] = useState('');
  const [justAddedSymbol, setJustAddedSymbol] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setLatexInput('');
      setJustAddedSymbol(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentCategory = MATH_CATEGORIES.find(c => c.id === activeTab) || MATH_CATEGORIES[0];

  const handleInsertCallback = (latex) => {
    if (typeof onInsert === 'function') onInsert(latex);
    if (typeof onInsertMath === 'function') onInsertMath(latex);
  };

  // Nối ký hiệu được click vào khung nhập
  const handleInsertSymbol = (latexCode) => {
    setLatexInput((prev) => (prev ? `${prev} ${latexCode}` : latexCode));
    setJustAddedSymbol(latexCode);
    setTimeout(() => setJustAddedSymbol(null), 300);
  };

  // Nút chính [✓ Chèn Vào Đề Bài]: chèn toàn bộ chuỗi $ ${latexInput} $ trực tiếp và đóng modal
  const handleConfirmInsert = () => {
    const trimmed = latexInput.trim();
    if (!trimmed) return;
    const formatted = trimmed.startsWith('$') ? trimmed : `$${trimmed}$`;
    handleInsertCallback(formatted);
    onClose();
  };

  const renderKatexSafely = (tex, displayMode = false) => {
    try {
      return {
        __html: katex.renderToString(tex, {
          displayMode,
          throwOnError: false
        })
      };
    } catch (e) {
      return { __html: tex };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex justify-between items-center bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5 text-cyan-400">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Bảng Ký Hiệu & Công Thức Toán Học
            </h2>
            <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700 hidden sm:inline-block">
              KaTeX Chuẩn LaTeX
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Đóng modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Header: Hàng Tabs cuộn ngang mượt mà no-scrollbar flex-nowrap */}
        <div className="flex overflow-x-auto no-scrollbar flex-nowrap border-b border-slate-800 px-4 sm:px-6 bg-slate-950/30 gap-1.5 pt-2 shrink-0">
          {MATH_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveTab(cat.id)}
              className={`px-3.5 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 rounded-t-lg transition-all ${
                activeTab === cat.id
                  ? 'bg-slate-800 text-cyan-400 border-t-2 border-cyan-500 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grid Symbols: Thu gọn lưới ký hiệu grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-2.5">
            {currentCategory.items.map((item, idx) => {
              const isRecentlyAdded = justAddedSymbol === item.latex;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleInsertSymbol(item.latex)}
                  className={`group p-2 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer h-18 sm:h-20 select-none ${
                    isRecentlyAdded
                      ? 'bg-cyan-500/20 border-cyan-400 scale-95 shadow-cyan-900/40 shadow-sm'
                      : 'bg-slate-800/60 hover:bg-cyan-600/15 hover:border-cyan-500/50 border-slate-700/60'
                  }`}
                  title={`Nhấp để thêm vào khung nhập: ${item.latex}`}
                >
                  <div
                    className="flex-1 flex items-center justify-center text-slate-100 text-sm sm:text-base group-hover:scale-105 transition-transform overflow-hidden px-1 pointer-events-none"
                    dangerouslySetInnerHTML={renderKatexSafely(item.display)}
                  />
                  <span className="text-[10px] sm:text-[11px] text-slate-400 group-hover:text-cyan-300 font-medium truncate w-full px-0.5">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer: Input, Live Preview, and Action Buttons */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col gap-3 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Input Container liên kết 2 chiều với latexInput */}
            <div className="flex-1 flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/50 transition">
              <span className="text-xs font-mono text-cyan-400 select-none font-bold">$</span>
              <input
                type="text"
                value={latexInput}
                onChange={(e) => setLatexInput(e.target.value)}
                placeholder="Nhấp vào ký hiệu ở trên hoặc gõ mã LaTeX (ví dụ: \frac{a}{b}, \sqrt{x})..."
                className="flex-1 bg-transparent text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmInsert();
                  }
                }}
              />
              <span className="text-xs font-mono text-cyan-400 select-none font-bold">$</span>
              {latexInput && (
                <button
                  type="button"
                  onClick={() => setLatexInput('')}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                  title="Xóa khung nhập"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Live Preview Box */}
            {latexInput.trim() && (
              <div
                className="px-3 py-1.5 bg-slate-900 border border-cyan-800/60 rounded-xl min-w-[120px] max-w-full sm:max-w-xs overflow-x-auto flex items-center justify-center text-center shadow-inner shrink-0"
                title="Xem trước kết quả hiển thị công thức"
              >
                <div className="text-[11px] text-slate-400 mr-2 shrink-0 select-none font-medium">Xem trước:</div>
                <span
                  className="text-sm text-cyan-300 font-medium"
                  dangerouslySetInnerHTML={renderKatexSafely(latexInput.trim())}
                />
              </div>
            )}
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
            <div className="text-[11px] text-slate-400 hidden sm:block">
              {latexInput.trim() ? (
                <span>Nhấn <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">Enter</kbd> hoặc nút chèn để hoàn tất</span>
              ) : (
                <span>Nhấp chọn các ký hiệu trên bảng để ghép thành công thức</span>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-end">
              {/* Nút Đóng / Hủy (Outline xám) */}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs sm:text-sm font-semibold rounded-lg transition"
              >
                Đóng / Hủy
              </button>

              {/* Nút chính [✓ Chèn Vào Đề Bài] (Màu xanh/cyan) */}
              <button
                type="button"
                onClick={handleConfirmInsert}
                disabled={!latexInput.trim()}
                className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg shadow-sm transition flex items-center gap-1.5 ${
                  latexInput.trim()
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950/40 cursor-pointer active:scale-95'
                    : 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-50'
                }`}
                title="Chèn toàn bộ công thức vào vị trí soạn thảo và đóng modal"
              >
                <Check className="w-4 h-4" />
                ✓ Chèn Vào Đề Bài
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
