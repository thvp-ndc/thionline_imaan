import React, { useMemo } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import MathContent from './MathContent';

/**
 * QuestionOptions: Component hiển thị danh sách phương án trắc nghiệm dùng chung
 * - Hỗ trợ: Giao diện học sinh thi (mode="interactive"),
 *           Khung xem trước đề thi / Ngân hàng đề (mode="preview"),
 *           Chi tiết bài làm / In bài thi (mode="paper").
 * - Cơ chế tự thích ứng:
 *   + Nếu có đáp án > 50 ký tự hoặc chứa công thức Toàn ($): tự động chuyển 1 cột dọc (grid-cols-1).
 *   + Nếu các đáp án đều ngắn: dàn 2 cột (sm:grid-cols-2) hoặc 4 cột (lg:grid-cols-4).
 *   + Container luôn dùng `items-start` để badge A, B, C, D luôn cố định ở góc trên cùng dòng đầu tiên.
 */
export default function QuestionOptions({
  options = [],
  questionType = 'single_choice', // 'single_choice' | 'multiple_choice'
  mode = 'preview', // 'interactive' | 'preview' | 'paper'
  selectedOptions = [], // Mảng ID thí sinh chọn (vd: ['A'] hoặc ['A', 'C'])
  correctAnswers = [], // Mảng ID đáp án đúng (vd: ['A'])
  showAnswerKey = false, // Hiển thị đáp án đúng hay không
  onSelectOption = null, // Callback khi thí sinh click (mode="interactive")
  disabled = false,
  className = '',
  optionStats = null // Mảng { id, text, count, percentage, is_correct }
}) {
  if (!options || !Array.isArray(options) || options.length === 0) {
    return null;
  }

  // Chuẩn hóa correctAnswers thành Set chữ hoa
  const correctSet = useMemo(() => {
    if (!correctAnswers) return new Set();
    if (Array.isArray(correctAnswers)) {
      return new Set(correctAnswers.map(x => String(x).toUpperCase()));
    }
    if (typeof correctAnswers === 'object') {
      return new Set(Object.keys(correctAnswers).filter(k => correctAnswers[k] === true || correctAnswers[k] === 'T').map(x => String(x).toUpperCase()));
    }
    return new Set([String(correctAnswers).toUpperCase()]);
  }, [correctAnswers]);

  // Chuẩn hóa selectedOptions thành Set chữ hoa
  const selectedSet = useMemo(() => {
    if (!selectedOptions) return new Set();
    if (Array.isArray(selectedOptions)) {
      return new Set(selectedOptions.map(x => String(x).toUpperCase()));
    }
    return new Set([String(selectedOptions).toUpperCase()]);
  }, [selectedOptions]);

  // Kiểm tra độ dài lớn nhất của các phương án
  const maxOptionLength = useMemo(() => {
    return options.reduce((max, opt) => {
      const len = String(opt?.text || opt?.content || '').length;
      return len > max ? len : max;
    }, 0);
  }, [options]);

  const hasSpecialContent = useMemo(() => {
    return options.some(opt => {
      const text = String(opt?.text || opt?.content || '');
      // Tín hiệu Toán / Hình ảnh
      if (text.includes('$') || text.includes('\\(') || text.includes('\\[') || text.includes('![')) return true;
      // Tín hiệu Khối mã nguồn (code block)
      if (text.includes('```')) return true;
      // Tín hiệu Mã nội dòng (inline code `...`)
      if (/(^|[^\\])`[^`\n]+`/.test(text)) return true;
      // Tín hiệu Mã đa dòng có thụt lề hoặc khối lệnh { ... } / dấu ;
      if (text.includes('\n') && (/^\s{2,}|\t/m.test(text) || /[{};]/.test(text))) return true;
      return false;
    });
  }, [options]);

  // Tính toán Grid class tự thích ứng
  const gridLayoutClass = useMemo(() => {
    // 1. Nếu có công thức toán phức tạp hoặc có phương án dài > 45 ký tự -> Dàn 1 cột dọc
    if (hasSpecialContent || maxOptionLength > 45) {
      return 'grid grid-cols-1 gap-2 sm:gap-2.5';
    }
    // 2. Nếu phương án từ 18 đến 45 ký tự -> Dàn 2 cột ngang rộng rãi (chuẩn đề thi in ấn A4)
    if (maxOptionLength > 18 || options.length === 2) {
      return 'grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5';
    }
    // 3. Nếu tất cả các phương án đều rất ngắn (<= 18 ký tự, vd: số, chữ cái, từ ngắn)
    if (options.length === 4) {
      return 'grid grid-cols-2 lg:grid-cols-4 gap-2';
    }
    return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2';
  }, [hasSpecialContent, maxOptionLength, options.length]);

  const isChecklist = questionType === 'multiple_choice';

  return (
    <div className={`${gridLayoutClass} ${className}`}>
      {options.map((opt) => {
        const optIdUpper = String(opt.id).toUpperCase();
        const isSelected = selectedSet.has(optIdUpper);
        const isCorrect = correctSet.has(optIdUpper);

        // ==========================================
        // 1. PAPER MODE (Dùng trong StudentPaperModal / In ấn bài làm)
        // ==========================================
        if (mode === 'paper') {
          let containerStyle = 'bg-white border-slate-200 text-slate-800';
          let letterStyle = 'bg-slate-100 border-slate-300 text-slate-700';

          if (showAnswerKey && isCorrect) {
            containerStyle = 'bg-emerald-50/80 border-emerald-400 text-emerald-950 ring-1 ring-emerald-400/60';
            letterStyle = 'bg-emerald-600 text-white border-emerald-600 font-bold';
          }
          if (isSelected && (!showAnswerKey || !isCorrect)) {
            containerStyle = showAnswerKey
              ? 'bg-rose-50/80 border-rose-400 text-rose-950'
              : 'bg-sky-50/80 border-sky-400 text-sky-950 font-semibold ring-1 ring-sky-400/60';
            letterStyle = showAnswerKey
              ? 'bg-rose-600 text-white border-rose-600 font-bold'
              : 'bg-sky-600 text-white border-sky-600 font-bold';
          }

          return (
            <div
              key={opt.id}
              className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between transition min-w-0 ${containerStyle}`}
            >
              {/* Hàng 1: Ký tự chữ cái và Nội dung văn bản (Chiếm trọn hàng ngang, không bị chèn ép) */}
              <div className="flex items-start gap-2 min-w-0">
                <span className={`w-5 h-5 rounded flex items-center justify-center font-bold font-mono uppercase text-[11px] shrink-0 border mt-0.5 ${letterStyle}`}>
                  {opt.id}
                </span>
                <div className={`flex-1 leading-relaxed min-w-0 break-words ${
                  isSelected && showAnswerKey && !isCorrect ? 'line-through text-rose-900 opacity-80' : ''
                }`}>
                  <MathContent content={opt.text || opt.content || ''} />
                </div>
              </div>

              {/* Hàng 2: Dải nhãn trạng thái kết quả bài làm (Nằm hàng riêng bên dưới, text phương án không bị thu hẹp) */}
              {(isSelected || (showAnswerKey && isCorrect)) && (
                <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-200/80 flex-wrap text-[10px]">
                  {isSelected && (
                    <span className={`px-2 py-0.5 rounded font-bold uppercase inline-flex items-center gap-1 shadow-xs ${
                      isCorrect
                        ? 'bg-emerald-700 text-white'
                        : (showAnswerKey ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white')
                    }`}>
                      {isCorrect ? '✓ Thí sinh chọn đúng' : (showAnswerKey ? '✗ Thí sinh chọn' : 'Thí sinh chọn')}
                    </span>
                  )}
                  {showAnswerKey && isCorrect && !isSelected && (
                    <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-bold uppercase inline-flex items-center gap-1 shadow-xs">
                      ★ Đáp án đúng
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        }

        // ==========================================
        // 2. PREVIEW MODE (Ngân hàng câu hỏi, Xem trước đề thi giáo viên)
        // ==========================================
        if (mode === 'preview') {
          const highlightCorrect = showAnswerKey && isCorrect;

          return (
            <div
              key={opt.id}
              className={`p-3 sm:p-3.5 rounded-xl border transition flex flex-col justify-between min-w-0 ${
                highlightCorrect
                  ? 'bg-emerald-50/90 border-2 border-emerald-500 text-emerald-950 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 shadow-2xs'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                {/* Visual Anchor: Avatar Badge 32x32px (w-8 h-8) */}
                <span
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 transition ${
                    highlightCorrect
                      ? 'bg-emerald-600 text-white font-extrabold shadow-sm ring-2 ring-emerald-300'
                      : 'bg-slate-100 text-slate-700 border border-slate-300 font-bold'
                  }`}
                >
                  {opt.id}
                </span>

                <div className="flex-1 text-sm leading-relaxed break-words min-w-0 pt-0.5">
                  <MathContent content={opt.text || opt.content || ''} />
                </div>
              </div>

              {/* Thống kê lượt chọn / phương án nhiễu (Item Analysis) */}
              {(() => {
                const optStat = Array.isArray(optionStats)
                  ? optionStats.find(s => s.id === opt.id || (s.text && opt.text && s.text.trim().toLowerCase() === opt.text.trim().toLowerCase()))
                  : null;

                if (optStat) {
                  return (
                    <div className="mt-2.5 pt-2 border-t border-slate-200 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={highlightCorrect ? 'text-emerald-700 font-bold flex items-center gap-1 text-[11px]' : 'text-slate-500 font-medium text-[11px]'}>
                          {highlightCorrect ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>ĐÁP ÁN ĐÚNG</span>
                            </>
                          ) : (
                            optStat.percentage >= 20 ? '⚠️ Bẫy phổ biến' : 'Lựa chọn'
                          )}
                        </span>
                        <span className="font-mono text-slate-700 font-bold text-[11px]">
                          {optStat.count} lượt <span className={highlightCorrect ? 'text-emerald-600' : (optStat.percentage >= 20 ? 'text-amber-600' : 'text-slate-500')}>({optStat.percentage}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            highlightCorrect
                              ? 'bg-emerald-500'
                              : optStat.percentage >= 20
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                          style={{ width: `${Math.max(optStat.percentage > 0 ? 3 : 0, optStat.percentage)}%` }}
                        />
                      </div>
                    </div>
                  );
                }

                if (highlightCorrect) {
                  return (
                    <div className="mt-2 pt-1.5 border-t border-emerald-200/80 flex justify-end">
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white font-bold text-[10px] tracking-wide inline-flex items-center gap-1 shadow-2xs">
                        <CheckCircle2 className="w-3 h-3" /> ĐÁP ÁN ĐÚNG
                      </span>
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          );
        }

        // ==========================================
        // 3. INTERACTIVE MODE (Giao diện thí sinh làm bài thi)
        // Tuyệt đối không hiển thị đáp án đúng hay dữ liệu chấm
        // ==========================================
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onSelectOption && onSelectOption(opt.id)}
            className={`w-full text-left p-3.5 sm:p-4 rounded-xl border transition-all flex items-start gap-3 select-none ${
              isSelected
                ? isChecklist
                  ? 'bg-indigo-50/80 border-2 border-indigo-600 shadow-sm text-indigo-950 font-medium'
                  : 'bg-blue-50/80 border-2 border-blue-600 shadow-sm text-blue-950 font-medium'
                : 'bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 text-slate-800'
            } ${disabled ? 'cursor-default opacity-80' : 'cursor-pointer active:scale-[0.99]'}`}
          >
            {/* Checkbox (Checklist) hoặc Radio (Đơn lựa chọn) */}
            {isChecklist ? (
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-1 transition ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-transparent hover:border-slate-400'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            ) : (
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1 transition ${
                  isSelected ? 'border-blue-600 bg-blue-600 shadow-xs' : 'border-slate-300 bg-white'
                }`}
              >
                {isSelected && <span className="w-2 h-2 rounded-full bg-white"></span>}
              </div>
            )}

            {/* Visual Anchor: Avatar Badge 32x32px (w-8 h-8) cho học sinh */}
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition ${
                isSelected
                  ? isChecklist
                    ? 'bg-indigo-600 text-white shadow-xs font-extrabold ring-2 ring-indigo-300'
                    : 'bg-blue-600 text-white shadow-xs font-extrabold ring-2 ring-blue-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-300 font-bold'
              }`}
            >
              {opt.id}
            </span>

            {/* Nội dung đáp án (Hỗ trợ xuống dòng, tự co giãn, render KaTeX/Toán học) */}
            <div className="flex-1 text-sm leading-relaxed break-words whitespace-pre-wrap min-w-0 pt-1">
              <MathContent content={opt.text || opt.content || ''} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
