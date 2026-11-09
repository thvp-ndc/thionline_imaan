import React, { useState, useRef, useMemo } from 'react';
import {
  X as CloseIcon,
  Upload,
  FileText,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Save,
  Scale,
  Sliders,
  ChevronDown,
  Info
} from 'lucide-react';
import MathContent from '../common/MathContent';

export default function ExamWordImportModal({
  isOpen,
  onClose,
  onImportSuccess
}) {
  // Step 1: Chọn file & Quét; Step 2: Xem trước, Đối soát & Xác nhận lưu đề
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [fileBase64, setFileBase64] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Dữ liệu phân tích đề thi
  const [examMeta, setExamMeta] = useState({
    title: '',
    subject: '',
    grade: '',
    duration_minutes: 45,
    total_score: 10.0,
    shuffle_questions: 1,
    shuffle_options: 1,
    school_name: ''
  });

  const [questions, setQuestions] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balancedPreviewList, setBalancedPreviewList] = useState([]);

  // Reset khi mở modal
  const resetState = () => {
    setStep(1);
    setFile(null);
    setFileBase64('');
    setAnalyzing(false);
    setSaving(false);
    setError('');
    setQuestions([]);
    setWarnings([]);
    setShowBalanceModal(false);
  };

  const handleClose = () => {
    if (analyzing || saving) return;
    resetState();
    onClose();
  };

  // Kéo thả và chọn file
  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.docx')) {
      setError('Vui lòng chỉ chọn tệp Microsoft Word định dạng .docx');
      return;
    }
    setError('');
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      setFileBase64(e.target.result);
    };
    reader.onerror = () => {
      setError('Không thể đọc dữ liệu từ tệp này');
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

  // Bước 1 -> Bước 2: Phân tích file Word
  const handleAnalyzeWordFile = async (e) => {
    if (e) e.preventDefault();
    if (!fileBase64) {
      setError('Vui lòng chọn hoặc kéo thả tệp Word (.docx) đề thi');
      return;
    }

    setAnalyzing(true);
    setError('');

    try {
      const res = await fetch('/api/exams/import-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64 })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi phân tích tệp Word đề thi');
      }

      const qList = (data.questions || []).map((q, idx) => ({
        ...q,
        order_index: q.order_index || (idx + 1),
        max_score: parseFloat(q.max_score) || 0.25
      }));

      const parsedMeta = data.meta || {};
      const computedTotal = Math.round(qList.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100;

      setExamMeta({
        title: parsedMeta.examTitle || data.title || file?.name?.replace(/\.[^/.]+$/, '') || 'Đề Thi Mới',
        subject: parsedMeta.subjectName || '',
        grade: parsedMeta.grade || '',
        duration_minutes: parseInt(parsedMeta.durationMinutes, 10) || 45,
        total_score: data.score_scale || (computedTotal > 0 ? computedTotal : 10.0),
        shuffle_questions: 1,
        shuffle_options: 1,
        school_name: parsedMeta.schoolName || ''
      });

      setQuestions(qList);
      setWarnings(data.warnings || []);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Tính tổng điểm hiện tại của các câu
  const currentTotalQuestionsScore = useMemo(() => {
    return Math.round(questions.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100;
  }, [questions]);

  // Đếm các câu hỏi có lỗi bắt buộc sửa
  const problematicQuestions = useMemo(() => {
    return questions.filter(q => {
      if (q.question_type === 'essay') return false;
      const noAns = !q.correct_answers || (Array.isArray(q.correct_answers) && q.correct_answers.length === 0) || (typeof q.correct_answers === 'object' && Object.keys(q.correct_answers).length === 0);
      return q.has_conflict || q.status === 'pending_review' || noAns;
    });
  }, [questions]);

  // Cập nhật điểm của từng câu
  const handleUpdateQuestionScore = (idx, newScoreStr) => {
    const val = parseFloat(newScoreStr);
    if (isNaN(val) || val < 0) return;
    setQuestions(prev => prev.map((q, i) => (i === idx ? { ...q, max_score: val } : q)));
  };

  // Cân đối điểm về thang điểm của đề (Yêu cầu xác nhận từ giáo viên theo Điều chỉnh 2)
  const handleOpenBalanceModal = () => {
    const targetScale = parseFloat(examMeta.total_score) || 10.0;
    const totalQ = questions.length;
    if (totalQ === 0) return;

    // Tính điểm chia đều hoặc tỷ lệ
    const equalScore = Number((targetScale / totalQ).toFixed(2));
    const preview = questions.map((q, idx) => {
      // Câu cuối cùng bù trừ sai số làm tròn để tổng bằng đúng targetScale
      const newScore = idx === totalQ - 1 
        ? Number((targetScale - equalScore * (totalQ - 1)).toFixed(2))
        : equalScore;

      return {
        order_index: q.order_index,
        content: q.content,
        old_score: q.max_score,
        new_score: newScore
      };
    });

    setBalancedPreviewList(preview);
    setShowBalanceModal(true);
  };

  const handleApplyBalance = () => {
    setQuestions(prev => prev.map((q, idx) => {
      const match = balancedPreviewList[idx];
      return match ? { ...q, max_score: match.new_score } : q;
    }));
    setShowBalanceModal(false);
  };

  // Bước 2: Xác nhận lưu đề thi
  const handleSaveExam = async () => {
    if (problematicQuestions.length > 0) {
      alert(`Đề thi còn ${problematicQuestions.length} câu hỏi chưa có đáp án hoặc đang xung đột. Theo nguyên tắc Zero-Guesswork, vui lòng giải quyết trước khi lưu!`);
      return;
    }

    if (!examMeta.title.trim()) {
      alert('Vui lòng nhập tên đề thi');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        title: examMeta.title.trim(),
        subject: examMeta.subject.trim() || 'Tổng hợp',
        grade: examMeta.grade || '',
        duration_minutes: parseInt(examMeta.duration_minutes, 10) || 45,
        total_score: parseFloat(examMeta.total_score) || currentTotalQuestionsScore,
        school_name: examMeta.school_name || '',
        shuffle_questions: examMeta.shuffle_questions ? 1 : 0,
        shuffle_options: examMeta.shuffle_options ? 1 : 0,
        questions: questions.map((q, i) => ({
          order_index: i + 1,
          question_type: q.question_type,
          content: q.content,
          options: q.options || [],
          correct_answers: q.correct_answers || [],
          short_answer: q.short_answer || null,
          max_score: q.max_score,
          rubric_guide: q.rubric_guide || '',
          is_fixed: q.is_fixed ? 1 : 0,
          group_id: q.group_id || null
        }))
      };

      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi lưu đề thi vào hệ thống');
      }

      alert(`Đã tạo thành công đề thi "${examMeta.title}" gồm ${questions.length} câu hỏi với tổng điểm ${currentTotalQuestionsScore}đ!`);
      handleClose();
      if (onImportSuccess) onImportSuccess(data.exam || data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-blue-50 via-slate-50 to-blue-50/30 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Nhập Đề Thi Từ File Word (.docx)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                  Bước {step}/2: {step === 1 ? 'Chọn File Đề Thi' : 'Xem Trước & Đối Soát Đề'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {step === 1
                  ? 'Chuyển đổi tệp đề kiểm tra Word thành bài khảo thí hoàn chỉnh trên phòng máy LAN'
                  : 'Kiểm tra thông số bài thi, thang điểm tổng và tình trạng đáp án trước khi lưu'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={analyzing || saving}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition disabled:opacity-40 cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {step === 1 ? (
          <div className="p-5 space-y-4 overflow-y-auto">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Drag & Drop File Upload Area */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                FILE WORD ĐỀ KIỂM TRA (*.DOCX):
              </label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/50'
                    : file
                    ? 'border-blue-400 bg-blue-50/30'
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
                    <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-900 truncate max-w-[320px]">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {(file.size / 1024).toFixed(1)} KB • Bấm để chọn file khác
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Upload className="w-8 h-8 text-blue-600 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-800">
                      Kéo & thả file Word đề thi vào đây hoặc <span className="text-blue-600 underline">bấm để chọn file</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Hỗ trợ đề thi trắc nghiệm, đúng/sai, trả lời ngắn, tự luận, công thức Toán & mã nguồn Tin học
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Download 4 Exam Templates */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-blue-600" />
                  Tải Mẫu Đề Thi Kiểm Tra (.docx):
                </span>
                <span className="text-[10px] text-slate-500 italic">4 mẫu chuẩn có Header trường & thời gian</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <a
                  href="/api/exams/template/download-word?type=tong_hop"
                  className="px-3 py-2 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg font-medium transition flex items-center justify-between shadow-2xs"
                  title="Mẫu đề thi tổng hợp có khung trường, thời gian 45 phút, thang điểm 10"
                >
                  <span className="truncate">📄 Mẫu Đề Tổng Hợp</span>
                  <span className="text-[10px] text-blue-600 font-bold shrink-0">Tải về</span>
                </a>
                <a
                  href="/api/exams/template/download-word?type=tin_hoc"
                  className="px-3 py-2 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg font-medium transition flex items-center justify-between shadow-2xs"
                  title="Mẫu đề thi Tin học bảo toàn khối code Python/C++, thụt lề, bảng đáp án"
                >
                  <span className="truncate">💻 Mẫu Đề Tin Học</span>
                  <span className="text-[10px] text-blue-600 font-bold shrink-0">Tải về</span>
                </a>
                <a
                  href="/api/exams/template/download-word?type=toan_khtn"
                  className="px-3 py-2 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg font-medium transition flex items-center justify-between shadow-2xs"
                  title="Mẫu đề thi Toán & KHTN hỗ trợ MathType, OMML, thang điểm phân bổ"
                >
                  <span className="truncate">📐 Mẫu Đề Toán - KHTN</span>
                  <span className="text-[10px] text-blue-600 font-bold shrink-0">Tải về</span>
                </a>
                <a
                  href="/api/exams/template/download-word?type=ngoai_ngu"
                  className="px-3 py-2 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg font-medium transition flex items-center justify-between shadow-2xs"
                  title="Mẫu đề thi Ngoại ngữ & Ngữ văn hỗ trợ chùm ngữ liệu đọc hiểu và tự luận"
                >
                  <span className="truncate">📖 Mẫu Đề Ngoại Ngữ</span>
                  <span className="text-[10px] text-blue-600 font-bold shrink-0">Tải về</span>
                </a>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: Xem Trước & Đối Soát Đề Thi (3 Khu Vực Chuyên Biệt) */
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/50">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* KHU VỰC 1: Thông tin đề thi & Cấu hình khảo thí */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  Khu vực 1: Thông tin bài thi & Cấu hình khảo thí
                </span>
                <span className="text-[11px] text-slate-400">Có thể chỉnh sửa trực tiếp</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Tên Đề Thi:</label>
                  <input
                    type="text"
                    value={examMeta.title}
                    onChange={e => setExamMeta(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                    placeholder="VD: Đề kiểm tra giữa học kỳ 1 môn Tin học"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Môn Học:</label>
                  <input
                    type="text"
                    value={examMeta.subject}
                    onChange={e => setExamMeta(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    placeholder="VD: Tin học, Toán..."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Thời Gian (Phút):</label>
                  <select
                    value={examMeta.duration_minutes}
                    onChange={e => setExamMeta(prev => ({ ...prev, duration_minutes: parseInt(e.target.value, 10) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value={15}>15 phút (Kiểm tra ngắn)</option>
                    <option value={45}>45 phút (1 tiết)</option>
                    <option value={60}>60 phút</option>
                    <option value={90}>90 phút (Học kỳ / Khảo sát)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Thang Điểm Chuẩn Của Đề:</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={examMeta.total_score}
                    onChange={e => setExamMeta(prev => ({ ...prev, total_score: parseFloat(e.target.value) || 10.0 }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-700 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Khối Lớp:</label>
                  <input
                    type="text"
                    value={examMeta.grade}
                    onChange={e => setExamMeta(prev => ({ ...prev, grade: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    placeholder="VD: 10, 11, 12..."
                  />
                </div>
              </div>
            </div>

            {/* KHU VỰC 3: Đối soát tổng hợp & Công cụ cân đối điểm */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-emerald-600" />
                  Khu vực 3: Đối soát tổng hợp & Cân đối thang điểm
                </span>
                <span className="text-[11px] text-slate-500">
                  {questions.length} câu hỏi • Hiện tại: <strong className="text-blue-700">{currentTotalQuestionsScore}đ</strong> / Thang {examMeta.total_score}đ
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Tổng số câu</span>
                  <span className="text-base font-black text-slate-800">{questions.length}</span>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 uppercase font-bold block">Câu hợp lệ</span>
                  <span className="text-base font-black text-emerald-800">{questions.length - problematicQuestions.length}</span>
                </div>
                <div className="p-2.5 bg-rose-50 rounded-lg border border-rose-200">
                  <span className="text-[10px] text-rose-700 uppercase font-bold block">Chưa duyệt / Xung đột</span>
                  <span className="text-base font-black text-rose-800">{problematicQuestions.length}</span>
                </div>
                <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-[10px] text-blue-700 uppercase font-bold block">Tổng điểm câu hỏi</span>
                  <span className="text-base font-black text-blue-800">{currentTotalQuestionsScore}đ</span>
                </div>
              </div>

              {/* Cảnh báo chênh lệch điểm & Nút hỗ trợ cân đối có xác nhận */}
              {Math.abs(currentTotalQuestionsScore - parseFloat(examMeta.total_score)) > 0.05 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Tổng điểm các câu hỏi ({currentTotalQuestionsScore}đ) chưa khớp với thang điểm đề ({examMeta.total_score}đ).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenBalanceModal}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>Cân đối về thang {examMeta.total_score}đ...</span>
                  </button>
                </div>
              )}

              {problematicQuestions.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    <strong>Khóa chặn Zero-Guesswork:</strong> Phát hiện {problematicQuestions.length} câu hỏi chưa có đáp án hoặc xung đột (Câu {problematicQuestions.map(q => q.order_index).join(', ')}). Vui lòng xử lý để mở nút lưu đề.
                  </span>
                </div>
              )}
            </div>

            {/* KHU VỰC 2: Danh sách câu hỏi đã phân tích */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Khu vực 2: Nội dung câu hỏi đã phân tích ({questions.length} câu)
                </span>
                <span className="text-[11px] text-slate-400">Xem trước & chỉnh sửa điểm/đáp án</span>
              </div>

              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {questions.map((q, idx) => {
                  const isConflict = q.has_conflict;
                  const noAns = !q.correct_answers || (Array.isArray(q.correct_answers) && q.correct_answers.length === 0);

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border transition ${
                        isConflict
                          ? 'bg-rose-50/50 border-rose-300'
                          : noAns && q.question_type !== 'essay'
                          ? 'bg-amber-50/50 border-amber-300'
                          : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-blue-800">
                            Câu {q.order_index}:
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                            {q.question_type}
                          </span>
                          {q.is_fixed ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">
                              Cố định
                            </span>
                          ) : null}
                          {q.group_id ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">
                              Nhóm {q.group_id}
                            </span>
                          ) : null}
                        </div>

                        {/* Điểm của câu */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 font-medium">Điểm:</span>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={q.max_score}
                            onChange={e => handleUpdateQuestionScore(idx, e.target.value)}
                            className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-center font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* Nội dung câu hỏi */}
                      <div className="mt-2 text-xs text-slate-800">
                        <MathContent content={q.content} />
                      </div>

                      {/* Phương án & Đáp án */}
                      {q.options && q.options.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                          {q.options.map((opt, oIdx) => {
                            const isCorrect = Array.isArray(q.correct_answers)
                              ? q.correct_answers.includes(opt.id)
                              : false;

                            return (
                              <div
                                key={oIdx}
                                className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-1.5 ${
                                  isCorrect
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                    : 'bg-white border-slate-200 text-slate-700'
                                }`}
                              >
                                <span className="truncate">
                                  <strong>{opt.id}.</strong> {opt.text}
                                </span>
                                {isCorrect && (
                                  <span className="text-[10px] text-emerald-700 font-bold shrink-0">✓ ĐÚNG</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Cảnh báo xung đột / chưa duyệt */}
                      {isConflict && (
                        <div className="mt-2 p-2 bg-rose-100/70 border border-rose-300 rounded-lg text-[11px] text-rose-800 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                          <span>{q.warning_message || 'Xung đột giữa bảng đáp án và nội dung câu hỏi.'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={analyzing}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Hủy Bỏ
              </button>

              <button
                type="button"
                onClick={handleAnalyzeWordFile}
                disabled={!fileBase64 || analyzing}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang Phân Tích Đề...</span>
                  </>
                ) : (
                  <>
                    <span>Quét & Xem Trước Đề Thi →</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={saving}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Quay Lại Chọn File</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Hủy
                </button>

                <button
                  type="button"
                  onClick={handleSaveExam}
                  disabled={saving || problematicQuestions.length > 0}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang Lưu Đề Thi...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Xác Nhận Lưu Đề Thi</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

      </div>

      {/* MODAL XÁC NHẬN CÂN ĐỐI ĐIỂM (Tuân thủ Điều chỉnh 2: Phải có bảng so sánh & xác nhận từ GV) */}
      {showBalanceModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Scale className="w-5 h-5 text-blue-600" />
                <span>Xác Nhận Cân Đối Điểm Về Thang {examMeta.total_score}đ</span>
              </div>
              <button
                onClick={() => setShowBalanceModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Dưới đây là bảng so sánh điểm trước và sau khi áp dụng. Tổng điểm mới sẽ bằng đúng <strong>{examMeta.total_score}đ</strong>. Thầy/Cô vui lòng xem xét và bấm xác nhận:
            </p>

            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Câu</th>
                    <th className="py-2 px-3">Điểm Trước</th>
                    <th className="py-2 px-3">Điểm Mới</th>
                    <th className="py-2 px-3 text-right">Chênh lệch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {balancedPreviewList.map((item, idx) => {
                    const diff = Math.round((item.new_score - item.old_score) * 100) / 100;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-1.5 px-3 font-semibold text-slate-800">Câu {item.order_index}</td>
                        <td className="py-1.5 px-3 text-slate-600">{item.old_score}đ</td>
                        <td className="py-1.5 px-3 font-bold text-blue-700">{item.new_score}đ</td>
                        <td className={`py-1.5 px-3 text-right font-medium ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBalanceModal(false)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleApplyBalance}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Xác Nhận Áp Dụng Thay Đổi</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
