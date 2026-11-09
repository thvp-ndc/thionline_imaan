import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Copy,
  Sparkles,
  FolderTree,
  Search,
  Filter,
  Upload,
  Download,
  BookOpen,
  Layers,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X as CloseIcon,
  FileText,
  Eye,
  SlidersHorizontal,
  MoreVertical,
  BarChart2,
  Repeat,
  Users,
  TrendingUp,
  Settings2,
  Archive,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  FileQuestion,
  Home
} from 'lucide-react';
import MathContent from '../common/MathContent';
import QuestionOptions from '../common/QuestionOptions';
import TopicLessonManagerModal from './TopicLessonManagerModal';
import QuestionBankEditorModal from './QuestionBankEditorModal';
import MatrixExamGeneratorModal from './MatrixExamGeneratorModal';
import QuestionBankPreviewModal from './QuestionBankPreviewModal';
import QuestionBankWordImportModal from './QuestionBankWordImportModal';
import SubjectManagerModal from './SubjectManagerModal';
import QuestionBankBackupModal from './QuestionBankBackupModal';
import { getTrueFalseState, getTrueFalseDisplayLabel } from '../../utils/trueFalseHelper';

export default function QuestionBankManager({ onNavigateToExams }) {
  // 1. Môn học & Khối lớp
  const [subjects, setSubjects] = useState([]);
  const [grades, setGrades] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('tin_hoc');
  const [selectedGradeId, setSelectedGradeId] = useState('k10');

  // 2. Dữ liệu Ngân hàng câu hỏi & Cây danh mục
  const [topics, setTopics] = useState([]);
  const [matrixStats, setMatrixStats] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // 3. Trạng thái thu gọn/mở rộng Ma Trận
  const [showMatrixSummary, setShowMatrixSummary] = useState(false);

  // 4. Bộ lọc & Tìm kiếm
  const [search, setSearch] = useState('');
  const [filterTopicId, setFilterTopicId] = useState('all');
  const [filterLessonId, setFilterLessonId] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all'); // 'all' | 'biet' | 'hieu' | 'van_dung'
  const [filterType, setFilterType] = useState('all'); // 'all' | 'single_choice' | 'true_false' | 'short_answer' | 'essay'

  // 4b. Quản lý Cây Thư Mục Windows Explorer
  const [showTreeSidebar, setShowTreeSidebar] = useState(true);
  const [expandedTopicIds, setExpandedTopicIds] = useState(new Set());
  const [treeSearch, setTreeSearch] = useState('');

  // 5. Modals
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewQuestionId, setPreviewQuestionId] = useState(null);
  const [showWordImportModal, setShowWordImportModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // 6. Word Export
  const [exportingWord, setExportingWord] = useState(false);

  // 7. Dropdown states
  const [showWordMenu, setShowWordMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // 8. Quản lý Thống kê phổ & Item Analysis
  const [expandedStatsQuestionIds, setExpandedStatsQuestionIds] = useState(new Set());
  const [questionStatsCache, setQuestionStatsCache] = useState({});
  const [loadingStatsIds, setLoadingStatsIds] = useState(new Set());
  const [showGlobalStats, setShowGlobalStats] = useState(false);

  // Ref theo dõi việc khởi tạo dữ liệu
  const isInitialMount = useRef(true);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-dropdown]')) {
        setShowWordMenu(false);
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Xác định đối tượng Môn học & Khối lớp active
  const activeSubject = subjects.find(s => s.id === selectedSubjectId) || { id: selectedSubjectId, name: 'Tin học' };
  const activeGrade = grades.find(g => g.id === selectedGradeId) || { id: selectedGradeId, name: 'Khối 10' };
  const selectedGsId = `${selectedGradeId}_${selectedSubjectId}`;
  const activeGradeSubject = {
    id: selectedGsId,
    grade_id: selectedGradeId,
    subject_id: selectedSubjectId,
    grade_name: activeGrade.name,
    subject_name: activeSubject.name
  };

  // Nạp toàn bộ dữ liệu (Chủ đề, Thống kê, Câu hỏi) cho một Grade-Subject cụ thể
  const fetchDataForGs = async (
    gsId = selectedGsId,
    topicFilter = 'all',
    lessonFilter = 'all',
    levelFilter = 'all',
    typeFilter = 'all',
    searchFilter = '',
    page = 1
  ) => {
    if (!gsId) return;
    try {
      setLoading(true);
      const [resTopics, resStats] = await Promise.all([
        fetch(`/api/curriculum/topics?grade_subject_id=${gsId}`).then(r => r.json()),
        fetch(`/api/question-bank/stats?grade_subject_id=${gsId}`).then(r => r.json())
      ]);

      if (resTopics.success) setTopics(resTopics.topics || []);
      else setTopics([]);

      if (resStats.success) setMatrixStats(resStats.stats || null);
      else setMatrixStats(null);

      const params = new URLSearchParams({
        grade_subject_id: gsId,
        page: page.toString(),
        limit: '10'
      });

      if (topicFilter !== 'all') params.set('topic_id', topicFilter);
      if (lessonFilter !== 'all') params.set('lesson_id', lessonFilter);
      if (levelFilter !== 'all') params.set('level', levelFilter);
      if (typeFilter !== 'all') params.set('question_type', typeFilter);
      if (searchFilter && searchFilter.trim()) params.set('search', searchFilter.trim());

      const resQ = await fetch(`/api/question-bank?${params.toString()}`).then(r => r.json());
      if (resQ.success) {
        setQuestions(resQ.questions || []);
        setTotalQuestions(resQ.total || 0);
        setCurrentPage(resQ.page || 1);
        setTotalPages(resQ.totalPages || 1);
      } else {
        setQuestions([]);
        setTotalQuestions(0);
        setCurrentPage(1);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Fetch bank data error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Chỉ nạp lại danh sách câu hỏi phân trang / bộ lọc (không nạp lại cây topics nếu không đổi môn)
  const fetchQuestionsOnly = async (
    page = currentPage,
    topicFilter = filterTopicId,
    lessonFilter = filterLessonId,
    levelFilter = filterLevel,
    typeFilter = filterType,
    searchFilter = search
  ) => {
    if (!selectedGsId) return;
    try {
      const params = new URLSearchParams({
        grade_subject_id: selectedGsId,
        page: page.toString(),
        limit: '10'
      });

      if (topicFilter !== 'all') params.set('topic_id', topicFilter);
      if (lessonFilter !== 'all') params.set('lesson_id', lessonFilter);
      if (levelFilter !== 'all') params.set('level', levelFilter);
      if (typeFilter !== 'all') params.set('question_type', typeFilter);
      if (searchFilter && searchFilter.trim()) params.set('search', searchFilter.trim());

      const res = await fetch(`/api/question-bank?${params.toString()}`).then(r => r.json());
      if (res.success) {
        setQuestions(res.questions || []);
        setTotalQuestions(res.total || 0);
        setCurrentPage(res.page || 1);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error('Fetch questions error:', err);
    }
  };

  // Khởi tạo danh mục Môn học & Khối lớp từ CSDL
  useEffect(() => {
    const fetchInit = async () => {
      try {
        const [resGrades, resSubjects] = await Promise.all([
          fetch('/api/curriculum/grades').then(r => r.json()),
          fetch('/api/curriculum/subjects').then(r => r.json())
        ]);

        const gList = resGrades.success ? (resGrades.grades || []) : [];
        const sList = resSubjects.success ? (resSubjects.subjects || []) : [];
        setGrades(gList);
        setSubjects(sList);

        const defaultG = gList.find(g => g.id === 'k10') || gList[0];
        const defaultS = sList.find(s => s.id === 'tin_hoc') || sList[0];

        const gId = defaultG ? defaultG.id : 'k10';
        const sId = defaultS ? defaultS.id : 'tin_hoc';

        setSelectedGradeId(gId);
        setSelectedSubjectId(sId);

        const initGsId = `${gId}_${sId}`;
        fetchDataForGs(initGsId, 'all', 'all', 'all', 'all', '', 1);
      } catch (err) {
        console.error('Fetch curriculum init error:', err);
      }
    };
    fetchInit();
  }, []);

  // Xử lý khi đổi Môn học: Giữ nguyên Khối đang chọn, reset bộ lọc Chủ đề & Bài học, trang 1
  const fetchSubjects = async (preferredSubjectId = null) => {
    try {
      const res = await fetch('/api/curriculum/subjects').then(r => r.json());
      if (res.success && res.subjects) {
        setSubjects(res.subjects);
        if (preferredSubjectId) {
          setSelectedSubjectId(preferredSubjectId);
          fetchDataForGs(`${selectedGradeId}_${preferredSubjectId}`, 'all', 'all', filterLevel, filterType, search, 1);
        }
      }
    } catch (err) {
      console.error('Fetch subjects error:', err);
    }
  };

  const handleSubjectChange = (newSubjectId) => {
    setSelectedSubjectId(newSubjectId);
    setFilterTopicId('all');
    setFilterLessonId('all');
    setCurrentPage(1);
    const newGsId = `${selectedGradeId}_${newSubjectId}`;
    fetchDataForGs(newGsId, 'all', 'all', filterLevel, filterType, search, 1);
  };

  // Xử lý khi đổi Khối lớp: Thông minh chuyển đổi môn học phù hợp cấp học nếu cần
  const handleGradeChange = (newGradeId) => {
    setSelectedGradeId(newGradeId);
    setFilterTopicId('all');
    setFilterLessonId('all');
    setCurrentPage(1);

    const isThcs = ['k6', 'k7', 'k8', 'k9'].includes(newGradeId);
    let targetSubjectId = selectedSubjectId;

    if (isThcs) {
      // Chuyển sang THCS: map các môn THPT sang môn tích hợp THCS tương ứng
      if (['vat_li', 'hoa_hoc', 'sinh_hoc'].includes(selectedSubjectId)) {
        targetSubjectId = 'khtn';
      } else if (['lich_su', 'dia_li'].includes(selectedSubjectId)) {
        targetSubjectId = 'ls_dl';
      } else if (selectedSubjectId === 'gdktpl') {
        targetSubjectId = 'gdcd';
      }
    } else {
      // Chuyển sang THPT: map các môn tích hợp THCS sang môn THPT tương ứng
      if (selectedSubjectId === 'khtn') {
        targetSubjectId = 'vat_li';
      } else if (selectedSubjectId === 'ls_dl') {
        targetSubjectId = 'lich_su';
      } else if (selectedSubjectId === 'gdcd') {
        targetSubjectId = 'gdktpl';
      }
    }

    setSelectedSubjectId(targetSubjectId);
    const newGsId = `${newGradeId}_${targetSubjectId}`;
    fetchDataForGs(newGsId, 'all', 'all', filterLevel, filterType, search, 1);
  };

  // Lắng nghe thay đổi bộ lọc chi tiết (Chủ đề, Mức độ, Dạng câu, Tìm kiếm)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    fetchQuestionsOnly(1, filterTopicId, filterLessonId, filterLevel, filterType, search);
  }, [filterTopicId, filterLessonId, filterLevel, filterType, search]);

  // Phân trang
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    fetchQuestionsOnly(newPage, filterTopicId, filterLessonId, filterLevel, filterType, search);
  };

  // Nạp lại dữ liệu sau khi sửa / xóa / thêm câu hỏi hoặc nhập Word
  const handleRefresh = () => {
    fetchDataForGs(selectedGsId, filterTopicId, filterLessonId, filterLevel, filterType, search, currentPage);
  };

  // Tải và quản lý thống kê phổ câu hỏi (Item & Distractor Analysis)
  const fetchQuestionStats = async (questionId) => {
    if (questionStatsCache[questionId]) return questionStatsCache[questionId];
    try {
      setLoadingStatsIds(prev => new Set(prev).add(questionId));
      const res = await fetch(`/api/question-bank/${questionId}/stats`).then(r => r.json());
      if (res.success && res.stats) {
        setQuestionStatsCache(prev => ({ ...prev, [questionId]: res.stats }));
        return res.stats;
      }
    } catch (err) {
      console.error('Lỗi tải thống kê câu hỏi:', err);
    } finally {
      setLoadingStatsIds(prev => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
    return null;
  };

  const handleToggleQuestionStats = async (questionId) => {
    setExpandedStatsQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });

    if (!questionStatsCache[questionId]) {
      await fetchQuestionStats(questionId);
    }
  };

  const handleToggleGlobalStats = async () => {
    if (showGlobalStats) {
      setShowGlobalStats(false);
      setExpandedStatsQuestionIds(new Set());
    } else {
      setShowGlobalStats(true);
      const allIds = questions.map(q => q.id);
      setExpandedStatsQuestionIds(new Set(allIds));
      allIds.forEach(id => {
        if (!questionStatsCache[id]) fetchQuestionStats(id);
      });
    }
  };

  // Đồng bộ mở rộng thống kê khi đổi trang hoặc lọc lại nếu đang bật chế độ toàn cục
  useEffect(() => {
    if (showGlobalStats && questions.length > 0) {
      const allIds = questions.map(q => q.id);
      setExpandedStatsQuestionIds(new Set(allIds));
      allIds.forEach(id => {
        if (!questionStatsCache[id]) fetchQuestionStats(id);
      });
    }
  }, [questions, showGlobalStats]);

  // Tự động mở rộng các thư mục khi topics được tải
  useEffect(() => {
    if (topics && topics.length > 0) {
      setExpandedTopicIds(new Set(topics.map(t => t.id)));
    }
  }, [topics]);

  const selectedTopic = topics.find(t => t.id === filterTopicId);
  const availableLessons = selectedTopic?.lessons || [];

  // Helper lấy thống kê câu hỏi cho cây thư mục
  const getTopicStats = (topicId) => {
    return matrixStats?.topics?.find(t => t.topic_id === topicId) || null;
  };

  const getLessonStats = (topicId, lessonId) => {
    const tStat = getTopicStats(topicId);
    if (!tStat) return null;
    if (lessonId === '__unassigned__') {
      return tStat.unassigned || null;
    }
    return (tStat.lessons || []).find(l => (l.lesson_id === lessonId || l.id === lessonId)) || null;
  };

  const toggleTopicExpand = (topicId, e) => {
    if (e) e.stopPropagation();
    setExpandedTopicIds(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const expandAllTopics = () => {
    setExpandedTopicIds(new Set(topics.map(t => t.id)));
  };

  const collapseAllTopics = () => {
    setExpandedTopicIds(new Set());
  };

  const filteredTopics = topics.filter(t => {
    if (!treeSearch || !treeSearch.trim()) return true;
    const term = treeSearch.toLowerCase().trim();
    if (t.name.toLowerCase().includes(term) || (t.code && t.code.toLowerCase().includes(term))) return true;
    if (t.lessons && t.lessons.some(l => l.name.toLowerCase().includes(term) || (l.code && l.code.toLowerCase().includes(term)))) return true;
    return false;
  });

  // Tính tổng theo mức độ cho thanh tóm tắt
  const totalBiet = matrixStats?.topics?.reduce((sum, t) => sum + (t.total_biet || 0), 0) || 0;
  const totalHieu = matrixStats?.topics?.reduce((sum, t) => sum + (t.total_hieu || 0), 0) || 0;
  const totalVD = matrixStats?.topics?.reduce((sum, t) => sum + (t.total_van_dung || 0), 0) || 0;

  // Xóa câu hỏi
  const handleDeleteQuestion = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn xóa câu hỏi này khỏi ngân hàng?')) return;
    try {
      const res = await fetch(`/api/question-bank/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        handleRefresh();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Nhân bản câu hỏi
  const handleDuplicateQuestion = async (id) => {
    try {
      const res = await fetch(`/api/question-bank/${id}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        handleRefresh();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Xuất file Word Ngân hàng câu hỏi chuẩn A4, lề 1cm, TNR 12, OMML
  const handleExportWord = async () => {
    const params = new URLSearchParams({
      grade_subject_id: selectedGsId
    });
    if (filterTopicId !== 'all') params.set('topic_id', filterTopicId);
    if (filterLessonId !== 'all') params.set('lesson_id', filterLessonId);
    if (filterLevel !== 'all') params.set('level', filterLevel);
    if (filterType !== 'all') params.set('question_type', filterType);
    if (search.trim()) params.set('search', search.trim());

    setExportingWord(true);
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

      // Tải tệp nhị phân xuống an toàn
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
      setExportingWord(false);
    }
  };

  // Mở modal xem trước trực quan
  const handleOpenVisualPreview = (questionId = null) => {
    setPreviewQuestionId(questionId);
    setShowPreviewModal(true);
  };

  // Quick filter từ ô ma trận
  const handleQuickFilterMatrix = (topicId, level) => {
    setFilterTopicId(topicId);
    setFilterLessonId('all');
    setFilterLevel(level);
  };

  return (
    <div className="space-y-3">
      {/* 1. Header Bar Gộp Thống Kê & Tác Vụ Tinh Gọn (Hàng thứ 3 cố định) */}
      <div className="sticky top-[100px] z-20 bg-slate-50/95 backdrop-blur-md pt-2 pb-3 border-b border-slate-200/90 -mx-4 sm:-mx-6 px-4 sm:px-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Hàng 1 bên trái: Tiêu đề + 2 dropdown Khối/Môn + Dải thống kê ngay bên dưới */}
        <div className="flex flex-col gap-1.5">
          {/* Dòng trên: Tiêu đề + 2 dropdown chọn [Khối] và [Môn học] */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <BookOpen className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Ngân Hàng Câu Hỏi
              </h2>
            </div>

            {/* Bộ chọn kép: [Môn học ▾] trước, [Khối lớp ▾] sau + Nút Quản lý Môn */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-xs shadow-2xs">
                {/* Dropdown 1: MÔN HỌC (đứng trước) - Phân nhóm thông minh theo THCS / THPT */}
                <select
                  value={selectedSubjectId}
                  onChange={e => handleSubjectChange(e.target.value)}
                  className="bg-white border border-slate-200 rounded-md px-2.5 py-1 text-blue-700 font-bold cursor-pointer focus:outline-none focus:border-blue-500 hover:bg-slate-50 transition max-w-[210px] truncate shadow-2xs"
                  title="Chọn Môn học"
                >
                  {['k6', 'k7', 'k8', 'k9'].includes(selectedGradeId) ? (
                    <>
                      <optgroup label="── Môn Cấp THCS (GDPT 2018) ──" className="bg-white text-teal-700 font-bold">
                        {subjects
                          .filter(s => ['khtn', 'ls_dl', 'gdcd', 'tin_hoc', 'toan', 'ngu_van', 'tieng_anh', 'cong_nghe'].includes(s.id))
                          .map(s => (
                            <option key={s.id} value={s.id} className="text-slate-800 font-normal">{s.name}</option>
                          ))}
                      </optgroup>
                      <optgroup label="── Môn Phân Hóa / Khác ──" className="bg-white text-slate-500 font-bold">
                        {subjects
                          .filter(s => !['khtn', 'ls_dl', 'gdcd', 'tin_hoc', 'toan', 'ngu_van', 'tieng_anh', 'cong_nghe'].includes(s.id))
                          .map(s => (
                            <option key={s.id} value={s.id} className="text-slate-800 font-normal">{s.name}</option>
                          ))}
                      </optgroup>
                    </>
                  ) : (
                    <>
                      <optgroup label="── Môn Cấp THPT (GDPT 2018) ──" className="bg-white text-blue-700 font-bold">
                        {subjects
                          .filter(s => !['khtn', 'ls_dl', 'gdcd'].includes(s.id))
                          .map(s => (
                            <option key={s.id} value={s.id} className="text-slate-800 font-normal">{s.name}</option>
                          ))}
                      </optgroup>
                      <optgroup label="── Môn Tích Hợp Cấp THCS ──" className="bg-white text-slate-500 font-bold">
                        {subjects
                          .filter(s => ['khtn', 'ls_dl', 'gdcd'].includes(s.id))
                          .map(s => (
                            <option key={s.id} value={s.id} className="text-slate-800 font-normal">{s.name}</option>
                          ))}
                      </optgroup>
                    </>
                  )}
                </select>

                {/* Dropdown 2: KHỐI LỚP (đứng sau) */}
                <select
                  value={selectedGradeId}
                  onChange={e => handleGradeChange(e.target.value)}
                  className="bg-white border border-slate-200 rounded-md px-2.5 py-1 text-slate-800 font-bold cursor-pointer focus:outline-none focus:border-blue-500 hover:bg-slate-50 transition shadow-2xs"
                  title="Chọn Khối lớp"
                >
                  {grades.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {/* Nút Quản lý & Bổ sung Môn học */}
              <button
                type="button"
                onClick={() => setShowSubjectModal(true)}
                className="px-2.5 py-1 text-slate-700 hover:text-blue-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition flex items-center gap-1.5 text-xs font-semibold shadow-2xs cursor-pointer"
                title="Quản lý danh mục môn học, bổ sung môn học mới"
              >
                <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Quản lý môn</span>
              </button>
            </div>
          </div>

          {/* Dòng dưới: Dải text/badge nhỏ gọn */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="font-semibold text-slate-600">
              Tổng: <strong className="text-slate-900">{matrixStats?.grandTotal || 0} câu</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-emerald-700 font-medium">
              🟢 Biết: <strong className="text-emerald-800">{totalBiet}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-blue-700 font-medium">
              🔵 Hiểu: <strong className="text-blue-800">{totalHieu}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-amber-700 font-medium">
              🟠 VD: <strong className="text-amber-800">{totalVD}</strong>
            </span>
            <button
              onClick={() => setShowMatrixSummary(!showMatrixSummary)}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-0.5 ml-1 transition cursor-pointer"
              title="Xem hoặc ẩn bảng ma trận chi tiết các chủ đề"
            >
              [{showMatrixSummary ? 'Đóng ma trận ▴' : 'Chi tiết ma trận ▾'}]
            </button>
          </div>
        </div>

        {/* Hàng 1 bên phải: Tối ưu nhóm nút tác vụ */}
        <div className="flex items-center gap-2">
          {/* Primary: + Soạn Câu Hỏi */}
          <button
            onClick={() => {
              setEditingQuestionId(null);
              setShowEditorModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Soạn Câu Hỏi
          </button>

          {/* Dropdown nhóm: Word ▾ (gồm Nhập Word & Xuất Word) */}
          <div className="relative" data-dropdown>
            <button
              onClick={() => {
                setShowWordMenu(!showWordMenu);
                setShowMoreMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition shadow-2xs cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" /> Word <ChevronDown className="w-3 h-3 ml-0.5" />
            </button>

            {showWordMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <button
                  onClick={() => {
                    setShowWordMenu(false);
                    setShowWordImportModal(true);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Nhập từ file Word</span>
                </button>

                <button
                  onClick={() => {
                    setShowWordMenu(false);
                    handleExportWord();
                  }}
                  disabled={exportingWord || totalQuestions === 0}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 disabled:opacity-40 flex items-center gap-2.5 transition cursor-pointer"
                  title="Xuất ngân hàng câu hỏi ra file Word (.docx) chuẩn A4"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{exportingWord ? 'Đang xuất...' : 'Xuất ra file Word'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Secondary: Sinh Đề Ma Trận */}
          <button
            onClick={() => setShowMatrixModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition shadow-2xs cursor-pointer"
            title="Tự động bốc câu hỏi từ ngân hàng theo ma trận 4 phần chuẩn 2025"
          >
            <Sparkles className="w-3.5 h-3.5" /> Sinh Đề Ma Trận
          </button>

          {/* Tertiary: Sao Lưu & Phục Hồi Ngân Hàng */}
          <button
            onClick={() => setShowBackupModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg font-bold text-xs transition shadow-2xs cursor-pointer"
            title="Sao lưu và phục hồi ngân hàng câu hỏi (.vnlanqb)"
          >
            <Archive className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden md:inline">Sao Lưu / Phục Hồi</span>
          </button>

          {/* Dropdown icon tiện ích ···: chứa Xem Trực Quan và Chủ Đề & Bài Học */}
          <div className="relative" data-dropdown>
            <button
              onClick={() => {
                setShowMoreMenu(!showMoreMenu);
                setShowWordMenu(false);
              }}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                showMoreMenu
                  ? 'bg-slate-100 text-slate-900 border-slate-300'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 shadow-2xs'
              }`}
              title="Tiện ích khác"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleOpenVisualPreview();
                  }}
                  disabled={totalQuestions === 0}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 disabled:opacity-40 flex items-center gap-2.5 transition cursor-pointer"
                  title="Mô phỏng trực quan câu hỏi như khi học sinh làm bài thi"
                >
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                  <span>Xem Trực Quan</span>
                </button>
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowTopicModal(true);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                  title="Quản lý danh mục Chủ đề & Bài học"
                >
                  <FolderTree className="w-3.5 h-3.5 text-blue-600" />
                  <span>Chủ Đề & Bài Học</span>
                </button>
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowBackupModal(true);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                  title="Sao lưu và phục hồi ngân hàng câu hỏi (.vnlanqb)"
                >
                  <Archive className="w-3.5 h-3.5 text-blue-600" />
                  <span>Sao Lưu & Phục Hồi</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* 2. Bảng Ma Trận Kho Câu Hỏi Chi Tiết (Chỉ hiện khi nhấn [Chi tiết ma trận]) */}
      {showMatrixSummary && (
        /* Bảng ma trận 2 chiều đầy đủ khi mở rộng */
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Ma Trận Kho Câu Hỏi ({activeGradeSubject.grade_name} - {activeGradeSubject.subject_name}):
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Tổng {matrixStats?.grandTotal || 0} câu
              </span>
            </div>

            <button
              onClick={() => setShowMatrixSummary(false)}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Thu Gọn <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-center">
                <tr>
                  <th className="py-2.5 px-3 text-left border-r border-slate-200">Chủ Đề / Chương</th>
                  <th className="py-2 px-2 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-bold">
                    🟢 Nhận Biết
                  </th>
                  <th className="py-2 px-2 border-r border-slate-200 bg-blue-50 text-blue-800 font-bold">
                    🔵 Thông Hiểu
                  </th>
                  <th className="py-2 px-2 border-r border-slate-200 bg-amber-50 text-amber-800 font-bold">
                    🟠 Vận Dụng
                  </th>
                  <th className="py-2 px-3 text-right bg-slate-100 text-slate-800 font-bold">Tổng Số</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 italic">Đang tải ma trận kho câu hỏi...</td>
                  </tr>
                ) : (!matrixStats?.topics || matrixStats.topics.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 italic">Chưa có chủ đề nào trong môn học này.</td>
                  </tr>
                ) : (
                  matrixStats.topics.map(t => (
                    <tr key={t.topic_id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2 px-3 border-r border-slate-100 font-medium text-slate-900 max-w-[260px]">
                        <div className="truncate font-semibold" title={t.topic_name}>{t.topic_name}</div>
                      </td>

                      {/* Ô Biết */}
                      <td className="py-1 px-2 text-center border-r border-slate-100 bg-emerald-50/20">
                        <button
                          onClick={() => handleQuickFilterMatrix(t.topic_id, 'biet')}
                          className={`px-2 py-0.5 rounded font-bold text-xs transition cursor-pointer ${
                            t.total_biet > 0
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 shadow-2xs'
                              : 'text-slate-400'
                          }`}
                          title="Lọc câu hỏi Nhận biết"
                        >
                          {t.total_biet} câu
                        </button>
                      </td>

                      {/* Ô Hiểu */}
                      <td className="py-1 px-2 text-center border-r border-slate-100 bg-blue-50/20">
                        <button
                          onClick={() => handleQuickFilterMatrix(t.topic_id, 'hieu')}
                          className={`px-2 py-0.5 rounded font-bold text-xs transition cursor-pointer ${
                            t.total_hieu > 0
                              ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 shadow-2xs'
                              : 'text-slate-400'
                          }`}
                          title="Lọc câu hỏi Thông hiểu"
                        >
                          {t.total_hieu} câu
                        </button>
                      </td>

                      {/* Ô Vận dụng */}
                      <td className="py-1 px-2 text-center border-r border-slate-100 bg-amber-50/20">
                        <button
                          onClick={() => handleQuickFilterMatrix(t.topic_id, 'van_dung')}
                          className={`px-2 py-0.5 rounded font-bold text-xs transition cursor-pointer ${
                            t.total_van_dung > 0
                              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 shadow-2xs'
                              : 'text-slate-400'
                          }`}
                          title="Lọc câu hỏi Vận dụng"
                        >
                          {t.total_van_dung} câu
                        </button>
                      </td>

                      {/* Tổng số câu */}
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => {
                            setFilterTopicId(t.topic_id);
                            setFilterLessonId('all');
                            setFilterLevel('all');
                          }}
                          className="font-bold text-slate-800 hover:text-blue-600 transition cursor-pointer"
                        >
                          {t.total_questions} câu
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Bố Cục Dạng Cây Thư Mục Windows Explorer + Danh Sách Câu Hỏi */}
      <div className="flex flex-col lg:flex-row items-start gap-3.5">
        {/* CỘT TRÁI: CÂY THƯ MỤC BÀI HỌC KIỂU WINDOWS EXPLORER (CỐ ĐỊNH KHI CUỘN) */}
        {showTreeSidebar && (
          <div className="w-full lg:w-72 xl:w-80 shrink-0 lg:sticky lg:top-[186px] lg:h-[calc(100vh-200px)] bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col overflow-hidden">
            {/* Header thanh cây thư mục */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-md bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                  <FolderTree className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-xs text-slate-800 uppercase tracking-wide truncate">
                  Cây Thư Mục Bài Học
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={expandAllTopics}
                  className="p-1 text-slate-500 hover:text-blue-700 hover:bg-slate-200/60 rounded transition cursor-pointer"
                  title="Mở rộng tất cả thư mục"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={collapseAllTopics}
                  className="p-1 text-slate-500 hover:text-blue-700 hover:bg-slate-200/60 rounded transition cursor-pointer"
                  title="Thu gọn tất cả thư mục"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowTopicModal(true)}
                  className="p-1 text-slate-500 hover:text-blue-700 hover:bg-slate-200/60 rounded transition cursor-pointer"
                  title="Quản lý & thêm bớt Chủ đề, Bài học"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowTreeSidebar(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded transition cursor-pointer lg:hidden"
                  title="Ẩn cây thư mục"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Ô tìm kiếm nhanh thư mục / bài học */}
            <div className="p-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Lọc thư mục, bài học..."
                  value={treeSearch}
                  onChange={e => setTreeSearch(e.target.value)}
                  className="w-full pl-7 pr-6 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                {treeSearch && (
                  <button
                    onClick={() => setTreeSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <CloseIcon className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Thân cây thư mục (Windows Explorer Tree View) */}
            <div className="p-2 flex-1 overflow-y-auto space-y-0.5 text-xs select-none custom-scrollbar">
              {/* Node gốc: Toàn bộ ngân hàng câu hỏi */}
              <div
                onClick={() => {
                  setFilterTopicId('all');
                  setFilterLessonId('all');
                }}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
                  filterTopicId === 'all'
                    ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200 shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Home className={`w-4 h-4 shrink-0 ${filterTopicId === 'all' ? 'text-blue-600' : 'text-slate-500'}`} />
                  <span className="truncate text-xs font-semibold">Tất cả câu hỏi môn học</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                  filterTopicId === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {matrixStats?.grandTotal || 0}
                </span>
              </div>

              {/* Danh sách các Thư Mục Chủ Đề */}
              <div className="pt-1 space-y-1">
                {filteredTopics.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-4 text-center">Không tìm thấy thư mục phù hợp</p>
                ) : (
                  filteredTopics.map(t => {
                    const tStat = getTopicStats(t.id);
                    const totalQ = tStat?.total_questions || 0;
                    const isExpanded = expandedTopicIds.has(t.id) || !!treeSearch;
                    const isTopicActive = filterTopicId === t.id && filterLessonId === 'all';
                    const tLessons = t.lessons || [];

                    return (
                      <div key={t.id} className="space-y-0.5">
                        {/* Hàng Thư mục Chủ đề */}
                        <div
                          onClick={() => {
                            setFilterTopicId(t.id);
                            setFilterLessonId('all');
                            setExpandedTopicIds(prev => new Set(prev).add(t.id));
                          }}
                          className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition ${
                            isTopicActive
                              ? 'bg-amber-50 text-amber-950 font-bold border border-amber-300 shadow-2xs'
                              : filterTopicId === t.id
                              ? 'bg-slate-100/80 text-slate-900 font-medium'
                              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {/* Nút mũi tên mở rộng/thu gọn thư mục */}
                            <button
                              type="button"
                              onClick={(e) => toggleTopicExpand(t.id, e)}
                              className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Icon Thư mục vàng kiểu Windows */}
                            {isExpanded ? (
                              <FolderOpen className="w-4 h-4 text-amber-500 fill-amber-400/20 shrink-0" />
                            ) : (
                              <Folder className="w-4 h-4 text-amber-500 fill-amber-400/20 shrink-0" />
                            )}

                            {/* Tên Thư mục */}
                            <span className="truncate text-xs font-medium" title={t.name}>
                              {t.name}
                            </span>
                          </div>

                          {/* Badge số lượng câu hỏi */}
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ml-1.5 ${
                            isTopicActive
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-200 text-slate-600 group-hover:bg-slate-300'
                          }`}>
                            {totalQ}
                          </span>
                        </div>

                        {/* Các Nhánh Bài Học Con (khi thư mục mở) */}
                        {isExpanded && (
                          <div className="ml-5 pl-2.5 border-l-2 border-slate-200 space-y-0.5 pt-0.5">
                            {tLessons.length === 0 ? (
                              <div className="text-[10px] text-slate-400 italic py-1 pl-1">
                                (Chưa có bài học con)
                              </div>
                            ) : (
                              tLessons.map(l => {
                                const lStat = getLessonStats(t.id, l.id);
                                const lQCount = lStat?.total_questions || 0;
                                const isLessonActive = filterTopicId === t.id && filterLessonId === l.id;

                                return (
                                  <div
                                    key={l.id}
                                    onClick={() => {
                                      setFilterTopicId(t.id);
                                      setFilterLessonId(l.id);
                                    }}
                                    className={`group flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition text-[11.5px] ${
                                      isLessonActive
                                        ? 'bg-blue-600 text-white font-bold shadow-2xs'
                                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-blue-900'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      <FileText className={`w-3.5 h-3.5 shrink-0 ${
                                        isLessonActive ? 'text-white' : 'text-blue-500'
                                      }`} />
                                      <span className="truncate" title={l.name}>
                                        {l.name}
                                      </span>
                                    </div>
                                    <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ml-1.5 ${
                                      isLessonActive ? 'bg-white text-blue-700' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-800'
                                    }`}>
                                      {lQCount}
                                    </span>
                                  </div>
                                );
                              })
                            )}

                            {/* Câu hỏi chung của chủ đề nếu có */}
                            {tStat?.unassigned && tStat.unassigned.total_questions > 0 && (
                              <div
                                onClick={() => {
                                  setFilterTopicId(t.id);
                                  setFilterLessonId('__unassigned__');
                                }}
                                className={`group flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition text-[11.5px] ${
                                  filterTopicId === t.id && filterLessonId === '__unassigned__'
                                    ? 'bg-amber-600 text-white font-bold shadow-2xs'
                                    : 'text-amber-800 hover:bg-amber-50'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <FileQuestion className={`w-3.5 h-3.5 shrink-0 ${
                                    filterTopicId === t.id && filterLessonId === '__unassigned__' ? 'text-white' : 'text-amber-600'
                                  }`} />
                                  <span className="truncate italic">Câu hỏi chung</span>
                                </div>
                                <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ml-1.5 ${
                                  filterTopicId === t.id && filterLessonId === '__unassigned__'
                                    ? 'bg-white text-amber-700'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {tStat.unassigned.total_questions}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer của cây thư mục */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between shrink-0">
              <span className="font-medium">{topics.length} chủ đề</span>
              <button
                type="button"
                onClick={() => setShowTopicModal(true)}
                className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer flex items-center gap-1"
              >
                + Quản lý bài/chủ đề
              </button>
            </div>
          </div>
        )}

        {/* CỘT PHẢI: KHUNG HIỂN THỊ CÂU HỎI & THANH CÔNG CỤ */}
        <div className="flex-1 min-w-0 w-full bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3 shadow-2xs">
          {/* Thanh Breadcrumb Địa Chỉ (Windows Explorer Address Bar) */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {/* Nút toggle Sidebar Cây Thư Mục */}
              <button
                type="button"
                onClick={() => setShowTreeSidebar(!showTreeSidebar)}
                className="p-1 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 hover:text-blue-700 transition cursor-pointer flex items-center gap-1.5 shadow-2xs text-[11px] font-semibold"
                title={showTreeSidebar ? 'Thu gọn cây thư mục' : 'Mở cây thư mục bài học'}
              >
                {showTreeSidebar ? (
                  <PanelLeftClose className="w-3.5 h-3.5 text-blue-600" />
                ) : (
                  <PanelLeftOpen className="w-3.5 h-3.5 text-blue-600" />
                )}
                <span>{showTreeSidebar ? 'Ẩn Cây' : 'Hiện Cây Thư Mục'}</span>
              </button>

              <span className="text-slate-300">|</span>

              {/* Breadcrumb Path */}
              <div className="flex items-center gap-1 text-slate-600 font-medium">
                <button
                  onClick={() => { setFilterTopicId('all'); setFilterLessonId('all'); }}
                  className="hover:text-blue-600 transition flex items-center gap-1 cursor-pointer font-bold text-slate-800"
                >
                  <Home className="w-3.5 h-3.5 text-blue-600" />
                  <span>{activeGradeSubject.subject_name} {activeGradeSubject.grade_name}</span>
                </button>

                {filterTopicId !== 'all' && (
                  <>
                    <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                    <button
                      onClick={() => { setFilterLessonId('all'); }}
                      className={`hover:text-blue-600 transition flex items-center gap-1 cursor-pointer ${
                        filterLessonId === 'all' ? 'font-bold text-amber-800' : 'text-slate-700'
                      }`}
                    >
                      <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-400/20" />
                      <span className="max-w-[200px] truncate" title={selectedTopic?.name}>{selectedTopic?.name || 'Chủ đề'}</span>
                    </button>
                  </>
                )}

                {filterLessonId !== 'all' && (
                  <>
                    <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="font-bold text-blue-700 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span className="max-w-[240px] truncate" title={
                        filterLessonId === '__unassigned__'
                          ? 'Câu hỏi chung'
                          : selectedTopic?.lessons?.find(l => l.id === filterLessonId)?.name
                      }>
                        {filterLessonId === '__unassigned__'
                          ? 'Câu hỏi chung của chủ đề'
                          : selectedTopic?.lessons?.find(l => l.id === filterLessonId)?.name || 'Bài học'}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Badge đếm số câu trong thư mục hiện tại & nút Đặt lại */}
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-bold">
                {totalQuestions} câu hỏi
              </span>
              {(filterTopicId !== 'all' || filterLessonId !== 'all') && (
                <button
                  onClick={() => { setFilterTopicId('all'); setFilterLessonId('all'); }}
                  className="text-[11px] text-slate-500 hover:text-rose-600 transition underline underline-offset-2 cursor-pointer font-medium"
                >
                  ✕ Xem tất cả
                </button>
              )}
            </div>
          </div>

          {/* Thanh Filter 1 Hàng Duy Nhất */}
          <div className="flex items-center gap-2 w-full flex-nowrap pb-3 border-b border-slate-200">
          {/* Text đếm câu hỏi dạng counter badge cạnh ô tìm kiếm */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 shrink-0">
            <span className="text-blue-700 font-extrabold">{totalQuestions}</span> câu hỏi
          </div>

          {/* Ô input tìm kiếm (flex-grow) chiếm phía bên trái */}
          <div className="relative flex-1 min-w-[140px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm nội dung câu hỏi..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <CloseIcon className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Ba dropdown bộ lọc nằm ngang phía bên phải: Chủ đề, Mức độ, và Dạng câu hỏi */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 1. Dropdown Chủ Đề (hỗ trợ phân cấp chủ đề & bài học) */}
            <select
              value={filterTopicId === 'all' ? 'all' : (filterLessonId !== 'all' ? `lesson_${filterLessonId}` : `topic_${filterTopicId}`)}
              onChange={e => {
                const val = e.target.value;
                if (val === 'all') {
                  setFilterTopicId('all');
                  setFilterLessonId('all');
                } else if (val.startsWith('topic_')) {
                  setFilterTopicId(val.replace('topic_', ''));
                  setFilterLessonId('all');
                } else if (val.startsWith('lesson_')) {
                  const lessonId = val.replace('lesson_', '');
                  const parentTopic = topics.find(t => (t.lessons || []).some(l => l.id === lessonId));
                  if (parentTopic) setFilterTopicId(parentTopic.id);
                  setFilterLessonId(lessonId);
                }
              }}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 cursor-pointer w-40 sm:w-48 truncate focus:outline-none focus:border-blue-500 font-medium shadow-2xs"
              title="Lọc theo chủ đề hoặc bài học"
            >
              <option value="all">Tất cả chủ đề ({topics.length})</option>
              {topics.map(t => (
                <React.Fragment key={t.id}>
                  <option value={`topic_${t.id}`} className="font-bold">
                    📁 {t.name}
                  </option>
                  {(t.lessons || []).map(l => (
                    <option key={l.id} value={`lesson_${l.id}`}>
                      &nbsp;&nbsp;&nbsp;↳ {l.name}
                    </option>
                  ))}
                </React.Fragment>
              ))}
            </select>

            {/* 2. Dropdown Mức Độ */}
            <select
              value={filterLevel}
              onChange={e => setFilterLevel(e.target.value)}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 cursor-pointer w-32 sm:w-36 focus:outline-none focus:border-blue-500 font-medium shadow-2xs"
              title="Lọc theo mức độ nhận thức"
            >
              <option value="all">Tất cả mức độ</option>
              <option value="biet">🟢 Nhận biết</option>
              <option value="hieu">🔵 Thông hiểu</option>
              <option value="van_dung">🟠 Vận dụng</option>
            </select>

            {/* 3. Dropdown Dạng Câu Hỏi */}
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 cursor-pointer w-32 sm:w-40 truncate focus:outline-none focus:border-blue-500 font-medium shadow-2xs"
              title="Lọc theo dạng câu hỏi"
            >
              <option value="all">Tất cả dạng câu</option>
              <option value="single_choice">🔹 Trắc nghiệm</option>
              <option value="true_false">⚖️ Đúng / Sai</option>
              <option value="short_answer">✏️ Trả lời ngắn</option>
              <option value="essay">✍️ Tự luận</option>
            </select>

            {/* 4. Nút Bật/Tắt Phổ Thống Kê Toàn Bộ */}
            <button
              onClick={handleToggleGlobalStats}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border shrink-0 cursor-pointer ${
                showGlobalStats
                  ? 'bg-blue-600 text-white border-blue-500 shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="Bật/Tắt hiển thị phổ thống kê và phân tích phương án cho tất cả câu hỏi"
            >
              <BarChart2 className={`w-3.5 h-3.5 ${showGlobalStats ? 'text-white' : 'text-blue-600'}`} />
              <span>{showGlobalStats ? 'Ẩn Thống Kê' : '📊 Phổ Thống Kê'}</span>
            </button>

            {/* Reset Filters */}
            {(filterTopicId !== 'all' || filterLessonId !== 'all' || filterLevel !== 'all' || filterType !== 'all' || search) && (
              <button
                onClick={() => {
                  setFilterTopicId('all');
                  setFilterLessonId('all');
                  setFilterLevel('all');
                  setFilterType('all');
                  setSearch('');
                }}
                className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-blue-700 hover:text-blue-800 rounded-lg text-xs font-semibold transition shrink-0 border border-slate-200 shadow-2xs cursor-pointer"
                title="Bỏ toàn bộ bộ lọc"
              >
                Đặt Lại
              </button>
            )}
          </div>
        </div>

        {/* 4. Danh Sách Câu Hỏi Phân Trang Tinh Gọn */}
        {loading ? (
          <p className="text-slate-400 text-xs italic py-6 text-center">Đang tải danh sách câu hỏi...</p>
        ) : questions.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
            <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
            <p className="text-slate-700 text-xs font-bold">Không tìm thấy câu hỏi phù hợp</p>
            <p className="text-slate-500 text-[11px] mt-1">
              Thầy/Cô có thể bấm "Soạn Câu Hỏi" hoặc "Nhập Word" để bổ sung câu hỏi vào kho.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q, idx) => {
              const levelBadge = q.level === 'biet'
                ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">🟢 Nhận biết</span>
                : q.level === 'hieu'
                ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">🔵 Thông hiểu</span>
                : <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🟠 Vận dụng</span>;

              const typeBadge = q.question_type === 'true_false'
                ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">⚖️ Đúng/Sai</span>
                : q.question_type === 'short_answer'
                ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">✏️ Trả lời ngắn</span>
                : q.question_type === 'essay'
                ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">✍️ Tự luận</span>
                : <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">🔹 Trắc nghiệm</span>;

              return (
                <div
                  key={q.id}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 hover:border-blue-300 hover:shadow-xs transition shadow-2xs space-y-3"
                >
                  {/* Hàng Header Thẻ Câu Hỏi */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900">Câu {(currentPage - 1) * 10 + idx + 1}:</span>
                      {levelBadge}
                      {typeBadge}
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                        {q.topic_name}
                      </span>
                      {q.lesson_name && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                          {q.lesson_name}
                        </span>
                      )}
                    </div>

                    {/* Cụm Nút Hành Động Thẻ Câu Hỏi (Xem trực quan, Nhân bản, Sửa, Xóa) */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Huy hiệu 1: Đã dùng */}
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                        title="Số lần câu hỏi đã được dùng trong các đề thi"
                      >
                        <Repeat className="w-3 h-3 text-blue-600" />
                        Đã dùng: <strong className="text-slate-900">{q.stats_summary?.usage_count || 0}</strong> lần
                      </span>

                      {/* Huy hiệu 2: Lượt làm & Tỉ lệ đúng */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          (q.stats_summary?.total_attempts || 0) === 0
                            ? 'bg-slate-100 text-slate-500 border-slate-200'
                            : (q.stats_summary?.correct_rate >= 70)
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : (q.stats_summary?.correct_rate >= 40)
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                        title="Tổng số lượt làm bài và tỉ lệ làm đúng"
                      >
                        <Users className="w-3 h-3" />
                        <strong className="text-slate-900">{q.stats_summary?.total_attempts || 0}</strong> lượt làm
                        {q.stats_summary?.correct_rate !== null && q.stats_summary?.correct_rate !== undefined ? (
                          <span className="font-bold">({q.stats_summary.correct_rate}% đúng)</span>
                        ) : (
                          <span className="text-slate-400 font-normal">(Chưa làm)</span>
                        )}
                      </span>

                      {/* Điểm mặc định */}
                      <span className="text-xs font-bold text-emerald-600 mx-1">
                        {q.default_score || 0.25}đ
                      </span>

                      {/* Nút Toggle Thống Kê Phổ 📊 */}
                      <button
                        onClick={() => handleToggleQuestionStats(q.id)}
                        className={`p-1.5 rounded-lg transition border flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                          expandedStatsQuestionIds.has(q.id)
                            ? 'bg-blue-600 text-white border-blue-500 shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        }`}
                        title="Xem phân tích phương án & phổ thống kê câu hỏi (Item & Distractor Analysis)"
                      >
                        <BarChart2 className={`w-3.5 h-3.5 ${expandedStatsQuestionIds.has(q.id) ? 'text-white' : 'text-blue-600'}`} />
                        <span className="text-[11px] font-bold">Thống kê</span>
                      </button>

                      {/* Nút Xem Trực Quan Câu Hỏi Này */}
                      <button
                        onClick={() => handleOpenVisualPreview(q.id)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition border border-slate-200 cursor-pointer"
                        title="Xem trực quan câu này như học sinh làm bài thi"
                      >
                        <Eye className="w-3.5 h-3.5 text-teal-600" />
                      </button>

                      {/* Nút Nhân Bản */}
                      <button
                        onClick={() => handleDuplicateQuestion(q.id)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition border border-slate-200 cursor-pointer"
                        title="Nhân bản câu hỏi"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {/* Nút Chỉnh Sửa */}
                      <button
                        onClick={() => {
                          setEditingQuestionId(q.id);
                          setShowEditorModal(true);
                        }}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-blue-700 rounded-lg transition border border-slate-200 cursor-pointer"
                        title="Chỉnh sửa câu hỏi"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Nút Xóa */}
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="p-1.5 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition border border-slate-200 cursor-pointer"
                        title="Xóa câu hỏi khỏi ngân hàng"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Nội dung câu hỏi */}
                  <div className="text-xs sm:text-sm text-slate-800 leading-relaxed font-sans">
                    <MathContent content={q.content} />
                  </div>

                  {/* Các phương án Trắc nghiệm (single_choice / multiple_choice) */}
                  {(q.question_type === 'single_choice' || q.question_type === 'multiple_choice') && q.options && q.options.length > 0 && (
                    <div className="pt-0.5">
                      <QuestionOptions
                        options={q.options || []}
                        questionType={q.question_type}
                        mode="preview"
                        correctAnswers={q.correct_answers || []}
                        showAnswerKey={true}
                        optionStats={expandedStatsQuestionIds.has(q.id) ? (questionStatsCache[q.id]?.distractor_stats || null) : null}
                      />
                    </div>
                  )}

                  {/* Đúng / Sai (true_false) */}
                  {q.question_type === 'true_false' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-0.5">
                      {['a', 'b', 'c', 'd'].map(k => {
                        const opt = (q.options || []).find(o => o.id?.toLowerCase() === k) || { id: k, text: '' };
                        const tfState = getTrueFalseState(q.correct_answers, k);
                        const displayLabel = getTrueFalseDisplayLabel(q.correct_answers, k);

                        return (
                          <div key={k} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <span className="font-bold text-slate-900 uppercase shrink-0 mt-0.5">{k})</span>
                              <div className="flex-1 text-slate-700 break-words whitespace-pre-wrap min-w-0">
                                <MathContent content={opt.text || ''} />
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5 ${
                              tfState === 'T'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : tfState === 'F'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-300'
                            }`}>
                              {displayLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Trả lời ngắn (short_answer) */}
                  {q.question_type === 'short_answer' && (
                    <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200 text-xs flex items-center gap-2.5">
                      <span className="font-bold text-amber-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Đáp án chuẩn:
                      </span>
                      <span className="font-mono bg-white px-2.5 py-0.5 rounded border border-amber-300 text-emerald-700 font-bold tracking-wide">
                        {q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] : '') || '(Chưa nhập)'}
                      </span>
                    </div>
                  )}

                  {/* Barem chấm tự luận (essay) */}
                  {q.question_type === 'essay' && q.rubric_guide && (
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                      <strong className="text-amber-800 block mb-1">Hướng dẫn chấm & Barem rubric:</strong>
                      <MathContent content={q.rubric_guide} />
                    </div>
                  )}

                  {/* Khối Thống Kê Phổ & Item Analysis Khi Mở Rộng */}
                  {expandedStatsQuestionIds.has(q.id) && (
                    <div className="mt-2.5 p-3.5 rounded-xl bg-slate-50 border border-blue-200 space-y-2.5 animate-fadeIn">
                      {loadingStatsIds.has(q.id) && !questionStatsCache[q.id] ? (
                        <div className="flex items-center justify-center py-4 text-xs text-blue-700 italic gap-2">
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          Đang phân tích dữ liệu làm bài và phổ phương án...
                        </div>
                      ) : (() => {
                        const stats = questionStatsCache[q.id];
                        if (!stats) return <p className="text-xs text-slate-500 italic text-center py-2">Không có dữ liệu thống kê.</p>;

                        const totalAttempts = stats.total_attempts || 0;

                        return (
                          <div className="space-y-2.5">
                            {/* Header tóm tắt Item Analysis */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                              <div className="flex items-center gap-2">
                                <BarChart2 className="w-4 h-4 text-blue-600" />
                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                  Phân Tích Khảo Thí & Phổ Lựa Chọn (Item Analysis)
                                </span>
                              </div>

                              {/* Đánh giá độ khó khảo thí */}
                              {totalAttempts > 0 && stats.correct_rate !== null && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-slate-500">Độ khó khảo thí:</span>
                                  {stats.correct_rate >= 80 ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      🟢 Dễ (Độ thông hiểu cao: {stats.correct_rate}%)
                                    </span>
                                  ) : stats.correct_rate >= 50 ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                      🔵 Vừa sức (Phân hóa tốt: {stats.correct_rate}%)
                                    </span>
                                  ) : stats.correct_rate >= 25 ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                      🟠 Khó (Tỉ lệ đúng: {stats.correct_rate}%)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                      🔴 Rất khó / Câu bẫy (Tỉ lệ đúng: {stats.correct_rate}%)
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Nếu chưa có lượt làm bài */}
                            {totalAttempts === 0 ? (
                              <div className="py-2.5 px-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                                <span>
                                  Câu hỏi này chưa có lượt nộp bài từ học sinh. Khi có học sinh tham gia thi và nộp bài, phổ lựa chọn và phân tích phương án bẫy sẽ tự động hiển thị ở đây.
                                </span>
                              </div>
                            ) : (
                              <>
                                {/* 1. Trắc nghiệm (single_choice / multiple_choice) - Cảnh báo phương án bẫy */}
                                {(q.question_type === 'single_choice' || q.question_type === 'multiple_choice') && stats.distractor_stats && (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                                      <span>Phổ lựa chọn phương án (đã map chuẩn hóa chống đảo đề):</span>
                                      <span>Tổng: <strong className="text-slate-800">{totalAttempts}</strong> lượt làm</span>
                                    </div>
                                    {(() => {
                                      const traps = stats.distractor_stats.filter(s => !s.is_correct && s.percentage >= 20);
                                      if (traps.length > 0) {
                                        return (
                                          <div className="p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                                            <span>
                                              <strong>Lưu ý khảo thí:</strong> Phương án <strong>{traps.map(t => t.id).join(', ')}</strong> thu hút nhiều học sinh chọn nhầm ({traps.map(t => `${t.id}: ${t.percentage}%`).join(', ')}). Giáo viên có thể dùng làm ví dụ giảng giải lỗi sai thường gặp.
                                            </span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                )}

                                {/* 2. Đúng / Sai (true_false) */}
                                {q.question_type === 'true_false' && stats.tf_stats && (
                                  <div className="space-y-2">
                                    <div className="text-[11px] text-slate-500 font-semibold">
                                      Thống kê tỷ lệ chọn Đúng vs Sai cho từng ý nhỏ:
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {stats.tf_stats.map(sub => {
                                        const isCorrectDung = sub.raw_correct === 'T';
                                        return (
                                          <div key={sub.key} className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                              <span className="font-bold text-slate-900 uppercase">{sub.key})</span>
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                isCorrectDung
                                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                                              }`}>
                                                Đáp án chuẩn: {sub.correct_value}
                                              </span>
                                            </div>
                                            {sub.text && (
                                              <div className="text-slate-700 text-[11px] line-clamp-2">
                                                <MathContent content={sub.text} />
                                              </div>
                                            )}
                                            <div className="space-y-1 pt-1 border-t border-slate-100">
                                              {/* Chọn Đúng */}
                                              <div className="flex items-center justify-between text-[11px]">
                                                <span className={isCorrectDung ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                                                  Chọn Đúng {isCorrectDung ? '✓' : ''}
                                                </span>
                                                <span className="font-mono text-slate-800 font-medium">
                                                  {sub.true_count} lượt ({sub.true_percentage}%)
                                                </span>
                                              </div>
                                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                  className={`h-full rounded-full ${isCorrectDung ? 'bg-emerald-500' : 'bg-slate-400'}`}
                                                  style={{ width: `${sub.true_percentage}%` }}
                                                />
                                              </div>

                                              {/* Chọn Sai */}
                                              <div className="flex items-center justify-between text-[11px] pt-0.5">
                                                <span className={!isCorrectDung ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                                                  Chọn Sai {!isCorrectDung ? '✓' : ''}
                                                </span>
                                                <span className="font-mono text-slate-800 font-medium">
                                                  {sub.false_count} lượt ({sub.false_percentage}%)
                                                </span>
                                              </div>
                                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                  className={`h-full rounded-full ${!isCorrectDung ? 'bg-emerald-500' : 'bg-slate-400'}`}
                                                  style={{ width: `${sub.false_percentage}%` }}
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* 3. Điền khuyết / Trả lời ngắn (short_answer) */}
                                {q.question_type === 'short_answer' && stats.short_answer_stats && (
                                  <div className="space-y-2">
                                    <div className="text-[11px] text-slate-500 font-semibold">
                                      Tần suất các chuỗi câu trả lời phổ biến nhất mà học sinh đã gõ vào:
                                    </div>
                                    {stats.short_answer_stats.length === 0 ? (
                                      <p className="text-xs text-slate-500 italic">Chưa có câu trả lời nào được ghi nhận.</p>
                                    ) : (
                                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                        <table className="w-full text-left text-xs border-collapse">
                                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                                            <tr>
                                              <th className="py-1.5 px-3">Câu trả lời học sinh đã gõ</th>
                                              <th className="py-1.5 px-3 text-center">Số lượt</th>
                                              <th className="py-1.5 px-3 text-center">Tỷ lệ (%)</th>
                                              <th className="py-1.5 px-3 text-right">Đánh giá</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 text-slate-700">
                                            {stats.short_answer_stats.map((ans, sIdx) => (
                                              <tr key={sIdx} className="hover:bg-slate-50/80">
                                                <td className="py-1.5 px-3 font-mono font-medium text-slate-900 max-w-[200px] truncate" title={ans.answer}>
                                                  "{ans.answer}"
                                                </td>
                                                <td className="py-1.5 px-3 text-center font-bold font-mono">
                                                  {ans.count}
                                                </td>
                                                <td className="py-1.5 px-3 text-center font-mono">
                                                  {ans.percentage}%
                                                </td>
                                                <td className="py-1.5 px-3 text-right">
                                                  {ans.is_correct ? (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                      ✓ ĐÁP ÁN ĐÚNG
                                                    </span>
                                                  ) : (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                                      Không khớp
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* 4. Tự luận (essay) */}
                                {q.question_type === 'essay' && stats.essay_stats && (
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-center">
                                      <div className="text-[11px] text-slate-500">Số bài đã chấm</div>
                                      <div className="text-base font-bold text-slate-900 font-mono mt-0.5">
                                        {stats.essay_stats.graded_count}
                                      </div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-center">
                                      <div className="text-[11px] text-slate-500">Điểm trung bình</div>
                                      <div className="text-base font-bold text-blue-700 font-mono mt-0.5">
                                        {stats.essay_stats.avg_score} <span className="text-xs text-slate-400 font-normal">/ {stats.essay_stats.max_possible_score}đ</span>
                                      </div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-center">
                                      <div className="text-[11px] text-slate-500">Điểm cao nhất đạt được</div>
                                      <div className="text-base font-bold text-emerald-600 font-mono mt-0.5">
                                        {stats.essay_stats.max_score_given}đ
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}

                            {/* Danh sách đề thi đã sử dụng */}
                            {stats.used_exams && stats.used_exams.length > 0 && (
                              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-600">Đã xuất hiện trong {stats.used_exams.length} đề thi:</span>
                                {stats.used_exams.map((ex, eIdx) => (
                                  <span
                                    key={eIdx}
                                    className="px-2 py-0.5 rounded bg-white text-blue-700 border border-slate-200 truncate max-w-[220px]"
                                    title={ex.exam_title}
                                  >
                                    📄 {ex.exam_title}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Phân Trang */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs text-slate-500">
            <div>
              Hiển thị trang <strong className="text-slate-800">{currentPage}</strong> / <strong className="text-slate-800">{totalPages}</strong> (Tổng <strong className="text-blue-600">{totalQuestions}</strong> câu hỏi)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition flex items-center gap-1 border border-slate-200 shadow-2xs cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-slate-400">...</span>}
                    <button
                      onClick={() => handlePageChange(p)}
                      className={`min-w-[28px] h-7 rounded-lg font-bold transition text-xs cursor-pointer ${
                        currentPage === p ? 'bg-blue-600 text-white shadow-2xs' : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
              <button
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition flex items-center gap-1 border border-slate-200 shadow-2xs cursor-pointer"
              >
                Sau <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* MODAL 0: Nhập Câu Hỏi Từ File Word Chuẩn Hóa */}
      {showWordImportModal && (
        <QuestionBankWordImportModal
          isOpen={showWordImportModal}
          onClose={() => setShowWordImportModal(false)}
          gradeSubject={activeGradeSubject}
          topics={topics}
          onImportSuccess={() => {
            handleRefresh();
          }}
        />
      )}

      {/* MODAL 1: Quản Lý Cây Chủ Đề & Bài Học */}
      {showTopicModal && (
        <TopicLessonManagerModal
          isOpen={showTopicModal}
          onClose={() => setShowTopicModal(false)}
          gradeSubject={activeGradeSubject}
          onCurriculumChanged={() => {
            handleRefresh();
          }}
        />
      )}

      {/* MODAL 2: Soạn Thảo Câu Hỏi */}
      {showEditorModal && (
        <QuestionBankEditorModal
          isOpen={showEditorModal}
          onClose={() => setShowEditorModal(false)}
          gradeSubject={activeGradeSubject}
          editingQuestionId={editingQuestionId}
          onSaved={() => {
            handleRefresh();
          }}
        />
      )}

      {/* MODAL 3: Sinh Đề Thi Theo Ma Trận */}
      {showMatrixModal && (
        <MatrixExamGeneratorModal
          isOpen={showMatrixModal}
          onClose={() => setShowMatrixModal(false)}
          gradeSubject={activeGradeSubject}
          onGenerated={() => {
            if (onNavigateToExams) onNavigateToExams();
          }}
        />
      )}

      {/* MODAL 4: Xem Trước Trực Quan Câu Hỏi (Như Học Sinh Làm Bài Thi) */}
      {showPreviewModal && (
        <QuestionBankPreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          gradeSubject={activeGradeSubject}
          filterParams={{
            topic_id: filterTopicId,
            lesson_id: filterLessonId,
            level: filterLevel,
            question_type: filterType,
            search: search
          }}
          initialQuestionId={previewQuestionId}
          onEditQuestion={(qId) => {
            setShowPreviewModal(false);
            setEditingQuestionId(qId);
            setShowEditorModal(true);
          }}
          onRefreshBank={() => {
            handleRefresh();
          }}
        />
      )}

      {/* MODAL 5: Quản Lý Danh Mục Môn Học (Bổ sung KHTN, LSDL, GDCD, v.v.) */}
      {showSubjectModal && (
        <SubjectManagerModal
          isOpen={showSubjectModal}
          onClose={() => setShowSubjectModal(false)}
          activeGradeId={selectedGradeId}
          onSubjectsChanged={(newSubId) => {
            fetchSubjects(newSubId);
          }}
        />
      )}

      {/* MODAL 6: Sao Lưu & Phục Hồi Ngân Hàng Câu Hỏi (.vnlanqb) */}
      {showBackupModal && (
        <QuestionBankBackupModal
          isOpen={showBackupModal}
          onClose={() => setShowBackupModal(false)}
          selectedGradeSubject={activeGradeSubject}
          onRestoreSuccess={() => {
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
