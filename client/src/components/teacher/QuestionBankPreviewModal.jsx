import React, { useState, useEffect } from 'react';
import {
  X,
  BookOpen,
  Download,
  Edit2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  FileText,
  Sparkles,
  HelpCircle,
  Copy,
  Trash2
} from 'lucide-react';
import MathContent from '../common/MathContent';
import QuestionOptions from '../common/QuestionOptions';
import { getTrueFalseState, getTrueFalseDisplayLabel } from '../../utils/trueFalseHelper';

export default function QuestionBankPreviewModal({
  isOpen,
  onClose,
  gradeSubject,
  filterParams = {},
  initialQuestionId = null,
  onEditQuestion,
  onRefreshBank
}) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState('focus'); // 'focus' | 'paper'
  const [downloadingWord, setDownloadingWord] = useState(false);

  // Fetch all filtered questions for preview
  useEffect(() => {
    if (!isOpen || !gradeSubject?.id) return;

    const fetchAllFilteredQuestions = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          grade_subject_id: gradeSubject.id,
          page: '1',
          limit: '1000'
        });

        if (filterParams.topic_id && filterParams.topic_id !== 'all') {
          params.set('topic_id', filterParams.topic_id);
        }
        if (filterParams.lesson_id && filterParams.lesson_id !== 'all') {
          params.set('lesson_id', filterParams.lesson_id);
        }
        if (filterParams.level && filterParams.level !== 'all') {
          params.set('level', filterParams.level);
        }
        if (filterParams.question_type && filterParams.question_type !== 'all') {
          params.set('question_type', filterParams.question_type);
        }
        if (filterParams.search && filterParams.search.trim()) {
          params.set('search', filterParams.search.trim());
        }

        const res = await fetch(`/api/question-bank?${params.toString()}`);
        const data = await res.json();
        if (data.success && data.questions) {
          setQuestions(data.questions);
          // Focus vào câu được chỉ định nếu có
          if (initialQuestionId) {
            const foundIdx = data.questions.findIndex(q => q.id === initialQuestionId);
            if (foundIdx !== -1) {
              setCurrentIndex(foundIdx);
            } else {
              setCurrentIndex(0);
            }
          } else {
            setCurrentIndex(0);
          }
        }
      } catch (err) {
        console.error('Fetch preview questions error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllFilteredQuestions();
  }, [isOpen, gradeSubject?.id, filterParams, initialQuestionId]);

  // Phím tắt bàn phím ← và → để duyệt câu trong chế độ Focus
  useEffect(() => {
    if (!isOpen || viewMode !== 'focus') return;
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        setCurrentIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, viewMode, questions.length]);

  if (!isOpen) return null;

  const currentQ = questions[currentIndex] || null;

  // Tải file Word trực tiếp từ Preview Modal
  const handleDownloadWord = async () => {
    const params = new URLSearchParams({
      grade_subject_id: gradeSubject.id
    });
    if (filterParams.topic_id && filterParams.topic_id !== 'all') {
      params.set('topic_id', filterParams.topic_id);
    }
    if (filterParams.lesson_id && filterParams.lesson_id !== 'all') {
      params.set('lesson_id', filterParams.lesson_id);
    }
    if (filterParams.level && filterParams.level !== 'all') {
      params.set('level', filterParams.level);
    }
    if (filterParams.question_type && filterParams.question_type !== 'all') {
      params.set('question_type', filterParams.question_type);
    }
    if (filterParams.search && filterParams.search.trim()) {
      params.set('search', filterParams.search.trim());
    }

    setDownloadingWord(true);
    try {
      const res = await fetch(`/api/question-bank/export-word?${params.toString()}`);
      if (!res.ok) {
        let errMsg = 'Không thể xuất file Word ngân hàng câu hỏi.';
        try {
          const errData = await res.json();
          if (errData && errData.message) errMsg = errData.message;
        } catch (_) {}
        alert(errMsg);
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      let filename = 'Ngan_Hang_Cau_Hoi.docx';
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1].replace(/["']/g, '').trim());
        }
      }
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert('Lỗi kết nối khi xuất file Word: ' + err.message);
    } finally {
      setDownloadingWord(false);
    }
  };

  // Render câu hỏi dạng mô phỏng học sinh thi
  const renderStudentViewQuestion = (q, index) => {
    if (!q) return null;

    const levelBadge = q.level === 'biet'
      ? <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">🟢 Nhận biết</span>
      : q.level === 'hieu'
      ? <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">🔵 Thông hiểu</span>
      : <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🟠 Vận dụng</span>;

    let typeTitle = 'Trắc nghiệm nhiều lựa chọn';
    let typeBadge = <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Phần I: Trắc nghiệm</span>;
    if (q.question_type === 'true_false') {
      typeTitle = 'Trắc nghiệm Đúng / Sai (GDPT 2025)';
      typeBadge = <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">Phần II: Đúng / Sai</span>;
    } else if (q.question_type === 'short_answer') {
      typeTitle = 'Câu hỏi Trả lời ngắn';
      typeBadge = <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Phần III: Trả lời ngắn</span>;
    } else if (q.question_type === 'essay') {
      typeTitle = 'Câu hỏi Tự luận';
      typeBadge = <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Phần IV: Tự luận</span>;
    }

    return (
      <div className="space-y-4">
        {/* Header câu hỏi */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
                {index + 1}
              </span>
              Câu {index + 1}
            </span>
            {typeBadge}
            {levelBadge}
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
              {q.topic_name}
            </span>
            {q.lesson_name && (
              <span className="text-xs px-2 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">
                {q.lesson_name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              Điểm: {q.default_score || 0.25}đ
            </span>
            {onEditQuestion && (
              <button
                onClick={() => onEditQuestion(q.id)}
                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-50 text-blue-600 rounded-lg text-xs font-bold transition border border-slate-200 shadow-2xs cursor-pointer"
                title="Sửa nội dung câu hỏi này"
              >
                <Edit2 className="w-3.5 h-3.5" /> Sửa Câu Này
              </button>
            )}
          </div>
        </div>

        {/* Nội dung đề bài */}
        <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 text-sm text-slate-900 leading-relaxed font-sans shadow-2xs">
          <MathContent content={q.content} />
        </div>

        {/* Phần 1: Trắc nghiệm 4 lựa chọn (single_choice) */}
        {(q.question_type === 'single_choice' || q.question_type === 'multiple_choice') && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Các phương án trả lời:
            </div>
            <QuestionOptions
              options={q.options || []}
              questionType={q.question_type}
              mode="preview"
              correctAnswers={q.correct_answers || []}
              showAnswerKey={true}
              className="pt-1"
            />
          </div>
        )}

        {/* Phần 2: Đúng / Sai chuẩn GDPT 2025 (true_false) */}
        {q.question_type === 'true_false' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center justify-between">
              <span>Đánh giá Đúng (Đ) / Sai (S) cho từng phát biểu:</span>
              <span className="text-[11px] text-teal-700 normal-case italic font-semibold">* Chuẩn Bộ GD&ĐT 2025</span>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center border-r border-slate-200">Ý</th>
                    <th className="py-2.5 px-3 border-r border-slate-200">Nội Dung Phát Biểu</th>
                    <th className="py-2.5 px-4 w-28 text-center bg-teal-50 text-teal-800">Đáp Án Chuẩn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {['a', 'b', 'c', 'd'].map(key => {
                    const opt = (q.options || []).find(o => o.id?.toLowerCase() === key) || { id: key, text: '' };
                    const rawAnswers = q.correct_answers || q.correct_answers_json;
                    const correctVal = getTrueFalseDisplayLabel(rawAnswers, key);

                    const isDung = correctVal === 'Đúng';
                    const isSai = correctVal === 'Sai';

                    return (
                      <tr key={key} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 text-center font-bold text-slate-900 uppercase border-r border-slate-200 bg-slate-50/50">
                          {key})
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-sm">
                          <MathContent content={opt.text || '(Chưa có nội dung phát biểu)'} />
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {correctVal === '-' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200" title="Chưa xác định đáp án">
                              -
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                              isDung
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> {correctVal}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Phần 3: Trả lời ngắn (short_answer) */}
        {q.question_type === 'short_answer' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Mô phỏng ô trả lời của học sinh & Đáp án chuẩn:
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 shadow-2xs">
              {/* Giả lập ô thí sinh nhập */}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ô nhập kết quả của thí sinh (Phần III):</label>
                <input
                  type="text"
                  disabled
                  placeholder="Thí sinh điền kết quả vào đây (ví dụ: -2.5, 14, 3/4...)"
                  className="w-full max-w-md px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-400 font-mono italic shadow-2xs"
                />
              </div>

              {/* Hộp hiển thị đáp án chuẩn */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs flex items-center gap-3">
                <span className="font-bold text-amber-800 flex items-center gap-1.5 shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Đáp án chuẩn hệ thống chấm:
                </span>
                <span className="px-3 py-1 bg-white rounded-lg border border-amber-300 text-emerald-700 font-mono font-bold text-sm tracking-wide shadow-2xs">
                  {q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] : '') || '(Chưa nhập đáp án)'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Phần 4: Tự luận (essay) */}
        {q.question_type === 'essay' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Khu vực làm bài tự luận & Hướng dẫn chấm / Barem:
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 shadow-2xs">
              <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-500 italic">
                [Vùng học sinh gõ bài giải tự luận hoặc tải ảnh bài làm lên khi thi trực tuyến]
              </div>

              {q.rubric_guide && (
                <div className="p-3.5 bg-indigo-50/80 rounded-xl border border-indigo-200 text-xs text-slate-800 space-y-1.5">
                  <div className="font-bold text-indigo-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Hướng dẫn chấm & Barem rubric chi tiết:
                  </div>
                  <div className="text-slate-700 leading-relaxed">
                    <MathContent content={q.rubric_guide} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Xem Trước Trực Quan Ngân Hàng Câu Hỏi
              </h2>
              <p className="text-xs text-slate-500">
                {gradeSubject.grade_name} • {gradeSubject.subject_name} • {questions.length} câu hỏi khả dụng
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Chuyển chế độ xem Focus / Paper */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1 text-xs font-semibold">
              <button
                onClick={() => setViewMode('focus')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'focus'
                    ? 'bg-white text-blue-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-blue-600" /> Mô Phỏng Thi
              </button>
              <button
                onClick={() => setViewMode('paper')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'paper'
                    ? 'bg-white text-blue-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" /> Dạng Trang In ({questions.length})
              </button>
            </div>

            {/* Nút Xuất Word */}
            <button
              onClick={handleDownloadWord}
              disabled={downloadingWord || questions.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
              title="Xuất danh sách câu hỏi ra Word (.docx) chuẩn A4, lề 1cm, Times New Roman 12"
            >
              <Download className="w-3.5 h-3.5" />
              {downloadingWord ? 'Đang xuất...' : 'Xuất Word'}
            </button>

            {/* Nút Đóng */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-slate-50/40">
          {loading ? (
            <div className="py-20 text-center text-slate-500 text-sm italic">
              Đang tải danh sách câu hỏi xem trước...
            </div>
          ) : questions.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-sm">
              Không có câu hỏi nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : viewMode === 'focus' ? (
            /* Chế độ Focus: Xem từng câu như học sinh thi */
            <div className="max-w-4xl mx-auto space-y-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
              {renderStudentViewQuestion(currentQ, currentIndex)}
            </div>
          ) : (
            /* Chế độ Paper: Toàn bộ danh sách câu hỏi */
            <div className="max-w-4xl mx-auto space-y-6">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition shadow-2xs"
                >
                  {renderStudentViewQuestion(q, idx)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Navigation (Chỉ hiện khi ở chế độ Focus) */}
        {viewMode === 'focus' && questions.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Nút Câu Trước */}
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex <= 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 shadow-2xs cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Câu Trước (←)
            </button>

            {/* Dải số câu hỏi */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-xl py-1 px-1 custom-scrollbar">
              {questions.map((q, idx) => {
                const isSelected = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`min-w-[28px] h-7 rounded-lg text-xs font-bold transition flex items-center justify-center shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-2xs ring-2 ring-blue-400/40'
                        : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
                    }`}
                    title={`Câu ${idx + 1}: ${q.topic_name || ''}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Nút Câu Sau */}
            <button
              onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIndex >= questions.length - 1}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 shadow-2xs cursor-pointer"
            >
              Câu Sau (→) <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
