import React, { useState, useRef, useMemo } from 'react';
import {
  X as CloseIcon,
  Upload,
  FileText,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FolderTree,
  BookOpen,
  FileUp,
  Loader2,
  ArrowLeft,
  ShieldCheck,
  Filter,
  CheckSquare,
  Square,
  Plus,
  Edit3,
  Trash2,
  Sparkles
} from 'lucide-react';
import MathContent from '../common/MathContent';

// Helper an toàn kiểm tra đáp án cho mọi dạng câu hỏi (trắc nghiệm, đúng/sai, trả lời ngắn)
const getOptionCorrectInfo = (question, optId) => {
  if (!question || !optId) return { isCorrect: false, label: '' };
  const cleanId = String(optId).trim().toLowerCase();
  const ca = question.correct_answers;

  // 1. Dạng câu hỏi Đúng / Sai (true_false)
  if (question.question_type === 'true_false') {
    let isTrue = false;
    if (ca && typeof ca === 'object' && !Array.isArray(ca)) {
      const val = ca[cleanId] ?? ca[optId] ?? ca[String(optId).toUpperCase()];
      isTrue = val === 'T' || val === true || String(val).toUpperCase() === 'DUNG';
    } else if (Array.isArray(ca)) {
      isTrue = ca.some(item => {
        if (typeof item === 'string' && item.includes(':')) {
          const [k, v] = item.split(':');
          return k.trim().toLowerCase() === cleanId && (v.trim().toUpperCase() === 'T' || v.trim().toUpperCase() === 'DUNG');
        }
        return String(item).toLowerCase() === cleanId;
      });
    }
    return {
      isCorrect: isTrue,
      label: isTrue ? '✓ ĐÚNG' : '✕ SAI'
    };
  }

  // 2. Dạng Trắc nghiệm (single_choice / multiple_choice)
  let isChoice = false;
  if (Array.isArray(ca)) {
    isChoice = ca.some(ans => String(ans).trim().toUpperCase() === String(optId).trim().toUpperCase());
  } else if (typeof ca === 'string') {
    isChoice = ca.trim().toUpperCase() === String(optId).trim().toUpperCase();
  }

  return {
    isCorrect: isChoice,
    label: isChoice ? '✓ ĐÁP ÁN ĐÚNG' : ''
  };
};

export default function QuestionBankWordImportModal({
  isOpen,
  onClose,
  gradeSubject,
  topics = [],
  onImportSuccess
}) {
  // Step 1: Chọn file; Step 2: Đối soát & Lựa chọn nạp
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [fileBase64, setFileBase64] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Dữ liệu đối soát trả về từ API
  const [auditData, setAuditData] = useState(null);
  const [activeFilterTab, setActiveFilterTab] = useState('all'); // 'all' | 'option_dup' | 'bank_dup' | 'valid'
  const [selectedQuestionIndices, setSelectedQuestionIndices] = useState(new Set());
  const [importMode, setImportMode] = useState('skip_duplicates'); // 'skip_duplicates' | 'all'
  const [editingAnswersMap, setEditingAnswersMap] = useState({});

  const handleAddTagToQuestion = (originalIndex) => {
    const rawVal = (editingAnswersMap[originalIndex] || '').trim();
    if (!rawVal) return;

    setAuditData(prev => {
      if (!prev?.audited_questions) return prev;
      const updated = prev.audited_questions.map(q => {
        if (q.original_index === originalIndex) {
          const currentList = Array.isArray(q.correct_answers) ? [...q.correct_answers] : (q.short_answer ? [q.short_answer] : []);
          if (!currentList.includes(rawVal)) {
            currentList.push(rawVal);
          }
          return {
            ...q,
            correct_answers: currentList,
            short_answer: currentList[0] || ''
          };
        }
        return q;
      });
      return { ...prev, audited_questions: updated };
    });

    setEditingAnswersMap(prev => ({ ...prev, [originalIndex]: '' }));
  };

  const handleRemoveTagFromQuestion = (originalIndex, tagToRemove) => {
    setAuditData(prev => {
      if (!prev?.audited_questions) return prev;
      const updated = prev.audited_questions.map(q => {
        if (q.original_index === originalIndex) {
          const currentList = Array.isArray(q.correct_answers) ? q.correct_answers : [];
          const filtered = currentList.filter(t => t !== tagToRemove);
          return {
            ...q,
            correct_answers: filtered,
            short_answer: filtered[0] || ''
          };
        }
        return q;
      });
      return { ...prev, audited_questions: updated };
    });
  };

  const handleToggleExamSheetForQuestion = (originalIndex, enabled) => {
    setAuditData(prev => {
      if (!prev?.audited_questions) return prev;
      const updated = prev.audited_questions.map(q => {
        if (q.original_index === originalIndex) {
          const sCfg = q.scoring_config || {};
          const eConstraints = sCfg.exam_constraints || {};
          return {
            ...q,
            scoring_config: {
              ...sCfg,
              answer_format: enabled ? 'exam_sheet' : 'decimal',
              max_characters: enabled ? 4 : null,
              exam_constraints: {
                ...eConstraints,
                mode: enabled ? 'exam_sheet_4' : 'free',
                max_characters: enabled ? 4 : null
              }
            }
          };
        }
        return q;
      });
      return { ...prev, audited_questions: updated };
    });
  };

  const handleToggleNumericEquivalence = (originalIndex, enabled) => {
    setAuditData(prev => {
      if (!prev?.audited_questions) return prev;
      const updated = prev.audited_questions.map(q => {
        if (q.original_index === originalIndex) {
          const sCfg = q.scoring_config || {};
          const gPolicy = sCfg.grading_policy || {};
          return {
            ...q,
            scoring_config: {
              ...sCfg,
              numeric_equivalence: enabled,
              grading_policy: {
                ...gPolicy,
                numeric_equivalence: enabled
              }
            }
          };
        }
        return q;
      });
      return { ...prev, audited_questions: updated };
    });
  };

  const handleResolveConflict = (originalIndex, choice) => {
    setAuditData(prev => {
      if (!prev?.audited_questions) return prev;
      const updated = prev.audited_questions.map(q => {
        if (q.original_index === originalIndex) {
          let chosen = [];
          if (choice === 'inline') {
            chosen = Array.isArray(q.conflict_inline) ? q.conflict_inline : [q.conflict_inline];
          } else if (choice === 'key') {
            chosen = Array.isArray(q.conflict_key) ? q.conflict_key : [q.conflict_key];
          } else if (choice === 'merge') {
            const set = new Set([...(q.conflict_inline || []), ...(q.conflict_key || [])]);
            chosen = Array.from(set);
          }
          return {
            ...q,
            correct_answers: chosen,
            short_answer: chosen[0] || '',
            has_conflict: false
          };
        }
        return q;
      });
      return { ...prev, audited_questions: updated };
    });
  };

  const handleRestorePrefix = (originalIndex) => {
    setAuditData(prev => {
      if (!prev?.audited_questions) return prev;
      const updated = prev.audited_questions.map(q => {
        if (q.original_index === originalIndex && q.raw_answer_detected) {
          return {
            ...q,
            correct_answers: [q.raw_answer_detected],
            short_answer: q.raw_answer_detected,
            prefix_stripped: null
          };
        }
        return q;
      });
      return { ...prev, audited_questions: updated };
    });
  };

  if (!isOpen) return null;

  const currentTopic = topics.find(t => t.id === selectedTopicId);
  const availableLessons = currentTopic?.lessons || [];

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.name.endsWith('.docx')) {
      setError('Vui lòng chọn file định dạng Word (.docx)');
      setFile(null);
      setFileBase64('');
      return;
    }
    setError('');
    setSuccessMsg('');
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      setFileBase64(e.target.result);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Bước 1 -> Bước 2: Quét và phân tích đối soát
  const handleAnalyzeFile = async (e) => {
    e.preventDefault();
    if (!file || !fileBase64) {
      setError('Vui lòng chọn một file Word (.docx) để quét.');
      return;
    }

    try {
      setAnalyzing(true);
      setError('');

      const res = await fetch('/api/question-bank/audit-word-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          grade_subject_id: gradeSubject.id
        })
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Lỗi khi phân tích file Word.');
        return;
      }

      const report = data.report;
      setAuditData(report);

      // Mặc định chọn tất cả các câu (trừ câu trùng kho nếu chọn chế độ skip_duplicates)
      const initialSelected = new Set();
      report.audited_questions.forEach((q, idx) => {
        // Mặc định tích chọn các câu không trùng hoàn toàn trong kho
        if (!q.audit?.bank_duplicate || q.audit.bank_duplicate.match_type !== 'exact') {
          initialSelected.add(idx);
        }
      });
      setSelectedQuestionIndices(initialSelected);

      setStep(2);
    } catch (err) {
      setError('Lỗi kết nối máy chủ khi quét file: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Lọc câu hỏi theo tab
  const filteredQuestions = useMemo(() => {
    if (!auditData?.audited_questions) return [];
    return auditData.audited_questions
      .map((q, idx) => ({ ...q, original_index: idx }))
      .filter(q => {
        if (activeFilterTab === 'all') return true;
        if (activeFilterTab === 'option_dup') return q.audit?.has_option_duplicates;
        if (activeFilterTab === 'bank_dup') return q.audit?.bank_duplicate;
        if (activeFilterTab === 'valid') return !q.audit?.has_option_duplicates && !q.audit?.bank_duplicate;
        return true;
      });
  }, [auditData, activeFilterTab]);

  // Toggle chọn/bỏ chọn câu hỏi
  const handleToggleSelectQuestion = (idx) => {
    setSelectedQuestionIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedQuestionIndices(prev => {
      const next = new Set(prev);
      filteredQuestions.forEach(q => next.add(q.original_index));
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedQuestionIndices(prev => {
      const next = new Set(prev);
      filteredQuestions.forEach(q => next.delete(q.original_index));
      return next;
    });
  };

  // Bước 2: Thực hiện nạp các câu đã chọn vào Ngân hàng
  const handleConfirmImport = async () => {
    if (selectedQuestionIndices.size === 0) {
      setError('Vui lòng tích chọn ít nhất 1 câu hỏi để nạp vào ngân hàng.');
      return;
    }

    try {
      setImporting(true);
      setError('');
      setSuccessMsg('');

      // Lấy danh sách câu hỏi giáo viên đã chọn
      const questionsToImport = auditData.audited_questions
        .filter((_, idx) => selectedQuestionIndices.has(idx))
        .map(q => {
          // Bỏ trường audit trước khi gửi vào hàm import
          const { audit, ...cleanQ } = q;
          return cleanQ;
        });

      // Kiểm tra Zero-Guesswork: cảnh báo nếu câu hỏi được chọn còn xung đột hoặc thiếu đáp án
      const unresolvedInSelection = questionsToImport.filter(q => {
        if (q.question_type === 'essay') return false;
        const noAns = !q.correct_answers || (Array.isArray(q.correct_answers) && q.correct_answers.length === 0) || (typeof q.correct_answers === 'object' && Object.keys(q.correct_answers).length === 0);
        return q.has_conflict || q.status === 'pending_review' || noAns;
      });
      if (unresolvedInSelection.length > 0) {
        setError(`Có ${unresolvedInSelection.length} câu hỏi đang xung đột hoặc chưa được chọn đáp án. Vui lòng bấm chọn phương án giải quyết (hoặc bỏ tích chọn các câu đó) trước khi nạp!`);
        setImporting(false);
        return;
      }

      const res = await fetch('/api/question-bank/import-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade_subject_id: gradeSubject.id,
          default_topic_id: selectedTopicId || null,
          default_lesson_id: selectedLessonId || null,
          custom_questions: questionsToImport,
          import_mode: importMode
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || `Đã nạp thành công ${questionsToImport.length} câu hỏi vào ngân hàng!`);
        setTimeout(() => {
          if (onImportSuccess) onImportSuccess();
          onClose();
        }, 1200);
      } else {
        setError(data.message || 'Đã xảy ra lỗi khi nạp câu hỏi.');
      }
    } catch (err) {
      setError('Lỗi khi nạp câu hỏi: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
      <div className={`bg-white border border-slate-200 rounded-2xl w-full shadow-2xl overflow-hidden flex flex-col transition-all duration-200 ${
        step === 2 ? 'max-w-4xl max-h-[92vh]' : 'max-w-xl'
      }`}>
        {/* Modal Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <FileUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Nhập Câu Hỏi Vào Ngân Hàng Từ File Word (.docx)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold">
                  Bước {step}/2: {step === 1 ? 'Chọn File & Quét' : 'Đối Soát & Cảnh Báo Trùng Lặp'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {step === 1
                  ? 'Nạp các câu hỏi độc lập vào kho kiến thức môn học, tự động phân loại mức độ nhận thức và kiểm soát trùng lặp'
                  : 'Kiểm tra cảnh báo trùng câu hỏi và trùng đáp án trước khi lưu vào ngân hàng'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={analyzing || importing}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition disabled:opacity-40 cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {step === 1 ? (
          <form onSubmit={handleAnalyzeFile} className="p-4 sm:p-5 space-y-4 overflow-y-auto bg-white">
            {/* Target Destination: Môn học & Khối lớp */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Đích nhập:</span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  Môn: {gradeSubject.subject_name}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold">
                  {gradeSubject.grade_name}
                </span>
              </div>
              <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Kiểm soát trùng tự động
              </span>
            </div>

            {/* Chọn Chủ đề / Bài học mặc định */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Chủ Đề Nhận Diện:
                </label>
                <select
                  value={selectedTopicId}
                  onChange={e => {
                    setSelectedTopicId(e.target.value);
                    setSelectedLessonId('');
                  }}
                  disabled={analyzing}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                >
                  <option value="">📁 Tự động nhận diện từ file Word</option>
                  {topics.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Bài Học Mặc Định:
                </label>
                <select
                  value={selectedLessonId}
                  onChange={e => setSelectedLessonId(e.target.value)}
                  disabled={analyzing || !selectedTopicId || availableLessons.length === 0}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 disabled:opacity-40 shadow-2xs"
                >
                  <option value="">-- Thuộc toàn chủ đề / Tự động --</option>
                  {availableLessons.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Drag & Drop File Upload Area */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                FILE WORD CÂU HỎI (*.DOCX):
              </label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/50'
                    : file
                    ? 'border-emerald-400 bg-emerald-50/40'
                    : 'border-slate-300 hover:border-blue-400 bg-slate-50/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx"
                  disabled={analyzing}
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                  className="hidden"
                />

                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-2xs">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-900 truncate max-w-[280px]">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {(file.size / 1024).toFixed(1)} KB • Bấm để đổi file khác
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Upload className="w-7 h-7 text-blue-600 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-800">
                      Kéo & thả file Word vào đây hoặc <span className="text-blue-600 underline">bấm để chọn file</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Hỗ trợ thẻ phân loại [[TOPIC]], [[LESSON]], mức độ [NB], [TH], [VD], [VDC], công thức Toán & Code
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Download 4 Bank Templates */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-emerald-600" />
                  Tải Mẫu Soạn Câu Hỏi Ngân Hàng (.docx):
                </span>
                <span className="text-[10px] text-slate-500 italic">4 mẫu chuyên biệt kèm thẻ nhận thức</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <a
                  href="/api/question-bank/template/download-word?type=bank_tong_hop"
                  className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg font-medium transition flex items-center justify-between shadow-2xs"
                  title="Mẫu ngân hàng tổng hợp gồm thẻ [[TOPIC]], [[LESSON]] và [NB], [TH], [VD], [VDC]"
                >
                  <span className="truncate">📄 Mẫu NH Tổng Hợp</span>
                  <span className="text-[10px] text-emerald-600 font-bold shrink-0">Tải về</span>
                </a>
                <a
                  href="/api/question-bank/template/download-word?type=bank_tin_hoc"
                  className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg font-medium transition flex items-center justify-between shadow-2xs"
                  title="Mẫu ngân hàng Tin học bảo toàn code Python/C++, thụt lề, mức độ"
                >
                  <span className="truncate">💻 Mẫu NH Tin Học</span>
                  <span className="text-[10px] text-emerald-600 font-bold shrink-0">Tải về</span>
                </a>
                <a
                  href="/api/question-bank/template/download-word?type=bank_toan_khtn"
                  className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg font-medium transition flex items-center justify-between shadow-2xs"
                  title="Mẫu ngân hàng Toán & KHTN hỗ trợ công thức MathType, OMML, mức độ"
                >
                  <span className="truncate">📐 Mẫu NH Toán - KHTN</span>
                  <span className="text-[10px] text-emerald-600 font-bold shrink-0">Tải về</span>
                </a>
                <a
                  href="/api/question-bank/template/download-word?type=bank_ngoai_ngu"
                  className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg font-medium transition flex items-center justify-between shadow-2xs"
                  title="Mẫu ngân hàng Ngoại ngữ & Đọc hiểu hỗ trợ chùm ngữ liệu chung"
                >
                  <span className="truncate">📖 Mẫu NH Ngoại Ngữ</span>
                  <span className="text-[10px] text-emerald-600 font-bold shrink-0">Tải về</span>
                </a>
              </div>
            </div>

            {/* Alert Messages */}
            {error && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-xs animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Footer Actions */}
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                disabled={analyzing}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition disabled:opacity-40 cursor-pointer shadow-2xs"
              >
                Hủy Bỏ
              </button>
              <button
                type="submit"
                disabled={analyzing || !file}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Đang quét & đối soát trùng lặp...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Quét & Kiểm Tra File Word →
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: Bảng đối soát & Cảnh báo trùng lặp */
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white">
            {/* Thanh tổng quan Thống kê (Metrics Overview) */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Tổng số câu bóc tách</span>
                  <span className="text-lg font-black text-slate-900">{auditData?.summary?.total || 0}</span>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">✅ Hợp lệ hoàn toàn</span>
                  <span className="text-lg font-black text-emerald-800">{auditData?.summary?.valid_count || 0}</span>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-amber-700 block">⚠️ Trùng phương án</span>
                  <span className="text-lg font-black text-amber-800">{auditData?.summary?.has_option_duplicates_count || 0}</span>
                </div>
                <div className="p-2 bg-rose-50 rounded-lg border border-rose-200 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-rose-700 block">⛔ Trùng trong kho</span>
                  <span className="text-lg font-black text-rose-800">{auditData?.summary?.is_duplicate_in_bank_count || 0}</span>
                </div>
              </div>

              {/* Tab lọc & Thao tác chọn nhanh */}
              <div className="mt-3 flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-200">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveFilterTab('all')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      activeFilterTab === 'all'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Tất cả ({auditData?.summary?.total || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilterTab('bank_dup')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 cursor-pointer ${
                      activeFilterTab === 'bank_dup'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                    }`}
                  >
                    ⛔ Trùng trong kho ({auditData?.summary?.is_duplicate_in_bank_count || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilterTab('option_dup')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 cursor-pointer ${
                      activeFilterTab === 'option_dup'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
                    }`}
                  >
                    ⚠️ Trùng đáp án ({auditData?.summary?.has_option_duplicates_count || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilterTab('valid')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 cursor-pointer ${
                      activeFilterTab === 'valid'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    ✅ Hợp lệ ({auditData?.summary?.valid_count || 0})
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-blue-600 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Chọn tab này
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiltered}
                    className="text-slate-500 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Square className="w-3.5 h-3.5" /> Bỏ chọn tab này
                  </button>
                </div>
              </div>
            </div>

            {/* Danh sách câu hỏi đối soát */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {filteredQuestions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Không có câu hỏi nào thuộc bộ lọc này.
                </div>
              ) : (
                filteredQuestions.map(q => {
                  const isSelected = selectedQuestionIndices.has(q.original_index);
                  const bankDup = q.audit?.bank_duplicate;
                  const optionDups = q.audit?.option_duplicates || [];

                  return (
                    <div
                      key={q.original_index}
                      className={`p-3.5 rounded-xl border transition-all ${
                        !isSelected
                          ? 'bg-white border-slate-200 opacity-60'
                          : bankDup?.match_type === 'exact'
                          ? 'bg-rose-50/50 border-rose-300 shadow-2xs'
                          : optionDups.length > 0
                          ? 'bg-amber-50/50 border-amber-300 shadow-2xs'
                          : 'bg-white border-slate-200 shadow-2xs'
                      }`}
                    >
                      {/* Header câu hỏi */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectQuestion(q.original_index)}
                            className="w-4 h-4 rounded text-blue-600 bg-white border-slate-300 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-slate-900">
                            Câu {q.order_index || (q.original_index + 1)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-semibold border border-slate-200">
                            {q.question_type === 'single_choice' ? 'Trắc nghiệm' : q.question_type === 'true_false' ? 'Đúng/Sai' : 'Trả lời ngắn'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {q.level === 'biet' ? 'Nhận biết' : q.level === 'hieu' ? 'Thông hiểu' : q.level === 'vandung' ? 'Vận dụng' : 'Vận dụng cao'}
                          </span>
                        </div>

                        {/* Badges trạng thái */}
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {q.has_conflict && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                              ⚠️ Xung đột bảng & nội dòng
                            </span>
                          )}
                          {q.warning === 'missing_answer' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                              ⚠️ Chưa có đáp án
                            </span>
                          )}
                          {q.prefix_stripped && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1">
                              ℹ️ Đã lọc "{q.prefix_stripped}"
                            </span>
                          )}
                          {q.is_sheet_invalid && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                              ⛔ Vi phạm phiếu THPT (&gt; 4 ký tự)
                            </span>
                          )}
                          {bankDup && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                              bankDup.match_type === 'exact'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}>
                              {bankDup.match_type === 'exact' ? '⛔ Trùng 100% trong kho' : `⚠️ Tương tự ${Math.round((bankDup.similarity || 1) * 100)}% kho`}
                            </span>
                          )}
                          {optionDups.length > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                              ⚠️ Trùng {optionDups.length} cặp phương án
                            </span>
                          )}
                          {!bankDup && optionDups.length === 0 && !q.has_conflict && q.warning !== 'missing_answer' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                              ✅ Hợp lệ
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Nội dung câu hỏi */}
                      <div className="mt-2 text-xs text-slate-800 line-clamp-3">
                        <MathContent content={q.content} />
                      </div>

                      {/* Chi tiết cảnh báo trùng lặp ngân hàng nếu có */}
                      {bankDup && (
                        <div className="mt-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold">
                              Đối chiếu với câu #{bankDup.matched_question?.id} trong ngân hàng ({bankDup.matched_question?.topic_name}):
                            </span>
                          </div>
                          <p className="italic opacity-85 line-clamp-2">
                            "{(bankDup.matched_question?.content || '').slice(0, 140)}..."
                          </p>
                        </div>
                      )}

                      {/* Chi tiết cảnh báo trùng phương án nếu có */}
                      {optionDups.length > 0 && (
                        <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                          <span className="font-bold">Các phương án bị trùng lặp nội dung: </span>
                          <span>
                            {optionDups.map(p => `[${p.id1} và ${p.id2}]`).join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Hiển thị các phương án thu nhỏ */}
                      {q.options && q.options.length > 0 && (
                        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                          {q.options.map(opt => {
                            const isDupOpt = optionDups.some(p => p.id1 === opt.id || p.id2 === opt.id);
                            const { isCorrect, label } = getOptionCorrectInfo(q, opt.id);
                            const isTrueFalse = q.question_type === 'true_false';

                            return (
                              <div
                                key={opt.id}
                                className={`px-2 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
                                  isDupOpt
                                    ? 'border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-300'
                                    : isTrueFalse
                                    ? isCorrect
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                      : 'border-slate-200 bg-white text-slate-600'
                                    : isCorrect
                                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300'
                                    : 'border-slate-200 bg-white text-slate-600'
                                }`}
                              >
                                <span className="font-bold font-mono text-xs">{opt.id}.</span>
                                <span className="truncate flex-1">{opt.text}</span>
                                {isTrueFalse ? (
                                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                    isCorrect
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}>
                                    {label}
                                  </span>
                                ) : (
                                  isCorrect && (
                                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                      ✓ ĐÁP ÁN ĐÚNG
                                    </span>
                                  )
                                )}
                                {isDupOpt && <span className="text-[9px] uppercase font-bold text-amber-700 shrink-0">⚠️ Trùng</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Hiển thị và chỉnh sửa đáp án câu trả lời ngắn (Phần III) */}
                      {q.question_type === 'short_answer' && (
                        <div className="mt-2.5 p-3 bg-emerald-50/70 border border-emerald-300 rounded-xl text-xs space-y-2.5">
                          {/* Header điều khiển */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-emerald-800 font-bold uppercase text-[10px] flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              <span>Đáp án đã trích xuất (Phần III):</span>
                            </span>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={q.scoring_config?.answer_format === 'exam_sheet' || q.scoring_config?.exam_constraints?.mode === 'exam_sheet_4'}
                                  onChange={e => handleToggleExamSheetForQuestion(q.original_index, e.target.checked)}
                                  className="w-3.5 h-3.5 rounded text-emerald-600 border-emerald-400 cursor-pointer"
                                />
                                <span>Phiếu thi THPT (≤ 4 ký tự)</span>
                              </label>
                              <label className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!q.scoring_config?.numeric_equivalence || !!q.scoring_config?.grading_policy?.numeric_equivalence}
                                  onChange={e => handleToggleNumericEquivalence(q.original_index, e.target.checked)}
                                  className="w-3.5 h-3.5 rounded text-emerald-600 border-emerald-400 cursor-pointer"
                                />
                                <span>Tương đương số (1/2 = 0.5)</span>
                              </label>
                            </div>
                          </div>

                          {/* Hộp thoại xử lý xung đột giữa Thẻ Inline và Bảng cuối đề (TC-14) */}
                          {q.has_conflict && (
                            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 space-y-2">
                              <div className="flex items-center gap-1.5 font-bold text-xs">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>Phát hiện xung đột giữa đáp án dưới câu và bảng đáp án cuối đề!</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                <div className="p-1.5 bg-white rounded border border-amber-200">
                                  <span className="font-semibold block text-slate-500">Đáp án nội dòng:</span>
                                  <span className="font-mono font-bold text-emerald-700">
                                    {Array.isArray(q.conflict_inline) ? q.conflict_inline.join(' | ') : q.conflict_inline}
                                  </span>
                                </div>
                                <div className="p-1.5 bg-white rounded border border-amber-200">
                                  <span className="font-semibold block text-slate-500">Đáp án bảng cuối đề:</span>
                                  <span className="font-mono font-bold text-blue-700">
                                    {Array.isArray(q.conflict_key) ? q.conflict_key.join(' | ') : q.conflict_key}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-amber-200">
                                <span className="text-[10px] font-semibold text-slate-600">Chọn phương án giải quyết:</span>
                                <button
                                  type="button"
                                  onClick={() => handleResolveConflict(q.original_index, 'inline')}
                                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition cursor-pointer shadow-2xs"
                                >
                                  ✓ Dùng Nội dòng
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResolveConflict(q.original_index, 'key')}
                                  className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] transition cursor-pointer shadow-2xs"
                                >
                                  ✓ Dùng Bảng cuối
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResolveConflict(q.original_index, 'merge')}
                                  className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] transition cursor-pointer shadow-2xs"
                                >
                                  ⚡ Gộp cả hai
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Thông báo đã lọc tiền tố biến an toàn (TC-04) */}
                          {q.prefix_stripped && (
                            <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-[11px] flex items-center justify-between gap-2">
                              <span>
                                Đã tự động lọc tiền tố biến <b>"{q.prefix_stripped}"</b> cho giá trị số học.
                              </span>
                              {q.raw_answer_detected && (
                                <button
                                  type="button"
                                  onClick={() => handleRestorePrefix(q.original_index)}
                                  className="text-[10px] text-sky-700 underline font-bold hover:text-sky-900 shrink-0 cursor-pointer"
                                >
                                  Khôi phục nguyên gốc: "{q.raw_answer_detected}"
                                </button>
                              )}
                            </div>
                          )}

                          {/* Danh sách thẻ đáp án hiện có */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(!q.correct_answers || q.correct_answers.length === 0) ? (
                              <span className="text-[11px] text-rose-600 italic">
                                ⚠️ Chưa nhận diện được đáp án nào! Vui lòng bấm thêm bên dưới.
                              </span>
                            ) : (
                              (Array.isArray(q.correct_answers) ? q.correct_answers : [q.correct_answers]).map((ans, aIdx) => {
                                const isSheet = q.scoring_config?.answer_format === 'exam_sheet' || q.scoring_config?.exam_constraints?.mode === 'exam_sheet_4';
                                const isInvalidSheet = isSheet && (String(ans).length > 4 || !/^[0-9,.\-]+$/.test(String(ans)));
                                return (
                                  <span
                                    key={aIdx}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono font-bold text-xs shadow-2xs border ${
                                      isInvalidSheet
                                        ? 'bg-rose-100 text-rose-800 border-rose-300 ring-1 ring-rose-400'
                                        : aIdx === 0
                                        ? 'bg-emerald-600 text-white border-emerald-700'
                                        : 'bg-white text-emerald-900 border-emerald-300'
                                    }`}
                                  >
                                    <span>{ans}</span>
                                    {isInvalidSheet && (
                                      <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" title="Vượt quá 4 ký tự hoặc ký tự lạ!" />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveTagFromQuestion(q.original_index, ans)}
                                      className="hover:bg-black/10 rounded-full p-0.5 transition cursor-pointer"
                                      title="Xóa đáp án này"
                                    >
                                      <CloseIcon className="w-2.5 h-2.5" />
                                    </button>
                                  </span>
                                );
                              })
                            )}
                          </div>

                          {/* Input bổ sung thêm đáp án tương đương trực tiếp */}
                          <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/60">
                            <input
                              type="text"
                              value={editingAnswersMap[q.original_index] || ''}
                              onChange={e => setEditingAnswersMap({ ...editingAnswersMap, [q.original_index]: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddTagToQuestion(q.original_index);
                                }
                              }}
                              placeholder="Nhập thêm đáp án tương đương (ví dụ 2.5 hoặc 2,5) rồi bấm Thêm..."
                              className="flex-1 bg-white border border-emerald-300 rounded-lg px-2.5 py-1 text-xs font-mono font-semibold text-slate-800 focus:outline-none focus:border-emerald-600 shadow-2xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddTagToQuestion(q.original_index)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Thêm</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Hiển thị barem hướng dẫn tự luận nếu có */}
                      {q.question_type === 'essay' && q.rubric_guide && (
                        <div className="mt-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs space-y-1">
                          <span className="text-indigo-700 font-bold uppercase text-[10px] block">Barem chấm:</span>
                          <p className="text-slate-700 line-clamp-2 italic">{q.rubric_guide}</p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Thông báo lỗi / thành công */}
            {error && (
              <div className="mx-4 p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-xs shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="mx-4 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700 text-xs shrink-0">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Footer Step 2: Tùy chọn nạp & Hành động */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={importing}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Chọn lại file khác
                </button>

                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-300 text-xs text-slate-700">
                  <span className="font-semibold text-slate-500">Chế độ nạp:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="skip_duplicates"
                      checked={importMode === 'skip_duplicates'}
                      onChange={() => setImportMode('skip_duplicates')}
                      className="text-blue-600"
                    />
                    <span>Bỏ qua câu trùng kho (Khuyên dùng)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer ml-2">
                    <input
                      type="radio"
                      name="importMode"
                      value="all"
                      checked={importMode === 'all'}
                      onChange={() => setImportMode('all')}
                      className="text-blue-600"
                    />
                    <span>Nạp tất cả</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={importing}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || selectedQuestionIndices.size === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Đang nạp vào ngân hàng...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Xác Nhận Nạp ({selectedQuestionIndices.size}) Câu Vào Ngân Hàng
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
