import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Clock, FileText, Layers, ChevronDown, Settings,
  Download, FileUp, Upload, Search, X, RotateCw, Sparkles,
  BookOpen, CheckCircle2
} from 'lucide-react';
import SessionListSection from './SessionListSection';
import ExamListSection from './ExamListSection';
import ExamSessionModal from './ExamSessionModal';
import ExamEditModal from './ExamEditModal';
import SessionStudentsModal from './SessionStudentsModal';
import ExamPreviewModal from './ExamPreviewModal';
import ExamShuffleModal from './ExamShuffleModal';
import MatrixExamGeneratorModal from './MatrixExamGeneratorModal';
import ExamWordImportModal from './ExamWordImportModal';

export const EXAM_TYPES = [
  { id: 'KTTX', code: 'TX', label: 'Thường Xuyên (KTTX)', short: 'KTTX', tag: 'Đánh giá thường xuyên' },
  { id: 'GK', code: 'GK', label: 'Giữa Kỳ (GK)', short: 'Giữa kỳ', tag: 'Đánh giá giữa kỳ' },
  { id: 'CK', code: 'CK', label: 'Cuối Kỳ (CK)', short: 'Cuối kỳ', tag: 'Đánh giá cuối kỳ' }
];

export const STANDARD_GRADES = ['6', '7', '8', '9', '10', '11', '12'];

const FALLBACK_GRADES = [
  { id: 'k6', name: 'Khối 6' },
  { id: 'k7', name: 'Khối 7' },
  { id: 'k8', name: 'Khối 8' },
  { id: 'k9', name: 'Khối 9' },
  { id: 'k10', name: 'Khối 10' },
  { id: 'k11', name: 'Khối 11' },
  { id: 'k12', name: 'Khối 12' }
];

const FALLBACK_SUBJECTS = [
  { id: 'tin_hoc', name: 'Tin học' },
  { id: 'toan', name: 'Toán học' },
  { id: 'vat_li', name: 'Vật lí' },
  { id: 'hoa_hoc', name: 'Hóa học' },
  { id: 'sinh_hoc', name: 'Sinh học' },
  { id: 'ngu_van', name: 'Ngữ văn' },
  { id: 'tieng_anh', name: 'Tiếng Anh' },
  { id: 'lich_su', name: 'Lịch sử' },
  { id: 'dia_li', name: 'Địa lí' },
  { id: 'gdcd', name: 'Giáo dục công dân (GDCD)' }
];

export default function ExamManager({
  mode = 'sessions',
  onSelectSessionForMonitor,
  onSelectSessionForResults,
  onOpenEssayGrading
}) {
  const [exams, setExams] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [matrices, setMatrices] = useState([]);
  const [availableClasses, setAvailableClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importingWord, setImportingWord] = useState(false);

  // Sub-tabs: 'sessions' | 'exams' | 'all' (áp dụng cho mode === 'all' nếu có)
  const [activeSubTab, setActiveSubTab] = useState('sessions');

  // Matrix Generator & GradeSubject picker
  const [gradeSubjects, setGradeSubjects] = useState([]);
  const [pickerGrades, setPickerGrades] = useState(FALLBACK_GRADES);
  const [pickerSubjects, setPickerSubjects] = useState(FALLBACK_SUBJECTS);
  const [pickerGradeId, setPickerGradeId] = useState('k10');
  const [pickerSubjectId, setPickerSubjectId] = useState('tin_hoc');
  const [showGradeSubjectPicker, setShowGradeSubjectPicker] = useState(false);
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [selectedMatrixGs, setSelectedMatrixGs] = useState(null);

  // Exam Search & Filter States (Đưa lên Hàng 3 theo yêu cầu của GV)
  const [examSearch, setExamSearch] = useState('');
  const [examGradeFilter, setExamGradeFilter] = useState('all');
  const [examSubjectFilter, setExamSubjectFilter] = useState('all');
  const [examTypeFilter, setExamTypeFilter] = useState('all');

  // Top bar dropdowns
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);

  // Modals state
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [sessionModalInitialExamId, setSessionModalInitialExamId] = useState(null);

  const [showExamModal, setShowExamModal] = useState(false);
  const [showExamWordImportModal, setShowExamWordImportModal] = useState(false);
  const [editingExamId, setEditingExamId] = useState(null);
  const [initialExamData, setInitialExamData] = useState(null);

  const [previewExamId, setPreviewExamId] = useState(null);
  const [selectedSessionForStudents, setSelectedSessionForStudents] = useState(null);
  const [selectedExamForShuffle, setSelectedExamForShuffle] = useState(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-dropdown]')) {
        setShowCreateMenu(false);
        setShowBackupMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Fetch all initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [resExams, resSessions, resMatrices, resStudents, resGradeSubjects, resGrades, resSubjects] = await Promise.all([
        fetch('/api/exams').then(r => r.json()),
        fetch('/api/sessions').then(r => r.json()),
        fetch('/api/exam-matrices').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/students').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/curriculum/grade-subjects').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/curriculum/grades').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/curriculum/subjects').then(r => r.json()).catch(() => ({ success: false }))
      ]);
      if (resExams.success) setExams(resExams.exams || []);
      if (resSessions.success) setSessions(resSessions.sessions || []);
      if (resMatrices.success) setMatrices(resMatrices.templates || []);
      if (resStudents.success && resStudents.classes) setAvailableClasses(resStudents.classes || []);
      if (resGradeSubjects.success && resGradeSubjects.grade_subjects?.length > 0) {
        setGradeSubjects(resGradeSubjects.grade_subjects);
        setPickerGradeId(prev => prev || resGradeSubjects.grade_subjects[0].grade_id);
        setPickerSubjectId(prev => prev || resGradeSubjects.grade_subjects[0].subject_id);
      }
      if (resGrades.success && resGrades.grades?.length > 0) {
        setPickerGrades(resGrades.grades);
      }
      if (resSubjects.success && resSubjects.subjects?.length > 0) {
        setPickerSubjects(resSubjects.subjects);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- SESSION ACTIONS ---
  const handleOpenCreateSession = (examId = null) => {
    setEditingSessionId(null);
    setSessionModalInitialExamId(examId);
    setShowSessionModal(true);
  };

  const handleOpenEditSession = (session) => {
    setEditingSessionId(session.id);
    setSessionModalInitialExamId(session.exam_id);
    setShowSessionModal(true);
  };

  const handleDeleteSession = async (sessionId, sessionCode) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa ca thi [${sessionCode}]? (Dữ liệu bài làm trong ca này sẽ bị xóa)`)) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.message || 'Không thể xóa ca thi');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFinishSessionDirect = async (sessionId, sessionCode) => {
    if (!confirm(`Bạn có chắc chắn muốn KẾT THÚC CA THI [${sessionCode}]?\n\nHệ thống sẽ thu bài của toàn bộ thí sinh và chuyển trạng thái ca thi sang Đã kết thúc.`)) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/finish`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchData();
      } else {
        alert(data.message || 'Không thể kết thúc ca thi');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReleaseScores = async (sessionId, sessionCode) => {
    if (!confirm(`Bạn có chắc chắn muốn CÔNG BỐ ĐIỂM cho ca thi [${sessionCode}]?\n\nSau khi công bố, học sinh trong ca thi này sẽ được phép xem điểm và kết quả bài làm trên máy tính của mình.`)) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/release-scores`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã công bố điểm cho ca thi thành công!');
        fetchData();
      } else {
        alert(data.message || 'Không thể công bố điểm');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // --- EXAM ACTIONS ---
  const handleOpenCreateExam = () => {
    setEditingExamId(null);
    setInitialExamData(null);
    setShowExamModal(true);
  };

  const handleOpenEditExam = (examId) => {
    setEditingExamId(examId);
    setInitialExamData(null);
    setShowExamModal(true);
  };

  const handleDeleteExam = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn xóa đề thi này? (Các ca thi dùng đề này cũng sẽ bị ảnh hưởng)')) return;
    try {
      const res = await fetch(`/api/exams/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.message || 'Không thể xóa đề thi');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Word file import from top menu
  const handleWordFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setImportingWord(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target.result;
          const res = await fetch('/api/exams/import-word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: base64 })
          });
          const data = await res.json();
          if (data.success) {
            const importedQuestions = data.questions || [];
            const computedTotal = Math.round(importedQuestions.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100;
            const pScores = data.partScores || { part1: 3.0, part2: 2.0, part3: 2.0, part4: 3.0 };

            setEditingExamId(null);
            setInitialExamData({
              title: data.meta?.examTitle || data.title || file.name.replace(/\.[^/.]+$/, ''),
              subject: data.meta?.subjectName || '',
              school_name: data.meta?.schoolName || '',
              school_year: data.meta?.schoolYear || '',
              grade: data.meta?.grade || '',
              note: data.meta?.note || '',
              part_scores_json: pScores,
              total_score: computedTotal > 0 ? computedTotal : 10.0,
              shuffle_questions: 1,
              shuffle_options: 1,
              questions: importedQuestions
            });
            setShowExamModal(true);
            alert(`Đã nhận diện thành công ${importedQuestions.length} câu hỏi chuẩn Bộ GD&ĐT từ file Word! Tổng điểm: ${computedTotal > 0 ? computedTotal : 10.0}đ.`);
          } else {
            alert('Lỗi phân tích file Word: ' + (data.message || 'Không rõ nguyên nhân'));
          }
        } catch (fetchErr) {
          alert('Lỗi kết nối máy chủ khi xử lý file: ' + fetchErr.message);
        } finally {
          setImportingWord(false);
          if (e.target) e.target.value = '';
        }
      };
      reader.onerror = () => {
        alert('Lỗi đọc file từ máy tính');
        setImportingWord(false);
        if (e.target) e.target.value = '';
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert('Không thể đọc file Word: ' + err.message);
      setImportingWord(false);
      if (e.target) e.target.value = '';
    }
  };

  // --- BACKUP & RESTORE ---
  const handleDownloadBackup = async () => {
    try {
      const res = await fetch('/api/system/backup');
      if (!res.ok) throw new Error('Không thể tải file sao lưu từ máy chủ');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Backup_DuLieuThi_LAN_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Lỗi khi tải file sao lưu: ' + err.message);
    }
  };

  const handleRestoreBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = confirm(
      `CẢNH BÁO QUAN TRỌNG:\n` +
      `Bạn sắp khôi phục toàn bộ CSDL và dữ liệu từ file "${file.name}".\n` +
      `Hệ thống sẽ ghi đè CSDL, ngân hàng đề thi và hình ảnh bằng dữ liệu từ bản sao lưu.\n` +
      `Bạn có chắc chắn muốn tiếp tục không?`
    );
    if (!ok) {
      e.target.value = '';
      return;
    }

    try {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target.result;
          const res = await fetch('/api/system/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: base64 })
          });
          const data = await res.json();
          if (data.success) {
            alert(data.message || 'Khôi phục dữ liệu thành công!');
            fetchData();
          } else {
            alert('Lỗi khôi phục: ' + (data.message || 'Không xác định'));
          }
        } catch (err) {
          alert('Lỗi gửi file sao lưu: ' + err.message);
        } finally {
          setLoading(false);
          e.target.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert('Lỗi đọc file sao lưu: ' + err.message);
      setLoading(false);
      e.target.value = '';
    }
  };

  // Trích xuất khối lớp của đề thi cho bộ lọc Hàng 3
  const getExamGrade = (exam) => {
    if (exam.grade) {
      const m = String(exam.grade).match(/\d+/);
      if (m) return m[0];
    }
    const mTitle = (exam.title || '').match(/\b(?:Tin|Toán|Văn|Anh|Lý|Hóa|Sinh|Sử|Địa|GDCD|K|Khối)?\s*(\d{1,2})\b/i);
    if (mTitle && parseInt(mTitle[1], 10) >= 6 && parseInt(mTitle[1], 10) <= 12) {
      return mTitle[1];
    }
    return null;
  };

  const filterExamGradeOptions = useMemo(() => {
    const set = new Set();
    (exams || []).forEach(e => {
      const g = getExamGrade(e);
      if (g) set.add(g);
    });
    if (set.size === 0) STANDARD_GRADES.forEach(g => set.add(g));
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [exams]);

  const filterExamSubjectOptions = useMemo(() => {
    const set = new Set((exams || []).map(e => (e.subject || 'Chung').trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [exams]);

  const hasActiveExamFilters = Boolean(
    examSearch.trim() ||
    examGradeFilter !== 'all' ||
    examSubjectFilter !== 'all' ||
    examTypeFilter !== 'all'
  );

  const handleResetExamFilters = () => {
    setExamSearch('');
    setExamGradeFilter('all');
    setExamSubjectFilter('all');
    setExamTypeFilter('all');
  };

  // --- MATRIX GENERATOR ACTIONS ---
  const handleOpenMatrixModal = () => {
    setShowCreateMenu(false);
    setShowGradeSubjectPicker(true);
  };

  const handleConfirmMatrixGradeSubject = () => {
    const targetGs = gradeSubjects.find(
      gs => gs.grade_id === pickerGradeId && gs.subject_id === pickerSubjectId
    ) || {
      id: `${pickerGradeId}_${pickerSubjectId}`,
      grade_id: pickerGradeId,
      subject_id: pickerSubjectId,
      grade_name: pickerGrades.find(g => g.id === pickerGradeId)?.name || `Khối ${pickerGradeId.replace('k', '')}`,
      subject_name: pickerSubjects.find(s => s.id === pickerSubjectId)?.name || 'Môn học'
    };

    setSelectedMatrixGs(targetGs);
    setShowGradeSubjectPicker(false);
    setShowMatrixModal(true);
  };

  // Phân biệt chế độ hiển thị
  const isExamMode = mode === 'exams';
  const isSessionMode = mode === 'sessions';
  const isAllMode = mode === 'all';

  return (
    <div className="space-y-4">
      {/* DẢI 1 - Hàng thứ 3 cố định: Thanh công cụ chuyên biệt theo ngữ cảnh */}
      <div className="sticky top-[100px] z-20 bg-slate-50/95 backdrop-blur-md pt-2 pb-3 border-b border-slate-200/90 -mx-4 sm:-mx-6 px-4 sm:px-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* ======================= CASE 1: TAB ĐỀ THI ======================= */}
          {isExamMode && (
            <>
              {/* Cụm trái: VÙNG TÌM KIẾM & BỘ LỌC ĐỀ THI */}
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                {/* 1. [🔍 Tìm tên đề, môn học...] */}
                <div className="relative min-w-[160px] max-w-[240px] flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Tìm tên đề, môn học..."
                    value={examSearch}
                    onChange={(e) => setExamSearch(e.target.value)}
                    className="w-full pl-8 pr-7 py-1 h-8 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs transition"
                  />
                  {examSearch && (
                    <button
                      onClick={() => setExamSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 2. [Khối: Tất cả ▼] [Môn: Tất cả ▼] [Loại: Tất cả ▼] */}
                <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                  {/* [Khối: Tất cả ▼] */}
                  <div className="relative">
                    <select
                      value={examGradeFilter}
                      onChange={e => setExamGradeFilter(e.target.value)}
                      className="h-8 appearance-none bg-white border border-slate-200 hover:border-slate-300 rounded-lg pl-2.5 pr-6 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs transition"
                    >
                      <option value="all">Khối: Tất cả</option>
                      {filterExamGradeOptions.map(g => (
                        <option key={g} value={g}>Khối {g}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  {/* [Môn: Tất cả ▼] */}
                  <div className="relative">
                    <select
                      value={examSubjectFilter}
                      onChange={e => setExamSubjectFilter(e.target.value)}
                      className="h-8 appearance-none bg-white border border-slate-200 hover:border-slate-300 rounded-lg pl-2.5 pr-6 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs transition"
                    >
                      <option value="all">Môn: Tất cả</option>
                      {filterExamSubjectOptions.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  {/* [Loại: Tất cả ▼] */}
                  <div className="relative">
                    <select
                      value={examTypeFilter}
                      onChange={e => setExamTypeFilter(e.target.value)}
                      className="h-8 appearance-none bg-white border border-slate-200 hover:border-slate-300 rounded-lg pl-2.5 pr-6 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs transition"
                    >
                      <option value="all">Loại: Tất cả</option>
                      <option value="KTTX">Thường xuyên (TX)</option>
                      <option value="GK">Giữa kỳ (GK)</option>
                      <option value="CK">Cuối kỳ (CK)</option>
                    </select>
                    <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  {/* Nút reset filter */}
                  {hasActiveExamFilters && (
                    <button
                      onClick={handleResetExamFilters}
                      className="h-8 px-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 text-xs transition flex items-center gap-1 shadow-2xs cursor-pointer"
                      title="Xóa bộ lọc để hiện tất cả đề thi"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span className="hidden md:inline text-[11px]">Xóa lọc</span>
                    </button>
                  )}
                </div>

                {/* Badge số lượng đề */}
                <span className="hidden xl:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
                  {exams.length} đề thi
                </span>
              </div>

              {/* Cụm phải: [+ Soạn Đề Mới ⌵] + ⚙ Settings */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Dropdown Soạn Đề ▾ */}
                <div className="relative" data-dropdown>
                  <button
                    onClick={() => {
                      setShowCreateMenu(!showCreateMenu);
                      setShowBackupMenu(false);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs transition shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Soạn Đề Mới</span>
                    <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                  </button>

                  {showCreateMenu && (
                    <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-fadeIn divide-y divide-slate-100">
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setShowCreateMenu(false);
                            handleOpenCreateExam();
                          }}
                          className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                        >
                          <Plus className="w-4 h-4 text-blue-600 shrink-0" />
                          <div>
                            <div>Tạo đề thi cố định</div>
                            <div className="text-[10px] text-slate-400 font-normal">Soạn thủ công hoặc lấy từ ngân hàng</div>
                          </div>
                        </button>

                        <button
                          onClick={handleOpenMatrixModal}
                          className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5 transition cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-indigo-700 font-bold">Sinh đề theo Ma trận chuẩn</span>
                              <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-100 text-indigo-700 font-bold">Hot</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal">Tự động rút câu hỏi & hoán vị mã đề</div>
                          </div>
                        </button>
                      </div>

                      <div className="py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCreateMenu(false);
                            setShowExamWordImportModal(true);
                          }}
                          className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                        >
                          <Upload className="w-4 h-4 text-teal-600 shrink-0" />
                          <div>
                            <div>Nhập đề thi từ file Word (.docx)</div>
                            <div className="text-[10px] text-slate-400 font-normal">Tự động nhận diện cấu trúc đề, thang điểm 10 & xem trước</div>
                          </div>
                        </button>
                      </div>

                      <div className="py-1">
                        <a
                          href="/api/exams/template/download-word?type=tong_hop"
                          download
                          onClick={() => setShowCreateMenu(false)}
                          className="w-full text-left px-3.5 py-2 text-[11px] text-slate-500 hover:bg-slate-50 hover:text-slate-800 flex items-center gap-2.5 transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Tải file Word mẫu đề thi (.docx)</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Settings Gear */}
                <div className="relative" data-dropdown>
                  <button
                    onClick={() => {
                      setShowBackupMenu(!showBackupMenu);
                      setShowCreateMenu(false);
                    }}
                    className="p-2 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition shadow-2xs cursor-pointer"
                    title="Sao lưu & Khôi phục CSDL"
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  {showBackupMenu && (
                    <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-fadeIn divide-y divide-slate-100">
                      <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">
                        Dữ liệu hệ thống
                      </div>
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setShowBackupMenu(false);
                            handleDownloadBackup();
                          }}
                          className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-amber-600" /> Sao lưu toàn bộ (.zip)
                        </button>
                        <label className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer">
                          <FileUp className="w-3.5 h-3.5 text-teal-600" />
                          <span>Khôi phục CSDL từ file .zip</span>
                          <input
                            type="file"
                            accept=".zip"
                            onChange={(e) => {
                              setShowBackupMenu(false);
                              handleRestoreBackup(e);
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ======================= CASE 2: TAB QUẢN LÝ CA THI ======================= */}
          {isSessionMode && (
            <>
              {/* Cụm trái: Tiêu đề & Thông số tổng quan ca thi */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-800">Quản Lý Ca Thi Phòng Máy</h2>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200/80 font-mono">
                      {sessions.length} ca thi
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 hidden sm:block">Giám sát trực tiếp, mở ca, cấp phát đề và thu bài học sinh qua mạng LAN</p>
                </div>
              </div>

              {/* Cụm phải: CHỈ DUY NHẤT 1 Nút [+ Mở Ca Thi Mới] + ⚙ Settings (TUYỆT ĐỐI BỎ NÚT SOẠN ĐỀ) */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleOpenCreateSession()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Mở Ca Thi Mới</span>
                </button>

                {/* Settings Gear */}
                <div className="relative" data-dropdown>
                  <button
                    onClick={() => {
                      setShowBackupMenu(!showBackupMenu);
                      setShowCreateMenu(false);
                    }}
                    className="p-2 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition shadow-2xs cursor-pointer"
                    title="Sao lưu & Khôi phục CSDL"
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  {showBackupMenu && (
                    <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-fadeIn divide-y divide-slate-100">
                      <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">
                        Dữ liệu hệ thống
                      </div>
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setShowBackupMenu(false);
                            handleDownloadBackup();
                          }}
                          className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-amber-600" /> Sao lưu toàn bộ (.zip)
                        </button>
                        <label className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer">
                          <FileUp className="w-3.5 h-3.5 text-teal-600" />
                          <span>Khôi phục CSDL từ file .zip</span>
                          <input
                            type="file"
                            accept=".zip"
                            onChange={(e) => {
                              setShowBackupMenu(false);
                              handleRestoreBackup(e);
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ======================= CASE 3: CHẾ ĐỘ PHỤ SUB-TABS (NẾU CÓ) ======================= */}
          {isAllMode && (
            <>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70 text-xs font-semibold shrink-0">
                <button
                  onClick={() => setActiveSubTab('sessions')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === 'sessions'
                      ? 'bg-white text-blue-700 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Ca Thi ({sessions.length})</span>
                </button>
                <button
                  onClick={() => setActiveSubTab('exams')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === 'exams'
                      ? 'bg-white text-blue-700 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Ngân Hàng Đề ({exams.length})</span>
                </button>
                <button
                  onClick={() => setActiveSubTab('all')}
                  className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === 'all'
                      ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Tất Cả</span>
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleOpenCreateSession()}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" /> Mở Ca Thi
                </button>
              </div>
            </>
          )}

        </div>
      </div>

      {/* KHỐI CA THI PHÒNG MÁY (Chỉ hiển thị khi ở tab Quản lý ca thi hoặc all) */}
      {(isSessionMode || (isAllMode && (activeSubTab === 'sessions' || activeSubTab === 'all'))) && (
        <SessionListSection
          sessions={sessions}
          availableClasses={availableClasses}
          loading={loading}
          onOpenCreateSession={handleOpenCreateSession}
          onOpenEditSession={handleOpenEditSession}
          onSelectSessionForMonitor={onSelectSessionForMonitor}
          onSelectSessionForResults={onSelectSessionForResults}
          onOpenEssayGrading={onOpenEssayGrading}
          onOpenStudentsModal={setSelectedSessionForStudents}
          onFinishSession={handleFinishSessionDirect}
          onReleaseScores={handleReleaseScores}
          onDeleteSession={handleDeleteSession}
        />
      )}

      {/* KHỐI NGÂN HÀNG ĐỀ THI (Chỉ hiển thị khi ở tab Đề thi hoặc all) */}
      {(isExamMode || (isAllMode && (activeSubTab === 'exams' || activeSubTab === 'all'))) && (
        <ExamListSection
          exams={exams}
          loading={loading}
          examSearch={examSearch}
          setExamSearch={setExamSearch}
          examGradeFilter={examGradeFilter}
          setExamGradeFilter={setExamGradeFilter}
          examSubjectFilter={examSubjectFilter}
          setExamSubjectFilter={setExamSubjectFilter}
          examTypeFilter={examTypeFilter}
          setExamTypeFilter={setExamTypeFilter}
          onOpenCreateSessionForExam={handleOpenCreateSession}
          onOpenEditExam={handleOpenEditExam}
          onPreviewExam={setPreviewExamId}
          onOpenShuffleExam={setSelectedExamForShuffle}
          onDeleteExam={handleDeleteExam}
        />
      )}

      {/* Modal Mở / Sửa Ca Thi */}
      <ExamSessionModal
        isOpen={showSessionModal}
        onClose={() => setShowSessionModal(false)}
        editingSessionId={editingSessionId}
        initialExamId={sessionModalInitialExamId}
        sessions={sessions}
        exams={exams}
        matrices={matrices}
        availableClasses={availableClasses}
        onSuccess={fetchData}
      />

      {/* Modal Soạn / Sửa Đề Thi */}
      <ExamEditModal
        isOpen={showExamModal}
        onClose={() => setShowExamModal(false)}
        editingExamId={editingExamId}
        initialData={initialExamData}
        onSuccess={fetchData}
      />

      {/* Modal Xem trước đề thi trực quan */}
      {previewExamId && (
        <ExamPreviewModal
          examId={previewExamId}
          onClose={() => setPreviewExamId(null)}
          onOpenCreateSession={(eId) => {
            setPreviewExamId(null);
            handleOpenCreateSession(eId);
          }}
          onOpenEditFull={(eId) => {
            setPreviewExamId(null);
            handleOpenEditExam(eId);
          }}
        />
      )}

      {/* Modal Quản lý danh sách thí sinh trong ca thi */}
      {selectedSessionForStudents && (
        <SessionStudentsModal
          session={selectedSessionForStudents}
          onClose={() => setSelectedSessionForStudents(null)}
          onUpdated={fetchData}
        />
      )}

      {/* Modal Trộn Đề Hoán Vị Từ Đề Gốc */}
      {selectedExamForShuffle && (
        <ExamShuffleModal
          isOpen={Boolean(selectedExamForShuffle)}
          onClose={() => setSelectedExamForShuffle(null)}
          exam={selectedExamForShuffle}
          onSuccess={fetchData}
        />
      )}

      {/* Modal Chọn Khối & Môn Học Sinh Đề Theo Ma Trận */}
      {showGradeSubjectPicker && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/80 to-indigo-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Sinh Đề Thi Theo Ma Trận Chuẩn</h3>
                  <p className="text-[11px] text-slate-500">Chọn khối lớp và môn học để nạp ma trận đặc tả & ngân hàng câu hỏi</p>
                </div>
              </div>
              <button
                onClick={() => setShowGradeSubjectPicker(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Dropdown selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Khối Lớp</label>
                  <select
                    value={pickerGradeId}
                    onChange={e => setPickerGradeId(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {pickerGrades.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Môn Học</label>
                  <select
                    value={pickerSubjectId}
                    onChange={e => setPickerSubjectId(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {pickerSubjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick select list of available GradeSubjects */}
              {gradeSubjects.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Hoặc chọn nhanh môn học sẵn có ({gradeSubjects.length})
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {gradeSubjects.map(gs => {
                      const isSelected = gs.grade_id === pickerGradeId && gs.subject_id === pickerSubjectId;
                      return (
                        <button
                          key={gs.id}
                          type="button"
                          onClick={() => {
                            setPickerGradeId(gs.grade_id);
                            setPickerSubjectId(gs.subject_id);
                          }}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500 text-blue-900 shadow-2xs'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700">
                              {gs.grade_name}
                            </span>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                          </div>
                          <span className="text-xs font-semibold truncate" title={gs.subject_name}>
                            {gs.subject_name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGradeSubjectPicker(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmMatrixGradeSubject}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" /> Tiếp Tục Mở Ma Trận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sinh Đề Theo Ma Trận Đặc Tả */}
      {showMatrixModal && selectedMatrixGs && (
        <MatrixExamGeneratorModal
          isOpen={showMatrixModal}
          onClose={() => setShowMatrixModal(false)}
          gradeSubject={selectedMatrixGs}
          onGenerated={() => {
            fetchData();
            setShowMatrixModal(false);
          }}
        />
      )}

      {/* Modal Nhập Đề Thi Từ Word (.docx) Chuyên Biệt */}
      {showExamWordImportModal && (
        <ExamWordImportModal
          isOpen={showExamWordImportModal}
          onClose={() => setShowExamWordImportModal(false)}
          onImportSuccess={() => {
            fetchData();
          }}
        />
      )}
    </div>
  );
}
