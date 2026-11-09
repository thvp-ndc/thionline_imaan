import React, { useState, useMemo, useRef, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import { Check, X, Edit2, Trash2 } from 'lucide-react';

export default function MathInlineNodeView({ node, updateAttributes, deleteNode, selected }) {
  const [isEditing, setIsEditing] = useState(false);
  const [latexInput, setLatexInput] = useState(node.attrs.latex || '');
  const inputRef = useRef(null);

  const latex = node.attrs.latex || '';

  // Đồng bộ giá trị nội bộ khi attrs thay đổi từ bên ngoài
  useEffect(() => {
    if (!isEditing) {
      setLatexInput(latex);
    }
  }, [latex, isEditing]);

  // Focus ô nhập khi mở popup chỉnh sửa
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Chuẩn hóa và render KaTeX
  const renderedHtml = useMemo(() => {
    if (!latex.trim()) {
      return '<span class="text-slate-400 italic text-xs px-1">(công thức trống)</span>';
    }
    try {
      // Chuẩn hóa ký hiệu độ C nếu có (20C -> 20^\circ\mathrm{C})
      const math = latex
        .replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*C\b/g, '$1^{\\circ}\\mathrm{C}')
        .replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*F\b/g, '$1^{\\circ}\\mathrm{F}');

      return katex.renderToString(math, {
        displayMode: false,
        throwOnError: false
      });
    } catch (e) {
      return `<span class="text-red-500 font-mono text-xs px-1">${latex}</span>`;
    }
  }, [latex]);

  // Xem trước thời gian thực trong popup
  const previewHtml = useMemo(() => {
    if (!latexInput.trim()) return '';
    try {
      const math = latexInput
        .replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*C\b/g, '$1^{\\circ}\\mathrm{C}')
        .replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*F\b/g, '$1^{\\circ}\\mathrm{F}');
      return katex.renderToString(math, { displayMode: false, throwOnError: false });
    } catch (e) {
      return '';
    }
  }, [latexInput]);

  const handleSave = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    updateAttributes({ latex: latexInput.trim() });
    setIsEditing(false);
  };

  const handleCancel = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setLatexInput(latex);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave(e);
    } else if (e.key === 'Escape') {
      handleCancel(e);
    }
  };

  return (
    <NodeViewWrapper as="span" className="inline-block relative select-none align-baseline my-0.5">
      {!isEditing ? (
        <span
          onClick={() => setIsEditing(true)}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded cursor-pointer transition border text-sm font-normal group ${
            selected
              ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-300'
              : 'bg-blue-50/80 hover:bg-blue-100 border-blue-200 text-slate-800'
          }`}
          title="Nhấp để chỉnh sửa công thức toán KaTeX"
        >
          <span dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          <span className="opacity-0 group-hover:opacity-100 text-[10px] text-blue-600 ml-0.5 transition-opacity">
            <Edit2 className="w-2.5 h-2.5 inline" />
          </span>
        </span>
      ) : (
        <span
          className="absolute z-50 left-0 top-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl p-2.5 flex flex-col gap-2 min-w-[280px] max-w-[360px] animate-fadeIn"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-1">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
              Chỉnh Sửa Công Thức LaTeX
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={latexInput}
            onChange={e => setLatexInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ví dụ: x^2, \\frac{a}{b}, 21^{\\circ}\\mathrm{C}"
            className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:border-blue-500 focus:bg-white focus:outline-none"
          />

          {previewHtml && (
            <div className="bg-slate-50/80 border border-slate-200 rounded p-1.5 text-center min-h-[32px] flex items-center justify-center overflow-x-auto">
              <span dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => deleteNode()}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-1.5 py-1 rounded hover:bg-red-50 cursor-pointer"
              title="Xóa công thức"
            >
              <Trash2 className="w-3 h-3" />
              <span>Xóa</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCancel}
                className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded border border-slate-200 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium rounded flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Lưu</span>
              </button>
            </div>
          </div>
        </span>
      )}
    </NodeViewWrapper>
  );
}
