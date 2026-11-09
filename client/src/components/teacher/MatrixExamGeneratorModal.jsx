import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X as CloseIcon, Sparkles, CheckCircle2, AlertCircle, Clock, BookOpen, Layers, Save, ArrowRight, ChevronDown, ChevronRight, FolderTree, Download, FileArchive, Copy, Eye, Table } from 'lucide-react';
import VariantExamPreviewModal from './VariantExamPreviewModal';
import MatrixSpecificationPreviewModal from './MatrixSpecificationPreviewModal';

/**
 * MatrixCell: Ô nhập số lượng câu hỏi trong Ma Trận Đặc Tả
 * Phân cấp thị giác 3 trạng thái theo chuẩn khảo thí:
 * 1. TRẠNG THÁI 1: HẾT CÂU / KHÔNG CÓ CÂU TRONG NGÂN HÀNG (available === 0)
 *    - Làm chìm hoàn toàn ô này để giảm tải thị giác:
 *      + Container: bg-slate-50/70 opacity-30 select-none cursor-not-allowed flex flex-col items-center justify-center py-1.5
 *      + Dấu gạch ngang nhẹ: <span className="text-slate-400 text-sm font-light leading-none">-</span>
 *      + Hiển thị số lượng: <span className="text-[10px] text-slate-400 mt-1">(0)</span>
 *      + Khóa hoàn toàn tương tác (không focus, không click được).
 * 2. TRẠNG THÁI 2: CÓ CÂU HỎI SẴN SÀNG NHƯNG CHƯA CHỌN (available > 0 && selected === 0)
 *    - Làm nổi bật số lượng sẵn có để giáo viên nhận biết ngay ô này có thể chọn:
 *      + Container: flex flex-col items-center gap-1 py-1
 *      + Thẻ <input>:
 *        * Placeholder: "0" (khi giá trị bằng 0 hoặc rỗng thì để ô trống hoặc mờ nhẹ, không hiện số 0 đậm át số khác).
 *        * Styling: w-11 h-7 text-center text-xs font-semibold rounded border border-slate-300 bg-white text-slate-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-300
 *      + Nhãn số lượng (available) bên dưới:
 *        * <span className="text-[11px] font-bold text-emerald-600">({available})</span>
 * 3. TRẠNG THÁI 3: ĐÃ CHỌN CÂU HỎI (selected > 0)
 *    - Làm nổi bật rực rỡ để giáo viên lướt mắt là thấy ngay những bài/mức độ mình đã gán số câu:
 *      + Thẻ <input> đổi sang tone màu active:
 *        * Styling: w-11 h-7 text-center text-xs font-bold rounded border-2 border-blue-600 bg-blue-50 text-blue-700 shadow-sm focus:ring-2 focus:ring-blue-500
 *        * Nếu vượt quá (isExceeded): border-2 border-rose-500 bg-rose-50 text-rose-700 shadow-sm focus:ring-2 focus:ring-rose-500
 *      + Nhãn số lượng bên dưới:
 *        * <span className="text-[11px] font-bold text-blue-600">({available})</span> (hoặc text-rose-600 nếu isExceeded)
 */
const MatrixCell = React.memo(function MatrixCell({
  available = 0,
  selected = 0,
  onChange,
  label = ''
}) {
  const availCount = Math.max(0, parseInt(available, 10) || 0);
  const selectedCount = Math.max(0, parseInt(selected, 10) || 0);
  const isExceeded = selectedCount > availCount;

  // TRẠNG THÁI 1: HẾT CÂU / KHÔNG CÓ CÂU TRONG NGÂN HÀNG
  if (availCount === 0) {
    return (
      <div
        className="bg-slate-50/70 opacity-30 select-none cursor-not-allowed flex flex-col items-center justify-center py-1.5"
        title="Chưa có câu hỏi trong ngân hàng cho tiêu chí này"
      >
        <span className="text-slate-400 text-sm font-light leading-none">-</span>
        <span className="text-[10px] text-slate-400 mt-1">(0)</span>
      </div>
    );
  }

  // Xử lý thay đổi khi gõ số: chặn số âm, cho phép xóa trống (backspace) không kẹt 0, tự động clamp về available nếu vượt quá
  const handleInputChange = (e) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange(0);
      return;
    }
    const cleanDigits = raw.replace(/[^0-9]/g, '');
    if (cleanDigits === '') {
      onChange(0);
      return;
    }
    let num = parseInt(cleanDigits, 10);
    if (isNaN(num) || num < 0) num = 0;
    if (availCount > 0 && num > availCount) {
      num = availCount;
    }
    onChange(num);
  };

  // Hỗ trợ phím mũi tên Lên/Xuống
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(availCount, selectedCount + 1);
      onChange(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(0, selectedCount - 1);
      onChange(next);
    }
  };

  // TRẠNG THÁI 3: ĐÃ CHỌN CÂU HỎI (selected > 0)
  if (selectedCount > 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={selectedCount}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={(e) => e.target.select()}
          placeholder="0"
          className={`w-11 h-7 text-center text-xs font-bold rounded border-2 shadow-sm focus:ring-2 transition-all cursor-text ${
            isExceeded
              ? 'border-rose-500 bg-rose-50 text-rose-700 focus:ring-rose-400'
              : 'border-blue-600 bg-blue-50 text-blue-700 focus:ring-blue-500'
          }`}
          title={`Đã chọn ${selectedCount} / ${availCount} câu (${label})`}
        />
        <span className={`text-[11px] font-bold ${isExceeded ? 'text-rose-600' : 'text-blue-600'}`}>
          ({availCount})
        </span>
      </div>
    );
  }

  // TRẠNG THÁI 2: CÓ CÂU HỎI SẴN SÀNG NHƯNG CHƯA CHỌN (available > 0 && selected === 0)
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value=""
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={(e) => e.target.select()}
        placeholder="0"
        className="w-11 h-7 text-center text-xs font-semibold rounded border border-slate-300 bg-white text-slate-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-300 hover:border-slate-400 cursor-text"
        title={`Sẵn có ${availCount} câu (${label})`}
      />
      <span className="text-[11px] font-bold text-emerald-600">
        ({availCount})
      </span>
    </div>
  );
});

export default function MatrixExamGeneratorModal({
  isOpen,
  onClose,
  gradeSubject,
  onGenerated
}) {
  const [topics, setTopics] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showMatrixPreviewModal, setShowMatrixPreviewModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // Chế độ cấu hình ma trận: 'lesson' (Chi tiết từng bài) | 'topic' (Gộp theo chủ đề)
  const [matrixMode, setMatrixMode] = useState('lesson');
  // Trạng thái thu gọn/mở rộng các chủ đề trong chế độ xem bài học
  const [collapsedTopics, setCollapsedTopics] = useState(new Set());

  // Form Thông Tin Đề
  const [examTitle, setExamTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [variantsCount, setVariantsCount] = useState(4);
  const [variantCodes, setVariantCodes] = useState(['101', '102', '103', '104']);

  const handleVariantsCountChange = (count) => {
    const n = Math.max(1, Math.min(24, parseInt(count, 10) || 1));
    setVariantsCount(n);
    setVariantCodes(prev => {
      const next = [...prev];
      if (n > next.length) {
        let lastNum = 100;
        for (const c of next) {
          const parsed = parseInt(c, 10);
          if (!isNaN(parsed) && parsed > lastNum) lastNum = parsed;
        }
        while (next.length < n) {
          lastNum++;
          next.push(String(lastNum));
        }
      } else if (n < next.length) {
        return next.slice(0, n);
      }
      return next;
    });
  };

  const handleUpdateVariantCode = (index, value) => {
    setVariantCodes(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleAddVariantCode = () => {
    if (variantCodes.length >= 24) return;
    const next = [...variantCodes];
    let lastNum = 100;
    for (const c of next) {
      const parsed = parseInt(c, 10);
      if (!isNaN(parsed) && parsed > lastNum) lastNum = parsed;
    }
    next.push(String(lastNum + 1));
    setVariantCodes(next);
    setVariantsCount(next.length);
  };

  const handleRemoveVariantCode = (index) => {
    if (variantCodes.length <= 1) return;
    const next = variantCodes.filter((_, i) => i !== index);
    setVariantCodes(next);
    setVariantsCount(next.length);
  };

  const applyVariantPreset = (type) => {
    const n = variantCodes.length || 1;
    let newCodes = [];
    if (type === '101') {
      newCodes = Array.from({ length: n }, (_, i) => String(101 + i));
    } else if (type === '01') {
      newCodes = Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0'));
    } else if (type === 'letters') {
      newCodes = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
    } else if (type === 'md') {
      newCodes = Array.from({ length: n }, (_, i) => `MĐ ${i + 1}`);
    }
    setVariantCodes(newCodes);
  };

  // Ma trận cấu hình: Map rowKey (lesson_id hoặc topic_id) -> { biet_mcq, ... }
  const [matrixConfig, setMatrixConfig] = useState({});

  // Lưu trữ yêu cầu cần đạt tùy chỉnh theo từng dòng đặc tả của ma trận hiện tại
  const [customObjectives, setCustomObjectives] = useState({});

  // Điểm số cấu hình cho từng loại câu (chuẩn Bộ GD&ĐT 2025)
  const [scorePerQuestion, setScorePerQuestion] = useState({
    mcq: 0.25,
    tf: 1.0,
    sa: 0.5,
    essay: 1.0
  });

  // Quản lý mẫu ma trận đã lưu (Templates)
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [currentTemplateId, setCurrentTemplateId] = useState(null);
  const [currentTemplateTitle, setCurrentTemplateTitle] = useState('');
  const [expandedPreviewId, setExpandedPreviewId] = useState(null);

  const getTemplateSummary = (itemsJson) => {
    try {
      const items = typeof itemsJson === 'string' ? JSON.parse(itemsJson || '[]') : (itemsJson || []);
      let totalQ = 0;
      let mcq = 0, tf = 0, sa = 0, essay = 0;
      let biet = 0, hieu = 0, vd = 0;
      for (const it of items) {
        const c = it.count || 0;
        totalQ += c;
        if (it.question_type === 'single_choice' || it.question_type === 'multiple_choice') mcq += c;
        else if (it.question_type === 'true_false') tf += c;
        else if (it.question_type === 'short_answer') sa += c;
        else if (it.question_type === 'essay') essay += c;

        if (it.level === 'biet') biet += c;
        else if (it.level === 'hieu') hieu += c;
        else if (it.level === 'van_dung') vd += c;
      }
      return { totalQ, mcq, tf, sa, essay, biet, hieu, vd, items };
    } catch (_) {
      return { totalQ: 0, mcq: 0, tf: 0, sa: 0, essay: 0, biet: 0, hieu: 0, vd: 0, items: [] };
    }
  };

  const fetchSavedTemplates = async () => {
    if (!gradeSubject?.id) return;
    try {
      const res = await fetch(`/api/exam-matrices?grade_subject_id=${gradeSubject.id}`);
      const data = await res.json();
      if (data.success) {
        setSavedTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Fetch templates error:', err);
    }
  };

  const emptyRow = () => ({
    biet_mcq: 0,
    hieu_mcq: 0,
    vd_mcq: 0,
    biet_tf: 0,
    hieu_tf: 0,
    vd_tf: 0,
    biet_sa: 0,
    hieu_sa: 0,
    vd_sa: 0,
    biet_essay: 0,
    hieu_essay: 0,
    vd_essay: 0
  });

  const fetchData = async () => {
    if (!gradeSubject?.id) return;
    try {
      setLoading(true);
      const [resTopics, resStats] = await Promise.all([
        fetch(`/api/curriculum/topics?grade_subject_id=${gradeSubject.id}`).then(r => r.json()),
        fetch(`/api/question-bank/stats?grade_subject_id=${gradeSubject.id}`).then(r => r.json())
      ]);

      if (resTopics.success) {
        setTopics(resTopics.topics || []);
      }
      if (resStats.success) {
        setStats(resStats.stats || null);
      }

      // Khởi tạo ma trận mặc định cho cả cấp chủ đề, bài học và câu hỏi chung
      const initialConfig = {};
      for (const t of resTopics.topics || []) {
        initialConfig[t.id] = emptyRow();
        if (t.lessons && t.lessons.length > 0) {
          for (const l of t.lessons) {
            initialConfig[l.id] = emptyRow();
          }
        }
        initialConfig[`${t.id}__unassigned__`] = emptyRow();
      }
      setMatrixConfig(initialConfig);
      setExamTitle(`Kiểm Tra ${gradeSubject.subject_name} ${gradeSubject.grade_name}`);
      fetchSavedTemplates();
    } catch (err) {
      console.error('Fetch matrix data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && gradeSubject?.id) {
      fetchData();
    }
  }, [isOpen, gradeSubject?.id]);

  if (!isOpen) return null;

  const toggleTopicCollapse = (topicId) => {
    setCollapsedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const expandAllTopics = () => setCollapsedTopics(new Set());
  const collapseAllTopics = () => setCollapsedTopics(new Set(topics.map(t => t.id)));

  const handleCellChange = (rowKey, field, value) => {
    const parsed = typeof value === 'number' ? value : (parseInt(value, 10) || 0);
    const val = Math.max(0, isNaN(parsed) ? 0 : parsed);
    setMatrixConfig(prev => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        [field]: val
      }
    }));
  };

  const checks = [
    { field: 'biet_mcq', level: 'biet', type: 'single_choice', score: scorePerQuestion.mcq, availKey: 'biet_mcq', label: 'Biết TN' },
    { field: 'hieu_mcq', level: 'hieu', type: 'single_choice', score: scorePerQuestion.mcq, availKey: 'hieu_mcq', label: 'Hiểu TN' },
    { field: 'vd_mcq', level: 'van_dung', type: 'single_choice', score: scorePerQuestion.mcq, availKey: 'van_dung_mcq', label: 'VD TN' },
    { field: 'biet_tf', level: 'biet', type: 'true_false', score: scorePerQuestion.tf, availKey: 'biet_tf', label: 'Biết Đ/S' },
    { field: 'hieu_tf', level: 'hieu', type: 'true_false', score: scorePerQuestion.tf, availKey: 'hieu_tf', label: 'Hiểu Đ/S' },
    { field: 'vd_tf', level: 'van_dung', type: 'true_false', score: scorePerQuestion.tf, availKey: 'van_dung_tf', label: 'VD Đ/S' },
    { field: 'biet_sa', level: 'biet', type: 'short_answer', score: scorePerQuestion.sa, availKey: 'biet_sa', label: 'Biết TLN' },
    { field: 'hieu_sa', level: 'hieu', type: 'short_answer', score: scorePerQuestion.sa, availKey: 'hieu_sa', label: 'Hiểu TLN' },
    { field: 'vd_sa', level: 'van_dung', type: 'short_answer', score: scorePerQuestion.sa, availKey: 'van_dung_sa', label: 'VD TLN' },
    { field: 'biet_essay', level: 'biet', type: 'essay', score: scorePerQuestion.essay, availKey: 'biet_essay', label: 'Biết Tự luận' },
    { field: 'hieu_essay', level: 'hieu', type: 'essay', score: scorePerQuestion.essay, availKey: 'hieu_essay', label: 'Hiểu Tự luận' },
    { field: 'vd_essay', level: 'van_dung', type: 'essay', score: scorePerQuestion.essay, availKey: 'van_dung_essay', label: 'VD Tự luận' }
  ];

  // Tính tổng số câu và tổng điểm theo ma trận hiện tại
  let computedTotalQuestions = 0;
  let computedTotalScore = 0;
  let validationErrors = [];
  const matrixItemsForApi = [];

  const processRow = (topicId, lessonId, rowKey, statObj, targetLabel, topicName = '', lessonName = '') => {
    const cfg = matrixConfig[rowKey] || {};
    for (const c of checks) {
      const count = cfg[c.field] || 0;
      if (count > 0) {
        computedTotalQuestions += count;
        computedTotalScore += count * c.score;

        const objKey = `${topicId}__${lessonId || '__none__'}__${c.level}__${c.type}`;
        const customObj = customObjectives[objKey];

        matrixItemsForApi.push({
          topic_id: topicId,
          topic_name: topicName,
          lesson_id: lessonId,
          lesson_name: lessonName,
          level: c.level,
          question_type: c.type,
          count,
          score_per_question: c.score,
          custom_objective: customObj ? customObj.text : undefined,
          is_reviewed: customObj ? customObj.isReviewed : false
        });

        const avail = statObj ? (statObj[c.availKey] || 0) : 0;
        if (count > avail) {
          validationErrors.push(
            `${targetLabel} (${c.label}): Cần ${count} câu nhưng kho chỉ có ${avail} câu`
          );
        }
      }
    }
  };

  if (matrixMode === 'lesson') {
    for (const t of topics) {
      const tStat = stats?.topics?.find(s => s.topic_id === t.id) || {};
      const tLessons = tStat.lessons || t.lessons || [];

      if (tLessons.length > 0) {
        for (const l of tLessons) {
          const lId = l.id || l.lesson_id;
          const lName = l.name || l.lesson_name || 'Bài học';
          const lStat = tStat.lessons?.find(ls => (ls.lesson_id === lId || ls.id === lId)) || {};
          processRow(t.id, lId, lId, lStat, `[${t.name} > ${lName}]`, t.name, lName);
        }
        if (tStat.unassigned && tStat.unassigned.total_questions > 0) {
          processRow(t.id, '__unassigned__', `${t.id}__unassigned__`, tStat.unassigned, `[${t.name} > Câu hỏi chung]`, t.name, 'Câu hỏi chung của chủ đề');
        }
      } else {
        processRow(t.id, null, t.id, tStat, `[${t.name}]`, t.name, 'Nội dung chung');
      }
    }
  } else {
    for (const t of topics) {
      const tStat = stats?.topics?.find(s => s.topic_id === t.id) || {};
      processRow(t.id, null, t.id, tStat, `[${t.name}]`, t.name, 'Nội dung chung');
    }
  }

  computedTotalScore = Math.round(computedTotalScore * 100) / 100;

  const getTopicChosenCount = (t) => {
    let qCount = 0;
    let sCount = 0;
    const tStat = stats?.topics?.find(s => s.topic_id === t.id) || {};
    const tLessons = tStat.lessons || t.lessons || [];
    const checkKeys = [t.id, `${t.id}__unassigned__`, ...(tLessons.map(l => l.id || l.lesson_id))];
    for (const key of checkKeys) {
      const cfg = matrixConfig[key] || {};
      for (const c of checks) {
        const count = cfg[c.field] || 0;
        if (count > 0) {
          qCount += count;
          sCount += count * c.score;
        }
      }
    }
    return { qCount, sCount: Math.round(sCount * 100) / 100 };
  };

  const handleSaveTemplate = async () => {
    if (!examTitle.trim()) return alert('Vui lòng nhập tên khung ma trận');
    if (matrixItemsForApi.length === 0) return alert('Vui lòng nhập số lượng câu hỏi vào bảng ma trận');

    let targetId = null;
    if (currentTemplateId) {
      const choice = confirm(
        `Bạn đang làm việc trên mẫu ma trận: "${currentTemplateTitle}"\n\n` +
        `• Bấm [OK] để CẬP NHẬT (ghi đè) vào mẫu này.\n` +
        `• Bấm [Cancel / Hủy] để LƯU THÀNH MẪU MỚI độc lập.`
      );
      if (choice) {
        targetId = currentTemplateId;
      }
    }

    try {
      setSavingTemplate(true);
      const res = await fetch('/api/exam-matrices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetId,
          title: examTitle.trim(),
          grade_subject_id: gradeSubject.id,
          duration_minutes: durationMinutes,
          total_score: computedTotalScore,
          matrix_items: matrixItemsForApi
        })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentTemplateId(data.template.id);
        setCurrentTemplateTitle(data.template.title);
        alert(
          targetId
            ? `🎉 Đã CẬP NHẬT thành công khung ma trận: "${data.template.title}"!`
            : `🎉 Đã LƯU THÀNH MẪU MỚI: "${data.template.title}"!\n\nKhung ma trận này hiện đã có sẵn tại mục "CHỌN KHUNG MA TRẬN" khi mở ca thi phòng máy.`
        );
        fetchSavedTemplates();
        if (onGenerated) onGenerated();
      } else {
        alert('Lỗi lưu ma trận: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDuplicateTemplate = async (tmpl) => {
    try {
      const items = JSON.parse(tmpl.matrix_items_json || '[]');
      const newTitle = `${tmpl.title} (Bản sao)`;
      const res = await fetch('/api/exam-matrices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          grade_subject_id: gradeSubject.id,
          duration_minutes: tmpl.duration_minutes || 45,
          total_score: tmpl.total_score || 10,
          matrix_items: items
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`🎉 Đã nhân bản thành công: "${newTitle}"!`);
        fetchSavedTemplates();
        if (onGenerated) onGenerated();
      } else {
        alert('Lỗi sao chép: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ: ' + err.message);
    }
  };

  const handleLoadTemplate = (tmpl) => {
    try {
      const items = JSON.parse(tmpl.matrix_items_json || '[]');
      const newConfig = {};
      let hasLessonLevelItem = false;

      for (const t of topics) {
        newConfig[t.id] = emptyRow();
        if (t.lessons) {
          for (const l of t.lessons) {
            newConfig[l.id] = emptyRow();
          }
        }
        newConfig[`${t.id}__unassigned__`] = emptyRow();
      }

      for (const item of items) {
        let key = item.topic_id;
        if (item.lesson_id) {
          hasLessonLevelItem = true;
          if (item.lesson_id === '__unassigned__') {
            key = `${item.topic_id}__unassigned__`;
          } else {
            key = item.lesson_id;
          }
        }

        if (!newConfig[key]) {
          newConfig[key] = emptyRow();
        }

        let typeKey = 'mcq';
        if (item.question_type === 'true_false') typeKey = 'tf';
        else if (item.question_type === 'short_answer') typeKey = 'sa';
        else if (item.question_type === 'essay') typeKey = 'essay';

        const fieldKey = `${item.level === 'van_dung' ? 'vd' : item.level}_${typeKey}`;
        if (newConfig[key][fieldKey] !== undefined) {
          newConfig[key][fieldKey] = item.count;
        }
      }

      // Khôi phục các yêu cầu cần đạt đã lưu kèm mẫu ma trận
      const loadedCustomObjs = {};
      for (const item of items) {
        if (item.custom_objective !== undefined || item.is_reviewed) {
          const lId = item.lesson_id || '__none__';
          const objKey = `${item.topic_id}__${lId}__${item.level}__${item.question_type}`;
          loadedCustomObjs[objKey] = {
            text: item.custom_objective !== undefined ? item.custom_objective : (item.objective || ''),
            isReviewed: Boolean(item.is_reviewed)
          };
        }
      }
      setCustomObjectives(loadedCustomObjs);

      setMatrixConfig(newConfig);
      setExamTitle(tmpl.title);
      setDurationMinutes(tmpl.duration_minutes || 45);
      setCurrentTemplateId(tmpl.id);
      setCurrentTemplateTitle(tmpl.title);
      setMatrixMode(hasLessonLevelItem ? 'lesson' : 'topic');
      setShowTemplatesModal(false);
      alert(`Đã nạp khung ma trận: "${tmpl.title}"!`);
    } catch (err) {
      alert('Lỗi nạp khung ma trận: ' + err.message);
    }
  };

  const handleDeleteTemplate = async (tmplId, tmplTitle) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa mẫu khung ma trận: "${tmplTitle}"?`)) return;
    try {
      const res = await fetch(`/api/exam-matrices/${tmplId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (currentTemplateId === tmplId) {
          setCurrentTemplateId(null);
          setCurrentTemplateTitle('');
        }
        fetchSavedTemplates();
        if (onGenerated) onGenerated();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleGenerate = async () => {
    if (!examTitle.trim()) return alert('Vui lòng nhập tên đề thi');
    if (matrixItemsForApi.length === 0) return alert('Vui lòng nhập số lượng câu hỏi vào bảng ma trận');
    if (validationErrors.length > 0) {
      return alert('Kho câu hỏi chưa đủ số lượng để tạo đề:\n\n' + validationErrors.join('\n'));
    }

    try {
      setGenerating(true);
      const res = await fetch('/api/exams/generate-from-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: examTitle.trim(),
          grade_subject_id: gradeSubject.id,
          duration_minutes: durationMinutes,
          total_score: computedTotalScore,
          variants: variantCodes.length,
          variant_codes: variantCodes,
          matrix_items: matrixItemsForApi
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(`🎉 ĐÃ SINH THÀNH CÔNG ${data.exams.length} ĐỀ THI TỪ MA TRẬN!\n\nĐề thi đã được lưu vào Ngân Hàng Đề Thi và sẵn sàng mở ca thi cho học sinh.`);
        if (onGenerated) onGenerated();
        onClose();
      } else {
        alert('Lỗi tạo đề thi từ ma trận: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPrintPackage = async () => {
    if (!examTitle.trim()) return alert('Vui lòng nhập tên đề thi');
    if (matrixItemsForApi.length === 0) return alert('Vui lòng nhập số lượng câu hỏi vào bảng ma trận');
    if (validationErrors.length > 0) {
      return alert('Kho câu hỏi chưa đủ số lượng để tạo đề:\n\n' + validationErrors.join('\n'));
    }

    try {
      setExportingZip(true);
      const res = await fetch('/api/exam-matrices/export-print-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: examTitle.trim(),
          grade_subject_id: gradeSubject.id,
          duration_minutes: durationMinutes,
          total_score: computedTotalScore,
          variants: variantCodes.length,
          variant_codes: variantCodes,
          matrix_items: matrixItemsForApi
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Lỗi tạo gói đề in ấn');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanTitle = examTitle.trim().replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g, '_');
      a.download = `Goi_In_An_${cleanTitle}_${variantCodes.length}MaDe.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Lỗi xuất gói in ấn: ' + err.message);
    } finally {
      setExportingZip(false);
    }
  };

  const handleOpenPreview = async () => {
    if (!examTitle.trim()) return alert('Vui lòng nhập tên đề thi');
    if (matrixItemsForApi.length === 0) return alert('Vui lòng nhập số lượng câu hỏi vào bảng ma trận');
    if (validationErrors.length > 0) {
      return alert('Kho câu hỏi chưa đủ số lượng để tạo đề:\n\n' + validationErrors.join('\n'));
    }

    try {
      setLoadingPreview(true);
      const res = await fetch('/api/exam-matrices/preview-variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: examTitle.trim(),
          grade_subject_id: gradeSubject.id,
          duration_minutes: durationMinutes,
          total_score: computedTotalScore,
          variants: variantCodes.length,
          variant_codes: variantCodes,
          matrix_items: matrixItemsForApi
        })
      });

      const data = await res.json();
      if (data.success && data.variants) {
        setPreviewData(data);
        setShowPreviewModal(true);
      } else {
        alert('Lỗi xem trước đề thi: ' + (data.message || 'Không thể tạo dữ liệu xem trước'));
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Tinh Gọn */}
        <div className="p-3.5 sm:px-6 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Sinh Đề Thi Tự Động Theo Ma Trận Đặc Tả (4 Phần BGD 2025)
              <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold">
                {gradeSubject.grade_name} - {gradeSubject.subject_name}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Hệ thống tự động rút ngẫu nhiên không lặp câu hỏi từ ngân hàng theo đúng Chủ đề, Bài học, Mức độ và Dạng câu.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMatrixPreviewModal(true)}
              disabled={matrixItemsForApi.length === 0}
              className="px-3 py-1.5 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-teal-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-40"
              title="Xem trước bảng ma trận và bản đặc tả đề thi chuẩn Bộ GD&ĐT"
            >
              <Table className="w-3.5 h-3.5 text-teal-600" />
              <span>Xem Trước Ma Trận</span>
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={savingTemplate || matrixItemsForApi.length === 0}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              title="Lưu cấu hình ma trận này làm mẫu tái sử dụng cho các lần thi sau"
            >
              <Save className="w-3.5 h-3.5" />
              {savingTemplate ? 'Đang lưu...' : 'Lưu Làm Mẫu'}
            </button>
            <button
              type="button"
              onClick={() => setShowTemplatesModal(true)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              title="Xem và nạp các mẫu khung ma trận đã lưu"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              Mẫu Đã Lưu ({savedTemplates.length})
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer">
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-white">
          {/* Thông tin chung */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase">Tên Đề Thi (*):</label>
                {currentTemplateId && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Đang nạp từ mẫu: <strong className="max-w-[140px] truncate">{currentTemplateTitle}</strong>
                    <button
                      type="button"
                      onClick={() => { setCurrentTemplateId(null); setCurrentTemplateTitle(''); }}
                      className="ml-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Hủy liên kết (để khi lưu sẽ tạo mẫu mới)"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
              <input
                type="text"
                value={examTitle}
                onChange={e => setExamTitle(e.target.value)}
                placeholder="VD: Kiểm Tra Cuối Kỳ 1 - Toán 10"
                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Thời Gian Làm Bài:</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(parseInt(e.target.value, 10) || 45)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 text-center font-bold shadow-2xs focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-slate-500 shrink-0 font-medium">phút</span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Số Lượng Mã Đề Cần Sinh:</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={variantsCount}
                  onChange={e => handleVariantsCountChange(e.target.value)}
                  className="w-16 bg-white border border-slate-200 rounded-lg p-2 text-xs text-blue-700 text-center font-black shadow-2xs focus:border-blue-500 focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-1">
                  {[1, 2, 4, 6, 8, 12].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleVariantsCountChange(num)}
                      className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                        variantsCount === num
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Hàng Cấu Hình Chi Tiết Tên Mã Đề */}
          <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-blue-950 uppercase flex items-center gap-1.5">
                  🏷️ Tùy Chỉnh Danh Sách Mã Đề ({variantCodes.length} mã đề):
                </span>
                <span className="text-[10px] text-slate-500 italic hidden sm:inline">
                  (Thầy/Cô có thể bấm vào từng ô để sửa tên mã đề trực tiếp)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-slate-500 font-medium">Kiểu mẫu:</span>
                <button
                  type="button"
                  onClick={() => applyVariantPreset('101')}
                  className="px-2 py-0.5 rounded bg-white border border-blue-200 text-blue-700 font-semibold hover:bg-blue-100 transition cursor-pointer"
                >
                  101, 102...
                </button>
                <button
                  type="button"
                  onClick={() => applyVariantPreset('01')}
                  className="px-2 py-0.5 rounded bg-white border border-blue-200 text-blue-700 font-semibold hover:bg-blue-100 transition cursor-pointer"
                >
                  01, 02...
                </button>
                <button
                  type="button"
                  onClick={() => applyVariantPreset('letters')}
                  className="px-2 py-0.5 rounded bg-white border border-blue-200 text-blue-700 font-semibold hover:bg-blue-100 transition cursor-pointer"
                >
                  A, B, C...
                </button>
                <button
                  type="button"
                  onClick={() => applyVariantPreset('md')}
                  className="px-2 py-0.5 rounded bg-white border border-blue-200 text-blue-700 font-semibold hover:bg-blue-100 transition cursor-pointer"
                >
                  MĐ 1, MĐ 2...
                </button>
              </div>
            </div>

            {/* Danh sách các mã đề có thể sửa */}
            <div className="flex flex-wrap items-center gap-2">
              {variantCodes.map((code, idx) => (
                <div key={idx} className="flex items-center rounded-lg bg-white border border-blue-300 shadow-2xs overflow-hidden focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-500">
                  <span className="px-1.5 py-1 text-[10px] font-bold text-slate-400 bg-slate-50 border-r border-blue-100 select-none">
                    #{idx + 1}
                  </span>
                  <input
                    type="text"
                    value={code}
                    onChange={e => handleUpdateVariantCode(idx, e.target.value)}
                    className="w-16 py-1 px-1.5 text-xs font-bold text-blue-900 text-center focus:outline-none"
                    placeholder="Mã đề"
                  />
                  {variantCodes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVariantCode(idx)}
                      title="Xóa mã đề này"
                      className="px-1.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer border-l border-blue-100"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {variantCodes.length < 24 && (
                <button
                  type="button"
                  onClick={handleAddVariantCode}
                  className="px-2.5 py-1 rounded-lg border border-dashed border-blue-400 text-blue-700 hover:bg-blue-100/60 transition text-xs font-bold flex items-center gap-1 cursor-pointer bg-white"
                  title="Thêm một mã đề nữa"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm mã đề
                </button>
              )}
            </div>
          </div>

          {/* Bảng cấu hình Ma Trận Đặc Tả */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" /> Bảng Ma Trận 4 Phần Chuẩn BGD 2025:
                </span>

                {/* Chế độ xem & cấu hình: Chi tiết từng bài vs Gộp theo chủ đề */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setMatrixMode('lesson')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] transition flex items-center gap-1.5 cursor-pointer ${
                      matrixMode === 'lesson'
                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                    Chi Tiết Từng Bài
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixMode('topic')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] transition flex items-center gap-1.5 cursor-pointer ${
                      matrixMode === 'topic'
                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FolderTree className="w-3.5 h-3.5 text-blue-600" />
                    Gộp Theo Chủ Đề
                  </button>
                </div>

                {matrixMode === 'lesson' && (
                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 pl-1 border-l border-slate-200">
                    <button
                      type="button"
                      onClick={expandAllTopics}
                      className="hover:text-blue-600 transition underline underline-offset-2 cursor-pointer font-medium"
                    >
                      Mở rộng tất cả
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={collapseAllTopics}
                      className="hover:text-blue-600 transition underline underline-offset-2 cursor-pointer font-medium"
                    >
                      Thu gọn
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                {/* Legend phân cấp thị giác */}
                <div className="hidden sm:flex items-center gap-2.5 px-2.5 py-1 rounded-lg bg-slate-100/90 border border-slate-200 text-[10.5px] text-slate-600">
                  <span className="font-semibold text-slate-500">Trạng thái ô:</span>
                  <span className="inline-flex items-center gap-1 opacity-60" title="Không có câu hỏi trong ngân hàng">
                    <span className="w-3.5 h-3.5 rounded bg-slate-200 flex items-center justify-center text-[10px] text-slate-500 font-bold">-</span>
                    <span>Hết câu (0)</span>
                  </span>
                  <span className="inline-flex items-center gap-1" title="Có câu hỏi khả dụng trong ngân hàng">
                    <span className="w-3.5 h-3.5 rounded border border-slate-300 bg-white flex items-center justify-center text-[9px] text-slate-400">0</span>
                    <span className="text-emerald-600 font-bold">Sẵn có (N)</span>
                  </span>
                  <span className="inline-flex items-center gap-1" title="Đã chọn câu hỏi cho ma trận">
                    <span className="w-3.5 h-3.5 rounded border border-blue-600 bg-blue-50 flex items-center justify-center text-[9px] font-bold text-blue-700">✓</span>
                    <span className="text-blue-700 font-bold">Đã chọn</span>
                  </span>
                </div>

                <span className="text-slate-500">
                  Tổng số câu: <strong className="text-slate-900">{computedTotalQuestions} câu</strong>
                </span>
                <span className="text-slate-500">
                  Tổng điểm: <strong className="text-emerald-700 text-sm font-black">{computedTotalScore}đ</strong>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-700 text-[11px] uppercase tracking-wider text-center border-b border-slate-200">
                  <tr>
                    <th rowSpan={2} className="py-2.5 px-3 text-left border-r border-slate-200 min-w-[270px]">
                      {matrixMode === 'lesson' ? 'Chủ Đề & Tên Bài Học Cụ Thể' : 'Chủ Đề / Chương'}
                    </th>
                    <th colSpan={3} className="py-1 px-2 border-r border-slate-200 bg-sky-50 text-sky-800 font-bold">
                      Phần I: Trắc Nghiệm ({scorePerQuestion.mcq}đ)
                    </th>
                    <th colSpan={3} className="py-1 px-2 border-r border-slate-200 bg-teal-50 text-teal-800 font-bold">
                      Phần II: Đúng / Sai ({scorePerQuestion.tf}đ)
                    </th>
                    <th colSpan={3} className="py-1 px-2 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-bold">
                      Phần III: Trả Lời Ngắn ({scorePerQuestion.sa}đ)
                    </th>
                    <th colSpan={3} className="py-1 px-2 bg-amber-50 text-amber-800 font-bold">
                      Phần IV: Tự Luận ({scorePerQuestion.essay}đ)
                    </th>
                  </tr>
                  <tr className="text-[10px] text-slate-500 border-t border-slate-200">
                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-sky-50/50">Biết</th>
                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-sky-50/50">Hiểu</th>
                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-sky-50/50">VD</th>

                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-teal-50/50">Biết</th>
                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-teal-50/50">Hiểu</th>
                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-teal-50/50">VD</th>

                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-emerald-50/50">Biết</th>
                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-emerald-50/50">Hiểu</th>
                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-emerald-50/50">VD</th>

                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-amber-50/50">Biết</th>
                    <th className="py-1.5 px-1.5 border-r border-slate-200 bg-amber-50/50">Hiểu</th>
                    <th className="py-1.5 px-1.5 bg-amber-50/50">VD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={13} className="py-6 text-center text-slate-500 italic">Đang tải cấu trúc ma trận...</td>
                    </tr>
                  ) : topics.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-6 text-center text-slate-500 italic">Chưa có chủ đề nào. Hãy vào "Quản lý chủ đề" để tạo danh mục.</td>
                    </tr>
                  ) : (() => {
                    const renderInputCell = (rowKey, field, availCount, label = '') => {
                      const cfg = matrixConfig[rowKey] || {};
                      const count = cfg[field] || 0;
                      return (
                        <MatrixCell
                          available={availCount}
                          selected={count}
                          onChange={(val) => handleCellChange(rowKey, field, val)}
                          label={label}
                        />
                      );
                    };

                    const renderInputRowCells = (rowKey, statObj = {}) => (
                      <>
                        {/* MCQ */}
                        <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-sky-50/20">
                          {renderInputCell(rowKey, 'biet_mcq', statObj.biet_mcq || 0, 'Biết TN')}
                        </td>
                        <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-sky-50/20">
                          {renderInputCell(rowKey, 'hieu_mcq', statObj.hieu_mcq || 0, 'Hiểu TN')}
                        </td>
                        <td className="py-1.5 px-1 text-center border-r border-slate-200 bg-sky-50/20">
                          {renderInputCell(rowKey, 'vd_mcq', statObj.van_dung_mcq || 0, 'VD TN')}
                        </td>

                        {/* Đúng / Sai */}
                        <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-teal-50/20">
                          {renderInputCell(rowKey, 'biet_tf', statObj.biet_tf || 0, 'Biết Đ/S')}
                        </td>
                        <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-teal-50/20">
                          {renderInputCell(rowKey, 'hieu_tf', statObj.hieu_tf || 0, 'Hiểu Đ/S')}
                        </td>
                        <td className="py-1.5 px-1 text-center border-r border-slate-200 bg-teal-50/20">
                          {renderInputCell(rowKey, 'vd_tf', statObj.van_dung_tf || 0, 'VD Đ/S')}
                        </td>

                        {/* Trả Lời Ngắn */}
                        <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-emerald-50/20">
                          {renderInputCell(rowKey, 'biet_sa', statObj.biet_sa || 0, 'Biết TLN')}
                        </td>
                        <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-emerald-50/20">
                          {renderInputCell(rowKey, 'hieu_sa', statObj.hieu_sa || 0, 'Hiểu TLN')}
                        </td>
                        <td className="py-1.5 px-1 text-center border-r border-slate-200 bg-emerald-50/20">
                          {renderInputCell(rowKey, 'vd_sa', statObj.van_dung_sa || 0, 'VD TLN')}
                        </td>

                        {/* Tự Luận */}
                        <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-amber-50/20">
                          {renderInputCell(rowKey, 'biet_essay', statObj.biet_essay || 0, 'Biết Tự luận')}
                        </td>
                        <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-amber-50/20">
                          {renderInputCell(rowKey, 'hieu_essay', statObj.hieu_essay || 0, 'Hiểu Tự luận')}
                        </td>
                        <td className="py-1.5 px-1 text-center bg-amber-50/20">
                          {renderInputCell(rowKey, 'vd_essay', statObj.van_dung_essay || 0, 'VD Tự luận')}
                        </td>
                      </>
                    );

                    if (matrixMode === 'lesson') {
                      return topics.map(t => {
                        const tStat = stats?.topics?.find(s => s.topic_id === t.id) || {};
                        const tLessons = tStat.lessons || t.lessons || [];
                        const isCollapsed = collapsedTopics.has(t.id);
                        const { qCount: tChosenCount, sCount: tChosenScore } = getTopicChosenCount(t);

                        return (
                          <React.Fragment key={t.id}>
                            {/* Dòng Header Chủ Đề */}
                            <tr className="bg-slate-100 border-y border-slate-200 font-semibold text-slate-900">
                              <td colSpan={13} className="py-2 px-3">
                                <div className="flex items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => toggleTopicCollapse(t.id)}
                                    className="flex items-center gap-2 text-left hover:text-blue-700 transition group cursor-pointer"
                                  >
                                    <span className="p-1 rounded bg-white border border-slate-200 group-hover:bg-blue-50 transition text-slate-600 group-hover:text-blue-700 shadow-2xs">
                                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </span>
                                    <span className="text-xs font-bold text-slate-900">
                                      {t.code ? `[${t.code}] ` : ''}{t.name}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-medium">
                                      {tLessons.length} bài học • Tổng: {tStat.total_questions || 0} câu
                                    </span>
                                  </button>
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-900 text-xs font-bold shadow-2xs">
                                      <span>Tổng chọn chủ đề:</span>
                                      <span className="text-sm font-black text-blue-700">{tChosenCount} câu</span>
                                      <span className="text-slate-300 font-normal">|</span>
                                      <span className="text-emerald-700 font-bold">{tChosenScore}đ</span>
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>

                            {/* Danh sách các bài học con nếu không thu gọn */}
                            {!isCollapsed && (
                              <>
                                {tLessons.length === 0 ? (
                                  <tr className="hover:bg-slate-50/60 transition">
                                    <td className="py-2 pl-8 pr-3 border-r border-slate-200 text-slate-500 text-xs italic">
                                      {t.name} <span className="text-[10px] text-amber-700">(Chưa tạo bài học con - cấu hình theo chủ đề)</span>
                                    </td>
                                    {renderInputRowCells(t.id, tStat)}
                                  </tr>
                                ) : (
                                  <>
                                    {tLessons.map(l => {
                                      const lId = l.id || l.lesson_id;
                                      const lName = l.name || l.lesson_name || 'Bài học';
                                      const lStat = tStat.lessons?.find(ls => (ls.lesson_id === lId || ls.id === lId)) || {};
                                      const totalQ = lStat.total_questions || 0;

                                      return (
                                        <tr key={lId} className="hover:bg-slate-50/70 transition bg-white border-b border-slate-100">
                                          <td className="py-2.5 pl-6 pr-3 border-r border-slate-200 font-medium min-w-[270px] max-w-[340px]">
                                            <div className="flex items-start gap-2">
                                              <span className="p-1 rounded bg-blue-50 border border-blue-200 text-blue-600 shrink-0 mt-0.5 shadow-2xs" title="Bài học">
                                                <BookOpen className="w-3.5 h-3.5" />
                                              </span>
                                              <div className="min-w-0 flex-1">
                                                <div className="text-xs font-semibold text-slate-900 leading-snug break-words">
                                                  {lName}
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                                                  {totalQ > 0 ? (
                                                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium text-[9.5px]">
                                                      Sẵn có: {totalQ} câu (B: {lStat.total_biet} • H: {lStat.total_hieu} • VD: {lStat.total_van_dung})
                                                    </span>
                                                  ) : (
                                                    <span className="text-slate-400 italic text-[10px]">
                                                      (Chưa có câu hỏi gán cho bài này)
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                          {renderInputRowCells(lId, lStat)}
                                        </tr>
                                      );
                                    })}

                                    {/* Dòng câu hỏi chung chưa gán bài (nếu có) */}
                                    {tStat.unassigned && tStat.unassigned.total_questions > 0 && (
                                      <tr key={`${t.id}__unassigned__`} className="hover:bg-amber-50/40 transition bg-amber-50/20 border-b border-amber-200/50">
                                        <td className="py-2.5 pl-6 pr-3 border-r border-slate-200 font-medium min-w-[270px] max-w-[340px]">
                                          <div className="flex items-start gap-2">
                                            <span className="p-1 rounded bg-amber-100 border border-amber-200 text-amber-800 shrink-0 mt-0.5">
                                              📌
                                            </span>
                                            <div className="min-w-0 flex-1">
                                              <div className="text-xs font-semibold text-amber-900 leading-snug">
                                                Câu hỏi chung của chủ đề
                                              </div>
                                              <div className="text-[10px] text-amber-700 mt-1 flex flex-wrap items-center gap-1.5">
                                                <span className="px-1.5 py-0.5 rounded bg-amber-100/80 border border-amber-200 text-amber-800 font-medium text-[9.5px]">
                                                  Sẵn có: {tStat.unassigned.total_questions} câu chung (chưa gán vào bài cụ thể)
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                        {renderInputRowCells(`${t.id}__unassigned__`, tStat.unassigned)}
                                      </tr>
                                    )}

                                    {/* Dòng Tổng số câu của Chủ đề (Subtotal Row) */}
                                    <tr className="bg-slate-50/95 border-b-2 border-slate-300 text-slate-800 font-bold">
                                      <td className="py-2.5 pl-6 pr-3 border-r border-slate-200">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                                            📊 Cộng {t.name}:
                                          </span>
                                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-black">
                                            {tChosenCount} câu ({tChosenScore}đ)
                                          </span>
                                        </div>
                                      </td>
                                      <td colSpan={12} className="py-2 px-3 text-right text-[11px] font-semibold text-slate-500 italic">
                                        {tChosenCount > 0 ? `Đã phân bổ ${tChosenCount} câu hỏi cho ${t.name}` : `(Chưa chọn câu hỏi)`}
                                      </td>
                                    </tr>
                                  </>
                                )}
                              </>
                            )}
                          </React.Fragment>
                        );
                      });
                    }

                    // CHẾ ĐỘ 2: GỘP THEO CHỦ ĐỀ
                    return topics.map(t => {
                      const tStat = stats?.topics?.find(s => s.topic_id === t.id) || {};
                      const { qCount: tChosenCount, sCount: tChosenScore } = getTopicChosenCount(t);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-2 px-3 border-r border-slate-200 font-medium text-slate-900 max-w-[220px]">
                            <div className="truncate font-semibold text-slate-900" title={t.name}>{t.name}</div>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                              <span>Mã: {t.code || 'N/A'}</span>
                              {t.lessons && t.lessons.length > 0 && (
                                <span className="text-teal-700 font-medium flex items-center gap-1" title={t.lessons.map(l => l.name).join(', ')}>
                                  <BookOpen className="w-2.5 h-2.5" /> {t.lessons.length} bài học
                                </span>
                              )}
                              {tChosenCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-black text-[9.5px]">
                                  Đã chọn: {tChosenCount} câu ({tChosenScore}đ)
                                </span>
                              )}
                            </div>
                          </td>
                          {renderInputRowCells(t.id, tStat)}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cảnh báo thiếu câu hỏi nếu có */}
          {validationErrors.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-700">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                Cảnh báo: Kho câu hỏi không đủ số lượng cho cấu hình ma trận hiện tại:
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-2 text-rose-700">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
              <p className="text-[10px] text-slate-500 mt-1 italic">
                * Thầy/Cô vui lòng giảm số câu yêu cầu tại các ô đỏ hoặc vào Ngân hàng câu hỏi để bổ sung thêm câu hỏi.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:px-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              Đề thi dự kiến: <strong className="text-slate-900">{computedTotalQuestions} câu</strong> / <strong className="text-emerald-700 font-bold">{computedTotalScore}đ</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
            >
              Hủy Bỏ
            </button>
            <button
              type="button"
              onClick={() => setShowMatrixPreviewModal(true)}
              disabled={matrixItemsForApi.length === 0}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Xem trước bảng ma trận và bản đặc tả đề thi chuẩn Bộ GD&ĐT"
            >
              <Table className="w-4 h-4" />
              <span>Xem Trước Ma Trận</span>
            </button>
            <button
              type="button"
              onClick={handleOpenPreview}
              disabled={loadingPreview || exportingZip || generating || computedTotalQuestions === 0 || validationErrors.length > 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Xem trước từng mã đề thi hoán vị và bảng đáp án soi chiếu trước khi xuất in hoặc lưu"
            >
              <Eye className="w-4 h-4" />
              {loadingPreview ? 'Đang Tải Đề...' : `Xem Trước ${variantCodes.length} Mã Đề`}
            </button>
            <button
              type="button"
              onClick={handleExportPrintPackage}
              disabled={exportingZip || generating || computedTotalQuestions === 0 || validationErrors.length > 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer"
              title="Xuất trọn gói gồm: Các mã đề Word (.docx) chuẩn BGD (bỏ phần làm bài P3, P4), 1 file Excel bảng ma trận đáp án soi chiếu, 1 file Word bảng ma trận & bản đặc tả đề thi"
            >
              <Download className="w-4 h-4" />
              {exportingZip ? 'Đang Đóng Gói In (.zip)...' : `Xuất Gói Đề In (.zip)`}
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || exportingZip || computedTotalQuestions === 0 || validationErrors.length > 0}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? 'Đang Bốc Câu Hỏi & Tạo Đề...' : `Sinh ${variantsCount} Đề Thi Ngay`}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Quản Lý Mẫu Đã Lưu */}
      {showTemplatesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl flex flex-col max-h-[88vh]">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Danh Sách Mẫu Khung Ma Trận Đã Lưu ({savedTemplates.length})
              </h4>
              <button onClick={() => setShowTemplatesModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-slate-100">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              💡 Thầy/Cô có thể <strong>Nạp & Sửa</strong> để đưa cấu hình vào bảng ma trận, <strong>Sao Chép</strong> để tạo bản sao mới nhanh chóng, hoặc <strong>Xóa</strong> mẫu không còn sử dụng.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {savedTemplates.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs italic">
                  Chưa có mẫu khung ma trận nào được lưu cho môn học này.
                </div>
              ) : (
                savedTemplates.map(tmpl => {
                  const summary = getTemplateSummary(tmpl.matrix_items_json);
                  const isExpanded = expandedPreviewId === tmpl.id;

                  return (
                    <div key={tmpl.id} className="p-3.5 bg-slate-50 hover:bg-slate-50/80 rounded-xl border border-slate-200 space-y-2 shadow-2xs transition">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h5 className="font-bold text-xs text-slate-900 truncate" title={tmpl.title}>
                            {tmpl.title}
                          </h5>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 mt-1">
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-bold">
                              {tmpl.duration_minutes} phút
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                              {tmpl.total_score}đ
                            </span>
                            <span className="text-slate-600 font-medium">
                              Tổng cộng: <strong className="text-slate-900">{summary.totalQ} câu</strong>
                            </span>
                          </div>
                        </div>

                        {/* Thao tác: Nạp, Sao chép, Xem, Xóa */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const items = typeof tmpl.matrix_items_json === 'string' ? JSON.parse(tmpl.matrix_items_json || '[]') : (tmpl.matrix_items_json || []);
                              setPreviewTemplate({
                                title: tmpl.title,
                                durationMinutes: tmpl.duration_minutes || 45,
                                totalScore: tmpl.total_score || 10,
                                matrixItems: items
                              });
                            }}
                            className="px-2 py-1.5 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-teal-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                            title="Xem bảng ma trận và bản đặc tả chuẩn Bộ GD&ĐT của mẫu này"
                          >
                            <Table className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Xem Ma Trận</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedPreviewId(isExpanded ? null : tmpl.id)}
                            className={`p-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-1 shadow-2xs ${
                              isExpanded
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-600'
                            }`}
                            title="Xem chi tiết cơ cấu câu hỏi"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Chi tiết</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateTemplate(tmpl)}
                            className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-emerald-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                            title="Nhân bản tạo một mẫu ma trận mới"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Sao Chép</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleLoadTemplate(tmpl)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Nạp mẫu này vào bảng ma trận để chỉnh sửa hoặc sinh đề"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Nạp & Sửa</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(tmpl.id, tmpl.title)}
                            className="p-1.5 hover:bg-rose-50 border border-transparent hover:border-rose-200 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                            title="Xóa mẫu ma trận này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Tóm tắt nhanh 4 phần */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] pt-1 border-t border-slate-200/60">
                        <div className="bg-sky-50/70 p-1.5 rounded border border-sky-100 text-sky-900">
                          <strong>P1 (Trắc nghiệm):</strong> {summary.mcq} câu
                        </div>
                        <div className="bg-teal-50/70 p-1.5 rounded border border-teal-100 text-teal-900">
                          <strong>P2 (Đúng/Sai):</strong> {summary.tf} câu
                        </div>
                        <div className="bg-emerald-50/70 p-1.5 rounded border border-emerald-100 text-emerald-900">
                          <strong>P3 (Trả lời ngắn):</strong> {summary.sa} câu
                        </div>
                        <div className="bg-amber-50/70 p-1.5 rounded border border-amber-100 text-amber-900">
                          <strong>P4 (Tự luận):</strong> {summary.essay} câu
                        </div>
                      </div>

                      {/* Chi tiết mở rộng khi bấm nút Chi tiết */}
                      {isExpanded && (
                        <div className="mt-2 p-2.5 bg-white rounded-lg border border-blue-200 text-[10px] text-slate-600 space-y-1.5">
                          <div className="font-bold text-slate-800 flex items-center justify-between">
                            <span>Phân bổ mức độ nhận thức:</span>
                            <span>Biết: <strong>{summary.biet}</strong> • Hiểu: <strong>{summary.hieu}</strong> • Vận dụng: <strong>{summary.vd}</strong></span>
                          </div>
                          <div className="max-h-32 overflow-y-auto space-y-1 pr-1 border-t border-slate-100 pt-1">
                            {summary.items.map((it, idx) => (
                              <div key={idx} className="flex items-center justify-between py-0.5 border-b border-slate-50">
                                <span className="truncate max-w-[320px] text-slate-700">
                                  {it.lesson_name ? `${it.topic_name} > ${it.lesson_name}` : it.topic_name}
                                </span>
                                <span className="font-mono font-bold text-blue-700 shrink-0">
                                  {it.count} câu ({it.level === 'van_dung' ? 'VD' : it.level === 'hieu' ? 'Hiểu' : 'Biết'} - {it.question_type})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem Trước Chi Tiết Các Đề Hoán Vị & Bảng Đáp Án Soi Chiếu */}
      {showPreviewModal && previewData && (
        <VariantExamPreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          previewData={previewData}
          onExportZip={handleExportPrintPackage}
          onGenerateDb={handleGenerate}
          exportingZip={exportingZip}
          generatingDb={generating}
        />
      )}

      {/* Modal Xem Trước Khung Ma Trận & Bản Đặc Tả Đề Thi */}
      {showMatrixPreviewModal && (
        <MatrixSpecificationPreviewModal
          isOpen={showMatrixPreviewModal}
          onClose={() => setShowMatrixPreviewModal(false)}
          examTitle={examTitle.trim() || 'Đề Thi Theo Ma Trận'}
          gradeSubject={gradeSubject}
          durationMinutes={durationMinutes}
          totalScore={computedTotalScore}
          matrixItems={matrixItemsForApi}
          topics={topics}
          onUpdateObjective={(objKey, text, isReviewed) => {
            setCustomObjectives(prev => ({
              ...prev,
              [objKey]: { text, isReviewed }
            }));
          }}
          onCurriculumChanged={fetchQuestionBankStats}
        />
      )}

      {/* Modal Xem Trước Mẫu Ma Trận Đã Lưu */}
      {previewTemplate && (
        <MatrixSpecificationPreviewModal
          isOpen={Boolean(previewTemplate)}
          onClose={() => setPreviewTemplate(null)}
          examTitle={previewTemplate.title || 'Mẫu Ma Trận Đã Lưu'}
          gradeSubject={gradeSubject}
          durationMinutes={previewTemplate.durationMinutes}
          totalScore={previewTemplate.totalScore}
          matrixItems={previewTemplate.matrixItems}
          topics={topics}
          onCurriculumChanged={fetchQuestionBankStats}
        />
      )}
    </div>
  );
}
