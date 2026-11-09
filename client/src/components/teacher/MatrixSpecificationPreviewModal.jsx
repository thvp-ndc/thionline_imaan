import React, { useState, useMemo } from 'react';
import {
  X as CloseIcon,
  Download,
  FileText,
  Table,
  CheckCircle2,
  BookOpen,
  Layers,
  Edit2,
  AlertTriangle,
  AlertCircle,
  Upload,
  RotateCcw,
  Check,
  Info
} from 'lucide-react';

// Danh sách các mẫu câu giữ chỗ chung chung đã biết (Placeholder patterns)
const KNOWN_PLACEHOLDER_PATTERNS = [
  /^vận dụng kiến thức bài học giải quyết các bài toán và tình huống thực tiễn/i,
  /^nắm vững kiến thức, kỹ năng theo chuẩn chương trình môn học đối với bài/i,
  /^mục tiêu kiến thức, kỹ năng cần đạt/i,
  /^bài học chưa có mục tiêu cụ thể/i
];

function isPlaceholderText(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return KNOWN_PLACEHOLDER_PATTERNS.some(re => re.test(trimmed));
}

export default function MatrixSpecificationPreviewModal({
  isOpen,
  onClose,
  examTitle,
  gradeSubject,
  durationMinutes = 45,
  totalScore = 10.0,
  matrixItems = [],
  topics = [],
  schoolName = '',
  onUpdateObjective,
  onCurriculumChanged
}) {
  const [activeTab, setActiveTab] = useState('matrix'); // 'matrix' | 'specification'
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  // State chỉnh sửa đặc tả trực tiếp
  const [editingItem, setEditingItem] = useState(null); // item being edited
  const [editText, setEditText] = useState('');
  const [editIsReviewed, setEditIsReviewed] = useState(false);
  const [updatingLesson, setUpdatingLesson] = useState(false);
  const [syncLessonConfirmItem, setSyncLessonConfirmItem] = useState(null);

  // Local overrides dictionary: key -> { text, isReviewed }
  const [localOverrides, setLocalOverrides] = useState({});

  // Chuẩn hóa danh sách các dòng đặc tả chi tiết
  const specRows = useMemo(() => {
    return matrixItems.filter(it => it.count > 0).map((it, idx) => {
      const matchedTopic = topics.find(t => t.id === it.topic_id);
      const tName = it.topic_name || matchedTopic?.name || `Chủ đề ${it.topic_id}`;
      let lName = it.lesson_name;
      let matchedLesson = null;

      if (matchedTopic?.lessons && it.lesson_id && it.lesson_id !== '__unassigned__') {
        matchedLesson = matchedTopic.lessons.find(l => l.id === it.lesson_id);
        if (matchedLesson) {
          lName = matchedLesson.name;
        }
      }
      if (!lName) {
        lName = it.lesson_id === '__unassigned__' ? 'Câu hỏi chung của chủ đề' : 'Nội dung bài học';
      }

      const rowKey = `${it.topic_id}__${it.lesson_id || '__none__'}__${it.level}__${it.question_type}`;
      const override = localOverrides[rowKey];

      let effectiveText = '';
      let isReviewed = false;
      let source = 'lesson';

      // 1. Kiểm tra override tại giao diện xem trước hiện tại
      if (override !== undefined) {
        effectiveText = override.text || '';
        isReviewed = Boolean(override.isReviewed);
        source = 'custom';
      } else if (it.custom_objective !== undefined && it.custom_objective !== null) {
        effectiveText = String(it.custom_objective);
        isReviewed = Boolean(it.is_reviewed);
        source = 'matrix_custom';
      } else if (matchedLesson) {
        // 2. Tra cứu cấu trúc 3 mức độ nhận thức trong bài học
        if (matchedLesson.objectives_by_level_json) {
          try {
            const parsed = typeof matchedLesson.objectives_by_level_json === 'string'
              ? JSON.parse(matchedLesson.objectives_by_level_json)
              : matchedLesson.objectives_by_level_json;
            const normLvl = it.level === 'van_dung' ? 'van_dung' : (it.level === 'hieu' ? 'hieu' : 'biet');
            effectiveText = parsed?.[normLvl] || parsed?.[it.level] || '';
            if (effectiveText) source = 'lesson_level';
          } catch (e) {}
        }
        // 3. Fallback sang objectives chuỗi cũ nếu chưa có cấu trúc 3 mức
        if (!effectiveText && matchedLesson.objectives) {
          effectiveText = matchedLesson.objectives;
          source = 'lesson_legacy';
        }
      }

      effectiveText = effectiveText ? effectiveText.trim() : '';

      // Xác định trạng thái: missing | placeholder | draft | reviewed
      let status = 'draft';
      if (!effectiveText) {
        status = 'missing';
      } else if (isPlaceholderText(effectiveText)) {
        status = 'placeholder';
      } else if (isReviewed) {
        status = 'reviewed';
      } else {
        status = 'draft';
      }

      return {
        originalItem: it,
        index: idx,
        rowKey,
        topicId: it.topic_id,
        topicName: tName,
        lessonId: it.lesson_id,
        lessonName: lName,
        level: it.level,
        questionType: it.question_type,
        count: it.count,
        effectiveText,
        isReviewed,
        status,
        source
      };
    });
  }, [matrixItems, topics, localOverrides]);

  // Thống kê chất lượng bản đặc tả
  const specStats = useMemo(() => {
    const total = specRows.length;
    let reviewed = 0;
    let draft = 0;
    let placeholder = 0;
    let missing = 0;

    for (const r of specRows) {
      if (r.status === 'reviewed') reviewed++;
      else if (r.status === 'draft') draft++;
      else if (r.status === 'placeholder') placeholder++;
      else if (r.status === 'missing') missing++;
    }

    const completed = reviewed + draft;
    const completedPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      reviewed,
      draft,
      placeholder,
      missing,
      completed,
      completedPercent,
      hasIssues: placeholder > 0 || missing > 0
    };
  }, [specRows]);

  // Tổng hợp dữ liệu hiển thị ma trận 16 cột (Tab 1)
  const matrixSummaryRows = useMemo(() => {
    if (!Array.isArray(matrixItems) || matrixItems.length === 0) return [];
    const rowMap = new Map();

    for (const item of matrixItems) {
      if (!item.count || item.count <= 0) continue;
      const tId = item.topic_id;
      const lId = item.lesson_id || '__none__';
      const rowKey = `${tId}__${lId}`;

      if (!rowMap.has(rowKey)) {
        const matchedTopic = topics.find(t => t.id === tId);
        const tName = item.topic_name || matchedTopic?.name || `Chủ đề ${tId}`;
        let lName = item.lesson_name;

        if (matchedTopic?.lessons && item.lesson_id && item.lesson_id !== '__unassigned__') {
          const matchedLesson = matchedTopic.lessons.find(l => l.id === item.lesson_id);
          if (matchedLesson) lName = matchedLesson.name;
        }
        if (!lName) {
          lName = item.lesson_id === '__unassigned__' ? 'Câu hỏi chung của chủ đề' : 'Nội dung bài học';
        }

        rowMap.set(rowKey, {
          topic_id: tId,
          topic_name: tName,
          lesson_id: lId,
          lesson_name: lName,
          p1_biet: 0, p1_hieu: 0, p1_vd: 0, p1_score: 0,
          p2_biet: 0, p2_hieu: 0, p2_vd: 0, p2_score: 0,
          p3_biet: 0, p3_hieu: 0, p3_vd: 0, p3_score: 0,
          p4_biet: 0, p4_hieu: 0, p4_vd: 0, p4_score: 0,
          total_questions: 0,
          total_score: 0
        });
      }

      const row = rowMap.get(rowKey);
      const cnt = item.count || 0;
      const score = Math.round((cnt * (item.score_per_question || 0)) * 100) / 100;
      const lvl = item.level;

      if (item.question_type === 'single_choice' || item.question_type === 'multiple_choice') {
        if (lvl === 'biet') row.p1_biet += cnt;
        else if (lvl === 'hieu') row.p1_hieu += cnt;
        else row.p1_vd += cnt;
        row.p1_score += score;
      } else if (item.question_type === 'true_false') {
        if (lvl === 'biet') row.p2_biet += cnt;
        else if (lvl === 'hieu') row.p2_hieu += cnt;
        else row.p2_vd += cnt;
        row.p2_score += score;
      } else if (item.question_type === 'short_answer') {
        if (lvl === 'biet') row.p3_biet += cnt;
        else if (lvl === 'hieu') row.p3_hieu += cnt;
        else row.p3_vd += cnt;
        row.p3_score += score;
      } else if (item.question_type === 'essay') {
        if (lvl === 'biet') row.p4_biet += cnt;
        else if (lvl === 'hieu') row.p4_hieu += cnt;
        else row.p4_vd += cnt;
        row.p4_score += score;
      }

      row.total_questions += cnt;
      row.total_score += score;
    }

    return Array.from(rowMap.values());
  }, [matrixItems, topics]);

  // Tính tổng kết bảng ma trận
  const totals = useMemo(() => {
    let p1_biet = 0, p1_hieu = 0, p1_vd = 0, p1_score = 0;
    let p2_biet = 0, p2_hieu = 0, p2_vd = 0, p2_score = 0;
    let p3_biet = 0, p3_hieu = 0, p3_vd = 0, p3_score = 0;
    let p4_biet = 0, p4_hieu = 0, p4_vd = 0, p4_score = 0;
    let totalQuestions = 0, totalScoreCalc = 0;

    for (const r of matrixSummaryRows) {
      p1_biet += r.p1_biet; p1_hieu += r.p1_hieu; p1_vd += r.p1_vd; p1_score += r.p1_score;
      p2_biet += r.p2_biet; p2_hieu += r.p2_hieu; p2_vd += r.p2_vd; p2_score += r.p2_score;
      p3_biet += r.p3_biet; p3_hieu += r.p3_hieu; p3_vd += r.p3_vd; p3_score += r.p3_score;
      p4_biet += r.p4_biet; p4_hieu += r.p4_hieu; p4_vd += r.p4_vd; p4_score += r.p4_score;
      totalQuestions += r.total_questions;
      totalScoreCalc += r.total_score;
    }

    let bietScoreActual = 0, hieuScoreActual = 0, vdScoreActual = 0;
    for (const it of matrixItems) {
      const s = (it.count || 0) * (it.score_per_question || 0);
      if (it.level === 'biet') bietScoreActual += s;
      else if (it.level === 'hieu') hieuScoreActual += s;
      else vdScoreActual += s;
    }

    const roundedTotalScore = Math.round(totalScoreCalc * 100) / 100;
    const bietPercent = roundedTotalScore > 0 ? Math.round((bietScoreActual / roundedTotalScore) * 100) : 0;
    const hieuPercent = roundedTotalScore > 0 ? Math.round((hieuScoreActual / roundedTotalScore) * 100) : 0;
    const vdPercent = roundedTotalScore > 0 ? Math.round((vdScoreActual / roundedTotalScore) * 100) : 0;

    return {
      p1_biet, p1_hieu, p1_vd, p1_score: Math.round(p1_score * 100) / 100,
      p2_biet, p2_hieu, p2_vd, p2_score: Math.round(p2_score * 100) / 100,
      p3_biet, p3_hieu, p3_vd, p3_score: Math.round(p3_score * 100) / 100,
      p4_biet, p4_hieu, p4_vd, p4_score: Math.round(p4_score * 100) / 100,
      totalQuestions,
      totalScore: roundedTotalScore,
      bietScore: Math.round(bietScoreActual * 100) / 100,
      hieuScore: Math.round(hieuScoreActual * 100) / 100,
      vdScore: Math.round(vdScoreActual * 100) / 100,
      bietPercent,
      hieuPercent,
      vdPercent
    };
  }, [matrixSummaryRows, matrixItems]);

  // Mở trình biên soạn dòng đặc tả
  const handleStartEdit = (row) => {
    setEditingItem(row);
    setEditText(row.effectiveText);
    setEditIsReviewed(row.isReviewed);
  };

  // Áp dụng nội dung cho ma trận này (Lưu độc lập, không ghi đè bài học gốc)
  const handleApplyToMatrix = () => {
    if (!editingItem) return;
    const trimmed = editText.trim();
    const rowKey = editingItem.rowKey;

    setLocalOverrides(prev => ({
      ...prev,
      [rowKey]: {
        text: trimmed,
        isReviewed: editIsReviewed
      }
    }));

    if (onUpdateObjective) {
      onUpdateObjective(rowKey, trimmed, editIsReviewed);
    }

    setEditingItem(null);
  };

  // Cập nhật vào bài học gốc (Có xác nhận từ giáo viên)
  const handleConfirmSyncToLesson = async () => {
    if (!syncLessonConfirmItem) return;
    const row = syncLessonConfirmItem;
    if (!row.lessonId || row.lessonId === '__unassigned__') {
      alert('Không thể lưu cho câu hỏi chung chưa gán bài học cụ thể.');
      setSyncLessonConfirmItem(null);
      return;
    }

    try {
      setUpdatingLesson(true);
      const res = await fetch(`/api/curriculum/lessons/${row.lessonId}/objective-level`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: row.level,
          objective: row.effectiveText
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(`Đã cập nhật thành công yêu cầu cần đạt cho bài học "${row.lessonName}" (Mức độ: ${row.level === 'van_dung' ? 'Vận dụng' : row.level === 'hieu' ? 'Thông hiểu' : 'Nhận biết'}) trong ngân hàng dữ liệu.`);
        if (onCurriculumChanged) onCurriculumChanged();
      } else {
        alert('Lỗi cập nhật: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setUpdatingLesson(false);
      setSyncLessonConfirmItem(null);
    }
  };

  // Chuẩn bị danh sách matrixItems có kèm custom_objective để xuất Word chính xác
  const preparedMatrixItemsForExport = useMemo(() => {
    return matrixItems.map(it => {
      const rowKey = `${it.topic_id}__${it.lesson_id || '__none__'}__${it.level}__${it.question_type}`;
      const matchedRow = specRows.find(r => r.rowKey === rowKey);
      if (matchedRow) {
        return {
          ...it,
          custom_objective: matchedRow.effectiveText,
          is_reviewed: matchedRow.isReviewed
        };
      }
      return it;
    });
  }, [matrixItems, specRows]);

  // Xuất riêng file Word (.docx) từ đúng dữ liệu đã kiểm tra/chỉnh sửa
  const handleDownloadDocx = async () => {
    try {
      setDownloadingDocx(true);
      const res = await fetch('/api/exam-matrices/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: examTitle.trim(),
          grade_subject_id: gradeSubject.id,
          duration_minutes: durationMinutes,
          total_score: totalScore,
          matrix_items: preparedMatrixItemsForExport,
          school_name: schoolName
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Lỗi xuất file Word ma trận');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanTitle = (examTitle || 'Ma_Tran').trim().replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g, '_');
      a.download = `Ma_Tran_Va_Ban_Dac_Ta_${cleanTitle}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Lỗi tải file Word: ' + err.message);
    } finally {
      setDownloadingDocx(false);
    }
  };

  if (!isOpen) return null;

  const typeLabels = {
    single_choice: 'Trắc nghiệm ABCD (Phần I)',
    multiple_choice: 'Nhiều lựa chọn (Phần I)',
    true_false: 'Đúng / Sai (Phần II)',
    short_answer: 'Trả lời ngắn (Phần III)',
    essay: 'Tự luận (Phần IV)'
  };

  const levelBadges = {
    biet: <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">Nhận biết</span>,
    hieu: <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Thông hiểu</span>,
    van_dung: <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold">Vận dụng</span>
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-6xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header Modal */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Xem Trước Khung Ma Trận & Bản Đặc Tả Đề Thi
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-semibold">
                  Chuẩn Bộ GD&ĐT 2025
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                <span><strong>Đề:</strong> {examTitle}</span>
                <span>•</span>
                <span><strong>Môn:</strong> {gradeSubject?.subject_name} {gradeSubject?.grade_name}</span>
                <span>•</span>
                <span><strong>Thời gian:</strong> {durationMinutes} phút</span>
                <span>•</span>
                <span><strong>Tổng điểm:</strong> <strong className="text-emerald-700">{totals.totalScore}đ</strong> ({totals.totalQuestions} câu)</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadDocx}
              disabled={downloadingDocx || matrixItems.length === 0}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              title="Tải riêng file Word (.docx) chứa Bảng ma trận và Bản đặc tả đã duyệt"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>{downloadingDocx ? 'Đang Tải Word...' : 'Tải File Word (.docx)'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Thanh chuyển tab & Thống kê tỷ lệ nhận thức */}
        <div className="px-5 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'matrix'
                  ? 'bg-white text-teal-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>1. Bảng Ma Trận Đề Thi</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('specification')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer relative ${
                activeTab === 'specification'
                  ? 'bg-white text-teal-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>2. Bản Đặc Tả Đề Thi</span>
              {specStats.hasIssues && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Có dòng cần hoàn thiện yêu cầu cần đạt" />
              )}
            </button>
          </div>

          {/* Tỷ lệ điểm nhận thức */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Tỷ lệ nhận thức:</span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
              Biết: {totals.bietPercent}% ({totals.bietScore}đ)
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">
              Hiểu: {totals.hieuPercent}% ({totals.hieuScore}đ)
            </span>
            <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold">
              Vận dụng: {totals.vdPercent}% ({totals.vdScore}đ)
            </span>
          </div>
        </div>

        {/* Nội dung bảng */}
        <div className="flex-1 overflow-auto p-4 sm:p-5">
          {matrixSummaryRows.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Table className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có ô câu hỏi nào được chọn trong ma trận.</p>
            </div>
          ) : activeTab === 'matrix' ? (
            /* TAB 1: BẢNG MA TRẬN ĐỀ THI (16 CỘT) */
            <div className="overflow-x-auto border border-slate-300 rounded-xl shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-center">
                    <th rowSpan="2" className="p-2.5 border-r border-slate-300 w-10">TT</th>
                    <th rowSpan="2" className="p-2.5 border-r border-slate-300 text-left min-w-[200px]">Chủ đề & Nội dung bài học</th>
                    <th colSpan="3" className="p-2 border-r border-slate-300 bg-blue-50/70 text-blue-900">
                      PHẦN I: TRẮC NGHIỆM ABCD
                    </th>
                    <th colSpan="3" className="p-2 border-r border-slate-300 bg-amber-50/70 text-amber-900">
                      PHẦN II: ĐÚNG / SAI
                    </th>
                    <th colSpan="3" className="p-2 border-r border-slate-300 bg-emerald-50/70 text-emerald-900">
                      PHẦN III: TRẢ LỜI NGẮN
                    </th>
                    <th colSpan="3" className="p-2 border-r border-slate-300 bg-purple-50/70 text-purple-900">
                      PHẦN IV: TỰ LUẬN
                    </th>
                    <th colSpan="2" className="p-2 bg-slate-200/80 text-slate-900">
                      TỔNG CỘNG
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-300 text-center">
                    <th className="p-1.5 border-r border-slate-200 w-10">Biết</th>
                    <th className="p-1.5 border-r border-slate-200 w-10">Hiểu</th>
                    <th className="p-1.5 border-r border-slate-300 w-10">VD</th>
                    <th className="p-1.5 border-r border-slate-200 w-10">Biết</th>
                    <th className="p-1.5 border-r border-slate-200 w-10">Hiểu</th>
                    <th className="p-1.5 border-r border-slate-300 w-10">VD</th>
                    <th className="p-1.5 border-r border-slate-200 w-10">Biết</th>
                    <th className="p-1.5 border-r border-slate-200 w-10">Hiểu</th>
                    <th className="p-1.5 border-r border-slate-300 w-10">VD</th>
                    <th className="p-1.5 border-r border-slate-200 w-10">Biết</th>
                    <th className="p-1.5 border-r border-slate-200 w-10">Hiểu</th>
                    <th className="p-1.5 border-r border-slate-300 w-10">VD</th>
                    <th className="p-1.5 border-r border-slate-200 w-14 font-bold">Số câu</th>
                    <th className="p-1.5 w-14 font-bold text-emerald-800">Điểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {matrixSummaryRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                      <td className="p-2 text-center text-slate-500 font-medium border-r border-slate-200">{idx + 1}</td>
                      <td className="p-2 border-r border-slate-200">
                        <div className="font-bold text-slate-800">{row.topic_name}</div>
                        <div className="text-[11px] text-slate-600 font-medium">{row.lesson_name}</div>
                      </td>
                      <td className="p-2 text-center border-r border-slate-200">{row.p1_biet || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-200">{row.p1_hieu || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-300 font-semibold">{row.p1_vd || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-200">{row.p2_biet || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-200">{row.p2_hieu || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-300 font-semibold">{row.p2_vd || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-200">{row.p3_biet || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-200">{row.p3_hieu || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-300 font-semibold">{row.p3_vd || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-200">{row.p4_biet || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-200">{row.p4_hieu || '-'}</td>
                      <td className="p-2 text-center border-r border-slate-300 font-semibold">{row.p4_vd || '-'}</td>
                      <td className="p-2 text-center font-bold text-blue-700 border-r border-slate-200">{row.total_questions}</td>
                      <td className="p-2 text-center font-bold text-emerald-800">{row.total_score}đ</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300 text-center">
                    <td colSpan="2" className="p-2.5 text-center border-r border-slate-300 uppercase tracking-wide">
                      Tổng số câu
                    </td>
                    <td className="p-2 border-r border-slate-200">{totals.p1_biet}</td>
                    <td className="p-2 border-r border-slate-200">{totals.p1_hieu}</td>
                    <td className="p-2 border-r border-slate-300">{totals.p1_vd}</td>
                    <td className="p-2 border-r border-slate-200">{totals.p2_biet}</td>
                    <td className="p-2 border-r border-slate-200">{totals.p2_hieu}</td>
                    <td className="p-2 border-r border-slate-300">{totals.p2_vd}</td>
                    <td className="p-2 border-r border-slate-200">{totals.p3_biet}</td>
                    <td className="p-2 border-r border-slate-200">{totals.p3_hieu}</td>
                    <td className="p-2 border-r border-slate-300">{totals.p3_vd}</td>
                    <td className="p-2 border-r border-slate-200">{totals.p4_biet}</td>
                    <td className="p-2 border-r border-slate-200">{totals.p4_hieu}</td>
                    <td className="p-2 border-r border-slate-300">{totals.p4_vd}</td>
                    <td className="p-2 border-r border-slate-200 text-blue-700 text-sm font-black">{totals.totalQuestions}</td>
                    <td className="p-2 text-emerald-800 text-sm font-black">{totals.totalScore}đ</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold text-slate-800 border-t border-slate-200 text-center">
                    <td colSpan="2" className="p-2 text-center border-r border-slate-300 uppercase">
                      Tổng điểm theo phần
                    </td>
                    <td colSpan="3" className="p-2 border-r border-slate-300 text-blue-700">{totals.p1_score}đ</td>
                    <td colSpan="3" className="p-2 border-r border-slate-300 text-amber-700">{totals.p2_score}đ</td>
                    <td colSpan="3" className="p-2 border-r border-slate-300 text-emerald-700">{totals.p3_score}đ</td>
                    <td colSpan="3" className="p-2 border-r border-slate-300 text-purple-700">{totals.p4_score}đ</td>
                    <td colSpan="2" className="p-2 text-emerald-900 font-black text-sm">100% ({totals.totalScore}đ)</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            /* TAB 2: BẢN ĐẶC TẢ ĐỀ THI CÓ KIỂM SOÁT CHẤT LƯỢNG & CHỈNH SỬA TRỰC TIẾP */
            <div className="space-y-3">
              {/* Thanh trạng thái kiểm soát chất lượng đặc tả */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-700">Kiểm soát bản đặc tả:</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Đã duyệt: <strong>{specStats.reviewed}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                    Bản nháp: <strong>{specStats.draft}</strong>
                  </span>
                  {specStats.placeholder > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Văn bản giữ chỗ: <strong>{specStats.placeholder}</strong>
                    </span>
                  )}
                  {specStats.missing > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Chưa có nội dung: <strong>{specStats.missing}</strong>
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-500">
                  💡 Thầy/Cô bấm vào ô hoặc icon cây bút <Edit2 className="w-3 h-3 inline text-blue-600" /> để sửa trực tiếp câu từ từng dòng.
                </div>
              </div>

              {/* Thông báo nếu còn dòng chưa chuẩn hóa */}
              {specStats.hasIssues && (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold">Lưu ý kiểm soát chất lượng hồ sơ khảo thí:</div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Bản đặc tả hiện có <strong>{specStats.missing} dòng chưa có nội dung</strong> và <strong>{specStats.placeholder} dòng chứa văn bản giữ chỗ chưa chuẩn hóa</strong>.
                      Hệ thống cho phép Thầy/Cô lưu ma trận dạng bản nháp để tiếp tục soạn dở, nhưng vui lòng hoàn thiện và xác nhận nội dung trước khi xuất bản hồ sơ chính thức của nhà trường.
                    </p>
                  </div>
                </div>
              )}

              {/* Bảng Đặc Tả */}
              <div className="overflow-x-auto border border-slate-300 rounded-xl shadow-2xs">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-center">
                      <th className="p-2.5 border-r border-slate-300 w-10">TT</th>
                      <th className="p-2.5 border-r border-slate-300 text-left min-w-[140px]">Chủ đề</th>
                      <th className="p-2.5 border-r border-slate-300 text-left min-w-[170px]">Đơn vị kiến thức / Bài học</th>
                      <th className="p-2.5 border-r border-slate-300 text-left min-w-[280px]">
                        Yêu cầu cần đạt (Chuẩn GDPT 2018)
                      </th>
                      <th className="p-2.5 border-r border-slate-300 w-28">Dạng thức câu hỏi</th>
                      <th className="p-2.5 border-r border-slate-300 w-24">Mức độ</th>
                      <th className="p-2.5 border-r border-slate-300 w-14">Số câu</th>
                      <th className="p-2.5 w-24">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {specRows.map((row, idx) => {
                      const isRowMissing = row.status === 'missing';
                      const isRowPlaceholder = row.status === 'placeholder';
                      const isRowReviewed = row.status === 'reviewed';

                      return (
                        <tr
                          key={row.rowKey}
                          className={`transition ${
                            isRowMissing
                              ? 'bg-rose-50/20 hover:bg-rose-50/40'
                              : isRowPlaceholder
                              ? 'bg-amber-50/20 hover:bg-amber-50/40'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="p-2 text-center text-slate-500 font-medium border-r border-slate-200">{idx + 1}</td>
                          <td className="p-2 font-medium text-slate-800 border-r border-slate-200">{row.topicName}</td>
                          <td className="p-2 font-semibold text-slate-900 border-r border-slate-200">{row.lessonName}</td>
                          
                          {/* Cột Yêu Cầu Cần Đạt với Trạng thái rõ ràng */}
                          <td
                            onClick={() => handleStartEdit(row)}
                            className="p-2 border-r border-slate-200 leading-relaxed cursor-pointer group hover:bg-blue-50/40 transition relative"
                            title="Bấm vào đây để chỉnh sửa yêu cầu cần đạt"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                {isRowMissing ? (
                                  <span className="text-slate-400 italic flex items-center gap-1.5 font-light">
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                    <span>(Chưa có yêu cầu cần đạt - Bấm để bổ sung)</span>
                                  </span>
                                ) : (
                                  <span className={isRowPlaceholder ? 'text-amber-900' : 'text-slate-800'}>
                                    {row.effectiveText}
                                  </span>
                                )}
                              </div>

                              <div className="shrink-0 flex items-center gap-1 mt-0.5">
                                {isRowReviewed ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Đã duyệt
                                  </span>
                                ) : isRowPlaceholder ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Giữ chỗ
                                  </span>
                                ) : isRowMissing ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    Trống
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    Bản nháp
                                  </span>
                                )}
                                <span className="opacity-0 group-hover:opacity-100 p-1 text-blue-600 hover:bg-blue-100 rounded transition">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="p-2 text-center font-medium text-slate-700 border-r border-slate-200">
                            {typeLabels[row.questionType] || row.questionType}
                          </td>
                          <td className="p-2 text-center border-r border-slate-200">
                            {levelBadges[row.level] || row.level}
                          </td>
                          <td className="p-2 text-center font-bold text-slate-900 border-r border-slate-200">
                            {row.count}
                          </td>

                          {/* Cột Thao tác */}
                          <td className="p-2 text-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(row)}
                              className="px-2 py-1 bg-white hover:bg-blue-50 border border-slate-200 text-blue-700 rounded text-[11px] font-semibold transition cursor-pointer shadow-2xs"
                              title="Chỉnh sửa yêu cầu cần đạt của dòng này"
                            >
                              Sửa
                            </button>
                            {row.lessonId && row.lessonId !== '__unassigned__' && row.effectiveText && !isPlaceholderText(row.effectiveText) && (
                              <button
                                type="button"
                                onClick={() => setSyncLessonConfirmItem(row)}
                                className="p-1 hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 rounded transition cursor-pointer"
                                title="Lưu nội dung này vào bài học gốc (ngân hàng dữ liệu)"
                              >
                                <Upload className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Khung ma trận đáp ứng 100% định dạng đề kiểm tra đánh giá định kỳ theo quy định của Bộ GD&ĐT.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
          >
            Đóng
          </button>
        </div>

      </div>

      {/* POPUP TRÌNH BIÊN SOẠN YÊU CẦU CẦN ĐẠT CỦA DÒNG ĐẶC TẢ */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-70 flex items-center justify-center p-3 sm:p-4 animate-in fade-in zoom-in-95 duration-100">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-5 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                Biên Soạn Yêu Cầu Cần Đạt (Dòng {editingItem.index + 1})
              </h4>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>
                <span className="text-slate-500">Chủ đề:</span> <strong className="text-slate-800">{editingItem.topicName}</strong>
              </div>
              <div>
                <span className="text-slate-500">Bài học:</span> <strong className="text-slate-900">{editingItem.lessonName}</strong>
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-slate-500">Mức độ:</span>
                {levelBadges[editingItem.level] || editingItem.level}
                <span className="text-slate-400">•</span>
                <span className="text-slate-500">Dạng câu:</span>
                <span className="font-semibold text-slate-700">{typeLabels[editingItem.questionType]}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500">Số câu:</span>
                <strong className="text-blue-700 font-mono">{editingItem.count}</strong>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Nội dung Yêu Cầu Cần Đạt (Chuẩn GDPT 2018):
              </label>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={4}
                placeholder="Nhập yêu cầu cần đạt phù hợp với bài học và mức độ đánh giá..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none leading-relaxed"
                autoFocus
              />
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <span className="text-slate-500 italic">
                  Hệ thống không tự sinh câu; Thầy/Cô biên soạn có căn cứ chương trình và SGK.
                </span>
                {isPlaceholderText(editText) && (
                  <span className="text-amber-700 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Phát hiện văn bản giữ chỗ
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editIsReviewed}
                  onChange={e => setEditIsReviewed(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-800">
                  Xác nhận nội dung đã được thẩm định & duyệt (Reviewed)
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleApplyToMatrix}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-2xs flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Áp Dụng Cho Ma Trận Này
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP XÁC NHẬN CẬP NHẬT VÀO BÀI HỌC GỐC */}
      {syncLessonConfirmItem && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-80 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Xác Nhận Cập Nhật Vào Bài Học Gốc?
                </h4>
                <p className="text-[11px] text-slate-500">
                  Đồng bộ dữ liệu dùng chung vào CSDL ngân hàng
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <div>
                Bài học: <strong className="text-slate-900">{syncLessonConfirmItem.lessonName}</strong>
              </div>
              <div>
                Mức độ cập nhật: <strong className="text-blue-700 uppercase">{syncLessonConfirmItem.level === 'van_dung' ? 'Vận dụng' : syncLessonConfirmItem.level === 'hieu' ? 'Thông hiểu' : 'Nhận biết'}</strong>
              </div>
              <div className="text-[11px] text-slate-600 italic bg-white p-2 rounded border border-slate-200 mt-2">
                "{syncLessonConfirmItem.effectiveText}"
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              ⚠️ <strong>Lưu ý:</strong> Thao tác này sẽ cập nhật trường yêu cầu cần đạt của bài học này trong danh mục bài học dùng chung. Các mức độ khác và các đề thi đã phát hành trước đây vẫn được giữ nguyên.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSyncLessonConfirmItem(null)}
                disabled={updatingLesson}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmSyncToLesson}
                disabled={updatingLesson}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-2xs flex items-center gap-1.5"
              >
                {updatingLesson ? 'Đang cập nhật...' : 'Xác Nhận Cập Nhật'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
