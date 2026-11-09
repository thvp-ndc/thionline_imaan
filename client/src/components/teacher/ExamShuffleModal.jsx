import React, { useState, useEffect } from 'react';
import {
  Shuffle, X as CloseIcon, Download, Save, CheckCircle2,
  AlertCircle, Plus, Trash2, FileText, Check, Layers, Clock, Eye, Printer
} from 'lucide-react';
import VariantExamPreviewModal from './VariantExamPreviewModal';

export default function ExamShuffleModal({
  isOpen,
  onClose,
  exam,
  onSuccess
}) {
  if (!isOpen || !exam) return null;

  const [variantsCount, setVariantsCount] = useState(4);
  const [variantCodes, setVariantCodes] = useState(['101', '102', '103', '104']);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [shuffleTfOptions, setShuffleTfOptions] = useState(true);

  // Nhóm 1: Thông tin trường và kỳ thi (Mẫu 2 Cột 4 Hàng)
  const [schoolName, setSchoolName] = useState('');
  const [examTitle, setExamTitle] = useState(exam.title || 'KIỂM TRA');
  const [schoolYear, setSchoolYear] = useState('2025 - 2026');
  const [subjectName, setSubjectName] = useState(exam.subject || 'Tin học');
  const [gradeName, setGradeName] = useState(exam.grade || '12');
  const [durationMinutes, setDurationMinutes] = useState(exam.duration_minutes || 45);

  // Nhóm 2: Cấu hình xuất đề in
  const [instructionNote, setInstructionNote] = useState('(Lưu ý: Thí sinh LÀM BÀI TRÊN PHIẾU TRẢ LỜI TRẮC NGHIỆM)');
  const [hidePart3AnswerLines, setHidePart3AnswerLines] = useState(true);

  // Nhóm 3: Tùy chọn khảo thí
  const [restartNumberingPerPart, setRestartNumberingPerPart] = useState(true);
  const [continuousRomanNumbers, setContinuousRomanNumbers] = useState(false);
  const [showAdvancedHeader, setShowAdvancedHeader] = useState(false);

  const [exportingZip, setExportingZip] = useState(false);
  const [savingDb, setSavingDb] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    fetch('/api/system/school-info')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.schoolInfo) {
          if (!schoolName && d.schoolInfo.school_name) setSchoolName(d.schoolInfo.school_name);
          if (d.schoolInfo.academic_year) setSchoolYear(d.schoolInfo.academic_year);
        }
      })
      .catch(() => {});
  }, []);

  const getExportOptionsPayload = () => ({
    shuffleQuestions,
    shuffleOptions,
    shuffleTfOptions,
    schoolName: schoolName.trim() || undefined,
    examTitle: examTitle.trim() || undefined,
    schoolYear: schoolYear.trim() || undefined,
    subjectName: subjectName.trim() || undefined,
    gradeName: gradeName.trim() || undefined,
    durationMinutes: parseInt(durationMinutes, 10) || undefined,
    instructionNote: instructionNote.trim() || undefined,
    showPart3AnswerLines: !hidePart3AnswerLines,
    restartNumberingPerPart,
    continuousRomanNumbers
  });

  // Sync variantCodes when count changes
  const handleCountChange = (count) => {
    const num = Math.max(1, Math.min(20, parseInt(count, 10) || 1));
    setVariantsCount(num);

    const newCodes = [];
    for (let i = 0; i < num; i++) {
      if (variantCodes[i]) {
        newCodes.push(variantCodes[i]);
      } else {
        newCodes.push(String(100 + i + 1));
      }
    }
    setVariantCodes(newCodes);
  };

  const handleUpdateCode = (index, value) => {
    const updated = [...variantCodes];
    updated[index] = value.toUpperCase().trim();
    setVariantCodes(updated);
  };

  const handleAddCode = () => {
    const nextNum = 100 + variantCodes.length + 1;
    setVariantCodes([...variantCodes, String(nextNum)]);
    setVariantsCount(variantCodes.length + 1);
  };

  const handleRemoveCode = (index) => {
    if (variantCodes.length <= 1) return alert('Phải có ít nhất 1 mã đề');
    const updated = variantCodes.filter((_, i) => i !== index);
    setVariantCodes(updated);
    setVariantsCount(updated.length);
  };

  // Validate duplicate codes
  const hasDuplicateCodes = () => {
    const set = new Set(variantCodes.map(c => c.trim()));
    return set.size !== variantCodes.length;
  };

  const hasEmptyCodes = () => {
    return variantCodes.some(c => !c || !c.trim());
  };

  // 1. TẢI GÓI IN ẤN (.ZIP)
  const handleExportZip = async () => {
    if (hasEmptyCodes()) return alert('Vui lòng điền đầy đủ tất cả các ô mã đề!');
    if (hasDuplicateCodes()) return alert('Các mã đề không được trùng nhau! Vui lòng kiểm tra lại.');

    try {
      setExportingZip(true);
      const res = await fetch(`/api/exams/${exam.id}/shuffle-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantCodes,
          options: getExportOptionsPayload()
        })
      });

      if (!res.ok) {
        let errMsg = '';
        try {
          const errJson = await res.json();
          errMsg = errJson.message;
        } catch (_) {
          try {
            errMsg = await res.text();
          } catch (__) {}
        }
        throw new Error(errMsg || `Máy chủ phản hồi mã lỗi HTTP ${res.status}: ${res.statusText}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanTitle = (exam.title || 'De_Thi').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g, '_');
      a.download = `Goi_Tron_De_${cleanTitle}_${variantCodes.length}MaDe.zip`;
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

  // 2. LƯU CÁC ĐỀ HOÁN VỊ VÀO CSDL NGÂN HÀNG ĐỀ
  const handleSaveToDb = async () => {
    if (hasEmptyCodes()) return alert('Vui lòng điền đầy đủ tất cả các ô mã đề!');
    if (hasDuplicateCodes()) return alert('Các mã đề không được trùng nhau! Vui lòng kiểm tra lại.');

    const ok = confirm(
      `XÁC NHẬN LƯU VÀO NGÂN HÀNG ĐỀ:\n\n` +
      `Hệ thống sẽ tạo ${variantCodes.length} đề thi hoán vị mới (Mã đề: ${variantCodes.join(', ')}) và lưu vào Ngân Hàng Đề Thi.\n` +
      `Các đề này có thể dùng để mở ca thi phòng máy hoặc xem/sửa riêng lẻ.\n\n` +
      `Bạn có muốn tiếp tục không?`
    );
    if (!ok) return;

    try {
      setSavingDb(true);
      const res = await fetch(`/api/exams/${exam.id}/shuffle-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantCodes,
          options: getExportOptionsPayload()
        })
      });

      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Lỗi máy chủ HTTP ${res.status}: ${res.statusText}`);
      }

      if (data.success) {
        alert(`🎉 ${data.message}\n\nBạn có thể thấy các mã đề mới trong Ngân Hàng Đề Thi ngay bây giờ!`);
        if (onSuccess) onSuccess();
        onClose();
      } else {
        alert('Lỗi: ' + (data.message || 'Không thể lưu đề hoán vị'));
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setSavingDb(false);
    }
  };

  // 3. XEM TRƯỚC ĐỀ HOÁN VỊ & BẢNG ĐÁP ÁN SOI CHIẾU
  const handleOpenPreview = async () => {
    if (hasEmptyCodes()) return alert('Vui lòng điền đầy đủ tất cả các ô mã đề!');
    if (hasDuplicateCodes()) return alert('Các mã đề không được trùng nhau! Vui lòng kiểm tra lại.');

    try {
      setLoadingPreview(true);
      const payloadOptions = getExportOptionsPayload();
      const res = await fetch(`/api/exams/${exam.id}/shuffle-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantCodes,
          options: payloadOptions
        })
      });

      const data = await res.json();
      if (data.success && data.variants) {
        setPreviewData({ ...data, options: payloadOptions });
        setShowPreviewModal(true);
      } else {
        alert('Lỗi xem trước đề hoán vị: ' + (data.message || 'Không có dữ liệu'));
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:px-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <Shuffle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                Trộn Đề Hoán Vị Từ Đề Gốc
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                Đề gốc: <strong className="text-slate-800">{exam.title}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            title="Đóng cửa sổ"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs text-slate-700">
          {/* Thông số đề gốc */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 shadow-2xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Môn Học</span>
              <strong className="text-blue-700 text-xs">{exam.subject || 'Chung'}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Khối Lớp</span>
              <strong className="text-purple-700 text-xs">{exam.grade || 'Chung'}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Cơ Cấu Câu Hỏi</span>
              <strong className="text-emerald-700 text-xs">
                {exam.total_questions || (exam.questions || []).length} câu ({exam.total_score || 10}đ)
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Thời Gian</span>
              <strong className="text-amber-700 text-xs">{exam.duration_minutes || 45} phút</strong>
            </div>
          </div>

          {/* Chọn số lượng đề & Cấu hình mã đề */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" /> Số Lượng & Danh Sách Mã Đề Cần Sinh:
              </span>

              {/* Nút chọn nhanh */}
              <div className="flex items-center gap-1">
                {[2, 4, 6, 8].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleCountChange(n)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition border cursor-pointer ${
                      variantsCount === n
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                    }`}
                  >
                    {n} Đề
                  </button>
                ))}
              </div>
            </div>

            {/* Grid các ô mã đề cho phép sửa trực tiếp */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-500 block">
                Mã đề hoán vị (Click vào từng ô để tự đặt mã đề mong muốn):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {variantCodes.map((code, idx) => (
                  <div key={idx} className="relative flex items-center">
                    <span className="absolute left-2.5 text-[11px] text-slate-400 font-mono pointer-events-none">
                      #{idx + 1}:
                    </span>
                    <input
                      type="text"
                      maxLength={10}
                      value={code}
                      onChange={e => handleUpdateCode(idx, e.target.value)}
                      placeholder={`10${idx + 1}`}
                      className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center text-blue-700 focus:outline-none focus:border-blue-500 uppercase transition shadow-2xs focus:bg-white"
                    />
                    {variantCodes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCode(idx)}
                        className="absolute right-1.5 p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                        title="Xóa mã đề này"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                {variantCodes.length < 20 && (
                  <button
                    type="button"
                    onClick={handleAddCode}
                    className="py-2 px-3 border border-dashed border-slate-300 hover:border-blue-500 rounded-lg text-slate-600 hover:text-blue-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-slate-50 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm Mã Đề
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quy tắc xáo trộn chuẩn Bộ GD&ĐT */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-2xs">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-1.5">
              <Shuffle className="w-4 h-4 text-emerald-600" /> Quy Tắc Hoán Vị (Chuẩn Bộ GD&ĐT 2025):
            </span>

            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={e => setShuffleQuestions(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded mt-0.5"
                />
                <div>
                  <strong className="text-slate-800 block">Hoán vị thứ tự câu hỏi trong từng phần độc lập</strong>
                  <span className="text-slate-500 text-[11px]">
                    Câu hỏi Phần I, Phần II, Phần III đảo riêng rẽ; không làm xáo trộn ranh giới các phần.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={e => setShuffleOptions(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded mt-0.5"
                />
                <div>
                  <strong className="text-slate-800 block">Hoán vị nội dung phương án A, B, C, D (Phần I)</strong>
                  <span className="text-slate-500 text-[11px]">
                    Giữ nguyên nhãn chuẩn A, B, C, D; tự động ánh xạ lại đáp án đúng và bảng soi chiếu chính xác 100%.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleTfOptions}
                  onChange={e => setShuffleTfOptions(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded mt-0.5"
                />
                <div>
                  <strong className="text-slate-800 block">Hoán vị nội dung các ý a, b, c, d (Phần II - Đúng/Sai)</strong>
                  <span className="text-slate-500 text-[11px]">
                    Giữ nguyên nhãn chuẩn a, b, c, d; tự động hoán vị nội dung 4 ý và bảo toàn ánh xạ đáp án Đúng/Sai trên tất cả các mã đề.
                  </span>
                </div>
              </label>

              <div className="flex items-start gap-2.5 text-slate-600 pt-1 border-t border-slate-100">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-[11px]">
                  <strong>Bảo toàn cấu trúc:</strong> Giữ nguyên nhãn chuẩn A, B, C, D (Phần I) và a, b, c, d (Phần II); Phần IV (Tự luận) giữ cố định ở cuối đề thi theo chuẩn Bộ GD&ĐT.
                </span>
              </div>
            </div>
          </div>

          {/* Nhóm 1: Tùy Chỉnh Tiêu Đề Đề Thi & Bản In (Mẫu 2 Cột 4 Hàng) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-sky-600" /> Tùy Chỉnh Tiêu Đề Đề Thi (Mẫu 2 Cột 4 Hàng):
              </span>
              <button
                type="button"
                onClick={() => setShowAdvancedHeader(!showAdvancedHeader)}
                className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 cursor-pointer"
              >
                {showAdvancedHeader ? 'Thu gọn ▲' : 'Mở rộng chi tiết ▼'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">Tên Trường / Đơn Vị:</label>
                <input
                  type="text"
                  maxLength={80}
                  value={schoolName}
                  onChange={e => setSchoolName(e.target.value)}
                  placeholder="TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">Tên Kỳ Thi / Tiêu Đề Đề:</label>
                <input
                  type="text"
                  maxLength={80}
                  value={examTitle}
                  onChange={e => setExamTitle(e.target.value)}
                  placeholder="KIỂM TRA ĐÁNH GIÁ ĐỊNH KỲ"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {showAdvancedHeader && (
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Năm Học:</label>
                    <input
                      type="text"
                      maxLength={20}
                      value={schoolYear}
                      onChange={e => setSchoolYear(e.target.value)}
                      placeholder="2025 - 2026"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500 text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Môn Học:</label>
                    <input
                      type="text"
                      maxLength={40}
                      value={subjectName}
                      onChange={e => setSubjectName(e.target.value)}
                      placeholder="Tin học"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500 text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Khối Lớp:</label>
                    <input
                      type="text"
                      maxLength={10}
                      value={gradeName}
                      onChange={e => setGradeName(e.target.value)}
                      placeholder="12"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500 text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Thời Gian (phút):</label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={durationMinutes}
                      onChange={e => setDurationMinutes(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500 text-center font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 block mb-1">Dòng Lưu Ý (Hàng 4 Tiêu Đề Gộp 2 Cột):</label>
                  <input
                    type="text"
                    maxLength={120}
                    value={instructionNote}
                    onChange={e => setInstructionNote(e.target.value)}
                    placeholder="(Lưu ý: Thí sinh LÀM BÀI TRÊN PHIẾU TRẢ LỜI TRẮC NGHIỆM)"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500 italic"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Nhóm 2 & 3: Tùy Chọn Định Dạng In Ấn & Khảo Thí */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-2xs">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-1.5">
              <Printer className="w-4 h-4 text-indigo-600" /> Tùy Chọn Định Dạng In Ấn & Khảo Thí:
            </span>

            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hidePart3AnswerLines}
                  onChange={e => setHidePart3AnswerLines(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded mt-0.5"
                />
                <div>
                  <strong className="text-slate-800 block">Ẩn dòng đáp án chấm lửng ở Phần III (Phiếu trả lời trắc nghiệm)</strong>
                  <span className="text-slate-500 text-[11px]">
                    Bỏ dòng "Trả lời: ................." ở Phần III trên đề in (vì học sinh tô đáp số trên Phiếu TLTN).
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restartNumberingPerPart}
                  onChange={e => setRestartNumberingPerPart(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded mt-0.5"
                />
                <div>
                  <strong className="text-slate-800 block">Đánh số câu hỏi bắt đầu từ Câu 1 cho mỗi phần</strong>
                  <span className="text-slate-500 text-[11px]">
                    Phần I: Câu 1..16, Phần II: Câu 1..4, Phần III: Câu 1..4 (Khớp hoàn toàn cấu trúc đề chuẩn Khảo thí).
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={continuousRomanNumbers}
                  onChange={e => setContinuousRomanNumbers(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded mt-0.5"
                />
                <div>
                  <strong className="text-slate-800 block">Dồn số thứ tự La Mã tuần tự (I, II, III...) khi khuyết phần</strong>
                  <span className="text-slate-500 text-[11px]">
                    Mặc định tắt: Giữ cố định Phần I (MCQ), Phần II (Đúng/Sai), Phần III (Ngắn), Phần IV (Tự luận) theo chuẩn Bộ GD&ĐT 2025.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Mô tả gói xuất */}
          <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3.5 flex items-start gap-2.5 shadow-2xs">
            <FileText className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-blue-900 leading-relaxed">
              <strong>Gói in ấn (.ZIP) khi tải về sẽ bao gồm:</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-800">
                <li><code>00_De_Goc_Kem_Dap_An.docx</code> (Đề gốc có đáp án và barem chi tiết)</li>
                <li>Thư mục <code>De_Thi_In/</code> chứa {variantCodes.length} file đề thi Word (.docx) chuẩn in ấn (ẩn đáp án)</li>
                <li><code>Bang_Dap_An_Soi_Chieu.xlsx</code> (Bảng ma trận đối soát đáp án các mã đề)</li>
                <li><code>Huong_Dan_Cham_Va_Dap_An_Chi_Tiet.docx</code> (Barem chấm tổng hợp)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold rounded-xl text-xs transition shadow-2xs cursor-pointer"
          >
            Đóng
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {/* Nút Xem Trước */}
            <button
              type="button"
              disabled={loadingPreview || savingDb || exportingZip}
              onClick={handleOpenPreview}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              title="Xem trước từng mã đề hoán vị và bảng đáp án soi chiếu trước khi in ấn/lưu"
            >
              <Eye className="w-3.5 h-3.5" />
              {loadingPreview ? 'Đang Tải Đề...' : `Xem Trước ${variantCodes.length} Mã Đề`}
            </button>

            {/* Nút 1: Lưu vào CSDL */}
            <button
              type="button"
              disabled={savingDb || exportingZip || loadingPreview}
              onClick={handleSaveToDb}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              title="Lưu các mã đề này vào Ngân Hàng Đề Thi để mở ca thi phòng máy"
            >
              <Save className="w-3.5 h-3.5" />
              {savingDb ? 'Đang Lưu...' : 'Lưu Đề Hoán Vị'}
            </button>

            {/* Nút 2: Tải gói ZIP */}
            <button
              type="button"
              disabled={exportingZip || savingDb || loadingPreview}
              onClick={handleExportZip}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              title="Tải trọn bộ file Word đề thi in, Excel bảng đáp án soi chiếu về máy"
            >
              <Download className="w-4 h-4" />
              {exportingZip ? 'Đang Đóng Gói .ZIP...' : 'Xuất Gói In Ấn (.zip)'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Xem Trước Chi Tiết Các Đề Hoán Vị & Bảng Đáp Án Soi Chiếu */}
      {showPreviewModal && previewData && (
        <VariantExamPreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          previewData={previewData}
          onExportZip={handleExportZip}
          onGenerateDb={handleSaveToDb}
          exportingZip={exportingZip}
          generatingDb={savingDb}
        />
      )}
    </div>
  );
}
