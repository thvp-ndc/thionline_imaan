import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserPlus, Upload, Download, Edit2, Trash2, Search, 
  CheckCircle2, AlertCircle, X, CheckSquare, Square, 
  Folder, FolderOpen, ChevronRight, ChevronDown, FileSpreadsheet, 
  Hash, Sparkles, Printer, GraduationCap, School, Layers, Filter,
  ChevronLeft, ChevronsLeft, ChevronsRight, RefreshCw
} from 'lucide-react';
import AutoAssignSbdModal from './AutoAssignSbdModal';
import PrintSbdModal from './PrintSbdModal';

export default function StudentManager() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schoolInfo, setSchoolInfo] = useState(null);

  // Tree View Selection State
  // { type: 'ALL' } | { type: 'GRADE', gradeNum: 7, label: 'Khối 7' } | { type: 'CLASS', className: '10A1', label: 'Lớp 10A1' }
  const [treeSelection, setTreeSelection] = useState({ type: 'ALL', label: 'Tất cả học sinh' });
  const [expandedNodes, setExpandedNodes] = useState({
    thcs: true,
    thpt: true,
    'Khối 7': true,
    'Khối 8': true,
    'Khối 9': true,
    'Khối 10': true,
    'Khối 11': true,
    'Khối 12': true
  });

  // Filter & Search State
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sbdFilter, setSbdFilter] = useState('ALL'); // 'ALL' | 'HAS_SBD' | 'NO_SBD'

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50); // 25, 50, 100

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deletingBatch, setDeletingBatch] = useState(false);

  // Modals
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [studentForm, setStudentForm] = useState({
    student_code: '',
    student_name: '',
    dob: '',
    class_name: '',
    gender: 'Nam'
  });

  const [showAutoAssignModal, setShowAutoAssignModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Import Excel State
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState(null);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/students');
      const data = await res.json();
      if (data.success) {
        setStudents(data.students || []);
        setClasses(data.classes || []);
      }
    } catch (err) {
      console.error('Fetch students error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetch('/api/system/school-info')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.schoolInfo) setSchoolInfo(d.schoolInfo);
      })
      .catch(() => {});
  }, []);

  // Compute Tree View hierarchy
  const treeData = useMemo(() => {
    const totalCount = students.length;
    const classCounts = {};
    for (const st of students) {
      const cls = (st.class_name || 'Khác').trim().toUpperCase();
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    }

    const grades = {};
    for (const [cls, count] of Object.entries(classCounts)) {
      const match = cls.match(/^(\d+)/);
      const gradeNum = match ? parseInt(match[1], 10) : null;
      const gradeKey = gradeNum ? `Khối ${gradeNum}` : 'Khác';
      if (!grades[gradeKey]) {
        grades[gradeKey] = {
          gradeNum,
          total: 0,
          classes: []
        };
      }
      grades[gradeKey].total += count;
      grades[gradeKey].classes.push({ name: cls, count });
    }

    // Sort classes inside each grade
    for (const g of Object.values(grades)) {
      g.classes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }

    const thcs = [];
    const thpt = [];
    const others = [];

    for (const [gradeKey, data] of Object.entries(grades)) {
      if (data.gradeNum >= 6 && data.gradeNum <= 9) {
        thcs.push({ key: gradeKey, ...data });
      } else if (data.gradeNum >= 10 && data.gradeNum <= 12) {
        thpt.push({ key: gradeKey, ...data });
      } else {
        others.push({ key: gradeKey, ...data });
      }
    }

    thcs.sort((a, b) => a.gradeNum - b.gradeNum);
    thpt.sort((a, b) => a.gradeNum - b.gradeNum);

    return { totalCount, thcs, thpt, others };
  }, [students]);

  const toggleExpand = (nodeKey) => {
    setExpandedNodes(prev => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  };

  // Filter students based on treeSelection, sbdFilter, searchKeyword
  const filteredStudents = useMemo(() => {
    return students.filter(st => {
      // 1. Tree selection filter
      if (treeSelection.type === 'CLASS') {
        if ((st.class_name || '').toUpperCase() !== treeSelection.className.toUpperCase()) {
          return false;
        }
      } else if (treeSelection.type === 'GRADE') {
        const match = (st.class_name || '').match(/^(\d+)/);
        if (!match || parseInt(match[1], 10) !== treeSelection.gradeNum) {
          return false;
        }
      }

      // 2. SBD filter
      const hasSbd = Boolean(st.student_code && st.student_code.trim() !== '' && st.student_code !== 'CHUA_CO');
      if (sbdFilter === 'HAS_SBD' && !hasSbd) return false;
      if (sbdFilter === 'NO_SBD' && hasSbd) return false;

      // 3. Search keyword
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const codeMatch = st.student_code && st.student_code.toLowerCase().includes(kw);
        const nameMatch = st.student_name && st.student_name.toLowerCase().includes(kw);
        const classMatch = st.class_name && st.class_name.toLowerCase().includes(kw);
        const dobMatch = st.dob && st.dob.toLowerCase().includes(kw);
        if (!codeMatch && !nameMatch && !classMatch && !dobMatch) return false;
      }

      return true;
    });
  }, [students, treeSelection, sbdFilter, searchKeyword]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [treeSelection, sbdFilter, searchKeyword, pageSize]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  // Multi-select handlers
  const isAllPageSelected = paginatedStudents.length > 0 && paginatedStudents.every(st => selectedIds.has(st.id));
  const isSomePageSelected = paginatedStudents.some(st => selectedIds.has(st.id)) && !isAllPageSelected;

  const handleToggleSelectAllPage = () => {
    const newSet = new Set(selectedIds);
    if (isAllPageSelected) {
      paginatedStudents.forEach(st => newSet.delete(st.id));
    } else {
      paginatedStudents.forEach(st => newSet.add(st.id));
    }
    setSelectedIds(newSet);
  };

  const handleToggleSelectOne = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Add / Edit Handlers
  const handleOpenAdd = () => {
    setEditingStudent(null);
    let defaultClass = '10A1';
    if (treeSelection.type === 'CLASS') {
      defaultClass = treeSelection.className;
    } else if (treeSelection.type === 'GRADE') {
      defaultClass = `${treeSelection.gradeNum}A1`;
    }
    setStudentForm({
      student_code: '',
      student_name: '',
      dob: '',
      class_name: defaultClass,
      gender: 'Nam'
    });
    setShowStudentModal(true);
  };

  const handleOpenEdit = (st) => {
    setEditingStudent(st);
    setStudentForm({
      student_code: st.student_code || '',
      student_name: st.student_name,
      dob: st.dob || '',
      class_name: st.class_name || '',
      gender: st.gender || 'Nam'
    });
    setShowStudentModal(true);
  };

  const handleSaveStudent = async (e) => {
    e.preventDefault();
    try {
      const url = editingStudent ? `/api/students/${editingStudent.id}` : '/api/students';
      const method = editingStudent ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentForm)
      });
      const data = await res.json();
      if (data.success) {
        setShowStudentModal(false);
        fetchStudents();
        setImportMessage({ type: 'success', text: editingStudent ? 'Đã cập nhật học sinh thành công!' : 'Đã thêm học sinh mới thành công!' });
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Không thể lưu học sinh: ' + err.message);
    }
  };

  const handleDeleteStudent = async (st) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa học sinh [${st.student_name} - SBD: ${st.student_code || 'Chưa có'}]?`)) return;
    try {
      const res = await fetch(`/api/students/${st.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        const newSet = new Set(selectedIds);
        newSet.delete(st.id);
        setSelectedIds(newSet);
        fetchStudents();
        setImportMessage({ type: 'success', text: `Đã xóa học sinh ${st.student_name} thành công!` });
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa ${count} học sinh đã chọn khỏi danh sách?\n\nLưu ý: Thao tác này sẽ xóa vĩnh viễn các học sinh đã chọn!`)) {
      return;
    }

    try {
      setDeletingBatch(true);
      const res = await fetch('/api/students/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      const data = await res.json();
      if (data.success) {
        setImportMessage({ type: 'success', text: `Đã xóa thành công ${data.count || count} học sinh đã chọn!` });
        setSelectedIds(new Set());
        fetchStudents();
      } else {
        setImportMessage({ type: 'error', text: 'Lỗi khi xóa học sinh: ' + data.message });
      }
    } catch (err) {
      setImportMessage({ type: 'error', text: 'Lỗi kết nối máy chủ: ' + err.message });
    } finally {
      setDeletingBatch(false);
    }
  };

  const handleDeleteEntireClass = async (className) => {
    if (!className) return;
    if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ học sinh của lớp [${className}]?\n\nThao tác này sẽ xóa vĩnh viễn toàn bộ học sinh thuộc lớp ${className}!`)) {
      return;
    }

    try {
      setDeletingBatch(true);
      const res = await fetch('/api/students/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className })
      });
      const data = await res.json();
      if (data.success) {
        setImportMessage({ type: 'success', text: `Đã xóa thành công toàn bộ học sinh lớp ${className} (${data.count} học sinh)!` });
        setSelectedIds(new Set());
        setTreeSelection({ type: 'ALL', label: 'Tất cả học sinh' });
        fetchStudents();
      } else {
        setImportMessage({ type: 'error', text: 'Lỗi: ' + data.message });
      }
    } catch (err) {
      setImportMessage({ type: 'error', text: 'Lỗi: ' + err.message });
    } finally {
      setDeletingBatch(false);
    }
  };

  // Export Excel Handlers
  const handleExportExcel = () => {
    const params = new URLSearchParams();
    if (treeSelection.type === 'CLASS') {
      params.set('className', treeSelection.className);
    } else if (treeSelection.type === 'GRADE') {
      params.set('grade', treeSelection.gradeNum);
    }
    if (sbdFilter !== 'ALL') {
      params.set('sbdStatus', sbdFilter);
    }
    if (searchKeyword.trim()) {
      params.set('search', searchKeyword.trim());
    }
    window.open(`/api/students/export-excel?${params.toString()}`, '_blank');
  };

  const handleDownloadTemplate = () => {
    window.open('/api/students/export-template', '_blank');
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setImporting(true);
      setImportMessage(null);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        const res = await fetch('/api/students/import-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64 })
        });
        const data = await res.json();
        if (data.success) {
          setImportMessage({ type: 'success', text: `Nhập thành công ${data.importedCount} học sinh từ file Excel!` });
          fetchStudents();
        } else {
          setImportMessage({ type: 'error', text: data.message || 'Lỗi đọc file Excel' });
        }
        setImporting(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setImportMessage({ type: 'error', text: 'Lỗi tải file: ' + err.message });
      setImporting(false);
    }
  };

  // Print Target Students
  const studentsToPrint = useMemo(() => {
    if (selectedIds.size > 0) {
      return students.filter(st => selectedIds.has(st.id));
    }
    return filteredStudents;
  }, [students, selectedIds, filteredStudents]);

  return (
    <div className="space-y-4">
      {/* Thông báo thao tác */}
      {importMessage && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-medium shadow-2xs animate-fadeIn ${
          importMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {importMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
            <span>{importMessage.text}</span>
          </div>
          <button
            onClick={() => setImportMessage(null)}
            className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Header Bar & Toolbar Cố Định (Hàng thứ 3 cố định) */}
      <div className="sticky top-[100px] z-20 bg-slate-50/95 backdrop-blur-md pt-2 pb-3 border-b border-slate-200/90 -mx-4 sm:-mx-6 px-4 sm:px-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Bên trái: Tiêu đề + Scope + Ô tìm kiếm + Dropdown lọc SBD */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <Users className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Danh Sách Học Sinh
              </h2>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 border border-slate-200/80 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700">
              <span className="truncate max-w-[150px]">{treeSelection.label || 'Tất cả học sinh'}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {filteredStudents.length} HS
              </span>
            </div>

            {/* Input tìm kiếm */}
            <div className="relative w-44 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                placeholder="Tìm SBD, Họ tên, Ngày sinh..."
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-6 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
              />
              {searchKeyword && (
                <button
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Dropdown Bộ lọc SBD */}
            <select
              value={sbdFilter}
              onChange={e => setSbdFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
            >
              <option value="ALL">Tất cả SBD</option>
              <option value="HAS_SBD">Đã có SBD</option>
              <option value="NO_SBD">Chưa có SBD</option>
            </select>
          </div>

          {/* Bên phải: Nhóm nút hành động */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/90 rounded-lg text-xs font-semibold transition shadow-2xs cursor-pointer"
              title="Xuất bảng Excel danh sách học sinh kèm Số Báo Danh và cột ký tên"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Tải DS SBD (Excel)</span>
            </button>

            <button
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs cursor-pointer"
              title="In phiếu / thẻ SBD phòng máy để dán bàn thi hoặc đối chiếu"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">In Thẻ SBD</span>
            </button>

            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">{importing ? 'Đang Nhập...' : 'Nhập Excel'}</span>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
                disabled={importing}
              />
            </label>

            <button
              onClick={handleDownloadTemplate}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs cursor-pointer"
              title="Tải mẫu file Excel nhập danh sách học sinh chuẩn"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
            </button>

            <button
              onClick={() => setShowAutoAssignModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition shadow-2xs cursor-pointer"
              title="Tự động đánh Số Báo Danh theo mã lớp hoặc tiền tố tùy chỉnh"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Đánh SBD</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-xs cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Thêm Học Sinh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="flex flex-col lg:flex-row items-start gap-4">
        {/* ======================================================== */}
        {/* CỘT TRÁI: CÂY THƯ MỤC KHỐI & LỚP (CỐ ĐỊNH KHI CUỘN)       */}
        {/* ======================================================== */}
        <div className="w-full lg:w-72 shrink-0 lg:sticky lg:top-[186px] lg:h-[calc(100vh-200px)] bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col overflow-hidden">
          {/* Header Cây thư mục */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 pb-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <School className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Cây Khối & Lớp</span>
            </div>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
              {treeData.totalCount} HS
            </span>
          </div>

          {/* Danh mục Cây thư mục */}
          <div className="flex-1 overflow-y-auto space-y-1 text-xs select-none pr-1 custom-scrollbar min-h-0 pt-1">
            {/* Gốc: Tất Cả Học Sinh */}
            <button
              onClick={() => setTreeSelection({ type: 'ALL', label: 'Tất cả học sinh' })}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition text-left cursor-pointer ${
                treeSelection.type === 'ALL'
                  ? 'bg-blue-50 text-blue-700 font-bold border-r-2 border-blue-600 shadow-2xs'
                  : 'text-slate-700 hover:bg-slate-50 font-medium'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Users className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">Tất cả học sinh</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                {treeData.totalCount}
              </span>
            </button>

            {/* NHÓM CẤP THCS */}
            {treeData.thcs.length > 0 && (
              <div className="pt-2">
                <div 
                  onClick={() => toggleExpand('thcs')}
                  className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-700 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    {expandedNodes.thcs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Cấp THCS
                  </span>
                  <span className="font-mono text-[10px]">
                    {treeData.thcs.reduce((acc, g) => acc + g.total, 0)} HS
                  </span>
                </div>

                {expandedNodes.thcs && (
                  <div className="space-y-0.5 pl-2 mt-0.5 border-l border-slate-200/80 ml-2">
                    {treeData.thcs.map(grade => {
                      const isGradeActive = treeSelection.type === 'GRADE' && treeSelection.gradeNum === grade.gradeNum;
                      const isExpanded = expandedNodes[grade.key] !== false;

                      return (
                        <div key={grade.key} className="space-y-0.5">
                          {/* Khối (Grade Level 1) */}
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => toggleExpand(grade.key)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition cursor-pointer"
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setTreeSelection({ type: 'GRADE', gradeNum: grade.gradeNum, label: grade.key, count: grade.total })}
                              className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg transition text-left cursor-pointer truncate ${
                                isGradeActive
                                  ? 'bg-blue-50 text-blue-700 font-bold border-r-2 border-blue-600 shadow-2xs'
                                  : 'text-slate-700 hover:bg-slate-50 font-medium'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {isExpanded ? (
                                  <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                                ) : (
                                  <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                )}
                                <span className="truncate">{grade.key}</span>
                              </div>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                {grade.total}
                              </span>
                            </button>
                          </div>

                          {/* Danh sách Lớp (Class Level 2) */}
                          {isExpanded && (
                            <div className="pl-6 space-y-0.5 border-l border-slate-200/60 ml-3">
                              {grade.classes.map(cls => {
                                const isClassActive = treeSelection.type === 'CLASS' && treeSelection.className === cls.name;
                                return (
                                  <button
                                    key={cls.name}
                                    type="button"
                                    onClick={() => setTreeSelection({ type: 'CLASS', className: cls.name, label: `Lớp ${cls.name}`, count: cls.count })}
                                    className={`w-full flex items-center justify-between px-2 py-1 rounded-md transition text-left cursor-pointer text-xs ${
                                      isClassActive
                                        ? 'bg-blue-50 text-blue-700 font-bold border-r-2 border-blue-600 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className="truncate">Lớp {cls.name}</span>
                                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                                      isClassActive ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {cls.count}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* NHÓM CẤP THPT */}
            {treeData.thpt.length > 0 && (
              <div className="pt-2">
                <div 
                  onClick={() => toggleExpand('thpt')}
                  className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-700 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    {expandedNodes.thpt ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Cấp THPT
                  </span>
                  <span className="font-mono text-[10px]">
                    {treeData.thpt.reduce((acc, g) => acc + g.total, 0)} HS
                  </span>
                </div>

                {expandedNodes.thpt && (
                  <div className="space-y-0.5 pl-2 mt-0.5 border-l border-slate-200/80 ml-2">
                    {treeData.thpt.map(grade => {
                      const isGradeActive = treeSelection.type === 'GRADE' && treeSelection.gradeNum === grade.gradeNum;
                      const isExpanded = expandedNodes[grade.key] !== false;

                      return (
                        <div key={grade.key} className="space-y-0.5">
                          {/* Khối (Grade Level 1) */}
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => toggleExpand(grade.key)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition cursor-pointer"
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setTreeSelection({ type: 'GRADE', gradeNum: grade.gradeNum, label: grade.key, count: grade.total })}
                              className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg transition text-left cursor-pointer truncate ${
                                isGradeActive
                                  ? 'bg-blue-50 text-blue-700 font-bold border-r-2 border-blue-600 shadow-2xs'
                                  : 'text-slate-700 hover:bg-slate-50 font-medium'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {isExpanded ? (
                                  <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
                                ) : (
                                  <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                                )}
                                <span className="truncate">{grade.key}</span>
                              </div>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                {grade.total}
                              </span>
                            </button>
                          </div>

                          {/* Danh sách Lớp (Class Level 2) */}
                          {isExpanded && (
                            <div className="pl-6 space-y-0.5 border-l border-slate-200/60 ml-3">
                              {grade.classes.map(cls => {
                                const isClassActive = treeSelection.type === 'CLASS' && treeSelection.className === cls.name;
                                return (
                                  <button
                                    key={cls.name}
                                    type="button"
                                    onClick={() => setTreeSelection({ type: 'CLASS', className: cls.name, label: `Lớp ${cls.name}`, count: cls.count })}
                                    className={`w-full flex items-center justify-between px-2 py-1 rounded-md transition text-left cursor-pointer text-xs ${
                                      isClassActive
                                        ? 'bg-blue-50 text-blue-700 font-bold border-r-2 border-blue-600 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className="truncate">Lớp {cls.name}</span>
                                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                                      isClassActive ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {cls.count}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* NHÓM KHÁC (NẾU CÓ) */}
            {treeData.others.length > 0 && (
              <div className="pt-2">
                <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Khác
                </div>
                {treeData.others.map(g => (
                  <div key={g.key} className="pl-3 space-y-0.5">
                    {g.classes.map(cls => (
                      <button
                        key={cls.name}
                        onClick={() => setTreeSelection({ type: 'CLASS', className: cls.name, label: cls.name, count: cls.count })}
                        className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-xs cursor-pointer ${
                          treeSelection.type === 'CLASS' && treeSelection.className === cls.name
                            ? 'bg-blue-50 text-blue-700 font-bold'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>{cls.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">{cls.count}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nút hành động nhanh ở sidebar */}
          {treeSelection.type === 'CLASS' && (
            <div className="pt-2 border-t border-slate-100 shrink-0">
              <button
                onClick={() => handleDeleteEntireClass(treeSelection.className)}
                disabled={deletingBatch}
                className="w-full py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                title={`Xóa toàn bộ học sinh lớp ${treeSelection.className}`}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Xóa Cả Lớp {treeSelection.className}</span>
              </button>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* CỘT PHẢI: BẢNG DỮ LIỆU & TÍNH NĂNG SBD                   */}
        {/* ======================================================== */}
        <div className="flex-1 min-w-0 w-full space-y-3">
          {/* Floating Action Bar (Khi có checkbox được chọn) */}
          {selectedIds.size > 0 && (
            <div className="bg-slate-900 text-white rounded-xl p-3 px-4 flex flex-wrap items-center justify-between gap-3 shadow-xl animate-fadeIn sticky top-[186px] z-25">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-600 text-white font-bold text-xs">
                  {selectedIds.size}
                </span>
                <span className="text-xs font-medium text-slate-200">
                  Đang chọn <strong>{selectedIds.size}</strong> học sinh
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPrintModal(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-400" />
                  <span>In Phiếu SBD ({selectedIds.size})</span>
                </button>

                <button
                  onClick={() => setShowAutoAssignModal(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                >
                  <Hash className="w-3.5 h-3.5" />
                  <span>Đánh SBD Mục Đã Chọn</span>
                </button>

                <button
                  onClick={handleBatchDelete}
                  disabled={deletingBatch}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa ({selectedIds.size})</span>
                </button>

                <button
                  onClick={handleClearSelection}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
                  title="Bỏ chọn"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Bảng Dữ Liệu Học Sinh (Table Data) */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            {loading ? (
              <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                <span>Đang tải danh sách học sinh...</span>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <Users className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-slate-700 font-semibold text-sm">Không tìm thấy học sinh nào.</p>
                <p className="text-xs text-slate-400">
                  {searchKeyword ? 'Thử tìm kiếm với từ khóa khác hoặc thay đổi bộ lọc SBD.' : 'Chưa có học sinh nào trong mục này.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50/80 text-xs font-bold text-slate-600 uppercase border-b border-slate-200 select-none">
                    <tr>
                      <th className="py-3 px-3 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={isAllPageSelected}
                          ref={input => {
                            if (input) input.indeterminate = isSomePageSelected;
                          }}
                          onChange={handleToggleSelectAllPage}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                          title={isAllPageSelected ? 'Bỏ chọn toàn bộ trang này' : 'Chọn toàn bộ học sinh trên trang này'}
                        />
                      </th>
                      <th className="py-3 px-3 w-14 text-center">STT</th>
                      <th className="py-3 px-4 w-36">Số Báo Danh</th>
                      <th className="py-3 px-4">Họ Và Tên</th>
                      <th className="py-3 px-4 w-28">Ngày Sinh</th>
                      <th className="py-3 px-4 w-24">Lớp</th>
                      <th className="py-3 px-4 w-24">Giới Tính</th>
                      <th className="py-3 px-4 w-28 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginatedStudents.map((st, idx) => {
                      const isSelected = selectedIds.has(st.id);
                      const hasSbd = Boolean(st.student_code && st.student_code.trim() !== '' && st.student_code !== 'CHUA_CO');
                      const globalIndex = (currentPage - 1) * pageSize + idx + 1;

                      return (
                        <tr
                          key={st.id}
                          onClick={(e) => {
                            if (e.target.closest('button') || e.target.closest('input')) return;
                            handleToggleSelectOne(st.id);
                          }}
                          className={`transition cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50/50 border-l-2 border-l-blue-600 hover:bg-blue-50/70'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectOne(st.id)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                            {globalIndex}
                          </td>
                          <td className="py-2.5 px-4">
                            {hasSbd ? (
                              <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60 text-xs">
                                {st.student_code}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                Chưa có SBD
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-900 text-xs sm:text-sm">
                            {st.student_name}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 font-mono text-xs">
                            {st.dob || '-'}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs text-slate-700 font-medium">
                              {st.class_name || '-'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-500">
                            {st.gender || '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEdit(st)}
                                className="p-1.5 bg-slate-50 hover:bg-slate-200/70 text-slate-600 hover:text-blue-700 rounded-lg border border-slate-200 transition shadow-2xs cursor-pointer"
                                title="Chỉnh sửa thông tin học sinh"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(st)}
                                className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg border border-slate-200 transition shadow-2xs cursor-pointer"
                                title="Xóa học sinh này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

            {/* Pagination Controls */}
            {filteredStudents.length > 0 && (
              <div className="p-3.5 px-4 border-t border-slate-200/80 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Thông tin số lượng hiển thị */}
                <div className="flex items-center gap-3 text-slate-500">
                  <span>
                    Hiển thị <strong>{(currentPage - 1) * pageSize + 1}</strong> - <strong>{Math.min(currentPage * pageSize, filteredStudents.length)}</strong> trong tổng số <strong>{filteredStudents.length}</strong> học sinh
                  </span>

                  {/* Bộ chọn số học sinh trên mỗi trang */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">|</span>
                    <span>Số dòng/trang:</span>
                    <select
                      value={pageSize}
                      onChange={e => setPageSize(Number(e.target.value))}
                      className="bg-white border border-slate-200 rounded-md px-2 py-1 font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-blue-500"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                {/* Điều hướng trang */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Về trang đầu"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Trang trước"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <span className="px-3 py-1 font-medium text-slate-700">
                    Trang <strong>{currentPage}</strong> / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Trang tiếp theo"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Đến trang cuối"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Thêm / Sửa Học Sinh */}
      {showStudentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-800 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingStudent ? 'Chỉnh Sửa Thông Tin Học Sinh' : 'Thêm Học Sinh Mới'}
              </h3>
              <button
                onClick={() => setShowStudentModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Số Báo Danh (SBD) <span className="text-slate-400 font-normal lowercase">(tùy chọn)</span>
                </label>
                <input
                  type="text"
                  value={studentForm.student_code}
                  onChange={e => setStudentForm({ ...studentForm, student_code: e.target.value.toUpperCase() })}
                  placeholder="Để trống nếu muốn hệ thống tự đánh SBD sau"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-mono font-bold uppercase focus:border-blue-500 focus:bg-white focus:outline-none text-xs sm:text-sm transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Họ Và Tên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentForm.student_name}
                  onChange={e => setStudentForm({ ...studentForm, student_name: e.target.value })}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-semibold focus:border-blue-500 focus:bg-white focus:outline-none text-xs sm:text-sm transition"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Ngày Sinh <span className="text-slate-400 font-normal lowercase">(tùy chọn)</span>
                  </label>
                  <input
                    type="text"
                    value={studentForm.dob}
                    onChange={e => setStudentForm({ ...studentForm, dob: e.target.value })}
                    placeholder="VD: 15/04/2008"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:border-blue-500 focus:bg-white focus:outline-none text-xs sm:text-sm transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Giới Tính</label>
                  <select
                    value={studentForm.gender}
                    onChange={e => setStudentForm({ ...studentForm, gender: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:border-blue-500 focus:bg-white focus:outline-none text-xs sm:text-sm transition"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Lớp</label>
                <input
                  type="text"
                  value={studentForm.class_name}
                  onChange={e => setStudentForm({ ...studentForm, class_name: e.target.value.toUpperCase() })}
                  placeholder="10A1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 uppercase font-bold focus:border-blue-500 focus:bg-white focus:outline-none text-xs sm:text-sm transition"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowStudentModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-2xs cursor-pointer"
                >
                  Lưu Thông Tin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Đánh Số Báo Danh Tự Động */}
      {showAutoAssignModal && (
        <AutoAssignSbdModal
          isOpen={showAutoAssignModal}
          onClose={() => setShowAutoAssignModal(false)}
          selectedScope={{
            type: treeSelection.type,
            value: treeSelection.type === 'CLASS' ? treeSelection.className : treeSelection.type === 'GRADE' ? treeSelection.gradeNum : null,
            count: treeSelection.count || filteredStudents.length,
            totalCount: treeData.totalCount
          }}
          selectedIds={Array.from(selectedIds)}
          classList={classes}
          onSuccess={(res) => {
            fetchStudents();
            setImportMessage({
              type: 'success',
              text: `Đã đánh Số Báo Danh thành công cho ${res.updatedCount} học sinh!`
            });
            handleClearSelection();
          }}
        />
      )}

      {/* Modal In Thẻ / Phiếu SBD Phòng Máy */}
      {showPrintModal && (
        <PrintSbdModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          students={studentsToPrint}
          schoolName={schoolInfo?.school_name || 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH'}
          className={treeSelection.type === 'CLASS' ? treeSelection.className : ''}
        />
      )}
    </div>
  );
}
