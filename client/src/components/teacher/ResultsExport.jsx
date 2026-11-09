import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Download,
  Award,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  Users,
  BookOpen,
  Clock,
  Lock,
  FileText,
  Printer,
  Sliders,
  Archive,
  Wrench,
  Folder,
  FolderArchive,
  FolderOpen,
  ExternalLink,
  Search,
  X,
  ChevronDown,
  Eye,
  BarChart3,
  Filter
} from 'lucide-react';
import StudentPaperModal from './StudentPaperModal';
import AdjustAnswersModal from './AdjustAnswersModal';
import { formatToLocalTime } from '../../utils/timeFormat';

// Trích xuất Khối lớp chính xác từ thông tin ca thi (target_class, code, title, exam_title, student_class)
export function extractSessionGrade(s) {
  if (!s) return 'Khác';

  if (s.exam_grade) {
    const m = String(s.exam_grade).match(/\b(6|7|8|9|10|11|12)\b/);
    if (m) return `Khối ${m[1]}`;
  }
  if (s.target_class) {
    const m = String(s.target_class).match(/(?:khối|k)?\s*(1[0-2]|[6-9])(?![0-9])/i);
    if (m) return `Khối ${m[1]}`;
  }
  if (s.student_class) {
    const m = String(s.student_class).match(/(?:khối|k)?\s*(1[0-2]|[6-9])(?![0-9])/i);
    if (m) return `Khối ${m[1]}`;
  }
  if (s.session_code) {
    const m = String(s.session_code).match(/^(1[0-2]|[6-9])[A-Za-z]/i);
    if (m) return `Khối ${m[1]}`;
  }
  const titles = [s.exam_title, s.matrix_title, s.title].filter(Boolean).join(' ');
  const mTitle = titles.match(/(?:khối|k|lớp|tin|toán|vật lí|hóa|sinh|sử|địa|tiếng anh)?\s*(1[0-2]|[6-9])(?![0-9])/i);
  if (mTitle) return `Khối ${mTitle[1]}`;

  const mCode = String(s.session_code || '').match(/(1[0-2]|[6-9])/);
  if (mCode) return `Khối ${mCode[1]}`;

  return 'Khác';
}

const gradeBadgeStyles = {
  'Khối 6': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Khối 7': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Khối 8': 'bg-teal-50 text-teal-700 border-teal-200',
  'Khối 9': 'bg-blue-50 text-blue-700 border-blue-200',
  'Khối 10': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Khối 11': 'bg-violet-50 text-violet-700 border-violet-200',
  'Khối 12': 'bg-purple-50 text-purple-700 border-purple-200',
  'Khác': 'bg-slate-100 text-slate-700 border-slate-200'
};

export default function ResultsExport({ sessionId, onSelectSession, onBack, onOpenEssayGrading }) {
  const [sessionsList, setSessionsList] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(sessionId || '');
  const [session, setSession] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingAttemptId, setViewingAttemptId] = useState(null);
  const [autoPrintMode, setAutoPrintMode] = useState(false);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Archive Tree State
  const [showArchiveTreeModal, setShowArchiveTreeModal] = useState(false);
  const [archiveTree, setArchiveTree] = useState([]);
  const [loadingArchiveTree, setLoadingArchiveTree] = useState(false);

  // Cascading Filter & Searchable Combobox State
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('all'); // 'all' | 'Khối 7' | ...
  const [isSessionComboboxOpen, setIsSessionComboboxOpen] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  const searchInputRef = React.useRef(null);

  // Dropdown & Filters State
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'passed' | 'failed' | 'violation'
  const [selectedScoreBand, setSelectedScoreBand] = useState('all'); // 'all' | 'kem' | 'yeu' | 'tb' | 'kha' | 'gioi'

  // Click outside to close export menu and session combobox
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-dropdown]')) {
        setShowExportMenu(false);
      }
      if (!e.target.closest('[data-combobox]')) {
        setIsSessionComboboxOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsSessionComboboxOpen(false);
        setShowExportMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto focus search input when combobox opens
  useEffect(() => {
    if (isSessionComboboxOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isSessionComboboxOpen]);

  // Fetch all sessions for dropdown selector
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.sessions) {
          setSessionsList(data.sessions);
          if (!selectedSessionId && data.sessions.length > 0) {
            setSelectedSessionId(data.sessions[0].id);
            if (onSelectSession) onSelectSession(data.sessions[0].id);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Enrich sessionsList with extracted grade
  const sessionsWithGrade = React.useMemo(() => {
    return sessionsList.map(s => ({
      ...s,
      gradeName: extractSessionGrade(s)
    }));
  }, [sessionsList]);

  // Unique available grades for cascading filter
  const availableGrades = React.useMemo(() => {
    const map = {};
    sessionsWithGrade.forEach(s => {
      const g = s.gradeName || 'Khác';
      map[g] = (map[g] || 0) + 1;
    });

    const gradeOrder = (g) => {
      const num = parseInt(g.replace(/\D/g, ''), 10);
      return isNaN(num) ? 999 : num;
    };

    return Object.keys(map)
      .sort((a, b) => gradeOrder(a) - gradeOrder(b))
      .map(name => ({
        name,
        count: map[name]
      }));
  }, [sessionsWithGrade]);

  // Current session object
  const currentSession = React.useMemo(() => {
    return sessionsWithGrade.find(s => s.id === selectedSessionId) || session;
  }, [sessionsWithGrade, selectedSessionId, session]);

  // Update selected session when prop changes
  useEffect(() => {
    if (sessionId && sessionId !== selectedSessionId) {
      setSelectedSessionId(sessionId);
      const targetSession = sessionsWithGrade.find(s => s.id === sessionId);
      if (targetSession && selectedGradeFilter !== 'all' && targetSession.gradeName !== selectedGradeFilter) {
        setSelectedGradeFilter(targetSession.gradeName);
      }
    }
  }, [sessionId, sessionsWithGrade]);

  // Fetch results whenever selectedSessionId changes
  useEffect(() => {
    if (!selectedSessionId) return;

    const fetchResults = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/teacher/sessions/${selectedSessionId}/live`);
        const data = await res.json();
        if (data.success) {
          setSession(data.session);
          setStudents(data.students || []);
        }
      } catch (err) {
        console.error('Fetch results error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [selectedSessionId, refreshKey]);

  const handleSessionChange = (newId) => {
    setSelectedSessionId(newId);
    setSelectedScoreBand('all');
    setStatusFilter('all');
    setSearchQuery('');
    if (onSelectSession) onSelectSession(newId);
  };

  // Handle cascading grade filter change
  const handleGradeFilterChange = (newGrade) => {
    setSelectedGradeFilter(newGrade);
    setSessionSearchQuery('');

    if (newGrade !== 'all') {
      const currentSelected = sessionsWithGrade.find(s => s.id === selectedSessionId);
      if (!currentSelected || currentSelected.gradeName !== newGrade) {
        const firstInGrade = sessionsWithGrade.find(s => s.gradeName === newGrade);
        if (firstInGrade) {
          handleSessionChange(firstInGrade.id);
        }
      }
    }
  };

  // Filter sessions by Grade & Search Query for Combobox
  const filteredSessionsForCombobox = React.useMemo(() => {
    // 1. Grade filter
    const gradeFiltered = selectedGradeFilter === 'all'
      ? sessionsWithGrade
      : sessionsWithGrade.filter(s => s.gradeName === selectedGradeFilter);

    // 2. Search query filter
    if (!sessionSearchQuery.trim()) return gradeFiltered;
    const q = sessionSearchQuery.toLowerCase().trim();
    return gradeFiltered.filter(s => {
      return (
        (s.session_code || '').toLowerCase().includes(q) ||
        (s.target_class || '').toLowerCase().includes(q) ||
        (s.title || '').toLowerCase().includes(q) ||
        (s.exam_title || '').toLowerCase().includes(q) ||
        (s.student_class || '').toLowerCase().includes(q) ||
        (s.gradeName || '').toLowerCase().includes(q)
      );
    });
  }, [sessionsWithGrade, selectedGradeFilter, sessionSearchQuery]);

  // Group by Grade for Combobox Popover
  const groupedSessions = React.useMemo(() => {
    const groups = {};
    const gradeOrder = (g) => {
      const num = parseInt(g.replace(/\D/g, ''), 10);
      return isNaN(num) ? 999 : num;
    };

    filteredSessionsForCombobox.forEach(s => {
      const g = s.gradeName || 'Khác';
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });

    return Object.keys(groups)
      .sort((a, b) => gradeOrder(a) - gradeOrder(b))
      .map(grade => ({
        grade,
        sessions: groups[grade]
      }));
  }, [filteredSessionsForCombobox]);

  const handleSelectSessionFromCombobox = (sessionItem) => {
    handleSessionChange(sessionItem.id);
    setIsSessionComboboxOpen(false);
  };

  const handleDownloadExcel = () => {
    if (!selectedSessionId) return;
    window.open(`/api/teacher/sessions/${selectedSessionId}/export-excel`, '_blank');
  };

  const handleDownloadZip = () => {
    if (!selectedSessionId) return;
    window.open(`/api/teacher/sessions/${selectedSessionId}/export-submissions-zip`, '_blank');
  };

  const handleDownloadClassArchive = () => {
    if (!selectedSessionId) return;
    window.open(`/api/sessions/${selectedSessionId}/archive-zip`, '_blank');
  };

  const handleOpenArchiveTree = async () => {
    setShowArchiveTreeModal(true);
    setLoadingArchiveTree(true);
    try {
      const res = await fetch('/api/archive/tree');
      const data = await res.json();
      if (data.success) {
        setArchiveTree(data.tree || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingArchiveTree(false);
    }
  };

  const handleOpenFolderOnHost = async (relativeFolder = '') => {
    try {
      const res = await fetch('/api/archive/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relativeFolder })
      });
      const data = await res.json();
      if (!data.success) alert(data.message);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDownloadKeyboardTool = () => {
    window.open('/tools/Chuan_Hoa_Ban_Phim_Phong_May.bat', '_blank');
  };

  // Calculations
  const submittedStudents = students.filter(s => s.status === 'submitted' || s.status === 'forced_submitted');
  const scores = submittedStudents.map(s => s.total_score || 0);
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '0.00';
  const maxScore = scores.length > 0 ? Math.max(...scores).toFixed(1) : '0.0';
  const minScore = scores.length > 0 ? Math.min(...scores).toFixed(1) : '0.0';
  const passCount = scores.filter(sc => sc >= 5.0).length;
  const passRate = scores.length > 0 ? Math.round((passCount / scores.length) * 100) : 0;
  const failCount = submittedStudents.length - passCount;
  const violationCount = students.filter(s => (s.violations_count || 0) > 0).length;

  // 5 Score Bands (Bar Chart)
  const scoreBands = [
    {
      key: 'kem',
      label: 'Kém',
      range: '< 3.5',
      color: 'bg-rose-500',
      textColor: 'text-rose-400',
      borderColor: 'border-rose-500/50',
      activeBg: 'bg-rose-950/80',
      count: submittedStudents.filter(s => (s.total_score || 0) < 3.5).length
    },
    {
      key: 'yeu',
      label: 'Yếu',
      range: '3.5 - 4.9',
      color: 'bg-orange-500',
      textColor: 'text-orange-400',
      borderColor: 'border-orange-500/50',
      activeBg: 'bg-orange-950/80',
      count: submittedStudents.filter(s => (s.total_score || 0) >= 3.5 && (s.total_score || 0) < 5.0).length
    },
    {
      key: 'tb',
      label: 'TB',
      range: '5.0 - 6.4',
      color: 'bg-amber-500',
      textColor: 'text-amber-400',
      borderColor: 'border-amber-500/50',
      activeBg: 'bg-amber-950/80',
      count: submittedStudents.filter(s => (s.total_score || 0) >= 5.0 && (s.total_score || 0) < 6.5).length
    },
    {
      key: 'kha',
      label: 'Khá',
      range: '6.5 - 7.9',
      color: 'bg-sky-500',
      textColor: 'text-sky-400',
      borderColor: 'border-sky-500/50',
      activeBg: 'bg-sky-950/80',
      count: submittedStudents.filter(s => (s.total_score || 0) >= 6.5 && (s.total_score || 0) < 8.0).length
    },
    {
      key: 'gioi',
      label: 'Giỏi',
      range: '≥ 8.0',
      color: 'bg-emerald-500',
      textColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/50',
      activeBg: 'bg-emerald-950/80',
      count: submittedStudents.filter(s => (s.total_score || 0) >= 8.0).length
    }
  ];

  const maxBandCount = Math.max(...scoreBands.map(b => b.count), 1);

  const bandLabelMap = {
    kem: 'Kém (< 3.5)',
    yeu: 'Yếu (3.5 - 4.9)',
    tb: 'TB (5.0 - 6.4)',
    kha: 'Khá (6.5 - 7.9)',
    gioi: 'Giỏi (≥ 8.0)'
  };

  // Filtered Students List
  const filteredStudents = students.filter(st => {
    // 1. Tìm kiếm theo Tên, SBD, Lớp, IP
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (st.student_name || '').toLowerCase().includes(q);
      const matchCode = (st.student_code || '').toLowerCase().includes(q);
      const matchClass = (st.class_name || '').toLowerCase().includes(q);
      const matchIp = (st.client_ip || '').toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchClass && !matchIp) return false;
    }

    // 2. Filter Pills trạng thái
    if (statusFilter === 'passed') {
      if ((st.total_score || 0) < 5.0) return false;
    } else if (statusFilter === 'failed') {
      if ((st.total_score || 0) >= 5.0) return false;
    } else if (statusFilter === 'violation') {
      if ((st.violations_count || 0) === 0) return false;
    }

    // 3. Filter dải điểm từ Bar Chart
    if (selectedScoreBand !== 'all') {
      const sc = st.total_score || 0;
      if (selectedScoreBand === 'kem' && sc >= 3.5) return false;
      if (selectedScoreBand === 'yeu' && (sc < 3.5 || sc >= 5.0)) return false;
      if (selectedScoreBand === 'tb' && (sc < 5.0 || sc >= 6.5)) return false;
      if (selectedScoreBand === 'kha' && (sc < 6.5 || sc >= 8.0)) return false;
      if (selectedScoreBand === 'gioi' && sc < 8.0) return false;
    }

    return true;
  });

  return (
    <div className="space-y-4">
      {/* 1. Header & Actions Tinh Gọn 1 Hàng Duy Nhất (Hàng thứ 3 cố định) */}
      <div className="sticky top-[100px] z-20 bg-slate-50/95 backdrop-blur-md pt-2 pb-3 border-b border-slate-200/90 -mx-4 sm:-mx-6 px-4 sm:px-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Hàng 1 bên trái: Nút Back + Tiêu đề + Dropdown Chọn Ca Thi */}
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <button
            onClick={onBack}
            className="p-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg transition border border-slate-200 shadow-2xs shrink-0 cursor-pointer"
            title="Quay lại danh sách ca thi"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
              <Award className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight whitespace-nowrap">
              Báo Cáo Điểm Thi
            </h2>
          </div>

          {/* Cascading Dropdown: Bộ lọc Khối & Searchable Combobox Chọn Ca Thi */}
          <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200/80 rounded-lg p-0.5 text-xs shadow-2xs">
            {/* 1. Cascading Dropdown: [Tất cả khối ▾] */}
            <div className="relative">
              <select
                value={selectedGradeFilter}
                onChange={e => handleGradeFilterChange(e.target.value)}
                className="bg-white hover:bg-slate-50 text-blue-700 font-bold border border-slate-200 rounded-md pl-2.5 pr-6 py-1.5 text-xs cursor-pointer focus:outline-none focus:border-blue-600 appearance-none transition shadow-2xs"
                title="Lọc nhanh ca thi theo Khối lớp"
              >
                <option value="all">Tất cả khối ({sessionsList.length})</option>
                {availableGrades.map(g => (
                  <option key={g.name} value={g.name}>
                    {g.name} ({g.count})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-blue-600 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-80" />
            </div>

            {/* 2. Searchable Combobox Chọn Ca Thi */}
            <div className="relative" data-combobox>
              <button
                type="button"
                onClick={() => {
                  setIsSessionComboboxOpen(!isSessionComboboxOpen);
                  setSessionSearchQuery('');
                }}
                className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-800 font-bold cursor-pointer transition text-xs focus:outline-none focus:border-blue-600 max-w-[200px] sm:max-w-[260px] text-left shadow-2xs"
                title="Chọn ca thi cần xem báo cáo (hỗ trợ tìm kiếm & phân nhóm theo khối)"
              >
                {currentSession ? (
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[11px] shrink-0 font-bold">
                      #{currentSession.session_code}
                    </span>
                    <span className="truncate text-slate-800 font-medium">
                      {currentSession.target_class ? `Lớp ${currentSession.target_class}` : (currentSession.exam_title || currentSession.title)}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400">Chọn ca thi...</span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-auto shrink-0 transition-transform duration-150 ${isSessionComboboxOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Popover Xổ Xuống */}
              {isSessionComboboxOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-fadeIn text-slate-800">
                  {/* Ô Input Tìm Kiếm Nhanh */}
                  <div className="p-2.5 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-20">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={sessionSearchQuery}
                        onChange={e => setSessionSearchQuery(e.target.value)}
                        placeholder="Tìm mã ca, tên lớp, tên đề..."
                        className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs"
                      />
                      {sessionSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setSessionSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                          title="Xóa tìm kiếm"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {selectedGradeFilter !== 'all' && (
                      <div className="flex items-center justify-between mt-2 pt-1.5 px-1 text-[11px] text-slate-500 border-t border-slate-200">
                        <span>Đang lọc theo: <span className="text-blue-600 font-bold">{selectedGradeFilter}</span></span>
                        <button
                          type="button"
                          onClick={() => setSelectedGradeFilter('all')}
                          className="text-[11px] text-blue-600 hover:text-blue-800 underline cursor-pointer font-medium"
                        >
                          Xem tất cả khối
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Danh Sách Ca Thi Group Theo Khối */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {groupedSessions.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        <Filter className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                        <p className="font-bold text-slate-700">Không tìm thấy ca thi phù hợp</p>
                        <p className="text-[11px] text-slate-400 mt-1">Thử đổi từ khóa hoặc chọn "Tất cả khối"</p>
                      </div>
                    ) : (
                      groupedSessions.map(group => (
                        <div key={group.grade} className="bg-white">
                          {/* Header Nhóm Khối */}
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-y border-slate-200/80 sticky top-0 z-10">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              {group.grade.toUpperCase()}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {group.sessions.length} ca thi
                            </span>
                          </div>

                          {/* Danh Sách Các Ca Thi trong Khối */}
                          <div className="divide-y divide-slate-100">
                            {group.sessions.map(s => {
                              const isSelected = s.id === selectedSessionId;
                              return (
                                <button
                                  type="button"
                                  key={s.id}
                                  onClick={() => handleSelectSessionFromCombobox(s)}
                                  className={`w-full text-left px-3 py-2 text-xs transition flex items-start gap-2.5 cursor-pointer ${
                                    isSelected
                                      ? 'bg-blue-50/80 border-l-3 border-blue-600 text-blue-900'
                                      : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 font-mono font-bold text-blue-700 text-[11px]">
                                        #{s.session_code}
                                      </span>
                                      {s.target_class && (
                                        <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                                          Lớp {s.target_class}
                                        </span>
                                      )}
                                      <span className="text-slate-400 text-[10px] ml-auto">
                                        {s.student_count || 0} HS
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-800 font-medium truncate mt-1" title={s.title}>
                                      {s.title}
                                    </div>
                                    {s.exam_title && s.exam_title !== s.title && (
                                      <div className="text-[10px] text-slate-500 truncate mt-0.5" title={s.exam_title}>
                                        Đề: {s.exam_title}
                                      </div>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Text Badges Thông Tin Ca Thi Kế Bên */}
            {session && (
              <div className="hidden lg:flex items-center gap-1.5 pr-1.5 text-[11px]">
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold">
                  #{session.session_code}
                </span>
                {session.target_class && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                    Lớp {session.target_class}
                  </span>
                )}
                <span className="text-slate-700 font-bold truncate max-w-[130px] xl:max-w-[170px]" title={session.exam_title || session.title}>
                  {session.exam_title || session.title}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium flex items-center gap-0.5">
                  <Clock className="w-3 h-3 text-amber-600" /> {session.duration_minutes || 45}p
                </span>
                {session.status === 'finished' ? (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-slate-400" /> Đã kết thúc
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Đang thi
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Hàng 1 bên phải: Nhóm nút hành động */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Primary: ✍️ Chấm Điểm Tự Luận */}
          <button
            onClick={() => onOpenEssayGrading(selectedSessionId)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1 cursor-pointer"
          >
            <span>✍️</span> Chấm Tự Luận
          </button>

          {/* Secondary: Điều Chỉnh Đáp Án */}
          <button
            onClick={() => setShowAdjustModal(true)}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition border border-slate-200 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Điều chỉnh đáp án ca thi & chấm lại tự động"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-600" /> Điều Chỉnh Đáp Án
          </button>

          {/* Nút 📊 Bảng Điểm Excel */}
          <button
            onClick={handleDownloadExcel}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            title="Tải bảng điểm tổng hợp Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" /> Bảng Điểm Excel
          </button>

          {/* Menu Xuất Hồ Sơ ▾ (Dropdown) */}
          <div className="relative" data-dropdown>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <FolderArchive className="w-3.5 h-3.5" /> Xuất Hồ Sơ <ChevronDown className="w-3 h-3 ml-0.5" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-fadeIn divide-y divide-slate-100">
                <div className="py-1">
                  {/* 1. PDF Gộp */}
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      setIsBatchPrinting(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>In Toàn Bộ (PDF Gộp)</span>
                  </button>

                  {/* 2. ZIP cả lớp */}
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      handleDownloadClassArchive();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5 text-teal-600" />
                    <span>Tải Hồ Sơ Lớp (.zip)</span>
                  </button>

                  {/* 3. ZIP từng SBD */}
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      handleDownloadZip();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <FolderArchive className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Xuất File ZIP (Từng SBD)</span>
                  </button>
                </div>

                <div className="py-1">
                  {/* 4. Cây thư mục */}
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      handleOpenArchiveTree();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
                    <span>Cây Thư Mục Hồ Sơ</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Icon button nhỏ cho Tool Bàn Phím (.bat) */}
          <button
            onClick={handleDownloadKeyboardTool}
            className="p-1.5 bg-white hover:bg-slate-50 text-amber-600 rounded-lg border border-slate-200 transition shadow-2xs cursor-pointer"
            title="Tải công cụ chuẩn hóa bàn phím phòng máy (.bat) - Khóa bàn phím English US"
          >
            <Wrench className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

      {/* 2. Dashboard Phân Tích Trực Quan (Grid 2 Cột: Cột 1 KPI 2x2 - Cột 2 Biểu Đồ Phổ Điểm) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Cột 1 (Trái - 5 cols): 4 thẻ KPI compact dạng lưới 2x2 Light Mode */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-3">
          {/* Card 1: Đã Nộp */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Đã Nộp Bài</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-900">{submittedStudents.length}</span>
              <span className="text-xs text-slate-500 font-semibold">/ {students.length} HS</span>
            </div>
            <span className="text-[11px] text-blue-600 font-bold mt-0.5">
              {students.length > 0 ? Math.round((submittedStudents.length / students.length) * 100) : 0}% hoàn thành
            </span>
          </div>

          {/* Card 2: Điểm TB */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Điểm TB</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Award className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-600">{avgScore}</span>
              <span className="text-xs text-slate-400 font-semibold">/ 10.0</span>
            </div>
            <span className="text-[11px] text-emerald-700 font-bold mt-0.5">
              {passRate}% đạt chuẩn (≥ 5.0)
            </span>
          </div>

          {/* Card 3: Cao / Thấp Nhất */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cao / Thấp</span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Sliders className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600">{maxScore}</span>
              <span className="text-slate-300 font-bold text-sm">/</span>
              <span className="text-2xl font-black text-rose-600">{minScore}</span>
            </div>
            <span className="text-[11px] text-slate-500 font-semibold mt-0.5">
              Biên độ: {Math.abs(Number(maxScore) - Number(minScore)).toFixed(1)}đ
            </span>
          </div>

          {/* Card 4: Tỷ Lệ Đạt */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tỷ Lệ Đạt</span>
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-2xl font-black text-teal-700">{passRate}%</span>
            </div>
            <span className="text-[11px] text-teal-700 font-bold mt-0.5">
              {passCount} / {submittedStudents.length} bài đạt ≥ 5.0
            </span>
          </div>
        </div>

        {/* Cột 2 (Phải - 7 cols): Biểu đồ Phổ Điểm dạng Bar Chart Light Mode */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs">
          {/* Header Bar Chart */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Biểu Đồ Phổ Điểm Ca Thi
              </h3>
            </div>
            <div>
              {selectedScoreBand !== 'all' ? (
                <button
                  onClick={() => setSelectedScoreBand('all')}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition cursor-pointer"
                  title="Hủy lọc theo dải điểm này"
                >
                  <X className="w-3 h-3" /> Bỏ lọc phổ điểm ({bandLabelMap[selectedScoreBand]})
                </button>
              ) : (
                <span className="text-[11px] text-slate-400 italic">
                  (Nhấp vào từng cột để lọc danh sách học sinh)
                </span>
              )}
            </div>
          </div>

          {/* 5 Cột Phổ Điểm */}
          <div className="grid grid-cols-5 gap-2 pt-2 items-end min-h-[110px]">
            {scoreBands.map(band => {
              const isSelected = selectedScoreBand === band.key;
              const isDimmed = selectedScoreBand !== 'all' && !isSelected;
              const percent = submittedStudents.length > 0 ? Math.round((band.count / submittedStudents.length) * 100) : 0;
              const heightPercent = maxBandCount > 0 ? Math.max(8, Math.round((band.count / maxBandCount) * 58)) : 8;

              return (
                <button
                  key={band.key}
                  type="button"
                  onClick={() => setSelectedScoreBand(selectedScoreBand === band.key ? 'all' : band.key)}
                  className={`group flex flex-col items-center justify-end p-2 rounded-xl transition-all text-center focus:outline-none cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 border border-blue-200 ring-2 ring-blue-500/30 shadow-xs'
                      : isDimmed
                      ? 'opacity-35 hover:opacity-75'
                      : 'hover:bg-slate-50'
                  }`}
                  title={`Dải ${band.label} (${band.range}): ${band.count} học sinh (${percent}%). Bấm để lọc.`}
                >
                  {/* Số lượng HS & % */}
                  <span className="text-xs font-extrabold text-slate-800 leading-tight">
                    {band.count}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {percent}%
                  </span>

                  {/* Thanh Bar Trực Quan */}
                  <div className="w-full h-[60px] flex items-end justify-center my-1.5">
                    <div
                      style={{ height: `${heightPercent}px` }}
                      className={`w-full max-w-[32px] rounded-t-md transition-all duration-300 ${band.color} ${
                        isSelected ? 'brightness-110 shadow-sm' : 'opacity-85 group-hover:opacity-100'
                      }`}
                    ></div>
                  </div>

                  {/* Tên dải & Khoảng điểm */}
                  <span className="text-[11px] font-bold text-slate-700 group-hover:text-blue-600 truncate w-full">
                    {band.label}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {band.range}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Bảng Danh Sách Điểm Chi Tiết Light Mode */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {/* Thanh Lọc Nhanh Phía Trên Bảng */}
        <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Ô Tìm Kiếm Học Sinh */}
          <div className="relative min-w-[200px] sm:min-w-[260px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm theo tên, SBD, lớp, IP..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {/* Pill: Tất cả */}
            <button
              onClick={() => {
                setStatusFilter('all');
                setSelectedScoreBand('all');
              }}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                statusFilter === 'all' && selectedScoreBand === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              Tất cả ({students.length})
            </button>

            {/* Pill: Đạt */}
            <button
              onClick={() => setStatusFilter(statusFilter === 'passed' ? 'all' : 'passed')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
                statusFilter === 'passed'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 border border-emerald-200'
              }`}
            >
              <span>🟢</span> Đạt ({passCount})
            </button>

            {/* Pill: Chưa đạt */}
            <button
              onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
                statusFilter === 'failed'
                  ? 'bg-rose-600 text-white shadow-2xs font-bold'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100/80 border border-rose-200'
              }`}
            >
              <span>🔴</span> Chưa đạt ({failCount})
            </button>

            {/* Pill: Có vi phạm */}
            <button
              onClick={() => setStatusFilter(statusFilter === 'violation' ? 'all' : 'violation')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
                statusFilter === 'violation'
                  ? 'bg-amber-600 text-white shadow-2xs font-bold'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100/80 border border-amber-200'
              }`}
            >
              <span>⚠️</span> Có vi phạm ({violationCount})
            </button>

            {/* Pill dải điểm active từ Bar Chart */}
            {selectedScoreBand !== 'all' && (
              <span className="px-3 py-1 rounded-lg font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5 animate-fadeIn">
                <span>📊 Phổ điểm: {bandLabelMap[selectedScoreBand]}</span>
                <button
                  onClick={() => setSelectedScoreBand('all')}
                  className="hover:text-blue-900 cursor-pointer"
                  title="Hủy lọc theo dải điểm này"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs italic">Đang tải bảng điểm ca thi...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-bold text-slate-800">Không tìm thấy thí sinh nào phù hợp</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Thử xóa ô tìm kiếm hoặc bấm "Tất cả" để hiển thị lại danh sách.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase border-b border-slate-200 font-bold">
                <tr>
                  <th className="py-3 px-3 text-center w-12">STT</th>
                  <th className="py-3 px-3">SBD</th>
                  <th className="py-3 px-3">Họ và Tên</th>
                  <th className="py-3 px-3">Ngày Sinh</th>
                  <th className="py-3 px-3">Lớp</th>
                  <th className="py-3 px-3">IP Máy</th>
                  <th className="py-3 px-3 text-center">Trắc Nghiệm</th>
                  <th className="py-3 px-3 text-center">Tự Luận</th>
                  <th className="py-3 px-3 text-center">Tổng Điểm</th>
                  <th className="py-3 px-3 text-center">Trạng Thái Chấm</th>
                  <th className="py-3 px-3 text-center">Vi Phạm</th>
                  <th className="py-3 px-3">Thời Gian Nộp</th>
                  <th className="py-3 px-3 text-center w-28">Bài Làm & PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((st, idx) => {
                  const isPassed = (st.total_score || 0) >= 5.0;
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{st.student_code}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{st.student_name}</td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-xs">{st.dob || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">{st.class_name || '-'}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{st.client_ip || '-'}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-700">{st.mcq_score ?? 0}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-amber-700">{st.essay_score ?? 0}</td>
                      <td className="py-2.5 px-3 text-center font-black">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          isPassed
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {st.total_score ?? 0}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {st.is_graded ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✓ Đã chấm
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            ⏳ Chờ tự luận
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {(st.violations_count || 0) > 0 ? (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[11px]">
                            {st.violations_count} lỗi
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500 font-mono">
                        {formatToLocalTime(st.submitted_at)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setViewingAttemptId(st.id);
                              setAutoPrintMode(false);
                            }}
                            className="p-1.5 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-lg transition border border-slate-200 shadow-2xs cursor-pointer"
                            title="Xem chi tiết bài làm học sinh"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setViewingAttemptId(st.id);
                              setAutoPrintMode(true);
                            }}
                            className="p-1.5 bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 rounded-lg transition border border-slate-200 shadow-2xs cursor-pointer"
                            title="In / Xuất bài thi sang PDF"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student Exam Paper Modal (Single or Batch) */}
      {(viewingAttemptId || isBatchPrinting) && (
        <StudentPaperModal
          attemptId={viewingAttemptId}
          sessionId={selectedSessionId}
          isBatchMode={isBatchPrinting}
          autoPrint={autoPrintMode}
          onClose={() => {
            setViewingAttemptId(null);
            setAutoPrintMode(false);
            setIsBatchPrinting(false);
          }}
        />
      )}

      {/* Modal Điều Chỉnh Đáp Án Ca Thi & Chấm Lại */}
      {showAdjustModal && (
        <AdjustAnswersModal
          sessionId={selectedSessionId}
          onClose={() => setShowAdjustModal(false)}
          onRegraded={() => {
            setRefreshKey(k => k + 1);
          }}
        />
      )}

      {/* Modal Cây Thư Mục Lưu Trữ Hồ Sơ: Lớp -> Tên Ca Thi */}
      {showArchiveTreeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-800">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Kho Lưu Trữ Hồ Sơ Khảo Thí (Lớp ➔ Tên Ca Thi)</h3>
                  <p className="text-xs text-slate-500">Cấu trúc thư mục được tự động tổ chức chuẩn hóa trên ổ cứng máy chủ</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenFolderOnHost('')}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-blue-700 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-slate-200 shadow-2xs cursor-pointer"
                  title="Mở thư mục gốc lưu trữ trên ổ đĩa máy chủ (Windows Explorer)"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Mở Trên Máy Chủ
                </button>
                <button
                  onClick={() => setShowArchiveTreeModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingArchiveTree ? (
                <div className="text-center py-12 text-slate-500 text-xs italic">
                  Đang quét cấu trúc thư mục lưu trữ...
                </div>
              ) : archiveTree.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200 p-6 space-y-2">
                  <Folder className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">Chưa có hồ sơ ca thi nào được lưu trữ</p>
                  <p className="text-xs text-slate-500">
                    Khi một ca thi kết thúc hoặc khi giáo viên bấm "Tải Hồ Sơ Lớp", hệ thống sẽ tự động tạo thư mục lưu trữ đầy đủ.
                  </p>
                </div>
              ) : (
                archiveTree.map(clsGroup => (
                  <div key={clsGroup.className} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-purple-600" />
                        <span className="font-bold text-slate-800 text-sm">Lớp: {clsGroup.className}</span>
                        <span className="text-[11px] text-slate-500">({clsGroup.totalSessions} ca thi)</span>
                      </div>
                      <button
                        onClick={() => handleOpenFolderOnHost(clsGroup.className)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 transition cursor-pointer"
                        title={`Mở thư mục của lớp ${clsGroup.className}`}
                      >
                        <ExternalLink className="w-3 h-3" /> Mở thư mục lớp
                      </button>
                    </div>

                    <div className="space-y-2.5 pl-3">
                      {clsGroup.sessions.map(sess => (
                        <div key={sess.sessionFolder} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FolderOpen className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="font-bold text-slate-800 text-xs">{sess.sessionFolder}</span>
                            </div>
                            <button
                              onClick={() => handleOpenFolderOnHost(sess.relativeFolder)}
                              className="text-[10px] text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 flex items-center gap-1 transition cursor-pointer"
                            >
                              <ExternalLink className="w-2.5 h-2.5" /> Mở
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {sess.files.map(file => (
                              <div key={file.name} className="flex items-center justify-between text-[11px] bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                                <span className="text-slate-700 truncate" title={file.name}>📄 {file.name}</span>
                                <span className="text-slate-500 font-mono text-[10px] shrink-0 ml-2">
                                  {(file.sizeBytes / 1024).toFixed(1)} KB
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-200 flex items-center justify-between bg-slate-50 text-xs text-slate-500">
              <span>Đường dẫn lưu trữ: <code className="text-blue-700 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono">server/storage/archive/[Lớp]/[Tên Ca Thi]</code></span>
              <button
                onClick={() => setShowArchiveTreeModal(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
