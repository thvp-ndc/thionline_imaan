import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import DOMPurify from 'dompurify';
import katex from 'katex';
import {
  Bold, Italic, Underline as UnderlineIcon, Subscript as SubIcon, Superscript as SuperIcon,
  List, ListOrdered, Table as TableIcon, Code2, Sigma, Image as ImageIcon,
  Undo2, Redo2, Plus, Minus, Trash2, Check, X, Sparkles, Loader2
} from 'lucide-react';
import MathInline from './extensions/MathInline';
import MathToolbarModal from '../common/MathToolbarModal';

/**
 * Tiền xử lý nội dung: Chuyển các công thức dạng $latex$ thành thẻ span tipTap mathInline
 */
export function preprocessMathHtml(content) {
  if (!content || typeof content !== 'string') return '';
  // Nếu đã chứa thẻ span math-inline thì không bọc lại
  let res = content;

  // Chuyển Markdown Image ![alt](url) thành <img src="url" alt="alt" />
  res = res.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" />');

  // Chuyển $latex$ thành <span data-type="math-inline" data-latex="latex">$latex$</span>
  res = res.replace(/(?<!\\)\$((?:\\\$|[^\$])+?)\$/g, (match, latex) => {
    const escaped = latex.replace(/"/g, '&quot;');
    return `<span data-type="math-inline" data-latex="${escaped}">$${latex}$</span>`;
  });

  return res;
}

/**
 * Upload tệp ảnh lên endpoint cục bộ VNLAN
 */
async function uploadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result;
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename: file.name })
        });
        const data = await res.json();
        if (data.success && data.url) {
          resolve(data.url);
        } else {
          // Fallback tới /api/upload-image
          const fbRes = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, filename: file.name })
          });
          const fbData = await fbRes.json();
          if (fbData.success && fbData.url) resolve(fbData.url);
          else reject(new Error(data.message || fbData.message || 'Lỗi tải ảnh'));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function RichQuestionEditor({
  content = '',
  onChange,
  placeholder = 'Nhập nội dung...',
  compact = false
}) {
  const [showMathDialog, setShowMathDialog] = useState(false);
  const [showAdvancedMathModal, setShowAdvancedMathModal] = useState(false);
  const [mathInput, setMathInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Xử lý Tailwind CSS Dynamic Class tường minh: Tuyệt đối không dùng nội suy chuỗi min-h-[${...}]
  const minHeightClass = compact ? 'min-h-[60px]' : 'min-h-[140px]';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: {
          HTMLAttributes: {
            class: 'rounded-lg bg-slate-900 text-slate-100 p-3 font-mono text-xs my-2'
          }
        }
      }),
      Underline,
      Subscript,
      Superscript,
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse w-full my-2'
        }
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        inline: true,
        allowBase64: false,
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg my-2 mx-auto block'
        }
      }),
      MathInline
    ],
    content: preprocessMathHtml(content),
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none p-3 text-slate-800 ${minHeightClass}`
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find(item => item.type.startsWith('image/'));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (file) {
            event.preventDefault();
            setIsUploading(true);
            uploadImageFile(file)
              .then(url => {
                if (url && editor) {
                  editor.chain().focus().setImage({ src: url }).run();
                }
              })
              .catch(err => {
                alert('Lỗi tải ảnh: ' + err.message);
              })
              .finally(() => setIsUploading(false));
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length > 0) {
          const file = event.dataTransfer.files[0];
          if (file && file.type.startsWith('image/')) {
            event.preventDefault();
            setIsUploading(true);
            uploadImageFile(file)
              .then(url => {
                if (url && editor) {
                  const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                  const node = view.state.schema.nodes.image.create({ src: url });
                  const transaction = view.state.tr.insert(coordinates?.pos ?? view.state.selection.from, node);
                  view.dispatch(transaction);
                }
              })
              .catch(err => {
                alert('Lỗi tải ảnh: ' + err.message);
              })
              .finally(() => setIsUploading(false));
            return true;
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor: ed }) => {
      if (onChange) {
        const html = ed.getHTML();
        onChange(html);
      }
    }
  });

  // Đồng bộ State chuẩn xác: Tránh giật con trỏ & mất dữ liệu
  useEffect(() => {
    if (!editor) return;
    const currentHTML = editor.getHTML();
    if (content !== undefined && content !== currentHTML) {
      const converted = preprocessMathHtml(content);
      if (converted !== currentHTML) {
        editor.commands.setContent(converted || '', false);
      }
    }
  }, [content, editor]);

  // Xử lý chèn công thức toán
  const handleInsertMath = useCallback((latex) => {
    if (!latex || !editor) return;
    editor.chain().focus().insertContent({
      type: 'mathInline',
      attrs: { latex: latex.trim() }
    }).run();
    setMathInput('');
    setShowMathDialog(false);
    setShowAdvancedMathModal(false);
  }, [editor]);

  // Xử lý chọn ảnh thủ công
  const handleFileInputChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const url = await uploadImageFile(file);
      if (url && editor) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    } catch (err) {
      alert('Lỗi tải ảnh: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Preview KaTeX trong math dialog
  const mathPreviewHtml = React.useMemo(() => {
    if (!mathInput.trim()) return '';
    try {
      let math = mathInput
        .replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*C\b/g, '$1^{\\circ}\\mathrm{C}')
        .replace(/(\d+(?:[.,]\d+)?)\s*(?:\^\{\\circ\}|\^\\circ|°)?\s*F\b/g, '$1^{\\circ}\\mathrm{F}');
      const rendered = katex.renderToString(math, { displayMode: false, throwOnError: false });
      return DOMPurify.sanitize(rendered);
    } catch (e) {
      return '';
    }
  }, [mathInput]);

  if (!editor) {
    return <div className={`w-full border border-slate-200 rounded-lg p-3 ${minHeightClass} bg-slate-50 animate-pulse`} />;
  }

  const isTableActive = editor.isActive('table');

  return (
    <div className="w-full border border-slate-200 hover:border-slate-300 focus-within:border-blue-500 rounded-xl overflow-hidden bg-white shadow-2xs transition-all relative">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5 bg-slate-50/90 border-b border-slate-200 text-slate-700 select-none">
        <div className="flex flex-wrap items-center gap-0.5">
          {/* Nhóm 1: Định dạng chữ */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-slate-200/80 transition cursor-pointer ${
              editor.isActive('bold') ? 'bg-blue-100 text-blue-700 font-bold' : ''
            }`}
            title="In đậm (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-slate-200/80 transition cursor-pointer ${
              editor.isActive('italic') ? 'bg-blue-100 text-blue-700 font-bold' : ''
            }`}
            title="In nghiêng (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded hover:bg-slate-200/80 transition cursor-pointer ${
              editor.isActive('underline') ? 'bg-blue-100 text-blue-700 font-bold' : ''
            }`}
            title="Gạch chân (Ctrl+U)"
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          {/* Nhóm 2: Chỉ số trên / dưới */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            className={`p-1.5 rounded hover:bg-slate-200/80 transition cursor-pointer ${
              editor.isActive('subscript') ? 'bg-blue-100 text-blue-700 font-bold' : ''
            }`}
            title="Chỉ số dưới (H2O, x1)"
          >
            <SubIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            className={`p-1.5 rounded hover:bg-slate-200/80 transition cursor-pointer ${
              editor.isActive('superscript') ? 'bg-blue-100 text-blue-700 font-bold' : ''
            }`}
            title="Chỉ số trên / Lũy thừa (x2, 21°C)"
          >
            <SuperIcon className="w-3.5 h-3.5" />
          </button>

          {/* Nhóm 3: Danh sách & Bảng (Nếu không phải compact) */}
          {!compact && (
            <>
              <span className="w-px h-4 bg-slate-300 mx-1" />
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`p-1.5 rounded hover:bg-slate-200/80 transition cursor-pointer ${
                  editor.isActive('bulletList') ? 'bg-blue-100 text-blue-700 font-bold' : ''
                }`}
                title="Danh sách dấu chấm"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`p-1.5 rounded hover:bg-slate-200/80 transition cursor-pointer ${
                  editor.isActive('orderedList') ? 'bg-blue-100 text-blue-700 font-bold' : ''
                }`}
                title="Danh sách số thứ tự"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isTableActive) {
                    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
                  }
                }}
                className={`p-1.5 rounded hover:bg-slate-200/80 transition cursor-pointer ${
                  isTableActive ? 'bg-blue-100 text-blue-700 font-bold' : ''
                }`}
                title="Chèn bảng 2x2"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <span className="w-px h-4 bg-slate-300 mx-1" />

          {/* Nhóm 4: Toán, Code, Ảnh */}
          <button
            type="button"
            onClick={() => setShowMathDialog(true)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-semibold transition cursor-pointer"
            title="Chèn công thức toán học KaTeX"
          >
            <Sigma className="w-3.5 h-3.5" />
            <span>Toán</span>
          </button>

          {!compact && (
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={`p-1.5 rounded hover:bg-slate-200/80 transition cursor-pointer ${
                editor.isActive('codeBlock') ? 'bg-blue-100 text-blue-700 font-bold' : ''
              }`}
              title="Chèn khối mã nguồn Tin học (Python/C++)"
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>
          )}

          {!compact && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-1.5 rounded hover:bg-slate-200/80 text-slate-600 hover:text-slate-900 transition cursor-pointer disabled:opacity-50"
              title="Tải ảnh lên từ máy tính (hoặc kéo thả / dán trực tiếp)"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <ImageIcon className="w-3.5 h-3.5" />}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>

        {/* Nhóm 5: Hoàn tác & Làm lại */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 disabled:opacity-30 transition cursor-pointer"
            title="Hoàn tác (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 disabled:opacity-30 transition cursor-pointer"
            title="Làm lại (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* THANH CÔNG CỤ BẢNG NẾU CON TRỎ ĐANG Ở TRONG BẢNG */}
      {isTableActive && !compact && (
        <div className="flex items-center gap-1 px-3 py-1 bg-amber-50/80 border-b border-amber-200 text-[11px] text-amber-900 overflow-x-auto">
          <span className="font-bold mr-1">Bảng:</span>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-1.5 py-0.5 bg-white border border-amber-300 rounded hover:bg-amber-100 flex items-center gap-0.5"
          >
            <Plus className="w-2.5 h-2.5" /> Cột
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="px-1.5 py-0.5 bg-white border border-amber-300 rounded hover:bg-amber-100 flex items-center gap-0.5"
          >
            <Minus className="w-2.5 h-2.5" /> Cột
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-1.5 py-0.5 bg-white border border-amber-300 rounded hover:bg-amber-100 flex items-center gap-0.5"
          >
            <Plus className="w-2.5 h-2.5" /> Hàng
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="px-1.5 py-0.5 bg-white border border-amber-300 rounded hover:bg-amber-100 flex items-center gap-0.5"
          >
            <Minus className="w-2.5 h-2.5" /> Hàng
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-300 rounded hover:bg-red-100 flex items-center gap-0.5 ml-auto"
          >
            <Trash2 className="w-2.5 h-2.5" /> Xóa Bảng
          </button>
        </div>
      )}

      {/* POPUP NHẬP CÔNG THỨC TOÁN NHANH */}
      {showMathDialog && (
        <div className="p-3 bg-blue-50/90 border-b border-blue-200 flex flex-col gap-2.5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Sigma className="w-4 h-4 text-blue-600" />
              Chèn Công Thức Toán Học KaTeX
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAdvancedMathModal(true)}
                className="text-xs text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                Mở bảng ký hiệu đầy đủ...
              </button>
              <button
                type="button"
                onClick={() => { setShowMathDialog(false); setMathInput(''); }}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={mathInput}
              onChange={e => setMathInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleInsertMath(mathInput);
                } else if (e.key === 'Escape') {
                  setShowMathDialog(false);
                }
              }}
              placeholder="Nhập LaTeX: x^2, \frac{a}{b}, 21^{\circ}\mathrm{C}, O(N \log N)..."
              className="flex-1 bg-white border border-blue-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleInsertMath(mathInput)}
              disabled={!mathInput.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-xs font-medium shadow-2xs transition flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Chèn</span>
            </button>
          </div>

          {/* Quick symbol shortcuts */}
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
            <span className="text-slate-500">Mẫu nhanh:</span>
            {[
              { label: 'x²', val: 'x^{2}' },
              { label: 'x₁', val: 'x_{1}' },
              { label: 'a/b', val: '\\frac{a}{b}' },
              { label: '√x', val: '\\sqrt{x}' },
              { label: '°C', val: '21^{\\circ}\\mathrm{C}' },
              { label: '≤', val: '\\le' },
              { label: '≥', val: '\\ge' },
              { label: '≠', val: '\\ne' },
              { label: '±', val: '\\pm' },
              { label: 'π', val: '\\pi' },
              { label: 'Δ', val: '\\Delta' },
              { label: 'vector', val: '\\vec{u}' },
              { label: 'O(NlogN)', val: 'O(N \\log N)' }
            ].map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setMathInput(prev => prev + (prev ? ' ' : '') + s.val)}
                className="px-1.5 py-0.5 rounded bg-white hover:bg-blue-100 border border-slate-200 text-slate-800 cursor-pointer font-mono"
              >
                {s.label}
              </button>
            ))}
          </div>

          {mathPreviewHtml && (
            <div className="bg-white border border-blue-200 rounded-lg p-2 text-center overflow-x-auto min-h-[36px] flex items-center justify-center">
              <span dangerouslySetInnerHTML={{ __html: mathPreviewHtml }} />
            </div>
          )}
        </div>
      )}

      {/* MODAL BẢNG KÝ HIỆU TOÁN MỞ RỘNG (ĐẦY ĐỦ CÁC MÔN TOÁN, LÝ, HÓA, SINH) */}
      <MathToolbarModal
        isOpen={showAdvancedMathModal}
        onClose={() => setShowAdvancedMathModal(false)}
        onInsert={(latex) => {
          handleInsertMath(latex);
        }}
      />

      {/* EDITOR CONTENT */}
      <EditorContent editor={editor} />
    </div>
  );
}
