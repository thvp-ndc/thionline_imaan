import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  ExternalLink,
  Download,
  X,
  Award,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  User,
  School,
  Calendar,
  Clock,
  Settings,
  Save,
  Upload,
  RotateCcw,
  Check,
  Archive
} from 'lucide-react';
import MathContent from '../common/MathContent';
import QuestionOptions from '../common/QuestionOptions';
import { formatToLocalTime } from '../../utils/timeFormat';

const DEFAULT_PRINT_CONFIG = {
  department: 'SỞ GD&ĐT • PHÒNG KHẢO THÍ',
  schoolName: 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH',
  subTitle: 'Hệ thống khảo thí mạng cục bộ LAN',
  paperTitle: 'BÀI THI KIỂM TRA TRÊN MÁY TÍNH',
  examinerTitle: 'Giáo Viên Bộ Môn',
  showRubric: true,
  showAnswerKey: true,
  showStudentSignature: true,
  showExaminerSignature: true,
  noteFooter: ''
};

export default function StudentPaperModal({ attemptId, sessionId, isBatchMode = false, autoPrint = false, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Print Configuration State (Template)
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [printConfig, setPrintConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('lan_exam_print_config');
      if (saved) return { ...DEFAULT_PRINT_CONFIG, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error loading print config:', e);
    }
    return DEFAULT_PRINT_CONFIG;
  });

  const [tempConfig, setTempConfig] = useState(printConfig);
  const [configSavedNotice, setConfigSavedNotice] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/system/school-info')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.schoolInfo) {
          setPrintConfig(prev => ({
            ...prev,
            schoolName: d.schoolInfo.school_name || prev.schoolName,
            department: d.schoolInfo.department_name ? `${d.schoolInfo.department_name} • PHÒNG KHẢO THÍ` : prev.department
          }));
        }
      })
      .catch(() => {});

    const fetchData = async () => {
      try {
        setLoading(true);
        if (isBatchMode) {
          const res = await fetch(`/api/teacher/sessions/${sessionId}/all-papers-detail`);
          const json = await res.json();
          if (json.success) {
            setData(json);
          } else {
            setError(json.message);
          }
        } else {
          const res = await fetch(`/api/teacher/attempts/${attemptId}/paper-detail`);
          const json = await res.json();
          if (json.success) {
            setData(json);
          } else {
            setError(json.message);
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [attemptId, sessionId, isBatchMode]);

  useEffect(() => {
    if (autoPrint && data && !loading && !error) {
      const timer = setTimeout(() => {
        handleOpenNewWindowPrint();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, data, loading, error]);

  const handleOpenNewWindowPrint = () => {
    const printArea = document.getElementById('printable-exam-paper');
    if (!printArea) return;
    const win = window.open('', '_blank');
    if (!win) {
      alert('Vui lòng cho phép trình duyệt mở popup để xem trang in.');
      return;
    }
    const sessionCode = data?.session?.session_code || sessionId || '';
    const studentInfo = isBatchMode ? 'ToanBoCaThi_' + sessionCode : (data?.attempt?.student_code || '') + '_' + (data?.attempt?.student_name || '');
    const title = `[LuuTru]_${sessionCode}_${studentInfo}_BaiLamThiSinh`;
    win.document.write(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 20px; font-family: 'Times New Roman', Times, serif; color: #111827; background: #fff; line-height: 1.45; font-size: 13pt; }
    @media print {
      body { padding: 0; }
      .no-print-toolbar { display: none !important; }
    }
    .no-print-toolbar {
      position: sticky; top: 10px; z-index: 999;
      background: #0f172a; color: #fff; padding: 12px 20px;
      border-radius: 12px; margin-bottom: 25px;
      display: flex; justify-content: space-between; align-items: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3); font-family: system-ui, -apple-system, sans-serif;
    }
    .print-paper-sheet {
      max-width: 100% !important; margin: 0 0 30px 0 !important;
      padding: 0 !important; page-break-after: always !important; break-after: page !important;
    }
    .print-paper-sheet:last-child { page-break-after: auto !important; break-after: auto !important; }
    .print-question-item, .part3-question { page-break-inside: avoid !important; break-inside: avoid !important; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="no-print-toolbar">
    <div>
      <strong style="font-size: 15px;">Hồ Sơ Lưu Trữ Bài Thi - ${isBatchMode ? 'Toàn Bộ Ca Thi (' + (data?.papers?.length || 0) + ' thí sinh)' : data?.attempt?.student_name}</strong>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Nhấn nút bên phải hoặc bấm phím <strong>Ctrl + P</strong> để lưu file PDF khổ A4</div>
    </div>
    <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 8px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px;">
      🖨️ In & Lưu Thành PDF (A4)
    </button>
  </div>
  ${printArea.innerHTML}
</body>
</html>`);
    win.document.close();
    const styleNodes = document.querySelectorAll('link[rel="stylesheet"], style');
    styleNodes.forEach(node => {
      if (node.tagName === 'LINK' || (node.tagName === 'STYLE' && node.id !== 'print-isolation-style')) {
        try {
          win.document.head.appendChild(node.cloneNode(true));
        } catch (e) {}
      }
    });
  };

const handlePrint = () => {
    const printArea = document.getElementById('printable-exam-paper');
    if (!printArea) {
      window.print();
      return;
    }

    // Remove existing print iframe helper if any
    let printFrame = document.getElementById('print-iframe-helper');
    if (printFrame) {
      printFrame.remove();
    }

    printFrame = document.createElement('iframe');
    printFrame.id = 'print-iframe-helper';
    printFrame.style.position = 'fixed';
    printFrame.style.top = '-9999px';
    printFrame.style.left = '-9999px';
    printFrame.style.width = '210mm';
    printFrame.style.height = '297mm';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${printConfig.paperTitle || 'Bài Làm Thí Sinh'} - ${isBatchMode ? 'Toàn Bộ Ca Thi' : data?.attempt?.student_name || ''}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm 15mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #111827 !important;
      font-family: 'Times New Roman', Times, serif;
      font-size: 13pt;
      line-height: 1.45;
      overflow: visible !important;
      height: auto !important;
    }
    .print-paper-sheet {
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 0 20px 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border: none !important;
      page-break-after: always !important;
      break-after: page !important;
    }
    .print-paper-sheet:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .print-question-item, .part3-question {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  ${printArea.innerHTML}
</body>
</html>`);
    frameDoc.close();

    // Copy styles from main document into the iframe so Tailwind applies seamlessly
    const styleNodes = document.querySelectorAll('link[rel="stylesheet"], style');
    styleNodes.forEach(node => {
      if (node.tagName === 'LINK' || (node.tagName === 'STYLE' && node.id !== 'print-isolation-style')) {
        try {
          frameDoc.head.appendChild(node.cloneNode(true));
        } catch (e) {}
      }
    });

    // Wait a brief moment for styles/fonts to apply then open print dialog
    setTimeout(() => {
      try {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      } catch (err) {
        console.error('Print iframe error, fallback to window.print():', err);
        window.print();
      }
    }, 400);
  };

  const handleDownloadHtml = () => {
    const printArea = document.getElementById('printable-exam-paper');
    if (!printArea) return;

    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${printConfig.paperTitle || 'Bài Làm Thí Sinh'} - ${isBatchMode ? 'Toàn Bộ Ca Thi' : data?.attempt?.student_name}</title>
  <style>
    body { font-family: 'Times New Roman', Times, serif; color: #111827; background: #fff; margin: 20px; line-height: 1.5; font-size: 14px; }
    .exam-sheet { max-width: 800px; margin: 0 auto 40px auto; padding: 25px; border: 1px solid #9ca3af; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .header-table td { vertical-align: top; }
    .score-box { width: 100%; border-collapse: collapse; margin: 15px 0 25px 0; }
    .score-box th, .score-box td { border: 1px solid #374151; padding: 8px; text-align: center; }
    .question-block { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px dashed #d1d5db; page-break-inside: avoid; }
    .opt-correct { font-weight: bold; color: #15803d; }
    .opt-wrong { font-weight: bold; color: #b91c1c; text-decoration: line-through; }
    .essay-box { background: #f9fafb; border: 1px solid #d1d5db; padding: 12px; margin-top: 8px; border-radius: 4px; white-space: pre-wrap; font-family: inherit; }
    .feedback-box { background: #fffbeb; border: 1px solid #fde68a; padding: 10px; margin-top: 8px; border-radius: 4px; font-style: italic; }
    @media print {
      body { margin: 0; padding: 0; }
      .exam-sheet { border: none; padding: 0; width: 100%; max-width: 100%; page-break-after: always; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  ${printArea.innerHTML}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BaiLam_${isBatchMode ? 'CaThi' : data?.attempt?.student_code + '_' + data?.attempt?.student_name}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- PRINT CONFIG TEMPLATE ACTIONS ---
  const handleOpenConfigModal = () => {
    setTempConfig({ ...printConfig });
    setConfigSavedNotice(false);
    setShowConfigModal(true);
  };

  const handleApplyConfig = () => {
    setPrintConfig(tempConfig);
    localStorage.setItem('lan_exam_print_config', JSON.stringify(tempConfig));
    setConfigSavedNotice(true);
    setTimeout(() => {
      setShowConfigModal(false);
      setConfigSavedNotice(false);
    }, 600);
  };

  const handleExportConfigFile = () => {
    const jsonStr = JSON.stringify(tempConfig, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CauHinh_MauIn_BaiThi.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportConfigFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const merged = { ...DEFAULT_PRINT_CONFIG, ...parsed };
        setTempConfig(merged);
        setPrintConfig(merged);
        localStorage.setItem('lan_exam_print_config', JSON.stringify(merged));
        alert('Đã nhập thành công mẫu cấu hình in từ file!');
      } catch (err) {
        alert('File không hợp lệ: ' + err.message);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetDefaultConfig = () => {
    if (confirm('Bạn có chắc muốn khôi phục mẫu in về thiết lập mặc định của trường?')) {
      setTempConfig(DEFAULT_PRINT_CONFIG);
      setPrintConfig(DEFAULT_PRINT_CONFIG);
      localStorage.setItem('lan_exam_print_config', JSON.stringify(DEFAULT_PRINT_CONFIG));
    }
  };

  const renderSinglePaper = (paperItem, sessionInfo, examInfo, keyIndex = 0) => {
    const attempt = paperItem.attempt || paperItem;
    const questions = paperItem.questions || [];

    const part1Questions = questions.filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
    const part2Questions = questions.filter(q => q.question_type === 'true_false');
    const part3Questions = questions.filter(q => q.question_type === 'short_answer');
    const essayQuestions = questions.filter(q => q.question_type === 'essay');

    const part1CorrectCount = part1Questions.filter(q => q.is_correct === 1 || q.is_correct === true).length;
    const part1TotalScore = Math.round(part1Questions.reduce((sum, q) => sum + (q.score_obtained || 0), 0) * 100) / 100;
    const part2TotalScore = Math.round(part2Questions.reduce((sum, q) => sum + (q.score_obtained || 0), 0) * 100) / 100;
    const part3CorrectCount = part3Questions.filter(q => {
      const sc = Number(q.score_obtained ?? 0);
      const mx = Number(q.max_score ?? 0.25);
      return (q.is_correct === 1 || q.is_correct === true) && sc >= mx;
    }).length;
    const part3TotalScore = Math.round(part3Questions.reduce((sum, q) => sum + (q.score_obtained || 0), 0) * 100) / 100;
    const isPassed = (attempt.total_score || 0) >= 5.0;

    return (
      <div
        key={attempt.id || keyIndex}
        className="print-paper-sheet bg-white text-slate-900 p-8 sm:p-12 shadow-2xl rounded-2xl max-w-4xl mx-auto mb-10 print:mb-0 print:p-6 print:shadow-none print:rounded-none print:max-w-none print:page-break-after border border-slate-300 print:border-none"
      >
        {/* Header Quốc Hiệu / Đơn Vị theo Mẫu Cấu Hình */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
          <div className="text-center w-5/12">
            <h4 className="text-xs font-semibold uppercase text-slate-600 tracking-wider">
              {printConfig.department || DEFAULT_PRINT_CONFIG.department}
            </h4>
            <h3 className="text-sm font-bold uppercase text-slate-900 mt-0.5">
              {printConfig.schoolName || DEFAULT_PRINT_CONFIG.schoolName}
            </h3>
            <p className="text-[11px] text-slate-500 italic mt-0.5">
              {printConfig.subTitle || DEFAULT_PRINT_CONFIG.subTitle}
            </p>
          </div>
          <div className="text-center w-6/12">
            <h3 className="text-base font-black uppercase text-slate-900">
              {printConfig.paperTitle || DEFAULT_PRINT_CONFIG.paperTitle}
            </h3>
            <p className="text-xs font-bold text-slate-700 mt-0.5">
              Môn: {examInfo?.subject || 'Tin Học'} - {examInfo?.title}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Ca thi: <strong>{sessionInfo?.session_code}</strong> ({sessionInfo?.title})
            </p>
          </div>
        </div>

        {/* Thông tin Thí Sinh */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs mb-6">
          <div>
            <span className="text-slate-500 block">Họ và tên thí sinh:</span>
            <strong className="text-slate-900 text-sm">{attempt.student_name}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Số báo danh (SBD):</span>
            <strong className="text-sky-700 font-mono text-sm font-bold">{attempt.student_code}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Lớp / Đơn vị:</span>
            <strong className="text-slate-900 text-sm">{attempt.class_name || '-'}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Thời gian nộp bài:</span>
            <span className="text-slate-700 font-mono text-xs">
              {formatToLocalTime(attempt.submitted_at, true)}
            </span>
          </div>
        </div>

        {/* Khung Điểm & Lời Phê của Giám Khảo */}
        <div className="grid grid-cols-12 border-2 border-slate-800 rounded-xl overflow-hidden mb-6 text-center">
          {(part2Questions.length > 0 || part3Questions.length > 0) ? (
            <>
              <div className="col-span-2 border-r-2 border-slate-800 bg-slate-100 p-2">
                <span className="text-[10px] font-bold uppercase text-slate-600 block">Phần I (MCQ)</span>
                <strong className="text-xl font-black text-sky-700 block mt-0.5">{part1TotalScore}đ</strong>
                <span className="text-[10px] text-slate-500">Đúng: {part1CorrectCount}/{part1Questions.length}</span>
              </div>
              <div className="col-span-2 border-r-2 border-slate-800 bg-teal-50 p-2">
                <span className="text-[10px] font-bold uppercase text-teal-800 block">Phần II (Đ/S)</span>
                <strong className="text-xl font-black text-teal-700 block mt-0.5">{part2TotalScore}đ</strong>
                <span className="text-[10px] text-teal-600">{part2Questions.length} câu</span>
              </div>
              <div className="col-span-2 border-r-2 border-slate-800 bg-violet-50 p-2">
                <span className="text-[10px] font-bold uppercase text-violet-800 block">Phần III (Ngắn)</span>
                <strong className="text-xl font-black text-violet-700 block mt-0.5">{part3TotalScore}đ</strong>
                <span className="text-[10px] text-violet-600">{part3Questions.length} câu</span>
              </div>
              <div className="col-span-2 border-r-2 border-slate-800 bg-amber-50 p-2">
                <span className="text-[10px] font-bold uppercase text-amber-800 block">Tự Luận</span>
                <strong className="text-xl font-black text-amber-700 block mt-0.5">{attempt.essay_score || 0}đ</strong>
                <span className="text-[10px] text-slate-500">{essayQuestions.length} câu</span>
              </div>
              <div className="col-span-2 border-r-2 border-slate-800 bg-slate-200/80 p-2">
                <span className="text-[10px] font-black uppercase text-slate-700 block">TỔNG ĐIỂM</span>
                <strong className={`text-2xl font-black block mt-0.5 ${isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {attempt.total_score || 0}
                </strong>
                <span className="text-[10px] font-semibold text-slate-600">{isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'}</span>
              </div>
              <div className="col-span-2 p-2 text-left bg-white">
                <span className="text-[10px] font-bold uppercase text-slate-600 block mb-0.5">Lời Phê:</span>
                <div className="text-[11px] italic text-slate-700 leading-relaxed">
                  {(attempt.violations_count || 0) > 0 && (
                    <span className="text-rose-600 font-semibold block not-italic">
                      ⚠️ {attempt.violations_count} lần vi phạm.
                    </span>
                  )}
                  {attempt.is_graded ? 'Đã chấm xong.' : 'Chờ tự luận.'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="col-span-3 border-r-2 border-slate-800 bg-slate-100 p-2">
                <span className="text-[11px] font-bold uppercase text-slate-600 block">Điểm Trắc Nghiệm</span>
                <strong className="text-2xl font-black text-sky-700 block mt-1">{attempt.mcq_score || 0}</strong>
                <span className="text-[10px] text-slate-500">Đúng: {part1CorrectCount}/{part1Questions.length} câu</span>
              </div>
              <div className="col-span-3 border-r-2 border-slate-800 bg-slate-100 p-2">
                <span className="text-[11px] font-bold uppercase text-slate-600 block">Điểm Tự Luận</span>
                <strong className="text-2xl font-black text-amber-700 block mt-1">{attempt.essay_score || 0}</strong>
                <span className="text-[10px] text-slate-500">{essayQuestions.length} câu tự luận</span>
              </div>
              <div className="col-span-2 border-r-2 border-slate-800 bg-slate-200/80 p-2">
                <span className="text-[11px] font-black uppercase text-slate-700 block">TỔNG ĐIỂM</span>
                <strong className={`text-3xl font-black block mt-0.5 ${isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {attempt.total_score || 0}
                </strong>
                <span className="text-[10px] font-semibold text-slate-600">{isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'}</span>
              </div>
              <div className="col-span-4 p-3 text-left bg-white">
                <span className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Lời Phê Của Giám Khảo:</span>
                <div className="text-xs italic text-slate-700 leading-relaxed min-h-[40px]">
                  {(attempt.violations_count || 0) > 0 && (
                    <span className="text-rose-600 font-semibold block not-italic mb-1">
                      ⚠️ Ghi nhận {attempt.violations_count} lần vi phạm quy chế (chuyển tab/cửa sổ).
                    </span>
                  )}
                  {attempt.is_graded ? 'Bài thi đã hoàn tất chấm điểm.' : 'Chờ hoàn tất chấm câu hỏi tự luận.'}
                </div>
              </div>
            </>
          )}
        </div>

        {/* PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN */}
        {part1Questions.length > 0 && (
          <div className="mb-8">
            <div className="bg-slate-100 text-slate-800 border border-slate-300 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider mb-4 flex justify-between items-center">
              <span>{part2Questions.length > 0 ? 'PHẦN I. CÂU HỎI TRẮC NGHIỆM NHIỀU LỰA CHỌN' : 'PHẦN I. CÂU HỎI TRẮC NGHIỆM'} ({part1Questions.length} CÂU)</span>
              <span className="text-blue-700">Đạt: {part1TotalScore} điểm</span>
            </div>

            <div className="space-y-5">
              {part1Questions.map((q) => {
                const isCorrect = q.is_correct === 1 || q.is_correct === true;
                const studentSelected = q.student_selected_options || [];
                const correctList = q.correct_answers || [];

                return (
                  <div key={q.id} className="print-question-item border-b border-slate-200 pb-4 text-xs">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="font-bold text-slate-900 text-sm leading-snug">
                        <span className="text-sky-700">Câu {q.display_order}:</span> <MathContent content={q.content} />
                        {q.is_overridden && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                            Đã điều chỉnh đáp án
                          </span>
                        )}
                      </p>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold flex-shrink-0 flex items-center gap-1 ${
                        isCorrect || (q.score_obtained && q.score_obtained > 0) ? 'bg-emerald-100 text-emerald-800' : (studentSelected.length > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-600')
                      }`}>
                        {isCorrect || (q.score_obtained && q.score_obtained > 0) ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {isCorrect || (q.score_obtained && q.score_obtained > 0) ? `+${q.score_obtained || q.max_score}đ` : '0đ'}
                      </span>
                    </div>

                    {/* Options list */}
                    <QuestionOptions
                      options={q.options || []}
                      questionType={q.question_type}
                      mode="paper"
                      selectedOptions={studentSelected}
                      correctAnswers={correctList}
                      showAnswerKey={printConfig.showAnswerKey}
                      className="mt-2"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI CHUẨN BGDĐT 2025 */}
        {part2Questions.length > 0 && (
          <div className="mb-8">
            <div className="bg-slate-100 text-slate-800 border border-slate-300 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider mb-4 flex justify-between items-center">
              <span>{part1Questions.length > 0 ? 'PHẦN II. CÂU HỎI TRẮC NGHIỆM ĐÚNG / SAI' : 'CÂU HỎI TRẮC NGHIỆM ĐÚNG / SAI'} ({part2Questions.length} CÂU)</span>
              <span className="text-teal-700">Đạt: {part2TotalScore} điểm</span>
            </div>

            <div className="space-y-6">
              {part2Questions.map((q) => {
                const subKeys = ['a', 'b', 'c', 'd'];
                const subOptions = q.options && q.options.length > 0
                  ? q.options
                  : subKeys.map(k => ({ id: k, text: '' }));

                let correctSubCount = 0;
                const evaluatedItems = subOptions.map(opt => {
                  const letter = opt.id.toLowerCase();
                  const detail = q.tf_details ? (q.tf_details[letter] || q.tf_details[letter.toUpperCase()]) : null;

                  let studentChoice = null;
                  let keyChoice = null;
                  let isMatch = false;

                  if (detail) {
                    studentChoice = detail.studentChoice;
                    keyChoice = detail.keyChoice;
                    isMatch = detail.isCorrect;
                  } else {
                    if (q.student_selected_options && typeof q.student_selected_options === 'object') {
                      studentChoice = q.student_selected_options[letter] !== undefined
                        ? q.student_selected_options[letter]
                        : q.student_selected_options[letter.toUpperCase()];
                    }
                    if (q.correct_answers && typeof q.correct_answers === 'object') {
                      keyChoice = q.correct_answers[letter] !== undefined
                        ? q.correct_answers[letter]
                        : q.correct_answers[letter.toUpperCase()];
                    }
                    const sNorm = (studentChoice === 'T' || studentChoice === 'Đ' || studentChoice === 'D' || String(studentChoice).toUpperCase() === 'TRUE') ? 'T' : (studentChoice ? 'F' : null);
                    const kNorm = (keyChoice === 'T' || keyChoice === 'Đ' || keyChoice === 'D' || String(keyChoice).toUpperCase() === 'TRUE') ? 'T' : (keyChoice ? 'F' : null);
                    isMatch = sNorm !== null && kNorm !== null && sNorm === kNorm;
                  }

                  if (isMatch) correctSubCount++;

                  const isT = (val) => val === 'T' || val === 'Đ' || val === 'D' || String(val).toUpperCase() === 'TRUE';
                  const isF = (val) => val === 'F' || val === 'S' || String(val).toUpperCase() === 'FALSE';

                  return {
                    id: letter,
                    text: opt.text,
                    studentChoice: isT(studentChoice) ? 'ĐÚNG' : (isF(studentChoice) ? 'SAI' : 'Chưa chọn'),
                    keyChoice: isT(keyChoice) ? 'ĐÚNG' : (isF(keyChoice) ? 'SAI' : '-'),
                    isMatch
                  };
                });

                return (
                  <div key={q.id} className="print-question-item border border-slate-300 rounded-xl p-4 bg-white text-xs">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <p className="font-bold text-slate-900 text-sm leading-snug">
                        <span className="text-teal-800">Câu {q.display_order} (Đúng/Sai):</span> <MathContent content={q.content} />
                        {q.is_overridden && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                            Đã điều chỉnh đáp án
                          </span>
                        )}
                      </p>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0 flex items-center gap-1 ${
                        q.score_obtained > 0 ? 'bg-teal-100 text-teal-900 border border-teal-300' : 'bg-slate-100 text-slate-600'
                      }`}>
                        Điểm: {q.score_obtained || 0} / {q.max_score || 1.0}đ
                      </span>
                    </div>

                    {/* Table for 4 sub-items */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-slate-300 text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700">
                            <th className="border border-slate-300 px-2 py-1.5 w-10 text-center font-bold">Ý</th>
                            <th className="border border-slate-300 px-3 py-1.5 text-left font-bold">Lệnh hỏi / Mệnh đề</th>
                            <th className="border border-slate-300 px-3 py-1.5 w-28 text-center font-bold">Thí sinh chọn</th>
                            {printConfig.showAnswerKey && (
                              <th className="border border-slate-300 px-3 py-1.5 w-28 text-center font-bold">Đáp án đúng</th>
                            )}
                            <th className="border border-slate-300 px-2 py-1.5 w-20 text-center font-bold">Đánh giá</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evaluatedItems.map((item) => (
                            <tr key={item.id} className={item.isMatch ? 'bg-emerald-50/40' : 'bg-rose-50/30'}>
                              <td className="border border-slate-300 px-2 py-2 text-center font-bold font-mono">
                                {item.id})
                              </td>
                              <td className="border border-slate-300 px-3 py-2 leading-relaxed text-slate-800">
                                <MathContent content={item.text} />
                              </td>
                              <td className="border border-slate-300 px-3 py-2 text-center font-semibold">
                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                  item.studentChoice === 'ĐÚNG'
                                    ? 'bg-blue-100 text-blue-900'
                                    : item.studentChoice === 'SAI'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-slate-200 text-slate-600 italic'
                                }`}>
                                  {item.studentChoice}
                                </span>
                              </td>
                              {printConfig.showAnswerKey && (
                                <td className="border border-slate-300 px-3 py-2 text-center font-bold text-emerald-800">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                    item.keyChoice === 'ĐÚNG' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-800'
                                  }`}>
                                    {item.keyChoice}
                                  </span>
                                </td>
                              )}
                              <td className="border border-slate-300 px-2 py-2 text-center">
                                {item.isMatch ? (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-700 font-bold">
                                    <CheckCircle2 className="w-4 h-4" /> Đúng
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold">
                                    <XCircle className="w-4 h-4" /> Sai
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span>
                        Kết quả: Trả lời đúng <strong>{correctSubCount}/4</strong> ý ➔ Đạt <strong>{q.score_obtained || 0}đ</strong>
                      </span>
                      <span className="text-[10px]">
                        (Barem Bộ GD&ĐT 2025: Đúng 1 ý=0.1đ • 2 ý=0.25đ • 3 ý=0.5đ • 4 ý=1.0đ)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PHẦN III: CÂU HỎI TRẮC NGHIỆM TRẢ LỜI NGẮN */}
        {part3Questions.length > 0 && (
          <div className="mb-8">
            <div className="bg-slate-100 text-slate-800 border border-slate-300 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider mb-4 flex justify-between items-center">
              <span>PHẦN III. CÂU HỎI TRẮC NGHIỆM TRẢ LỜI NGẮN ({part3Questions.length} CÂU)</span>
              <span className="text-violet-700">Đạt: {part3TotalScore} điểm</span>
            </div>

            <div className="space-y-6">
              {part3Questions.map((q) => {
                const score = Number(q.score_obtained ?? 0);
                const maxScore = Number(q.max_score ?? 0.25);
                const isCorrect = (q.is_correct === true || q.is_correct === 1) && score >= maxScore;
                const isPartial = score > 0 && score < maxScore;
                const studentAns = q.student_short_answer ? String(q.student_short_answer).trim() : '';
                const hasAnswer = studentAns.length > 0;

                const correctAnswersList = Array.isArray(q.correct_answers)
                  ? q.correct_answers
                  : (q.correct_answers ? [q.correct_answers] : []);

                return (
                  <div key={q.id} className="print-question-item part3-question border border-slate-300 rounded-xl p-4 bg-white text-xs">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <p className="font-bold text-slate-900 text-sm leading-snug">
                        <span className="text-violet-800">Câu {q.display_order} (Trả lời ngắn):</span> <MathContent content={q.content} />
                        {q.is_overridden && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                            Đã điều chỉnh đáp án
                          </span>
                        )}
                      </p>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0 flex items-center gap-1 ${
                        isCorrect
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : isPartial
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : hasAnswer
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : 'bg-slate-100 text-slate-600'
                      }`}>
                        Điểm: {score} / {maxScore}đ
                      </span>
                    </div>

                    {/* Câu trả lời của thí sinh & Đánh giá */}
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <span className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                          Câu trả lời của thí sinh:
                        </span>
                        <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                          {hasAnswer ? (
                            <>
                              <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-slate-900 font-mono">
                                {studentAns}
                              </span>
                              {isCorrect ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  ✓ Đúng
                                </span>
                              ) : isPartial ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 font-bold text-xs bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  ⚠ Điểm một phần
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                  ✕ Sai
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="italic text-slate-400 text-xs">Thí sinh không trả lời (Bỏ trống).</span>
                          )}
                        </div>
                      </div>

                      {/* Đáp án chuẩn (nếu bật hiển thị) */}
                      {printConfig.showAnswerKey && (
                        <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg">
                          <span className="text-[11px] font-bold text-blue-900 uppercase block mb-1">
                            Đáp án chuẩn chấp nhận:
                          </span>
                          <div className="text-sm font-bold text-blue-700">
                            {correctAnswersList.length > 0 ? (
                              <span className="px-2 py-0.5 bg-white border border-blue-300 rounded font-mono">
                                {correctAnswersList.join(' / ')}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-xs">-</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Hướng dẫn chấm / Rubric nếu có */}
                    {printConfig.showRubric && q.rubric_guide && (
                      <div className="mt-3 p-3 bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-600 leading-relaxed">
                        <span className="font-bold text-slate-700 block mb-0.5">Tiêu chí chấm / Hướng dẫn:</span>
                        <div><MathContent content={q.rubric_guide} /></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PHẦN TỰ LUẬN (NẾU CÓ) */}
        {essayQuestions.length > 0 && (
          <div className="mb-8">
            <div className="bg-slate-100 text-slate-800 border border-slate-300 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider mb-4 flex justify-between items-center">
              <span>
                {part3Questions.length > 0
                  ? 'PHẦN IV. CÂU HỎI TỰ LUẬN'
                  : (part2Questions.length > 0 ? 'PHẦN III. CÂU HỎI TỰ LUẬN' : 'PHẦN II. CÂU HỎI TỰ LUẬN')} ({essayQuestions.length} CÂU)
              </span>
              <span className="text-amber-800">Đạt: {attempt.essay_score || 0} điểm</span>
            </div>

            <div className="space-y-6">
              {essayQuestions.map((q) => (
                <div key={q.id} className="print-question-item border border-slate-300 rounded-xl p-5 bg-white text-xs">
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <p className="font-bold text-slate-900 text-sm leading-snug">
                      <span className="text-amber-700">Câu {q.display_order} (Tự Luận):</span> <MathContent content={q.content} />
                    </p>
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-900 font-bold rounded-lg text-xs flex-shrink-0">
                      Điểm: {q.score_obtained || 0} / {q.max_score}đ
                    </span>
                  </div>

                  {/* Bài làm của thí sinh */}
                  <div className="mt-3">
                    <span className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                      Bài làm của thí sinh:
                    </span>
                    <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 text-slate-900 font-sans leading-relaxed whitespace-pre-wrap min-h-[70px]">
                      {q.student_essay_content ? (
                        <MathContent content={q.student_essay_content} />
                      ) : (
                        <span className="italic text-slate-400">Thí sinh không làm câu này (Bỏ trống).</span>
                      )}
                    </div>
                  </div>

                  {/* Barem / Tiêu chí (Nếu cấu hình bật hiển thị) */}
                  {printConfig.showRubric && q.rubric_guide && (
                    <div className="mt-3 p-3 bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-600 leading-relaxed">
                      <span className="font-bold text-slate-700 block mb-0.5">Tiêu chí chấm (Barem):</span>
                      <div><MathContent content={q.rubric_guide} /></div>
                    </div>
                  )}

                  {/* Lời phê & Nhận xét của giám khảo */}
                  {q.teacher_feedback && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-950">
                      <span className="font-bold block mb-0.5">Lời phê của Giám khảo:</span>
                      <p className="italic">{q.teacher_feedback}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ghi chú chân trang nếu có */}
        {printConfig.noteFooter && (
          <div className="text-center text-xs italic text-slate-500 mt-6 pt-4 border-t border-dashed border-slate-300">
            {printConfig.noteFooter}
          </div>
        )}

        {/* Chữ Ký Cuối Bài Thi */}
        <div className="print-question-item grid grid-cols-2 text-center text-xs mt-8 pt-6 border-t border-slate-300">
          <div>
            {printConfig.showStudentSignature && (
              <>
                <span className="font-bold uppercase text-slate-700 block">Chữ Ký Của Thí Sinh</span>
                <span className="text-[11px] text-slate-400 italic block mb-12">(Ký và ghi rõ họ tên)</span>
                <p className="font-bold text-slate-800">{attempt.student_name}</p>
              </>
            )}
          </div>
          <div>
            {printConfig.showExaminerSignature && (
              <>
                <span className="font-bold uppercase text-slate-700 block">Chữ Ký Của Giám Khảo</span>
                <span className="text-[11px] text-slate-400 italic block mb-12">(Ký và ghi rõ họ tên)</span>
                <p className="font-bold text-slate-800">{printConfig.examinerTitle || 'Giáo Viên Bộ Môn'}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs overflow-y-auto p-4 sm:p-6 print:static print:h-auto print:overflow-visible print:p-0 print:bg-white print-modal-overlay">
      {/* Global CSS overrides when printing natively or via Ctrl+P */}
      <style id="print-isolation-style">{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 15mm 15mm;
          }
          html, body {
            overflow: visible !important;
            height: auto !important;
            min-height: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          header, nav, aside, .print\\:hidden, #print-controls-bar {
            display: none !important;
          }
          .print-modal-overlay {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            display: block !important;
          }
          #printable-exam-paper {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .print-paper-sheet {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 0 20px 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .print-paper-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .print-question-item, .part3-question {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Top Floating Control Bar (Hidden when printing) */}
      <div id="print-controls-bar" className="sticky top-0 z-50 max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-xl flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold shadow-2xs">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              {isBatchMode ? 'In Toàn Bộ Bài Thi Cả Ca Thi' : 'Bản In Bài Làm Chi Tiết Thí Sinh'}
            </h3>
            <p className="text-xs text-slate-500">
              {isBatchMode ? `Tổng số: ${data?.papers?.length || 0} bài làm` : `${data?.attempt?.student_name} (${data?.attempt?.student_code})`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Nút Cấu Hình Mẫu In */}
          <button
            onClick={handleOpenConfigModal}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition border border-slate-200 shadow-2xs flex items-center gap-1.5"
            title="Cấu hình thông tin trường, tiêu đề và xuất/nhập file mẫu cấu hình in"
          >
            <Settings className="w-4 h-4 text-amber-500" /> Mẫu In & Cấu Hình
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-rose-600/20 flex items-center gap-1.5"
            title="Mở hộp thoại In của máy tính và lưu bài làm dưới dạng tệp PDF khổ A4"
          >
            <Printer className="w-4 h-4" /> Xuất / Lưu File PDF (A4)
          </button>
          <button
            onClick={handleOpenNewWindowPrint}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition shadow-2xs flex items-center gap-1.5"
            title="Mở toàn bộ bài thi trong tab mới để xem toàn màn hình và in/lưu PDF"
          >
            <ExternalLink className="w-4 h-4" /> Mở Tab In Trực Tiếp
          </button>
          <button
            onClick={handleDownloadHtml}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition shadow-2xs flex items-center gap-1.5"
            title="Tải về tệp HTML độc lập chứa đầy đủ công thức toán và bài làm để lưu trữ offline"
          >
            <Download className="w-4 h-4" /> Tải File HTML Lưu Trữ
          </button>
          {isBatchMode && (
            <button
              onClick={() => window.open(`/api/teacher/sessions/${sessionId}/export-submissions-zip`, '_blank')}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs transition shadow-2xs flex items-center gap-1.5"
              title="Tải về 1 tệp ZIP chứa tách riêng từng bài làm của từng thí sinh theo Số Báo Danh (khổ A4 kèm bảng điểm)"
            >
              <Archive className="w-4 h-4 text-white" /> Tải ZIP Tách Riêng Từng SBD
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-xl transition"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Hướng dẫn lưu file PDF */}
      <div className="max-w-4xl mx-auto mb-6 bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-800 flex items-center justify-between gap-3 shadow-2xs print:hidden">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg font-bold">💡</span>
          <span>
            <strong>Hướng dẫn lưu trữ file PDF:</strong> Khi bấm <strong>"Xuất / Lưu File PDF (A4)"</strong>, tại mục <strong>Máy in (Destination)</strong> của trình duyệt ➔ Chọn <strong>"Lưu dưới dạng PDF" (Save as PDF)</strong> ➔ Đặt khổ giấy <strong>A4</strong> ➔ Nhấn <strong>Lưu (Save)</strong>.
          </span>
        </div>
      </div>

      {/* Main Printable Container */}
      <div id="printable-exam-paper">
        {loading ? (
          <div className="bg-white max-w-4xl mx-auto p-16 rounded-2xl text-center text-slate-500">
            <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Đang tải dữ liệu bài làm của thí sinh...
          </div>
        ) : error ? (
          <div className="bg-white max-w-4xl mx-auto p-8 rounded-2xl text-center text-rose-600">
            Lỗi tải bài làm: {error}
          </div>
        ) : isBatchMode ? (
          <div>
            {(data?.papers || []).map((p, idx) => renderSinglePaper(p, data.session, data.exam, idx))}
          </div>
        ) : (
          renderSinglePaper(data, data?.session, data?.exam)
        )}
      </div>

      {/* MODAL CẤU HÌNH MẪU IN (EXPORT/IMPORT JSON CONFIG TEMPLATE) */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-500" />
                Cấu Hình Mẫu In & Tiêu Đề Bài Thi
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 max-h-[65vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Đơn vị cấp trên (Sở / Phòng GD&ĐT):
                </label>
                <input
                  type="text"
                  value={tempConfig.department}
                  onChange={e => setTempConfig({ ...tempConfig, department: e.target.value })}
                  placeholder="Ví dụ: SỞ GD&ĐT • PHÒNG KHẢO THÍ"
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-2 text-slate-800 text-xs outline-none transition shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tên Trường / Trung Tâm Đào Tạo:
                </label>
                <input
                  type="text"
                  value={tempConfig.schoolName}
                  onChange={e => setTempConfig({ ...tempConfig, schoolName: e.target.value })}
                  placeholder="Ví dụ: TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH"
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-2 text-slate-900 text-xs font-semibold outline-none transition shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Dòng phụ đề:
                  </label>
                  <input
                    type="text"
                    value={tempConfig.subTitle}
                    onChange={e => setTempConfig({ ...tempConfig, subTitle: e.target.value })}
                    placeholder="Hệ thống khảo thí mạng LAN"
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-2 text-slate-800 text-xs outline-none transition shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Chức danh Giám khảo ký tên:
                  </label>
                  <input
                    type="text"
                    value={tempConfig.examinerTitle}
                    onChange={e => setTempConfig({ ...tempConfig, examinerTitle: e.target.value })}
                    placeholder="Giáo Viên Bộ Môn"
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-2 text-slate-800 text-xs outline-none transition shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tiêu đề chính của bài thi:
                </label>
                <input
                  type="text"
                  value={tempConfig.paperTitle}
                  onChange={e => setTempConfig({ ...tempConfig, paperTitle: e.target.value })}
                  placeholder="BÀI THI KIỂM TRA TRÊN MÁY TÍNH"
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-2 text-slate-900 text-xs font-bold outline-none transition shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Ghi chú chân trang (tùy chọn):
                </label>
                <input
                  type="text"
                  value={tempConfig.noteFooter}
                  onChange={e => setTempConfig({ ...tempConfig, noteFooter: e.target.value })}
                  placeholder="Ví dụ: Mọi thắc mắc về điểm số vui lòng phản hồi trong 48h."
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3 py-2 text-slate-800 text-xs outline-none transition shadow-2xs"
                />
              </div>

              {/* Checkboxes for options */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <span className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tùy Chọn Chi Tiết Trên Bản In:
                </span>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={tempConfig.showRubric}
                    onChange={e => setTempConfig({ ...tempConfig, showRubric: e.target.checked })}
                    className="rounded bg-white border-slate-300 text-blue-600 focus:ring-0"
                  />
                  In kèm Barem điểm chi tiết của câu hỏi Tự Luận
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={tempConfig.showAnswerKey}
                    onChange={e => setTempConfig({ ...tempConfig, showAnswerKey: e.target.checked })}
                    className="rounded bg-white border-slate-300 text-blue-600 focus:ring-0"
                  />
                  Đánh dấu Đáp Án Đúng ở phần Trắc Nghiệm
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={tempConfig.showStudentSignature}
                    onChange={e => setTempConfig({ ...tempConfig, showStudentSignature: e.target.checked })}
                    className="rounded bg-white border-slate-300 text-blue-600 focus:ring-0"
                  />
                  Hiển thị khung chữ ký Thí sinh
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={tempConfig.showExaminerSignature}
                    onChange={e => setTempConfig({ ...tempConfig, showExaminerSignature: e.target.checked })}
                    className="rounded bg-white border-slate-300 text-blue-600 focus:ring-0"
                  />
                  Hiển thị khung chữ ký Giám khảo
                </label>
              </div>

              {/* Export / Import Template Section */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">File Mẫu Cấu Hình:</span>
                  <span className="text-[10px] text-slate-500">Lưu ra file .json để dùng cho các máy khác</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportConfigFile}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-blue-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition shadow-2xs"
                    title="Tải về file cấu hình CauHinh_MauIn_BaiThi.json"
                  >
                    <Download className="w-3.5 h-3.5" /> Xuất File Mẫu (.json)
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-emerald-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition shadow-2xs"
                    title="Nhập file cấu hình .json từ máy tính"
                  >
                    <Upload className="w-3.5 h-3.5" /> Nhập File Mẫu
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImportConfigFile}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleResetDefaultConfig}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-xl text-xs font-medium flex items-center gap-1 transition"
                title="Khôi phục về thông số mẫu mặc định"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Đặt Lại Mặc Định
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleApplyConfig}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition"
                >
                  {configSavedNotice ? <Check className="w-4 h-4 text-white" /> : <Save className="w-4 h-4" />}
                  {configSavedNotice ? 'Đã Lưu Thành Công!' : 'Lưu & Áp Dụng'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
