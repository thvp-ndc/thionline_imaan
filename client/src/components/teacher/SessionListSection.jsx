import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock, Users, Play, Lock, Trash2, Edit2, Download, FileEdit,
  BarChart2, Search, X as CloseIcon, RotateCw, ChevronDown,
  LayoutGrid, List, MoreVertical, MoreHorizontal, ChevronLeft, ChevronRight,
  Layers, Award, CheckCircle2, TrendingUp, Copy, Check, FileSpreadsheet, Megaphone
} from 'lucide-react';

export const STANDARD_GRADES = ['6', '7', '8', '9', '10', '11', '12'];

export default function SessionListSection({
  sessions = [],
  availableClasses = [],
  loading = false,
  onOpenCreateSession,
  onOpenEditSession,
  onSelectSessionForMonitor,
  onSelectSessionForResults,
  onOpenEssayGrading,
  onOpenStudentsModal,
  onFinishSession,
  onReleaseScores,
  onDeleteSession
}) {
  // Filter & Search states
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState('all'); // 'all' | 'in_progress' | 'waiting' | 'finished'
  const [sessionGradeFilter, setSessionGradeFilter] = useState('all'); // 'all' | '6' ... '12'
  const [sessionClassFilter, setSessionClassFilter] = useState('all'); // 'all' | '10A1'...
  const [sessionTypeFilter, setSessionTypeFilter] = useState('all'); // 'all' | 'KTTX' | 'GK' | 'CK'
  const [sessionViewMode, setSessionViewMode] = useState(() => localStorage.getItem('lan_exam_session_view') || 'grid');
  const [sessionPage, setSessionPage] = useState(1);
  const [activeActionSessionId, setActiveActionSessionId] = useState(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-dropdown]')) {
        setActiveActionSessionId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleToggleSessionViewMode = (mode) => {
    setSessionViewMode(mode);
    localStorage.setItem('lan_exam_session_view', mode);
  };

  // Reset page when filter changes
  useEffect(() => {
    setSessionPage(1);
  }, [sessionSearch, sessionStatusFilter, sessionGradeFilter, sessionClassFilter, sessionTypeFilter, sessionViewMode]);

  // KPI Metrics toàn cục trên toàn hệ thống
  const totalSessionsCount = sessions.length;
  const inProgressCountAll = useMemo(() => sessions.filter(s => s.status === 'in_progress').length, [sessions]);
  const onlineStudentsCount = useMemo(() => {
    return sessions.reduce((acc, s) => {
      return acc + (s.status === 'in_progress' ? (s.student_count || 0) : 0);
    }, 0);
  }, [sessions]);

  const avgCompletionRate = useMemo(() => {
    let totalAssigned = 0;
    let totalSubmitted = 0;
    sessions.forEach(s => {
      if (s.assigned_student_count > 0) {
        totalAssigned += s.assigned_student_count;
        totalSubmitted += (s.student_count || 0);
      }
    });
    if (totalAssigned > 0) {
      return Math.min(100, Math.round((totalSubmitted / totalAssigned) * 100));
    }
    const finishedCount = sessions.filter(s => s.status === 'finished').length;
    return sessions.length > 0 ? Math.round((finishedCount / sessions.length) * 100) : 100;
  }, [sessions]);

  // Danh sách các khối thực tế có trong danh sách ca thi & CSDL học sinh
  const filterGradeOptions = useMemo(() => {
    const set = new Set();
    (sessions || []).forEach(s => {
      const m = (s.target_class || '').match(/^\d+/);
      if (m) {
        set.add(m[0]);
      } else {
        const m2 = (s.exam_title || s.title || '').match(/\b(?:Tin|Toán|K|Khối)?\s*(\d{1,2})\b/i);
        if (m2 && parseInt(m2[1]) >= 6 && parseInt(m2[1]) <= 12) set.add(m2[1]);
      }
    });
    (availableClasses || []).forEach(c => {
      const m = String(c).match(/^\d+/);
      if (m) set.add(m[0]);
    });
    if (set.size === 0) {
      STANDARD_GRADES.forEach(g => set.add(g));
    }
    return Array.from(set).sort((a, b) => parseInt(a) - parseInt(b));
  }, [sessions, availableClasses]);

  // Danh sách các lớp khả dụng (Chuẩn hóa toUpperCase để triệt tiêu trùng lặp 7a1 và 7A1)
  const filterClassOptions = useMemo(() => {
    const set = new Set();
    (sessions || []).forEach(s => {
      if (s.target_class && s.target_class.trim() && s.target_class.trim().toUpperCase() !== 'CHUNG') {
        set.add(s.target_class.trim().toUpperCase());
      }
    });
    (availableClasses || []).forEach(c => {
      if (c && String(c).trim() && String(c).trim().toUpperCase() !== 'CHUNG') {
        set.add(String(c).trim().toUpperCase());
      }
    });

    let classList = Array.from(set);
    if (sessionGradeFilter !== 'all') {
      classList = classList.filter(c => {
        const m = c.match(/^\d+/);
        return m ? m[0] === sessionGradeFilter : false;
      });
    }
    return classList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [sessions, availableClasses, sessionGradeFilter]);

  // Lọc ca thi theo Khối, Lớp, Loại kiểm tra & Tìm kiếm
  const baseFilteredSessions = useMemo(() => {
    return (sessions || []).filter(s => {
      // 1. Lọc theo Khối
      if (sessionGradeFilter !== 'all') {
        let sGrade = null;
        const mClass = (s.target_class || '').match(/^\d+/);
        if (mClass) {
          sGrade = mClass[0];
        } else {
          const mTitle = (s.exam_title || s.title || '').match(/\b(?:Tin|Toán|K|Khối)?\s*(\d{1,2})\b/i);
          if (mTitle) sGrade = mTitle[1];
        }
        if (sGrade !== sessionGradeFilter) return false;
      }

      // 2. Lọc theo Lớp (Case-insensitive)
      if (sessionClassFilter !== 'all') {
        if ((s.target_class || '').trim().toUpperCase() !== sessionClassFilter.trim().toUpperCase()) {
          return false;
        }
      }

      // 3. Lọc theo Loại kiểm tra
      if (sessionTypeFilter !== 'all') {
        const curType = (s.exam_type || '').toUpperCase();
        const codeOrTitle = `${s.session_code || ''} ${s.title || ''} ${s.exam_title || ''}`.toUpperCase();

        if (sessionTypeFilter === 'KTTX') {
          const isTX = curType === 'KTTX' || curType === 'TX' || codeOrTitle.includes('KTTX') || codeOrTitle.includes('_TX') || codeOrTitle.includes('-TX');
          if (!isTX) return false;
        } else if (sessionTypeFilter === 'GK') {
          const hasTX = codeOrTitle.includes('KTTX') || codeOrTitle.includes('_TX') || codeOrTitle.includes('-TX');
          const isGK = (curType === 'GK' && !hasTX) || codeOrTitle.includes('GIỮA KỲ') || codeOrTitle.includes('_GK') || codeOrTitle.includes('-GK');
          if (!isGK) return false;
        } else if (sessionTypeFilter === 'CK') {
          const isCK = curType === 'CK' || codeOrTitle.includes('CUỐI KỲ') || codeOrTitle.includes('_CK') || codeOrTitle.includes('-CK');
          if (!isCK) return false;
        } else {
          if (curType !== sessionTypeFilter) return false;
        }
      }

      // 4. Tìm kiếm từ khóa
      if (sessionSearch.trim()) {
        const term = sessionSearch.trim().toLowerCase();
        const matchCode = (s.session_code || '').toLowerCase().includes(term);
        const matchTitle = (s.title || '').toLowerCase().includes(term);
        const matchExam = (s.exam_title || '').toLowerCase().includes(term);
        const matchClass = (s.target_class || '').toLowerCase().includes(term);
        if (!matchCode && !matchTitle && !matchExam && !matchClass) return false;
      }

      return true;
    });
  }, [sessions, sessionGradeFilter, sessionClassFilter, sessionTypeFilter, sessionSearch]);

  // Derived KPI đếm theo bộ lọc hiện tại
  const inProgressCount = useMemo(() => baseFilteredSessions.filter(s => s.status === 'in_progress').length, [baseFilteredSessions]);
  const waitingCount = useMemo(() => baseFilteredSessions.filter(s => s.status === 'waiting').length, [baseFilteredSessions]);
  const finishedCount = useMemo(() => baseFilteredSessions.filter(s => s.status === 'finished').length, [baseFilteredSessions]);

  // Kết quả cuối cùng kết hợp lọc theo trạng thái
  const filteredSessions = useMemo(() => {
    if (sessionStatusFilter === 'all') return baseFilteredSessions;
    return baseFilteredSessions.filter(s => s.status === sessionStatusFilter);
  }, [baseFilteredSessions, sessionStatusFilter]);

  const hasActiveSessionFilters = Boolean(
    sessionSearch.trim() ||
    sessionStatusFilter !== 'all' ||
    sessionGradeFilter !== 'all' ||
    sessionClassFilter !== 'all' ||
    sessionTypeFilter !== 'all'
  );

  const handleResetSessionFilters = () => {
    setSessionSearch('');
    setSessionStatusFilter('all');
    setSessionGradeFilter('all');
    setSessionClassFilter('all');
    setSessionTypeFilter('all');
  };

  // Chế độ bảng hiển thị 24 ca/trang để dễ dàng đối soát nhanh 24 lớp
  const sessionPageSize = sessionViewMode === 'table' ? 24 : 9;
  const totalSessionPages = Math.max(1, Math.ceil(filteredSessions.length / sessionPageSize));
  const paginatedSessions = filteredSessions.slice((sessionPage - 1) * sessionPageSize, sessionPage * sessionPageSize);

  // Pagination renderer Light Mode
  const renderPagination = (currentPage, totalPages, totalItems, onPageChange) => {
    if (totalItems === 0 || totalPages <= 1) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 text-xs text-slate-500">
        <div>
          Hiển thị trang <strong className="text-slate-800">{currentPage}</strong> / <strong className="text-slate-800">{totalPages}</strong> (Tổng <strong className="text-blue-600 font-bold">{totalItems}</strong> ca thi)
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition flex items-center gap-1 border border-slate-200 shadow-2xs cursor-pointer font-medium"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Trước
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
            .map((p, idx, arr) => (
              <React.Fragment key={p}>
                {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-slate-400">...</span>}
                <button
                  onClick={() => onPageChange(p)}
                  className={`min-w-[32px] h-[32px] rounded-lg font-bold transition cursor-pointer text-xs ${
                    currentPage === p
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  {p}
                </button>
              </React.Fragment>
            ))}
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition flex items-center gap-1 border border-slate-200 shadow-2xs cursor-pointer font-medium"
          >
            Sau <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* CỤM KPI & TOOLBAR CỐ ĐỊNH KHI CUỘN (THEO YÊU CẦU CỦA GV) */}
      <div className="sticky top-[152px] z-10 bg-slate-50/95 backdrop-blur-md pt-1 pb-3 space-y-2.5 -mx-4 sm:-mx-6 px-4 sm:px-6 shadow-2xs">
        {/* HÀNG KPI METRIC CARDS DOANH NGHIỆP PHÍA TRÊN BẢNG (YÊU CẦU 3.1) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Thẻ 1: Tổng số ca thi */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Số Ca Thi</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-slate-900">{totalSessionsCount}</span>
              <span className="text-xs text-slate-500 font-medium">ca thi</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate hidden sm:block">Đã khởi tạo trong phiên làm việc</div>
          </div>

          {/* Thẻ 2: Ca thi đang diễn ra */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ca Đang Mở</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Play className="w-3.5 h-3.5 fill-current" />
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-emerald-600">{inProgressCountAll}</span>
              <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Đang diễn ra
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate hidden sm:block">Sẵn sàng nhận kết nối từ thí sinh</div>
          </div>

          {/* Thẻ 3: Học sinh đang làm bài trực tuyến (Real-time online count) */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Thí Sinh Online</span>
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-indigo-700">{onlineStudentsCount}</span>
              <span className="text-xs text-slate-500 font-medium">thí sinh</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate hidden sm:block">Lưu trữ bài thi cục bộ trên LAN</div>
          </div>

          {/* Thẻ 4: Tỷ lệ hoàn thành nộp bài trung bình (%) */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tỷ Lệ Nộp Bài</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Award className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-slate-900">{avgCompletionRate}%</span>
              <span className="text-xs text-emerald-600 font-bold">trung bình</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${avgCompletionRate >= 80 ? 'bg-emerald-500' : avgCompletionRate >= 50 ? 'bg-blue-600' : 'bg-amber-500'}`}
                style={{ width: `${avgCompletionRate}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* THANH FILTER & TOOLBAR PHẲNG LIGHT MODE (YÊU CẦU 3.2) */}
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Nhóm trái: Ô tìm kiếm + Bộ 3 dropdown Khối / Lớp / Loại phẳng */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* 1. [🔍 Tìm mã ca, lớp...] */}
            <div className="relative min-w-[160px] max-w-[230px] flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm mã ca, lớp, tên đề..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 h-8.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
              />
              {sessionSearch && (
                <button
                  onClick={() => setSessionSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 2. Flat Inline Select Components: [Khối] [Lớp] [Loại] */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              {/* [Khối: Tất cả ▼] */}
              <div className="relative">
                <select
                  value={sessionGradeFilter}
                  onChange={e => {
                    const newGrade = e.target.value;
                    setSessionGradeFilter(newGrade);
                    if (newGrade !== 'all' && sessionClassFilter !== 'all') {
                      const m = sessionClassFilter.match(/^\d+/);
                      if (!m || m[0] !== newGrade) {
                        setSessionClassFilter('all');
                      }
                    }
                  }}
                  className="h-8.5 appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg pl-2.5 pr-6 py-1 text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs transition"
                >
                  <option value="all">Khối: Tất cả</option>
                  {filterGradeOptions.map(g => (
                    <option key={g} value={g}>Khối {g}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* [Lớp: Tất cả ▼] - Đã toUpperCase() triệt tiêu trùng lặp */}
              <div className="relative">
                <select
                  value={sessionClassFilter}
                  onChange={e => setSessionClassFilter(e.target.value)}
                  className="h-8.5 appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg pl-2.5 pr-6 py-1 text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs transition"
                >
                  <option value="all">Lớp: Tất cả</option>
                  {filterClassOptions.map(c => (
                    <option key={c} value={c}>Lớp {c}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* [Loại: Tất cả ▼] */}
              <div className="relative">
                <select
                  value={sessionTypeFilter}
                  onChange={e => setSessionTypeFilter(e.target.value)}
                  className="h-8.5 appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg pl-2.5 pr-6 py-1 text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs transition"
                >
                  <option value="all">Loại: Tất cả</option>
                  <option value="KTTX">Thường xuyên (TX)</option>
                  <option value="GK">Giữa kỳ (GK)</option>
                  <option value="CK">Cuối kỳ (CK)</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Nút reset filter */}
              {hasActiveSessionFilters && (
                <button
                  onClick={handleResetSessionFilters}
                  className="h-8.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-lg border border-slate-200 text-xs transition flex items-center gap-1 shadow-2xs cursor-pointer font-medium"
                  title="Xóa bộ lọc để hiện tất cả ca thi"
                >
                  <RotateCw className="w-3 h-3" />
                  <span className="hidden md:inline text-[11px]">Xóa lọc</span>
                </button>
              )}
            </div>
          </div>

          {/* Nhóm phải: Segmented Controls cho trạng thái + Nút View Mode */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Segmented Controls cho trạng thái có pill background và badge số đếm nhỏ */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70 text-xs font-semibold">
              <button
                onClick={() => setSessionStatusFilter('all')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  sessionStatusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Tất cả</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  sessionStatusFilter === 'all' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {baseFilteredSessions.length}
                </span>
              </button>

              <button
                onClick={() => setSessionStatusFilter('in_progress')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  sessionStatusFilter === 'in_progress'
                    ? 'bg-emerald-50 text-emerald-800 shadow-2xs font-bold border border-emerald-200'
                    : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Đang mở</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-emerald-100 text-emerald-800">
                  {inProgressCount}
                </span>
              </button>

              <button
                onClick={() => setSessionStatusFilter('waiting')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  sessionStatusFilter === 'waiting'
                    ? 'bg-amber-50 text-amber-800 shadow-2xs font-bold border border-amber-200'
                    : 'text-slate-600 hover:text-amber-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Chờ bắt đầu</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-amber-100 text-amber-800">
                  {waitingCount}
                </span>
              </button>

              <button
                onClick={() => setSessionStatusFilter('finished')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  sessionStatusFilter === 'finished'
                    ? 'bg-white text-slate-800 shadow-2xs font-bold border border-slate-200'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <Lock className="w-3 h-3 text-slate-400" />
                <span>Đã kết thúc</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-slate-200 text-slate-600">
                  {finishedCount}
                </span>
              </button>
            </div>

            {/* Toggle View Mode [▦][☷] */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5">
              <button
                onClick={() => handleToggleSessionViewMode('grid')}
                title="Chế độ thẻ lưới (Grid Card) [▦]"
                className={`p-1.5 rounded-md transition cursor-pointer ${
                  sessionViewMode === 'grid' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleToggleSessionViewMode('table')}
                title="Chế độ bảng đối soát (Table View) [☷]"
                className={`p-1.5 rounded-md transition cursor-pointer ${
                  sessionViewMode === 'table' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Nội dung danh sách ca thi (Data Table hoặc Grid Cards) */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-xs italic">
          <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
          <span>Đang đồng bộ danh sách ca thi mạng LAN...</span>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-800 text-sm font-bold">Không tìm thấy ca thi phù hợp</p>
          <p className="text-slate-500 text-xs mt-1 max-w-md mx-auto">
            {hasActiveSessionFilters
              ? 'Thử thay đổi từ khóa tìm kiếm, chọn lại khối/lớp hoặc đặt lại bộ lọc.'
              : 'Chưa có ca thi nào được mở. Nhấn nút "Mở Ca Thi Mới" để bắt đầu ca kiểm tra.'}
          </p>
          {hasActiveSessionFilters && (
            <button
              onClick={handleResetSessionFilters}
              className="mt-3.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-blue-700 font-semibold rounded-lg text-xs transition border border-slate-200 flex items-center gap-1.5 mx-auto cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Đặt lại bộ lọc</span>
            </button>
          )}
        </div>
      ) : sessionViewMode === 'table' ? (
        /* COMPACT TABLE VIEW - 7 CỘT CHUẨN ĐỐI SOÁT B2B EDTECH (YÊU CẦU 4) */
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">Mã Ca</th>
                <th className="py-3 px-3 whitespace-nowrap">Lớp</th>
                <th className="py-3 px-3">Tên Đề Thi</th>
                <th className="py-3 px-3 whitespace-nowrap">Thời Lượng</th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Sĩ Số / Đã Nộp</th>
                <th className="py-3 px-3 whitespace-nowrap">Trạng Thái</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {paginatedSessions.map((s, idx) => {
                const isNearBottom = idx >= paginatedSessions.length - 2 && paginatedSessions.length > 2;
                const hasMissingSubs = s.assigned_student_count > 0 && s.student_count < s.assigned_student_count;
                const displayExamTitle = s.exam_title || s.matrix_title || s.title;

                // Tính toán tỷ lệ % bài nộp cho Micro Progress Bar
                const submitCount = s.student_count || 0;
                const totalAssigned = s.assigned_student_count || 0;
                const submitPct = totalAssigned > 0
                  ? Math.min(100, Math.round((submitCount / totalAssigned) * 100))
                  : (submitCount > 0 ? 100 : 0);

                return (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition">
                    {/* 1. Mã Ca */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded font-mono font-bold text-xs">
                          #{s.session_code}
                        </span>
                        {s.exam_type && (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-bold text-[10px]" title={`Loại kiểm tra: ${s.exam_type}`}>
                            {s.exam_type === 'KTTX' ? 'TX' : (s.exam_type === 'GK' ? 'GK' : (s.exam_type === 'CK' ? 'CK' : s.exam_type))}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 2. Lớp */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {s.target_class && s.target_class.trim().toUpperCase() !== 'CHUNG' ? (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold text-xs">
                          {s.target_class.trim().toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-xs font-medium">Chung</span>
                      )}
                    </td>

                    {/* 3. Tên Đề Thi */}
                    <td className="py-3 px-3 max-w-[280px]">
                      <div className="font-bold text-slate-900 truncate" title={displayExamTitle}>
                        {displayExamTitle}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 flex-wrap mt-0.5">
                        {(s.distribution_mode === 'matrix_dynamic' || (s.matrix_id && s.generate_per_student === 1)) ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Mỗi thí sinh bốc đề ngẫu nhiên từ ngân hàng theo ma trận">
                            🎲 Ma trận động
                          </span>
                        ) : (s.variant_exam_ids_json && s.variant_exam_ids_json !== '[]') ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200" title="Phát các mã đề 101, 102... chia đều theo số báo danh">
                            📑 Đề cố định (chia SBD)
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200" title="Phát đề thi cố định cho cả lớp">
                            📑 Đề cố định
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 4. Thời Gian */}
                    <td className="py-3 px-3 whitespace-nowrap text-slate-700 font-semibold">
                      <span className="inline-flex items-center gap-1 text-slate-800">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>{s.duration_minutes || 45} phút</span>
                      </span>
                    </td>

                    {/* 5. Sĩ Số / Đã Nộp & Micro Progress Bar (YÊU CẦU 4.1) */}
                    <td className="py-3 px-3 text-center whitespace-nowrap min-w-[130px]">
                      {totalAssigned > 0 ? (
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-bold ${hasMissingSubs ? 'text-amber-700' : 'text-slate-800'}`}>
                            {submitCount} <span className="text-slate-400 font-normal">/</span> {totalAssigned}
                          </span>
                          {/* Micro Progress Bar mini hiển thị tỷ lệ đã nộp */}
                          <div className="w-20 bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden" title={`Đã nộp: ${submitPct}%`}>
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${submitPct >= 100 ? 'bg-emerald-500' : submitPct >= 50 ? 'bg-blue-600' : 'bg-amber-500'}`}
                              style={{ width: `${submitPct}%` }}
                            ></div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-bold text-slate-800">
                            {submitCount} <span className="text-[11px] text-slate-500 font-normal">đã nộp</span>
                          </span>
                          <span className="text-[10px] text-slate-400">Phòng mở tự do</span>
                        </div>
                      )}
                    </td>

                    {/* 6. Trạng Thái & Công Bố Điểm */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        {s.status === 'finished' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <Lock className="w-3 h-3 text-slate-400" /> Đã kết thúc
                          </span>
                        ) : s.status === 'waiting' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Chờ bắt đầu
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Đang thi
                          </span>
                        )}

                        {/* Huy hiệu chế độ công bố điểm */}
                        {s.score_release_mode === 'manual_release' ? (
                          s.scores_released_at ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title={`Đã công bố lúc: ${s.scores_released_at}`}>
                              📢 Đã mở điểm
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Chờ giáo viên công bố điểm">
                              🔒 Chưa mở điểm
                            </span>
                          )
                        ) : s.score_release_mode === 'immediate' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            👁️ Xem điểm ngay
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            🔒 Ẩn điểm
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 7. Thao Tác (1 nút chính + Menu 3 chấm MoreHorizontal) (YÊU CẦU 4.2) */}
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {s.status === 'finished' ? (
                          <button
                            onClick={() => onSelectSessionForResults(s.id)}
                            className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                            title="Xem bảng điểm & in bài nộp"
                          >
                            <BarChart2 className="w-3.5 h-3.5 text-blue-600" />
                            <span>Bảng Điểm & Bài Nộp</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onSelectSessionForMonitor(s.id)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-xs cursor-pointer"
                            title="Giám sát trực tiếp phòng thi"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Vào Giám Sát</span>
                          </button>
                        )}

                        {/* Menu thao tác nhanh dạng ba chấm ngang (MoreHorizontal) */}
                        <div className="relative" data-dropdown>
                          <button
                            onClick={() => setActiveActionSessionId(activeActionSessionId === s.id ? null : s.id)}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              activeActionSessionId === s.id
                                ? 'bg-slate-100 text-slate-800 border-slate-300'
                                : 'bg-white hover:bg-slate-50 text-slate-500 border-slate-200 shadow-2xs'
                            }`}
                            title="Thao tác nhanh"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {activeActionSessionId === s.id && (
                            <div className={`absolute right-0 ${isNearBottom ? 'bottom-full mb-1' : 'top-full mt-1'} w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-left animate-fadeIn divide-y divide-slate-100`}>
                              {s.score_release_mode === 'manual_release' && !s.scores_released_at && onReleaseScores && (
                                <div className="p-1">
                                  <button
                                    onClick={() => {
                                      setActiveActionSessionId(null);
                                      onReleaseScores(s.id, s.session_code);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg flex items-center gap-2 transition cursor-pointer border border-amber-200"
                                    title="Mở khóa công bố điểm cho học sinh trong phòng thi"
                                  >
                                    <Megaphone className="w-4 h-4 text-amber-600" />
                                    <span>Công bố điểm cho học sinh</span>
                                  </button>
                                </div>
                              )}

                              <div className="py-1">
                                <button
                                  onClick={() => {
                                    setActiveActionSessionId(null);
                                    window.open(`/api/sessions/${s.id}/export-excel`, '_blank');
                                  }}
                                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                                  title="Xuất bảng điểm ca thi dạng Excel .xlsx"
                                >
                                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                  <span>Xuất bảng điểm Excel (.xlsx)</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveActionSessionId(null);
                                    onOpenStudentsModal(s);
                                  }}
                                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                                >
                                  <Users className="w-4 h-4 text-indigo-600" />
                                  <span>Xem nhật ký thi / Gian lận</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveActionSessionId(null);
                                    window.open(`/api/sessions/${s.id}/archive-zip`, '_blank');
                                  }}
                                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                                  title={`Tải trọn bộ hồ sơ ca thi lớp ${s.target_class || 'Chung'}`}
                                >
                                  <Download className="w-4 h-4 text-blue-600" />
                                  <span>Tải hồ sơ lớp (.zip)</span>
                                </button>

                                {onOpenEssayGrading && (
                                  <button
                                    onClick={() => {
                                      setActiveActionSessionId(null);
                                      onOpenEssayGrading(s.id);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                                  >
                                    <FileEdit className="w-4 h-4 text-amber-600" />
                                    <span>Chấm bài tự luận</span>
                                  </button>
                                )}
                              </div>

                              <div className="py-1">
                                <button
                                  onClick={() => {
                                    setActiveActionSessionId(null);
                                    onOpenCreateSession(s.exam_id);
                                  }}
                                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                                  title="Mở ca thi mới với cùng đề thi này"
                                >
                                  <Copy className="w-4 h-4 text-slate-500" />
                                  <span>Nhân bản ca thi</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveActionSessionId(null);
                                    onOpenEditSession(s);
                                  }}
                                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                                >
                                  <Edit2 className="w-4 h-4 text-slate-500" />
                                  <span>Sửa thông tin ca thi</span>
                                </button>
                              </div>

                              <div className="py-1">
                                {s.status !== 'finished' && (
                                  <button
                                    onClick={() => {
                                      setActiveActionSessionId(null);
                                      onFinishSession(s.id, s.session_code);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center gap-2.5 transition cursor-pointer"
                                  >
                                    <Lock className="w-4 h-4 text-amber-600" />
                                    <span>Kết thúc / Thu bài toàn bộ</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    setActiveActionSessionId(null);
                                    onDeleteSession(s.id, s.session_code);
                                  }}
                                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4 text-rose-600" />
                                  <span>Xóa ca thi</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* GRID CARDS VIEW - LIGHT MODE B2B EDTECH */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {paginatedSessions.map(s => {
            const hasMissingSubs = s.assigned_student_count > 0 && s.student_count < s.assigned_student_count;
            const displayExamTitle = s.exam_title || s.matrix_title || s.title;

            const submitCount = s.student_count || 0;
            const totalAssigned = s.assigned_student_count || 0;
            const submitPct = totalAssigned > 0
              ? Math.min(100, Math.round((submitCount / totalAssigned) * 100))
              : (submitCount > 0 ? 100 : 0);

            return (
              <div key={s.id} className="group bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between hover:border-blue-400 hover:shadow-xs transition duration-200 shadow-2xs">
                <div>
                  {/* Header Card: Mã ca + Lớp + Trạng thái */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded font-mono font-bold text-xs">
                        #{s.session_code}
                      </span>
                      {s.exam_type && (
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-bold text-[10px]" title={`Loại kiểm tra: ${s.exam_type}`}>
                          {s.exam_type === 'KTTX' ? 'TX' : (s.exam_type === 'GK' ? 'GK' : (s.exam_type === 'CK' ? 'CK' : s.exam_type))}
                        </span>
                      )}
                      {s.target_class && s.target_class.trim().toUpperCase() !== 'CHUNG' ? (
                        <span className="px-2 py-0.5 rounded font-bold text-xs bg-blue-50 text-blue-700 border border-blue-200">
                          Lớp {s.target_class.trim().toUpperCase()}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 border border-slate-200">
                          Chung
                        </span>
                      )}
                      {(s.distribution_mode === 'matrix_dynamic' || (s.matrix_id && s.generate_per_student === 1)) ? (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Mỗi thí sinh bốc đề ngẫu nhiên từ ngân hàng theo ma trận">
                          🎲 Ma trận động
                        </span>
                      ) : (s.variant_exam_ids_json && s.variant_exam_ids_json !== '[]') ? (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200" title="Phát các mã đề 101, 102... chia đều theo số báo danh">
                          📑 Đề cố định (chia SBD)
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200" title="Phát đề thi cố định cho cả lớp">
                          📑 Đề cố định
                        </span>
                      )}

                      {/* Huy hiệu điểm số grid view */}
                      {s.score_release_mode === 'manual_release' ? (
                        s.scores_released_at ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title={`Đã mở điểm lúc: ${s.scores_released_at}`}>
                            📢 Đã mở điểm
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Chờ giáo viên công bố điểm">
                            🔒 Chưa mở điểm
                          </span>
                        )
                      ) : s.score_release_mode === 'immediate' ? (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          👁️ Hiện điểm ngay
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          🔒 Ẩn điểm
                        </span>
                      )}
                    </div>

                    {/* Trạng thái góc phải */}
                    <div className="shrink-0">
                      {s.status === 'finished' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <Lock className="w-3 h-3 text-slate-400" /> Kết thúc
                        </span>
                      ) : s.status === 'waiting' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Chờ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Đang thi
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body Card: Tên đề thi */}
                  <h4 className="font-bold text-slate-900 mt-2.5 text-sm line-clamp-2 leading-snug group-hover:text-blue-600 transition" title={displayExamTitle}>
                    {displayExamTitle}
                  </h4>

                  {/* Thông số ngắn gọn: Thời gian • Sĩ số / Đã nộp + Micro Progress Bar */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-slate-700 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-amber-500" /> {s.duration_minutes || 45} phút
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                        {totalAssigned > 0 ? (
                          <span className={hasMissingSubs ? 'text-amber-700 font-bold' : 'text-slate-800 font-semibold'}>
                            {submitCount}/{totalAssigned} đã nộp
                          </span>
                        ) : (
                          <span className="text-slate-700 font-semibold">
                            <strong>{submitCount}</strong> đã nộp
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Micro Progress Bar trong Grid Card */}
                    {totalAssigned > 0 && (
                      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden" title={`Đã nộp: ${submitPct}%`}>
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${submitPct >= 100 ? 'bg-emerald-500' : submitPct >= 50 ? 'bg-blue-600' : 'bg-amber-500'}`}
                          style={{ width: `${submitPct}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions: Nút bấm chính + Dropdown menu 3 chấm MoreHorizontal */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {s.status === 'finished' ? (
                    <button
                      onClick={() => onSelectSessionForResults(s.id)}
                      className="flex-1 py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      title="Xem bảng điểm & in bài nộp"
                    >
                      <BarChart2 className="w-3.5 h-3.5 text-blue-600" /> Bảng Điểm & Bài Nộp
                    </button>
                  ) : (
                    <button
                      onClick={() => onSelectSessionForMonitor(s.id)}
                      className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      title="Vào màn hình giám sát trực tiếp ca thi"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Vào Giám Sát
                    </button>
                  )}

                  {/* Dropdown Menu 3 chấm MoreHorizontal */}
                  <div className="relative" data-dropdown>
                    <button
                      onClick={() => setActiveActionSessionId(activeActionSessionId === s.id ? null : s.id)}
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        activeActionSessionId === s.id
                          ? 'bg-slate-100 text-slate-800 border-slate-300'
                          : 'bg-white hover:bg-slate-50 text-slate-500 border-slate-200 shadow-2xs'
                      }`}
                      title="Thao tác khác"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {activeActionSessionId === s.id && (
                      <div className="absolute right-0 bottom-full mb-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-left animate-fadeIn divide-y divide-slate-100">
                        {s.score_release_mode === 'manual_release' && !s.scores_released_at && onReleaseScores && (
                          <div className="p-1">
                            <button
                              onClick={() => {
                                setActiveActionSessionId(null);
                                onReleaseScores(s.id, s.session_code);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg flex items-center gap-2 transition cursor-pointer border border-amber-200"
                              title="Mở khóa công bố điểm cho học sinh trong phòng thi"
                            >
                              <Megaphone className="w-4 h-4 text-amber-600" />
                              <span>Công bố điểm cho học sinh</span>
                            </button>
                          </div>
                        )}

                        <div className="py-1">
                          <button
                            onClick={() => {
                              setActiveActionSessionId(null);
                              window.open(`/api/sessions/${s.id}/export-excel`, '_blank');
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                          >
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                            <span>Xuất bảng điểm Excel (.xlsx)</span>
                          </button>

                          <button
                            onClick={() => {
                              setActiveActionSessionId(null);
                              onOpenStudentsModal(s);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                          >
                            <Users className="w-4 h-4 text-indigo-600" />
                            <span>Xem nhật ký thi / Gian lận</span>
                          </button>

                          <button
                            onClick={() => {
                              setActiveActionSessionId(null);
                              window.open(`/api/sessions/${s.id}/archive-zip`, '_blank');
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                            title={`Tải trọn bộ hồ sơ ca thi lớp ${s.target_class || 'Chung'}`}
                          >
                            <Download className="w-4 h-4 text-blue-600" />
                            <span>Tải hồ sơ lớp (.zip)</span>
                          </button>

                          {onOpenEssayGrading && (
                            <button
                              onClick={() => {
                                setActiveActionSessionId(null);
                                onOpenEssayGrading(s.id);
                              }}
                              className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                            >
                              <FileEdit className="w-4 h-4 text-amber-600" />
                              <span>Chấm bài tự luận</span>
                            </button>
                          )}
                        </div>

                        <div className="py-1">
                          <button
                            onClick={() => {
                              setActiveActionSessionId(null);
                              onOpenCreateSession(s.exam_id);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                          >
                            <Copy className="w-4 h-4 text-slate-500" />
                            <span>Nhân bản ca thi</span>
                          </button>

                          <button
                            onClick={() => {
                              setActiveActionSessionId(null);
                              onOpenEditSession(s);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4 text-slate-500" />
                            <span>Sửa thông tin ca thi</span>
                          </button>
                        </div>

                        <div className="py-1">
                          {s.status !== 'finished' && (
                            <button
                              onClick={() => {
                                setActiveActionSessionId(null);
                                onFinishSession(s.id, s.session_code);
                              }}
                              className="w-full text-left px-3.5 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center gap-2.5 transition cursor-pointer"
                            >
                              <Lock className="w-4 h-4 text-amber-600" />
                              <span>Kết thúc / Thu bài toàn bộ</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setActiveActionSessionId(null);
                              onDeleteSession(s.id, s.session_code);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4 text-rose-600" />
                            <span>Xóa ca thi</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phân trang Ca Thi */}
      {renderPagination(sessionPage, totalSessionPages, filteredSessions.length, setSessionPage)}
    </div>
  );
}
