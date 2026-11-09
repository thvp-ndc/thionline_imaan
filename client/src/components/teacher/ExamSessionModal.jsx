import React, { useState, useEffect, useMemo } from 'react';
import { Clock, X as CloseIcon, FileText, Shuffle, RotateCw, CheckCircle2 } from 'lucide-react';

export const EXAM_TYPES = [
  { id: 'KTTX', code: 'TX', label: 'Thường Xuyên (KTTX)', short: 'KTTX', tag: 'Đánh giá thường xuyên' },
  { id: 'GK', code: 'GK', label: 'Giữa Kỳ (GK)', short: 'Giữa kỳ', tag: 'Đánh giá giữa kỳ' },
  { id: 'CK', code: 'CK', label: 'Cuối Kỳ (CK)', short: 'Cuối kỳ', tag: 'Đánh giá cuối kỳ' }
];

export const STANDARD_GRADES = ['6', '7', '8', '9', '10', '11', '12'];

export const SCORE_RELEASE_MODES = [
  {
    id: 'manual_release',
    label: 'Giáo viên công bố',
    badge: 'Khuyên dùng GK/CK',
    description: 'Học sinh không thấy điểm khi nộp. Giáo viên mở khóa điểm đồng loạt sau khi kết thúc.',
    icon: '📢'
  },
  {
    id: 'immediate',
    label: 'Hiện điểm ngay',
    badge: 'Khuyên dùng KTTX',
    description: 'Học sinh xem điểm trắc nghiệm ngay sau khi nộp (Luyện tập / Thường xuyên).',
    icon: '👁️'
  },
  {
    id: 'hidden',
    label: 'Ẩn điểm tuyệt đối',
    badge: 'Bảo mật cao',
    description: 'Học sinh không bao giờ xem điểm của bài thi này trên máy làm bài.',
    icon: '🔒'
  }
];

export default function ExamSessionModal({
  isOpen,
  onClose,
  editingSessionId = null,
  initialExamId = null,
  initialMatrixId = null,
  sessions = [],
  exams = [],
  matrices = [],
  availableClasses = [],
  onSuccess
}) {
  if (!isOpen) return null;

  const [selectedSessionGrade, setSelectedSessionGrade] = useState('10');
  const [isCustomClass, setIsCustomClass] = useState(false);
  const [isTitleManuallyEdited, setIsTitleManuallyEdited] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    distribution_mode: 'fixed',
    source_type: 'exam',
    exam_id: '',
    matrix_id: '',
    variant_exam_ids: [],
    generate_per_student: 0,
    target_class: '',
    exam_type: 'GK',
    score_release_mode: 'manual_release',
    session_code: '',
    title: '',
    duration_minutes: 45,
    status: 'waiting'
  });

  const availableGrades = useMemo(() => {
    const gradeSet = new Set(STANDARD_GRADES);
    (availableClasses || []).forEach(c => {
      const match = String(c).match(/^\d+/);
      if (match) gradeSet.add(match[0]);
    });
    return Array.from(gradeSet).sort((a, b) => parseInt(a) - parseInt(b));
  }, [availableClasses]);

  const classesInSelectedGrade = useMemo(() => {
    if (!selectedSessionGrade) return availableClasses || [];
    return (availableClasses || []).filter(c => {
      const match = String(c).match(/^\d+/);
      return match ? match[0] === String(selectedSessionGrade) : false;
    });
  }, [availableClasses, selectedSessionGrade]);

  const computeAutoSessionTitle = (targetClass, examType, examId, matrixId, distMode) => {
    const classLabel = (targetClass || '').trim() || (selectedSessionGrade ? `Khối ${selectedSessionGrade}` : 'Lớp');
    const typeObj = EXAM_TYPES.find(t => t.id === examType) || EXAM_TYPES[1];

    let subjectOrName = 'Kiểm tra';
    if (distMode === 'matrix_dynamic' || !examId) {
      const mat = (matrices || []).find(m => m.id === matrixId);
      if (mat) {
        subjectOrName = mat.subject_name || mat.title || 'Ma trận';
      }
    } else {
      const ex = (exams || []).find(e => e.id === examId);
      if (ex) {
        subjectOrName = (ex.title || ex.subject || 'Đề thi').replace(/\s*-\s*Mã đề\s*\d+.*$/i, '').trim();
      }
    }

    return `${classLabel} - ${subjectOrName} - ${typeObj.short}`;
  };

  const computeAutoSessionCode = (targetClass, examType) => {
    let cleanClass = String(targetClass || (selectedSessionGrade ? `K${selectedSessionGrade}` : 'PHONG'))
      .trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanClass) cleanClass = 'PHONG';
    const typeObj = EXAM_TYPES.find(t => t.id === examType);
    const typeCode = typeObj ? typeObj.code : 'GK';
    const cleanPrefix = `${cleanClass}-${typeCode}`;

    const existing = new Set((sessions || []).map(s => s.session_code?.toUpperCase()));
    for (let i = 1; i <= 99; i++) {
      const candidate = `${cleanPrefix}${i}`;
      if (!existing.has(candidate)) return candidate;
    }
    for (let i = 1; i <= 99; i++) {
      const pad = i < 10 ? `0${i}` : `${i}`;
      const candidate = `${cleanPrefix}-${pad}`;
      if (!existing.has(candidate)) return candidate;
    }
    return `${cleanPrefix}-${Math.floor(100 + Math.random() * 900)}`;
  };

  const handleRegenerateSessionCode = async (targetClassParam = null, examTypeParam = null) => {
    const targetClass = targetClassParam !== null ? targetClassParam : sessionForm.target_class;
    const examType = examTypeParam !== null ? examTypeParam : sessionForm.exam_type;

    let cleanClass = String(targetClass || (selectedSessionGrade ? `K${selectedSessionGrade}` : 'PHONG'))
      .trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanClass) cleanClass = 'PHONG';
    const typeObj = EXAM_TYPES.find(t => t.id === examType);
    const typeCode = typeObj ? typeObj.code : 'GK';
    const prefix = `${cleanClass}-${typeCode}`;

    try {
      const res = await fetch(`/api/sessions/suggest-code?prefix=${encodeURIComponent(prefix)}`);
      const data = await res.json();
      if (data.success && data.session_code) {
        setSessionForm(prev => ({ ...prev, session_code: data.session_code }));
        return;
      }
    } catch (_) {}
    setSessionForm(prev => ({ ...prev, session_code: computeAutoSessionCode(targetClass, examType) }));
  };

  const isSessionCodeDuplicate = Boolean(
    sessionForm.session_code &&
    sessionForm.session_code.trim().length > 0 &&
    (sessions || []).some(s => 
      s.session_code?.trim().toUpperCase() === sessionForm.session_code.trim().toUpperCase() &&
      s.id !== editingSessionId
    )
  );

  const detectedSiblingVariants = useMemo(() => {
    if (!sessionForm.exam_id) return [];
    const currentExam = exams.find(e => e.id === sessionForm.exam_id);
    if (!currentExam || !currentExam.title) return [];
    
    const cleanPrefix = currentExam.title.replace(/\s*-\s*Mã đề\s*\d+.*$/i, '').trim().toLowerCase();
    const siblings = exams.filter(e => {
      if (!e.title) return false;
      const t = e.title.toLowerCase();
      return (t.includes(cleanPrefix) && t.includes('mã đề')) || e.id === currentExam.id;
    });

    return siblings.length > 1 ? siblings : [];
  }, [sessionForm.exam_id, exams]);

  // Initial load
  useEffect(() => {
    if (editingSessionId) {
      const s = sessions.find(item => item.id === editingSessionId);
      if (s) {
        setIsTitleManuallyEdited(true);
        const isMatrix = s.distribution_mode === 'matrix_dynamic' || Boolean(s.matrix_id && s.generate_per_student);
        let parsedVariants = [];
        if (s.variant_exam_ids_json) {
          try { parsedVariants = JSON.parse(s.variant_exam_ids_json); } catch (e) {}
        }
        const currentClass = s.target_class || '';
        const m = currentClass.match(/^\d+/);
        const grade = m ? m[0] : '10';
        setSelectedSessionGrade(grade);
        const exists = (availableClasses || []).includes(currentClass);
        setIsCustomClass(!exists && Boolean(currentClass));

        setSessionForm({
          distribution_mode: isMatrix ? 'matrix_dynamic' : 'fixed',
          source_type: isMatrix ? 'matrix' : 'exam',
          exam_id: s.exam_id || '',
          matrix_id: s.matrix_id || '',
          variant_exam_ids: parsedVariants,
          generate_per_student: isMatrix ? 1 : 0,
          target_class: currentClass,
          exam_type: s.exam_type || 'GK',
          score_release_mode: s.score_release_mode || 'manual_release',
          session_code: s.session_code,
          title: s.title,
          duration_minutes: s.duration_minutes || 45,
          status: s.status || 'in_progress'
        });
        return;
      }
    }

    // Creating new session
    setIsTitleManuallyEdited(false);
    const isMatrix = Boolean(initialMatrixId);
    const initialExId = initialExamId || (exams.length > 0 ? exams[0].id : '');
    const initialMatId = initialMatrixId || (matrices.length > 0 ? matrices[0].id : '');

    let detectedGrade = '10';
    if (!isMatrix && initialExId) {
      const ex = exams.find(e => e.id === initialExId);
      if (ex?.grade) {
        const m = String(ex.grade).match(/\d+/);
        if (m) detectedGrade = m[0];
      }
    } else if (isMatrix && initialMatId) {
      const mat = matrices.find(m => m.id === initialMatId);
      if (mat?.grade_name) {
        const m = String(mat.grade_name).match(/\d+/);
        if (m) detectedGrade = m[0];
      }
    } else if (availableClasses && availableClasses.length > 0) {
      const m = String(availableClasses[0]).match(/^\d+/);
      if (m) detectedGrade = m[0];
    }

    setSelectedSessionGrade(detectedGrade);
    const classesOfGrade = (availableClasses || []).filter(c => {
      const m = String(c).match(/^\d+/);
      return m ? m[0] === detectedGrade : false;
    });

    let defaultClass = classesOfGrade.length > 0 ? classesOfGrade[0] : `${detectedGrade}A1`;
    setIsCustomClass(classesOfGrade.length === 0);

    const defaultExamType = 'GK';
    const initialCode = computeAutoSessionCode(defaultClass, defaultExamType);
    const initialTitle = computeAutoSessionTitle(
      defaultClass,
      defaultExamType,
      initialExId,
      initialMatId,
      isMatrix ? 'matrix_dynamic' : 'fixed'
    );

    setSessionForm({
      distribution_mode: isMatrix ? 'matrix_dynamic' : 'fixed',
      source_type: isMatrix ? 'matrix' : 'exam',
      exam_id: initialExId,
      matrix_id: initialMatId,
      variant_exam_ids: [],
      generate_per_student: isMatrix ? 1 : 0,
      target_class: defaultClass,
      exam_type: defaultExamType,
      score_release_mode: 'manual_release',
      session_code: initialCode,
      title: initialTitle,
      duration_minutes: 45,
      status: 'waiting'
    });
  }, [editingSessionId, initialExamId, initialMatrixId]);

  const handleSessionGradeChange = (newGrade) => {
    setSelectedSessionGrade(newGrade);
    const classesOfGrade = (availableClasses || []).filter(c => {
      const m = String(c).match(/^\d+/);
      return m ? m[0] === newGrade : false;
    });

    let newClass = '';
    if (classesOfGrade.length > 0) {
      newClass = classesOfGrade[0];
      setIsCustomClass(false);
    } else {
      newClass = `${newGrade}A1`;
      setIsCustomClass(true);
    }

    const newCode = computeAutoSessionCode(newClass, sessionForm.exam_type);
    const newTitle = !isTitleManuallyEdited
      ? computeAutoSessionTitle(newClass, sessionForm.exam_type, sessionForm.exam_id, sessionForm.matrix_id, sessionForm.distribution_mode)
      : sessionForm.title;

    setSessionForm(prev => ({
      ...prev,
      target_class: newClass,
      session_code: newCode,
      title: newTitle
    }));
  };

  const handleSessionClassChange = (newClass) => {
    if (newClass === '__CUSTOM__') {
      setIsCustomClass(true);
      return;
    }
    setIsCustomClass(false);
    const newCode = computeAutoSessionCode(newClass, sessionForm.exam_type);
    const newTitle = !isTitleManuallyEdited
      ? computeAutoSessionTitle(newClass, sessionForm.exam_type, sessionForm.exam_id, sessionForm.matrix_id, sessionForm.distribution_mode)
      : sessionForm.title;

    setSessionForm(prev => ({
      ...prev,
      target_class: newClass,
      session_code: newCode,
      title: newTitle
    }));
  };

  const handleSessionExamTypeChange = (newType) => {
    const newCode = computeAutoSessionCode(sessionForm.target_class, newType);
    const newTitle = !isTitleManuallyEdited
      ? computeAutoSessionTitle(sessionForm.target_class, newType, sessionForm.exam_id, sessionForm.matrix_id, sessionForm.distribution_mode)
      : sessionForm.title;

    setSessionForm(prev => ({
      ...prev,
      exam_type: newType,
      session_code: newCode,
      title: newTitle
    }));
  };

  const handleSelectExamForSession = (examId) => {
    const ex = (exams || []).find(x => x.id === examId);
    let newDuration = sessionForm.duration_minutes;
    if (ex?.duration_minutes) newDuration = ex.duration_minutes;

    const newTitle = !isTitleManuallyEdited
      ? computeAutoSessionTitle(sessionForm.target_class, sessionForm.exam_type, examId, sessionForm.matrix_id, sessionForm.distribution_mode)
      : sessionForm.title;

    setSessionForm(prev => ({
      ...prev,
      exam_id: examId,
      duration_minutes: newDuration,
      title: newTitle
    }));
  };

  const handleSelectMatrixForSession = (matrixId) => {
    const mat = (matrices || []).find(m => m.id === matrixId);
    let newDuration = mat?.duration_minutes || sessionForm.duration_minutes;

    const newTitle = !isTitleManuallyEdited
      ? computeAutoSessionTitle(sessionForm.target_class, sessionForm.exam_type, sessionForm.exam_id, matrixId, 'matrix_dynamic')
      : sessionForm.title;

    setSessionForm(prev => ({
      ...prev,
      matrix_id: matrixId,
      duration_minutes: newDuration,
      title: newTitle
    }));
  };

  const handleSaveSession = async (e) => {
    e.preventDefault();
    if (!sessionForm.session_code || !sessionForm.title) return alert('Vui lòng điền đủ thông tin ca thi!');
    
    const isMatrix = sessionForm.distribution_mode === 'matrix_dynamic';
    if (!isMatrix && !sessionForm.exam_id) return alert('Vui lòng chọn đề thi cho ca thi!');
    if (isMatrix && !sessionForm.matrix_id) return alert('Vui lòng chọn khung ma trận cho ca thi!');

    if (isSessionCodeDuplicate) {
      return alert(`Mã ca thi "${sessionForm.session_code}" đã tồn tại trong hệ thống. Vui lòng bấm "Tạo mã mới" hoặc nhập mã khác!`);
    }

    try {
      const url = editingSessionId ? `/api/sessions/${editingSessionId}` : '/api/sessions';
      const method = editingSessionId ? 'PUT' : 'POST';

      const siblingIds = (!isMatrix && detectedSiblingVariants.length > 1) ? detectedSiblingVariants.map(x => x.id) : null;

      const payload = {
        session_code: sessionForm.session_code.trim().toUpperCase(),
        title: sessionForm.title,
        duration_minutes: sessionForm.duration_minutes,
        status: sessionForm.status,
        target_class: sessionForm.target_class ? sessionForm.target_class.trim() : null,
        exam_type: sessionForm.exam_type || 'GK',
        score_release_mode: sessionForm.score_release_mode || 'manual_release',
        distribution_mode: isMatrix ? 'matrix_dynamic' : 'fixed',
        exam_id: isMatrix ? null : sessionForm.exam_id,
        matrix_id: isMatrix ? sessionForm.matrix_id : null,
        variant_exam_ids: siblingIds || (sessionForm.variant_exam_ids && sessionForm.variant_exam_ids.length > 0 ? sessionForm.variant_exam_ids : null),
        generate_per_student: isMatrix ? 1 : 0
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert(editingSessionId ? 'Đã cập nhật ca thi!' : 'Kích hoạt ca thi mới thành công!');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        alert('Lỗi: ' + data.message);
        if (data.suggested_code) {
          setSessionForm(prev => ({ ...prev, session_code: data.suggested_code }));
        }
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            {editingSessionId ? 'Chỉnh Sửa Ca Thi' : 'Mở Ca Thi Phòng Máy Mới'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveSession} className="space-y-4">
          {/* Kiểu phát đề: Phát theo đề cố định vs Sinh động theo ma trận */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">
              Kiểu Phát Đề Cho Thí Sinh:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setSessionForm({ ...sessionForm, distribution_mode: 'fixed', source_type: 'exam' })}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                  sessionForm.distribution_mode === 'fixed'
                    ? 'bg-blue-50/80 border-blue-500 text-blue-900 ring-1 ring-blue-500 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Phát theo đề cố định</span>
                    {sessionForm.distribution_mode === 'fixed' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Các mã đề 101, 102... chia đều theo số báo danh
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSessionForm({ ...sessionForm, distribution_mode: 'matrix_dynamic', source_type: 'matrix', generate_per_student: 1 })}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                  sessionForm.distribution_mode === 'matrix_dynamic'
                    ? 'bg-indigo-50/80 border-indigo-500 text-indigo-900 ring-1 ring-indigo-500 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Shuffle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Sinh động theo ma trận</span>
                    {sessionForm.distribution_mode === 'matrix_dynamic' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Bốc ngẫu nhiên trực tiếp từ ngân hàng câu hỏi
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Lựa chọn theo kiểu phát đề */}
          {sessionForm.distribution_mode === 'fixed' ? (
            <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Chọn Đề Thi (Hoặc Đề Gốc Trong Bộ):
              </label>
              <select
                value={sessionForm.exam_id || ''}
                onChange={e => handleSelectExamForSession(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 text-sm focus:border-blue-500 focus:outline-none shadow-2xs"
                required={sessionForm.distribution_mode === 'fixed'}
              >
                <option value="">-- Chọn đề thi --</option>
                {exams.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.total_questions} câu • {e.subject || 'Chung'})
                  </option>
                ))}
              </select>

              {sessionForm.exam_id && (
                detectedSiblingVariants.length > 1 ? (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1.5">
                    <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                      <span>✨ Tự động nhận diện bộ gồm {detectedSiblingVariants.length} mã đề hoán vị:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {detectedSiblingVariants.map(v => (
                        <span key={v.id} className="px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-[11px] font-mono text-emerald-800">
                          Mã đề {v.variantCode || v.title.split('- Mã đề ')[1] || v.title}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Hệ thống sẽ <strong>tự động chia đều xoay vòng</strong> các mã đề này theo số báo danh của thí sinh khi vào phòng thi.
                    </p>
                  </div>
                ) : (
                  <div className="mt-1.5 p-2 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-center gap-1.5 shadow-2xs">
                    <span className="text-blue-600 shrink-0">ℹ️</span>
                    <span>Tất cả thí sinh làm chung bộ câu hỏi này. Thứ tự câu hỏi và phương án được xáo trộn tự động chống nhìn bài.</span>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="space-y-3 bg-indigo-50/40 border border-indigo-200 rounded-xl p-3.5">
              <div>
                <label className="block text-xs font-semibold text-indigo-900 uppercase mb-1">
                  Chọn Khung Ma Trận Đề Thi:
                </label>
                {matrices.length === 0 ? (
                  <div className="p-3 bg-white border border-amber-200 rounded-lg text-xs text-amber-800">
                    Chưa có khung ma trận nào. Vui lòng vào tab "Ngân Hàng Câu Hỏi" để thiết lập ma trận đề thi trước.
                  </div>
                ) : (
                  <select
                    value={sessionForm.matrix_id || ''}
                    onChange={e => handleSelectMatrixForSession(e.target.value)}
                    className="w-full bg-white border border-indigo-200 rounded-xl p-2.5 text-slate-800 text-sm focus:border-indigo-500 focus:outline-none shadow-2xs"
                    required={sessionForm.distribution_mode === 'matrix_dynamic'}
                  >
                    <option value="">-- Chọn khung ma trận --</option>
                    {matrices.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.grade_name || ''} - {m.subject_name || ''} • {m.duration_minutes}p • {m.total_score}đ)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="p-2.5 bg-white rounded-lg border border-indigo-100 space-y-1.5 text-xs shadow-2xs">
                <div className="font-bold text-indigo-800 flex items-center gap-1.5">
                  <span>🎲 Bốc câu hỏi ngẫu nhiên theo ma trận:</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Mỗi thí sinh khi bắt đầu làm bài sẽ được bốc một bộ câu hỏi ngẫu nhiên độc lập từ ngân hàng bám sát 100% cấu trúc ma trận (chống gian lận tuyệt đối).
                </p>
                <div className="pt-1.5 border-t border-indigo-100 text-[11px] text-emerald-700 flex items-start gap-1.5">
                  <span className="shrink-0">🔒</span>
                  <span><strong>Lưu vết đề thi:</strong> Toàn bộ đề thi và thứ tự đáp án được lưu cố định vào CSDL bài làm ngay khi vào thi. Thí sinh F5 tải lại trang hay chuyển máy tính vẫn giữ nguyên đề thi cũ.</span>
                </div>
              </div>
            </div>
          )}

          {/* 1. Bổ sung trường chọn "Loại kiểm tra" (Exam Type) */}
          <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                🏷️ Loại Kiểm Tra (Exam Type):
              </label>
              <span className="text-[11px] text-blue-600 font-semibold">
                {EXAM_TYPES.find(t => t.id === sessionForm.exam_type)?.tag || ''}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {EXAM_TYPES.map(type => {
                const isSelected = sessionForm.exam_type === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleSessionExamTypeChange(type.id)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm scale-[1.02]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span className="text-[12px]">{type.label}</span>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                      Tiền tố mã: {type.code}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1.1 Bổ sung trường chọn "Chế độ công bố điểm" (Score Release Mode) */}
          <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                🛡️ Chế Độ Công Bố Điểm (Score Release):
              </label>
              <span className="text-[11px] text-amber-700 font-semibold">
                {SCORE_RELEASE_MODES.find(m => m.id === sessionForm.score_release_mode)?.badge || ''}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {SCORE_RELEASE_MODES.map(mode => {
                const isSelected = sessionForm.score_release_mode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSessionForm(prev => ({ ...prev, score_release_mode: mode.id }))}
                    className={`px-3 py-2.5 rounded-xl text-left transition border cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm scale-[1.01]'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{mode.icon}</span>
                      <span className="text-xs font-bold">{mode.label}</span>
                    </div>
                    <p className={`text-[10px] mt-1 leading-tight ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                      {mode.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Chuẩn hóa ô "Lớp thi mục tiêu" thành Dropdown 2 cấp (Khối -> Lớp) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Cấp 1: Chọn Khối */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                📚 Khối Thi:
              </label>
              <select
                value={selectedSessionGrade}
                onChange={e => handleSessionGradeChange(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold text-sm focus:border-blue-500 focus:outline-none shadow-2xs"
              >
                {availableGrades.map(g => (
                  <option key={g} value={g}>
                    Khối {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Cấp 2: Chọn Lớp trong Khối */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase">
                  🏫 Lớp Thi Mục Tiêu:
                </label>
                {isCustomClass && (
                  <button
                    type="button"
                    onClick={() => {
                      if (classesInSelectedGrade.length > 0) {
                        handleSessionClassChange(classesInSelectedGrade[0]);
                      }
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-medium"
                  >
                    Chọn từ danh sách
                  </button>
                )}
              </div>

              {isCustomClass ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={sessionForm.target_class || ''}
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      setSessionForm(prev => ({
                        ...prev,
                        target_class: val,
                        session_code: computeAutoSessionCode(val, prev.exam_type),
                        title: !isTitleManuallyEdited
                          ? computeAutoSessionTitle(val, prev.exam_type, prev.exam_id, prev.matrix_id, prev.distribution_mode)
                          : prev.title
                      }));
                    }}
                    placeholder={`Ví dụ: ${selectedSessionGrade}A1, ${selectedSessionGrade}A2...`}
                    className="w-full bg-white border border-amber-300 rounded-xl p-2.5 text-slate-800 font-bold text-sm focus:outline-none focus:border-amber-500 shadow-2xs"
                    required
                  />
                  <div className="text-[10px] text-amber-700 italic">
                    Khối {selectedSessionGrade} chưa có lớp trong CSDL, bạn có thể tự do nhập tên lớp.
                  </div>
                </div>
              ) : (
                <select
                  value={sessionForm.target_class || ''}
                  onChange={e => handleSessionClassChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold text-sm focus:border-blue-500 focus:outline-none shadow-2xs"
                  required
                >
                  {classesInSelectedGrade.map(cls => (
                    <option key={cls} value={cls}>
                      Lớp {cls}
                    </option>
                  ))}
                  <option value="__CUSTOM__">✏️ Nhập lớp khác...</option>
                </select>
              )}
              <span className="text-[10px] text-slate-500 italic block mt-1">
                Hồ sơ lưu vào: <strong className="text-slate-700">{sessionForm.target_class || 'Lớp'}/[Tên Ca Thi]</strong>
              </span>
            </div>
          </div>

          {/* 3. Tự động sinh Tên ca & Mã ca thi chuẩn hóa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Mã Ca Thi */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase">
                  Mã Ca Thi (Học sinh nhập):
                </label>
                <button
                  type="button"
                  onClick={() => handleRegenerateSessionCode()}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium hover:underline transition-colors"
                  title="Tự động tạo mã ca thi ngẫu nhiên không trùng"
                >
                  <RotateCw className="w-3 h-3" />
                  Tạo mã mới
                </button>
              </div>
              <input
                type="text"
                value={sessionForm.session_code}
                onChange={e => setSessionForm({ ...sessionForm, session_code: e.target.value.toUpperCase() })}
                placeholder="10A1-GK1"
                className={`w-full bg-white border rounded-xl p-2.5 uppercase font-mono font-bold text-sm transition-all shadow-2xs ${
                  isSessionCodeDuplicate
                    ? 'border-rose-400 bg-rose-50 text-rose-800 focus:ring-rose-400 focus:border-rose-400'
                    : 'border-slate-200 text-slate-800 focus:border-blue-500'
                }`}
                required
              />
              {isSessionCodeDuplicate && (
                <div className="mt-1.5 flex items-center justify-between text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 animate-fadeIn">
                  <span className="flex items-center gap-1 font-medium">
                    ⚠️ Mã <strong>"{sessionForm.session_code}"</strong> đã tồn tại!
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRegenerateSessionCode()}
                    className="text-[11px] text-rose-800 hover:text-rose-950 font-bold underline ml-2 whitespace-nowrap cursor-pointer"
                  >
                    Đổi mã khác
                  </button>
                </div>
              )}
            </div>

            {/* Thời Gian Thi */}
            <div>
              <label className="block text-xs font-semibold text-amber-700 uppercase mb-1">Thời Gian Thi (Phút):</label>
              <input
                type="number"
                min="1"
                max="180"
                value={sessionForm.duration_minutes}
                onChange={e => setSessionForm({ ...sessionForm, duration_minutes: Number(e.target.value) })}
                placeholder="45"
                className="w-full bg-white border border-amber-300 rounded-xl p-2.5 text-amber-900 font-mono font-bold text-sm shadow-2xs focus:border-amber-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Tên Ca Thi */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                Tên Ca Thi:
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsTitleManuallyEdited(false);
                  setSessionForm(prev => ({
                    ...prev,
                    title: computeAutoSessionTitle(prev.target_class, prev.exam_type, prev.exam_id, prev.matrix_id, prev.distribution_mode)
                  }));
                }}
                className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium hover:underline transition-colors"
                title="Tự động đặt lại tên theo công thức: [Khối/Lớp] - [Tên Đề] - [Loại kiểm tra]"
              >
                <RotateCw className="w-3 h-3" />
                Đặt lại tên chuẩn
              </button>
            </div>
            <input
              type="text"
              value={sessionForm.title}
              onChange={e => {
                setIsTitleManuallyEdited(true);
                setSessionForm({ ...sessionForm, title: e.target.value });
              }}
              placeholder="Ví dụ: 10A1 - Tin học 10 - Giữa kỳ"
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 text-sm shadow-2xs focus:border-blue-500 focus:outline-none"
              required
            />
            <span className="text-[10px] text-slate-500 italic block mt-1">
              💡 Gợi ý công thức: <strong className="text-slate-700">[Khối/Lớp] - [Tên Đề] - [Loại kiểm tra]</strong>
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Trạng Thái Ca Thi:</label>
            <select
              value={sessionForm.status}
              onChange={e => setSessionForm({ ...sessionForm, status: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 text-sm shadow-2xs focus:border-blue-500 focus:outline-none"
            >
              <option value="waiting">🟡 Phòng Chờ (Chờ giáo viên bấm Bắt Đầu mới mở đề)</option>
              <option value="in_progress">🟢 Cho Thi Ngay (Học sinh đăng nhập là làm bài luôn)</option>
              {editingSessionId && <option value="finished">🔴 Đã Kết Thúc (Khóa ca thi)</option>}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs cursor-pointer transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSessionCodeDuplicate}
              className={`px-5 py-2 font-bold rounded-xl text-xs shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isSessionCodeDuplicate
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title={isSessionCodeDuplicate ? 'Mã ca thi đang bị trùng, vui lòng đổi mã khác' : ''}
            >
              <CheckCircle2 className="w-4 h-4" />
              {editingSessionId ? 'Lưu Thay Đổi' : 'Kích Hoạt Ca Thi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
