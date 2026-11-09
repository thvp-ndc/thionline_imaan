import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Search, X as CloseIcon, LayoutGrid, List, Download,
  Eye, Clock, Edit2, Trash2, Shuffle, ChevronLeft, ChevronRight,
  ChevronDown, RotateCw
} from 'lucide-react';
import ExamExportModal from './ExamExportModal';

export const STANDARD_GRADES = ['6', '7', '8', '9', '10', '11', '12'];

export default function ExamListSection({
  exams = [],
  loading = false,
  examSearch: propExamSearch,
  setExamSearch: propSetExamSearch,
  examGradeFilter: propExamGradeFilter,
  setExamGradeFilter: propSetExamGradeFilter,
  examSubjectFilter: propExamSubjectFilter,
  setExamSubjectFilter: propSetExamSubjectFilter,
  examTypeFilter: propExamTypeFilter,
  setExamTypeFilter: propSetExamTypeFilter,
  onOpenCreateSessionForExam,
  onOpenEditExam,
  onPreviewExam,
  onOpenShuffleExam,
  onDeleteExam
}) {
  const [internalExamSearch, setInternalExamSearch] = useState('');
  const [internalExamGradeFilter, setInternalExamGradeFilter] = useState('all');
  const [internalExamSubjectFilter, setInternalExamSubjectFilter] = useState('all');
  const [internalExamTypeFilter, setInternalExamTypeFilter] = useState('all');

  const examSearch = propExamSearch !== undefined ? propExamSearch : internalExamSearch;
  const setExamSearch = propSetExamSearch || setInternalExamSearch;
  const examGradeFilter = propExamGradeFilter !== undefined ? propExamGradeFilter : internalExamGradeFilter;
  const setExamGradeFilter = propSetExamGradeFilter || setInternalExamGradeFilter;
  const examSubjectFilter = propExamSubjectFilter !== undefined ? propExamSubjectFilter : internalExamSubjectFilter;
  const setExamSubjectFilter = propSetExamSubjectFilter || setInternalExamSubjectFilter;
  const examTypeFilter = propExamTypeFilter !== undefined ? propExamTypeFilter : internalExamTypeFilter;
  const setExamTypeFilter = propSetExamTypeFilter || setInternalExamTypeFilter;

  const [examViewMode, setExamViewMode] = useState(() => localStorage.getItem('lan_exam_exam_view') || 'grid');
  const [examPage, setExamPage] = useState(1);
  const [exportingExam, setExportingExam] = useState(null);

  const PAGE_SIZE = 9;

  const handleToggleExamViewMode = (mode) => {
    setExamViewMode(mode);
    localStorage.setItem('lan_exam_exam_view', mode);
  };

  useEffect(() => {
    setExamPage(1);
  }, [examSearch, examGradeFilter, examSubjectFilter, examTypeFilter, examViewMode]);

  // Trích xuất khối lớp của đề thi
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

  // Danh sách các khối khả dụng
  const filterGradeOptions = useMemo(() => {
    const set = new Set();
    (exams || []).forEach(e => {
      const g = getExamGrade(e);
      if (g) set.add(g);
    });
    if (set.size === 0) {
      STANDARD_GRADES.forEach(g => set.add(g));
    }
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [exams]);

  // Danh sách các môn học khả dụng
  const filterSubjectOptions = useMemo(() => {
    const set = new Set((exams || []).map(e => (e.subject || 'Chung').trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [exams]);

  // Lọc đề thi theo Khối, Môn, Loại & Từ khóa tìm kiếm
  const filteredExams = useMemo(() => {
    return (exams || []).filter(e => {
      // 1. Lọc theo Khối
      if (examGradeFilter !== 'all') {
        const g = getExamGrade(e);
        if (g !== examGradeFilter) return false;
      }

      // 2. Lọc theo Môn
      if (examSubjectFilter !== 'all') {
        if ((e.subject || 'Chung').trim().toLowerCase() !== examSubjectFilter.trim().toLowerCase()) {
          return false;
        }
      }

      // 3. Lọc theo Loại kiểm tra
      if (examTypeFilter !== 'all') {
        const codeOrTitle = `${e.title || ''} ${e.note || ''}`.toUpperCase();
        if (examTypeFilter === 'KTTX') {
          const isTX = codeOrTitle.includes('KTTX') || codeOrTitle.includes('_TX') || codeOrTitle.includes('-TX') || codeOrTitle.includes('THƯỜNG XUYÊN');
          if (!isTX) return false;
        } else if (examTypeFilter === 'GK') {
          const hasTX = codeOrTitle.includes('KTTX') || codeOrTitle.includes('_TX') || codeOrTitle.includes('-TX');
          const isGK = (!hasTX && codeOrTitle.includes('GIỮA KỲ')) || codeOrTitle.includes('_GK') || codeOrTitle.includes('-GK') || codeOrTitle.includes(' GK');
          if (!isGK) return false;
        } else if (examTypeFilter === 'CK') {
          const isCK = codeOrTitle.includes('CUỐI KỲ') || codeOrTitle.includes('_CK') || codeOrTitle.includes('-CK') || codeOrTitle.includes(' CK');
          if (!isCK) return false;
        }
      }

      // 4. Tìm kiếm từ khóa
      if (examSearch.trim()) {
        const term = examSearch.trim().toLowerCase();
        const matchTitle = (e.title || '').toLowerCase().includes(term);
        const matchSubject = (e.subject || '').toLowerCase().includes(term);
        const matchNote = (e.note || '').toLowerCase().includes(term);
        if (!matchTitle && !matchSubject && !matchNote) return false;
      }

      return true;
    });
  }, [exams, examGradeFilter, examSubjectFilter, examTypeFilter, examSearch]);

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

  const totalExamPages = Math.max(1, Math.ceil(filteredExams.length / PAGE_SIZE));
  const paginatedExams = filteredExams.slice((examPage - 1) * PAGE_SIZE, examPage * PAGE_SIZE);

  const renderPagination = (currentPage, totalPages, totalItems, onPageChange) => {
    if (totalItems === 0 || totalPages <= 1) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 text-xs text-slate-500">
        <div>
          Hiển thị trang <strong className="text-slate-800">{currentPage}</strong> / <strong className="text-slate-800">{totalPages}</strong> (Tổng <strong className="text-blue-600">{totalItems}</strong> mục)
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition flex items-center gap-1 border border-slate-200 shadow-2xs"
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
                  className={`min-w-[30px] h-[30px] rounded-lg font-bold transition ${
                    currentPage === p ? 'bg-blue-600 text-white shadow-2xs' : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  {p}
                </button>
              </React.Fragment>
            ))}
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition flex items-center gap-1 border border-slate-200 shadow-2xs"
          >
            Sau <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-2xs">
      {/* Toolbar Đề Thi Gọn Gàng */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-0.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">Danh Sách Đề Thi Trong Kho</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {filteredExams.length} đề thi
              </span>
            </div>
            {hasActiveExamFilters && (
              <span className="text-[11px] text-blue-600 font-medium">
                Đang áp dụng bộ lọc từ Hàng 3 (Tìm kiếm / Khối / Môn / Loại)
              </span>
            )}
          </div>
        </div>

        {/* Nhóm phải: Toggle View [▦][☷] + Tải Mẫu Word */}
        <div className="flex items-center gap-2">
          {/* Toggle View Mode: Grid vs Table */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => handleToggleExamViewMode('grid')}
              title="Chế độ danh sách (List View)"
              className={`p-1.5 rounded transition ${
                examViewMode === 'grid' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleToggleExamViewMode('table')}
              title="Chế độ bảng thu gọn (Compact Table)"
              className={`p-1.5 rounded transition ${
                examViewMode === 'table' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tải Mẫu Word */}
          <a
            href="/api/exams/sample-word"
            download
            className="px-2.5 py-1.5 h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition border border-slate-200 flex items-center gap-1 shadow-2xs"
            title="Tải tệp mẫu đề thi Word (.docx)"
          >
            <Download className="w-3.5 h-3.5" /> File Mẫu
          </a>
        </div>
      </div>

      {/* Nội dung danh sách đề thi */}
      {loading ? (
        <p className="text-slate-500 text-xs italic py-4">Đang tải danh sách đề thi...</p>
      ) : filteredExams.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
          <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
          <p className="text-slate-800 text-sm font-semibold">Không tìm thấy đề thi phù hợp</p>
          <p className="text-slate-500 text-xs mt-1">
            {hasActiveExamFilters
              ? 'Thử thay đổi từ khóa hoặc bộ lọc khối / môn học / loại kiểm tra.'
              : 'Chưa có đề thi nào. Nhấn "Soạn Đề" để bắt đầu.'}
          </p>
          {hasActiveExamFilters && (
            <button
              onClick={handleResetExamFilters}
              className="mt-3 px-3 py-1 bg-white hover:bg-slate-50 text-blue-600 rounded-lg text-xs font-semibold transition border border-slate-200 flex items-center gap-1.5 mx-auto shadow-2xs"
            >
              <RotateCw className="w-3 h-3" />
              Đặt lại toàn bộ bộ lọc
            </button>
          )}
        </div>
      ) : examViewMode === 'table' ? (
        /* COMPACT TABLE VIEW */
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Tên Đề Thi</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Khối / Môn</th>
                <th className="py-2.5 px-3">Cơ Cấu Câu Hỏi</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Thang Điểm & Trộn Đề</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {paginatedExams.map(exam => {
                const detectedGrade = getExamGrade(exam);

                return (
                  <tr key={exam.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 max-w-[280px]">
                      <div
                        onClick={() => onPreviewExam(exam.id)}
                        className="cursor-pointer group flex items-center gap-1.5"
                        title="Nhấp để xem trước đề thi trực quan (như học sinh làm bài) và chỉnh sửa"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition shrink-0" />
                        <span className="font-bold text-slate-900 text-xs block truncate group-hover:text-blue-600 group-hover:underline transition">
                          {exam.title}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {detectedGrade && (
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-bold text-[10px]">
                            K{detectedGrade}
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-medium">
                          {exam.subject || 'Chung'}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-slate-900">Tổng {exam.total_questions}</span>
                        <span className="text-blue-600 font-medium">TN: {exam.mcq_count}</span>
                        {exam.tf_count > 0 && <span className="text-teal-700 font-medium">Đ/S: {exam.tf_count}</span>}
                        {exam.essay_count > 0 && <span className="text-amber-700 font-medium">TL: {exam.essay_count}</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-bold text-emerald-600">{exam.total_score}đ</span>
                      {exam.shuffle_questions === 1 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 font-medium">
                          <Shuffle className="w-3 h-3" /> Trộn
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Nút Trộn đề hoán vị */}
                        <button
                          onClick={() => onOpenShuffleExam && onOpenShuffleExam(exam)}
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-semibold transition border border-indigo-200 flex items-center gap-1 shadow-2xs"
                          title="Trộn đề hoán vị (101, 102...) & xuất trọn gói in ấn (.zip)"
                        >
                          <Shuffle className="w-3 h-3 text-indigo-600" /> Trộn Đề
                        </button>
                        <button
                          onClick={() => onPreviewExam(exam.id)}
                          className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-blue-600 rounded transition border border-slate-200"
                          title="Xem trước đề thi trực quan & chỉnh sửa"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onOpenCreateSessionForExam(exam.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition flex items-center gap-1 shadow-2xs"
                          title="Mở ca thi mới với đề này"
                        >
                          <Clock className="w-3 h-3" /> Mở Ca
                        </button>
                        <button
                          onClick={() => setExportingExam(exam)}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition flex items-center gap-1 shadow-2xs"
                          title="Tùy chọn xuất đề in học sinh hoặc đề lưu trữ giáo viên (.docx)"
                        >
                          <Download className="w-3.5 h-3.5" /> Xuất Đề
                        </button>
                        <button
                          onClick={() => onOpenEditExam(exam.id)}
                          className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-blue-600 rounded transition border border-slate-200"
                          title="Sửa đề thi"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteExam(exam.id)}
                          className="p-1 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded transition border border-slate-200"
                          title="Xóa đề thi"
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
      ) : (
        /* LIST / CARDS VIEW */
        <div className="divide-y divide-slate-100">
          {paginatedExams.map(exam => {
            const detectedGrade = getExamGrade(exam);

            return (
              <div key={exam.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/80 px-2.5 rounded-xl transition">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div
                      onClick={() => onPreviewExam(exam.id)}
                      className="cursor-pointer group flex items-center gap-2"
                      title="Nhấp để xem trước đề thi trực quan (như học sinh làm bài) và chỉnh sửa"
                    >
                      <Eye className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition shrink-0" />
                      <h4 className="font-bold text-slate-900 text-base group-hover:text-blue-600 group-hover:underline transition">
                        {exam.title}
                      </h4>
                    </div>
                    {detectedGrade && (
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-bold text-xs">
                        Khối {detectedGrade}
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs border border-slate-200 font-medium">
                      {exam.subject || 'Chung'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3.5 text-xs text-slate-500 mt-1.5">
                    <span>📝 Tổng: <strong className="text-slate-800">{exam.total_questions}</strong> câu</span>
                    <span className="text-blue-600 font-medium">🔹 Trắc nghiệm: <strong>{exam.mcq_count}</strong> câu</span>
                    {exam.tf_count > 0 && (
                      <span className="text-teal-700 font-medium">⚖️ Đúng/Sai: <strong>{exam.tf_count}</strong> câu</span>
                    )}
                    <span className="text-amber-700 font-medium">✍️ Tự luận: <strong>{exam.essay_count}</strong> câu</span>
                    <span>🏆 Thang điểm: <strong className="text-emerald-600 font-bold">{exam.total_score}đ</strong></span>
                    {exam.shuffle_questions === 1 && (
                      <span className="flex items-center gap-1 text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 font-medium">
                        <Shuffle className="w-3 h-3" /> Trộn câu hỏi
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Nút Trộn đề hoán vị */}
                  <button
                    onClick={() => onOpenShuffleExam && onOpenShuffleExam(exam)}
                    className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-indigo-200 shadow-2xs"
                    title="Trộn đề hoán vị (101, 102...) & xuất trọn gói in ấn (.zip)"
                  >
                    <Shuffle className="w-3.5 h-3.5 text-indigo-600" /> Trộn Đề
                  </button>
                  <button
                    onClick={() => onPreviewExam(exam.id)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-slate-200 shadow-2xs"
                    title="Xem trước đề thi trực quan (như học sinh làm bài) và chỉnh sửa nếu có sai sót"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" /> Xem Trước
                  </button>
                  <button
                    onClick={() => setExportingExam(exam)}
                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-blue-200 shadow-2xs"
                    title="Tùy chọn xuất đề in học sinh hoặc đề lưu trữ giáo viên (.docx)"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" /> Xuất Đề Word
                  </button>
                  <button
                    onClick={() => onOpenCreateSessionForExam(exam.id)}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-2xs"
                  >
                    <Clock className="w-3.5 h-3.5" /> Mở Ca Với Đề Này
                  </button>
                  <button
                    onClick={() => onOpenEditExam(exam.id)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-blue-600 rounded-lg transition border border-slate-200"
                    title="Chỉnh sửa cấu hình đề thi"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteExam(exam.id)}
                    className="p-1.5 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition border border-slate-200"
                    title="Xóa đề thi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phân trang Đề Thi */}
      {renderPagination(examPage, totalExamPages, filteredExams.length, setExamPage)}

      {/* Modal Xuất Đề Chuẩn Hóa */}
      {exportingExam && (
        <ExamExportModal
          isOpen={Boolean(exportingExam)}
          onClose={() => setExportingExam(null)}
          exam={exportingExam}
          onOpenShuffleModal={(ex) => {
            setExportingExam(null);
            if (onOpenShuffleExam) onOpenShuffleExam(ex);
          }}
        />
      )}
    </div>
  );
}
