import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  BookOpen,
  Download,
  Clock,
  Edit2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Sigma,
  Code2,
  Image as ImageIcon,
  Save,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  Check
} from 'lucide-react';
import MathContent from '../common/MathContent';
import QuestionOptions from '../common/QuestionOptions';
import MathToolbarModal from '../common/MathToolbarModal';
import CodeToolbarModal from '../common/CodeToolbarModal';
import ExamExportModal from './ExamExportModal';
import { getTrueFalseState, normalizeTrueFalseMap } from '../../utils/trueFalseHelper';

export default function ExamPreviewModal({ examId, onClose, onOpenCreateSession, onOpenEditFull }) {
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);

  // Chế độ xem: 'focus' (từng câu như học sinh làm bài) | 'paper' (toàn bộ đề cuộn liên tục)
  const [viewMode, setViewMode] = useState('focus');
  const [currentQIndex, setCurrentQIndex] = useState(0);

  // Chế độ chỉnh sửa inline tại chỗ
  const [editingQId, setEditingQId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Ref container nội dung câu hỏi để tự động cuộn lên đầu khi chuyển câu
  const questionContentRef = useRef(null);

  // Math & Code & Image Toolbars
  const [mathModalTarget, setMathModalTarget] = useState(null); // { field: 'content' | 'option' | 'rubric', optId?: string }
  const [codeModalTarget, setCodeModalTarget] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageFileInputRef = useRef(null);

  // Load chi tiết đề thi
  const fetchExamDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`/api/exams/${examId}`);
      const data = await res.json();
      if (data.success && data.exam) {
        setExam(data.exam);
      } else {
        setError(data.message || 'Không thể tải chi tiết đề thi');
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (examId) {
      fetchExamDetails();
    }
  }, [examId]);

  // Tiêu chí 2: Tự động cuộn vùng câu hỏi về đầu khi chuyển câu
  useEffect(() => {
    if (questionContentRef.current) {
      questionContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentQIndex]);

  // Tiêu chí 3: Phím tắt bàn phím ← và → để chuyển câu, bảo toàn tuyệt đối không cướp phím của input/textarea/contentEditable
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (editingQId) return; // Đang sửa thì không bắt phím chuyển câu
      const target = e.target;
      if (!target) return;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        setCurrentQIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' && exam?.questions) {
        setCurrentQIndex(prev => Math.min(exam.questions.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exam, editingQId]);

  const questions = exam?.questions || [];
  const currentQ = questions[currentQIndex] || null;

  // Bắt đầu sửa một câu hỏi
  const startEditingQuestion = (q) => {
    let options = [];
    try {
      options = Array.isArray(q.options) ? JSON.parse(JSON.stringify(q.options)) : [];
    } catch (e) {
      options = [];
    }

    let correct_answers = q.correct_answers;
    if (q.question_type === 'true_false') {
      correct_answers = normalizeTrueFalseMap(correct_answers, 'F');
    } else if (q.question_type === 'single_choice') {
      if (!Array.isArray(correct_answers) || correct_answers.length === 0) {
        correct_answers = ['A'];
      }
    }

    setEditingQId(q.id);
    setEditForm({
      id: q.id,
      question_type: q.question_type,
      content: q.content || '',
      options: options,
      correct_answers: correct_answers,
      short_answer: q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] || '' : ''),
      rubric_guide: q.rubric_guide || '',
      max_score: q.max_score !== undefined ? q.max_score : 1.0
    });
  };

  const cancelEditing = () => {
    setEditingQId(null);
    setEditForm(null);
  };

  // Lưu chỉnh sửa câu hỏi
  const handleSaveQuestion = async () => {
    if (!editForm) return;
    try {
      setSaving(true);

      let answersToSave = editForm.correct_answers;
      if (editForm.question_type === 'short_answer') {
        answersToSave = [editForm.short_answer.trim()];
      }

      const res = await fetch(`/api/exams/${exam.id}/questions/${editForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editForm.content,
          options: editForm.options,
          correct_answers: answersToSave,
          short_answer: editForm.short_answer,
          rubric_guide: editForm.rubric_guide,
          max_score: parseFloat(editForm.max_score) || 1.0,
          question_type: editForm.question_type
        })
      });

      const data = await res.json();
      if (data.success && data.exam) {
        setExam(data.exam);
        setEditingQId(null);
        setEditForm(null);
        setSaveSuccessMsg('✓ Đã cập nhật câu hỏi thành công!');
        setTimeout(() => setSaveSuccessMsg(''), 3000);
      } else {
        alert('Lỗi lưu câu hỏi: ' + (data.message || 'Không rõ nguyên nhân'));
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ khi lưu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper chèn Math/Code vào form sửa
  const insertTextToEditForm = (target, text) => {
    if (!editForm || !target) return;
    const { field, optId } = target;
    if (field === 'content') {
      const prev = editForm.content || '';
      setEditForm(prevForm => ({ ...prevForm, content: prev + (prev ? ' ' : '') + text }));
    } else if (field === 'rubric') {
      const prev = editForm.rubric_guide || '';
      setEditForm(prevForm => ({ ...prevForm, rubric_guide: prev + (prev ? ' ' : '') + text }));
    } else if (field === 'option' && optId) {
      const updatedOpts = editForm.options.map(opt => {
        if (opt.id.toLowerCase() === optId.toLowerCase()) {
          return { ...opt, text: (opt.text || '') + (opt.text ? ' ' : '') + text };
        }
        return opt;
      });
      setEditForm(prevForm => ({ ...prevForm, options: updatedOpts }));
    }
  };

  // Upload ảnh
  const handleUploadImageBlob = async (blob, target) => {
    if (!blob || !target) return;
    try {
      setUploadingImage(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: reader.result })
          });
          const data = await res.json();
          if (data.success) {
            insertTextToEditForm(target, `\n![Hình ảnh](${data.url})\n`);
          } else {
            alert('Lỗi lưu ảnh: ' + data.message);
          }
        } catch (e) {
          alert('Lỗi tải ảnh: ' + e.message);
        } finally {
          setUploadingImage(false);
        }
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      setUploadingImage(false);
      alert('Lỗi đọc ảnh: ' + e.message);
    }
  };

  // Helper phân loại nhãn câu hỏi
  const getQuestionTypeBadge = (type) => {
    switch (type) {
      case 'single_choice':
        return { label: 'Trắc nghiệm (Phần I)', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'multiple_choice':
        return { label: 'Chọn nhiều đáp án', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'true_false':
        return { label: 'Đúng / Sai (Phần II)', color: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'short_answer':
        return { label: 'Trả lời ngắn (Phần III)', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'essay':
        return { label: 'Tự luận (Phần IV)', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      default:
        return { label: 'Câu hỏi', color: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  // Helper phân loại mức độ nhận thức
  const getCognitiveLevelBadge = (level) => {
    if (!level) return null;
    const l = String(level).toLowerCase();
    if (l.includes('biet') || l === 'nb') return { label: 'Nhận biết', color: 'bg-sky-50 text-sky-700 border-sky-200' };
    if (l.includes('hieu') || l === 'th') return { label: 'Thông hiểu', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (l.includes('dung') || l === 'vd' || l === 'vdc') return { label: 'Vận dụng', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    return { label: level, color: 'bg-slate-50 text-slate-700 border-slate-200' };
  };

  // Helper màu sắc button bảng câu hỏi
  const getNavButtonClass = (q, idx) => {
    const isCurrent = idx === currentQIndex;
    let base = 'font-bold text-xs flex items-center justify-center transition relative rounded-lg border cursor-pointer ';

    if (isCurrent && viewMode === 'focus') {
      base += 'ring-2 ring-blue-500 bg-blue-600 text-white font-black border-blue-500 shadow-2xs ';
    } else {
      switch (q.question_type) {
        case 'single_choice':
        case 'multiple_choice':
          base += 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 ';
          break;
        case 'true_false':
          base += 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 ';
          break;
        case 'short_answer':
          base += 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 ';
          break;
        case 'essay':
          base += 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 ';
          break;
        default:
          base += 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 ';
      }
    }
    return base;
  };

  // Render câu hỏi ở chế độ xem trực quan
  const renderQuestionCard = (q, idx, isPaper = false) => {
    const isEditing = editingQId === q.id;
    const badge = getQuestionTypeBadge(q.question_type);
    const cogBadge = getCognitiveLevelBadge(q.cognitive_level || q.level);

    return (
      <div
        key={q.id || idx}
        id={`q-preview-${idx}`}
        className={`bg-white border rounded-2xl p-5 sm:p-6 transition shadow-sm space-y-5 ${
          isEditing ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
        } ${isPaper ? 'mb-6' : ''}`}
      >
        {/* Header câu hỏi: Visual Anchor cho số câu, dạng câu, mức độ và điểm số */}
        <div className="flex flex-wrap items-center justify-between pb-3.5 border-b border-slate-100 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
              {idx + 1}
            </span>
            <span className="font-extrabold text-blue-700 text-base tracking-tight">
              CÂU {idx + 1}
            </span>
            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${badge.color}`}>
              {badge.label}
            </span>
            {cogBadge && (
              <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${cogBadge.color}`}>
                {cogBadge.label}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
              {q.max_score} điểm
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => startEditingQuestion(q)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-600 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Chỉnh sửa nội dung câu hỏi, đáp án hoặc điểm số"
              >
                <Edit2 className="w-3.5 h-3.5" /> Sửa Câu Này
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveQuestion}
                  disabled={saving}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Đang Lưu...' : 'Lưu Thay Đổi'}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            )}
          </div>
        </div>

        {/* NỘI DUNG HIỂN THỊ (KHI KHÔNG SỬA) */}
        {!isEditing ? (
          <div className="space-y-4">
            {/* Đề bài KaTeX với vạch màu biên trái border-l-4 border-l-blue-600 tạo visual anchor */}
            <div className="border-l-4 border-l-blue-600 bg-gradient-to-r from-blue-50/30 to-slate-50/50 p-4 sm:p-5 rounded-r-2xl border-y border-r border-slate-200/90 shadow-2xs">
              <div className="text-slate-900 text-[15.5px] sm:text-[16px] leading-relaxed font-sans">
                <MathContent content={q.content || '(Chưa có nội dung đề bài)'} />
              </div>
            </div>

            {/* PHẦN I: TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN */}
            {(q.question_type === 'single_choice' || q.question_type === 'multiple_choice') && (
              <div className="space-y-2 pt-1">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span>Các phương án lựa chọn:</span>
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

            {/* PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI */}
            {q.question_type === 'true_false' && (
              <div className="space-y-2.5 pt-1">
                <div className="text-xs font-bold uppercase tracking-wider text-teal-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                  <span>Bảng xác định tính Đúng / Sai của từng mệnh đề (BGDĐT):</span>
                </div>
                <div className="space-y-2">
                  {(q.options && q.options.length > 0 ? q.options : ['a', 'b', 'c', 'd'].map(k => ({ id: k, text: '' }))).map(opt => {
                    const key = opt.id.toLowerCase();
                    const tfState = getTrueFalseState(q.correct_answers, key);
                    const isTrue = tfState === 'T';

                    return (
                      <div
                        key={opt.id}
                        className={`p-3 sm:p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-2xs transition ${
                          isTrue ? 'bg-emerald-50/70 border-emerald-300' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-[240px]">
                          <span className={`w-8 h-8 rounded-xl font-bold text-sm flex items-center justify-center shrink-0 border mt-0.5 ${
                            isTrue ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs' : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}>
                            {key.toUpperCase()}
                          </span>
                          <div className="text-sm text-slate-800 pt-1 flex-1 leading-relaxed">
                            <MathContent content={opt.text} />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                              isTrue
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                : 'bg-white text-slate-400 border-slate-200 opacity-60'
                            }`}
                          >
                            {isTrue ? '✓ ĐÚNG' : 'Đúng'}
                          </span>
                          <span
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                              !isTrue
                                ? 'bg-rose-600 text-white border-rose-500 shadow-xs'
                                : 'bg-white text-slate-400 border-slate-200 opacity-60'
                            }`}
                          >
                            {!isTrue ? '✕ SAI' : 'Sai'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PHẦN III: TRẢ LỜI NGẮN */}
            {q.question_type === 'short_answer' && (
              <div className="p-4 bg-emerald-50/60 rounded-xl border-2 border-emerald-300 space-y-2 shadow-2xs">
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 uppercase">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  <span>Đáp án chính xác chuẩn:</span>
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-4 py-2 bg-white border border-emerald-400 rounded-xl text-emerald-950 font-mono font-extrabold text-base shadow-2xs">
                    {q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] : '') || '(Chưa có đáp án)'}
                  </div>
                  <span className="text-xs text-slate-600">
                    Học sinh điền chính xác chuỗi kết quả này sẽ đạt tối đa <strong>{q.max_score} điểm</strong>.
                  </span>
                </div>
              </div>
            )}

            {/* PHẦN IV: TỰ LUẬN */}
            {q.question_type === 'essay' && (
              <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-300 space-y-2 shadow-2xs">
                <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5 uppercase">
                  <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                  <span>Barem điểm & Hướng dẫn chấm chi tiết:</span>
                </span>
                <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans bg-white/70 p-3 rounded-lg border border-amber-200">
                  <MathContent content={q.rubric_guide || 'Chưa có hướng dẫn chấm chi tiết cho câu hỏi tự luận này.'} />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* NỘI DUNG CHỈNH SỬA TẠI CHỖ (INLINE LIVE EDITOR) */
          <div className="space-y-4 pt-1">
            {/* Thanh công cụ chèn Toán, Code, Ảnh */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" /> Đang chỉnh sửa câu {idx + 1}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMathModalTarget({ field: 'content' })}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 border border-blue-200 shadow-2xs cursor-pointer"
                  title="Chèn công thức toán học KaTeX ($...$)"
                >
                  <Sigma className="w-3.5 h-3.5" /> Chèn Toán
                </button>
                <button
                  type="button"
                  onClick={() => setCodeModalTarget({ field: 'content' })}
                  className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1 border border-emerald-200 shadow-2xs cursor-pointer"
                  title="Chèn khối mã nguồn Python / C++"
                >
                  <Code2 className="w-3.5 h-3.5" /> Chèn Code
                </button>
                <label className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1 border border-indigo-200 shadow-2xs cursor-pointer">
                  <ImageIcon className="w-3.5 h-3.5" /> {uploadingImage ? 'Đang Tải...' : 'Chèn Ảnh'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleUploadImageBlob(e.target.files[0], { field: 'content' });
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Ô soạn thảo đề bài & Live Preview */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Nội dung đề bài:</label>
              <textarea
                rows={3}
                value={editForm.content}
                onChange={e => setEditForm({ ...editForm, content: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:bg-white transition font-sans shadow-2xs"
                placeholder="Nhập nội dung đề bài (hỗ trợ $công_thức_toán$)..."
              />
              {/* Live Preview đề bài */}
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  👁️ Xem trước hiển thị đề bài:
                </span>
                <MathContent content={editForm.content || '(Chưa nhập nội dung)'} />
              </div>
            </div>

            {/* SỬA PHƯƠNG ÁN: TRẮC NGHIỆM A, B, C, D */}
            {(editForm.question_type === 'single_choice' || editForm.question_type === 'multiple_choice') && (
              <div className="space-y-3 pt-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Các phương án lựa chọn (Click vào chữ cái A, B, C, D để đổi đáp án đúng):
                </label>
                <div className="grid grid-cols-1 gap-2.5">
                  {(editForm.options || []).map(opt => {
                    const isCorrect = Array.isArray(editForm.correct_answers) && editForm.correct_answers.includes(opt.id);
                    return (
                      <div
                        key={opt.id}
                        className={`flex items-start gap-2 p-2 rounded-xl border transition shadow-2xs ${
                          isCorrect ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (editForm.question_type === 'single_choice') {
                              setEditForm({ ...editForm, correct_answers: [opt.id] });
                            } else {
                              const prev = editForm.correct_answers || [];
                              const next = prev.includes(opt.id)
                                ? prev.filter(x => x !== opt.id)
                                : [...prev, opt.id];
                              setEditForm({ ...editForm, correct_answers: next });
                            }
                          }}
                          className={`w-8 h-8 rounded-lg font-bold text-xs flex items-center justify-center transition shrink-0 mt-0.5 cursor-pointer ${
                            isCorrect ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Click để chọn làm đáp án đúng"
                        >
                          {opt.id}
                        </button>
                        <textarea
                          rows={2}
                          value={opt.text}
                          onChange={e => {
                            const newOpts = editForm.options.map(o => o.id === opt.id ? { ...o, text: e.target.value } : o);
                            setEditForm({ ...editForm, options: newOpts });
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.max(48, e.target.scrollHeight)}px`;
                          }}
                          onFocus={e => {
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.max(48, e.target.scrollHeight)}px`;
                          }}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-xs leading-relaxed resize-y break-words whitespace-pre-wrap min-h-[48px] focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                          placeholder={`Nội dung phương án ${opt.id}...`}
                        />
                        <button
                          type="button"
                          onClick={() => setMathModalTarget({ field: 'option', optId: opt.id })}
                          className="p-1.5 bg-white hover:bg-blue-50 text-slate-500 hover:text-blue-700 border border-slate-200 rounded-lg text-xs shrink-0 mt-0.5 shadow-2xs cursor-pointer"
                          title="Chèn công thức toán vào phương án này"
                        >
                          <Sigma className="w-3.5 h-3.5" />
                        </button>
                        {isCorrect && (
                          <span className="text-emerald-700 text-xs font-bold shrink-0 pr-1 mt-1.5">✓ ĐÚNG</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SỬA ĐÚNG / SAI (a, b, c, d) */}
            {editForm.question_type === 'true_false' && (
              <div className="space-y-3 pt-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Nội dung và Đáp án 4 ý Đúng / Sai:
                </label>
                {(editForm.options || []).map(opt => {
                  const key = opt.id.toLowerCase();
                  const isTrue = editForm.correct_answers?.[key] === 'T';
                  return (
                    <div
                      key={opt.id}
                      className="flex flex-wrap items-start justify-between gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs"
                    >
                      <div className="flex items-start gap-2 flex-1 min-w-[260px]">
                        <span className="w-7 h-7 rounded bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center shrink-0 border border-teal-200 mt-0.5">
                          {key})
                        </span>
                        <textarea
                          rows={2}
                          value={opt.text}
                          onChange={e => {
                            const newOpts = editForm.options.map(o => o.id === opt.id ? { ...o, text: e.target.value } : o);
                            setEditForm({ ...editForm, options: newOpts });
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.max(48, e.target.scrollHeight)}px`;
                          }}
                          onFocus={e => {
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.max(48, e.target.scrollHeight)}px`;
                          }}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-xs leading-relaxed resize-y break-words whitespace-pre-wrap min-h-[48px] focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                          placeholder={`Nội dung ý ${key}...`}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditForm({
                              ...editForm,
                              correct_answers: { ...editForm.correct_answers, [key]: 'T' }
                            });
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
                            isTrue ? 'bg-emerald-600 text-white border-emerald-500 shadow-2xs' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Đúng
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditForm({
                              ...editForm,
                              correct_answers: { ...editForm.correct_answers, [key]: 'F' }
                            });
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
                            !isTrue ? 'bg-rose-600 text-white border-rose-500 shadow-2xs' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Sai
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* SỬA TRẢ LỜI NGẮN */}
            {editForm.question_type === 'short_answer' && (
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Đáp án chuẩn (Kết quả chính xác học sinh cần điền):
                </label>
                <input
                  type="text"
                  value={editForm.short_answer}
                  onChange={e => setEditForm({ ...editForm, short_answer: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold text-sm focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                  placeholder="Ví dụ: 4500 hoặc 1/2..."
                />
              </div>
            )}

            {/* SỬA TỰ LUẬN */}
            {editForm.question_type === 'essay' && (
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Barem điểm & Hướng dẫn chấm chi tiết:
                </label>
                <textarea
                  rows={3}
                  value={editForm.rubric_guide}
                  onChange={e => setEditForm({ ...editForm, rubric_guide: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 text-xs font-sans focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                  placeholder="Nhập hướng dẫn chấm, các bước cho điểm..."
                />
              </div>
            )}

            {/* ĐIỂM SỐ CỦA CÂU HỎI */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <label className="text-xs text-slate-600 flex items-center gap-2">
                Điểm tối đa của câu hỏi này:
                <input
                  type="number"
                  step="0.1"
                  value={editForm.max_score}
                  onChange={e => setEditForm({ ...editForm, max_score: e.target.value })}
                  className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 text-center text-xs font-bold shadow-2xs"
                />
                <span className="font-semibold text-slate-700">điểm</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuestion}
                  disabled={saving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Đang Lưu...' : '✓ Lưu Thay Đổi'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NÚT ĐIỀU HƯỚNG TRONG FOCUS MODE */}
        {!isPaper && (
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
            <button
              type="button"
              disabled={idx === 0}
              onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-40 text-slate-700 rounded-xl font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Câu Trước
            </button>
            <span className="text-slate-500 hidden sm:inline">
              Mẹo: Dùng phím mũi tên <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-mono">←</kbd> <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-mono">→</kbd> trên bàn phím
            </span>
            <button
              type="button"
              disabled={idx === questions.length - 1}
              onClick={() => setCurrentQIndex(prev => Math.min(questions.length - 1, prev + 1))}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              Câu Tiếp Theo <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-7xl w-full h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER BAR CỦA MODAL XEM TRƯỚC */}
        <div className="flex flex-wrap items-center justify-between p-3.5 sm:px-6 border-b border-slate-200 bg-white shrink-0 gap-3 z-30 shadow-2xs">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
                <Eye className="w-4 h-4" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-wide">
                Xem Trước Đề Thi Trực Quan
              </h3>
              {saveSuccessMsg && (
                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold animate-bounce">
                  {saveSuccessMsg}
                </span>
              )}
            </div>
            {exam && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                <span className="font-bold text-slate-900 text-sm">{exam.title}</span>
                {exam.subject && <span className="text-blue-600">• Môn: {exam.subject}</span>}
                {exam.grade && <span>• Khối {exam.grade}</span>}
                <span>• Thời gian: {exam.duration_minutes || 45} phút</span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold">
                  {exam.total_score}đ
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold">
                  {questions.length} câu
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Chuyển chế độ xem */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1 text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('focus')}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'focus' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Xem từng câu như học sinh làm bài thi"
              >
                <Eye className="w-3.5 h-3.5" /> Từng Câu (Focus)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('paper')}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'paper' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Xem toàn bộ đề cuộn liên tục như tờ giấy thi"
              >
                <Layers className="w-3.5 h-3.5" /> Toàn Bộ Đề
              </button>
            </div>

            {/* Các tiện ích */}
            {exam && (
              <>
                <button
                  type="button"
                  onClick={() => setShowExportModal(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Xuất đề Word (.docx) chuẩn OMML Math và A4"
                >
                  <Download className="w-3.5 h-3.5" /> Xuất Đề Word
                </button>
                {onOpenCreateSession && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCreateSession(exam.id);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5" /> Mở Ca Thi
                  </button>
                )}
                {onOpenEditFull && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenEditFull(exam.id);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border border-slate-200 shadow-2xs cursor-pointer"
                    title="Mở bảng cấu hình đề đầy đủ"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Cài Đặt Đề
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              title="Đóng xem trước"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NỘI DUNG CHÍNH (BODY) */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm">Đang tải trực quan đề thi...</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-rose-600 gap-3">
            <AlertCircle className="w-10 h-10 text-rose-500" />
            <p className="text-base font-semibold">{error}</p>
            <button
              type="button"
              onClick={fetchExamDetails}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs cursor-pointer"
            >
              Thử Lại
            </button>
          </div>
        ) : questions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">
            <BookOpen className="w-12 h-12 text-slate-400" />
            <p className="text-base">Đề thi này chưa có câu hỏi nào.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_16rem] lg:grid-cols-[minmax(0,1fr)_18rem] gap-4 p-3.5 sm:p-5 overflow-hidden bg-slate-50/50">
            {/* CỘT TRÁI: VÙNG NỘI DUNG CÂU HỎI TRỌNG TÂM (Main Content - min-w-0 flex-1) */}
            <main
              ref={questionContentRef}
              className="min-w-0 min-h-0 flex flex-col justify-between overflow-y-auto pr-1 sm:pr-2"
            >
              {viewMode === 'focus' ? (
                currentQ ? renderQuestionCard(currentQ, currentQIndex, false) : null
              ) : (
                <div className="space-y-4">
                  {questions.map((q, idx) => renderQuestionCard(q, idx, true))}
                </div>
              )}
            </main>

            {/* CỘT PHẢI: BẢNG ĐIỀU HƯỚNG CÂU HỎI (Sidebar Palette) */}
            <aside className="min-w-0 min-h-0 flex flex-col bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 overflow-hidden shadow-2xs shrink-0">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Bảng Câu Hỏi</span>
                <span className="text-xs text-blue-600 font-mono font-bold">{questions.length} câu</span>
              </div>

              {/* Lưới ô câu hỏi cuộn được */}
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-4 gap-2">
                  {questions.map((q, idx) => {
                    return (
                      <button
                        key={q.id || idx}
                        type="button"
                        onClick={() => {
                          setCurrentQIndex(idx);
                          if (viewMode === 'paper') {
                            const el = document.getElementById(`q-preview-${idx}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className={`h-9 ${getNavButtonClass(q, idx)}`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chú thích màu sắc 4 phần theo chuẩn Bộ GD&ĐT */}
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-600 shrink-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Phần thi</div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span>
                  <span>Phần I: Trắc nghiệm</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-teal-100 border border-teal-300"></span>
                  <span>Phần II: Đúng / Sai</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span>
                  <span>Phần III: Trả lời ngắn</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span>
                  <span>Phần IV: Tự luận</span>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* MODAL CHÈN TOÁN HỌC */}
      {mathModalTarget && (
        <MathToolbarModal
          isOpen={true}
          onClose={() => setMathModalTarget(null)}
          onInsertMath={(latex) => insertTextToEditForm(mathModalTarget, latex)}
        />
      )}

      {/* MODAL CHÈN CODE */}
      {codeModalTarget && (
        <CodeToolbarModal
          isOpen={true}
          onClose={() => setCodeModalTarget(null)}
          onInsertCode={(codeStr) => insertTextToEditForm(codeModalTarget, codeStr)}
        />
      )}
      {/* MODAL XUẤT ĐỀ THI CHUẨN HÓA */}
      {showExportModal && exam && (
        <ExamExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          exam={exam}
        />
      )}
    </div>
  );
}
