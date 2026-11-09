import React, { useState, useRef } from 'react';
import {
  Archive,
  Download,
  Upload,
  Layers,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  FileArchive,
  HelpCircle,
  CopyCheck,
  FolderSync,
  Info
} from 'lucide-react';

export default function QuestionBankBackupModal({
  isOpen,
  onClose,
  selectedGradeSubject,
  onRestoreSuccess
}) {
  const [activeTab, setActiveTab] = useState('export'); // 'export' | 'restore'

  // State Export
  const [exportScope, setExportScope] = useState('single'); // 'single' | 'all'
  const [exporting, setExporting] = useState(false);

  // State Restore
  const [selectedFile, setSelectedFile] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [previewManifest, setPreviewManifest] = useState(null);
  const [fileBase64, setFileBase64] = useState('');
  const [restoreMode, setRestoreMode] = useState('merge'); // 'merge' | 'replace'
  const [handleDuplicates, setHandleDuplicates] = useState('skip'); // 'skip' | 'overwrite'
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // 1. Xử lý xuất file sao lưu
  const handleExport = () => {
    setExporting(true);
    setErrorMsg('');

    const params = new URLSearchParams();
    if (exportScope === 'single' && selectedGradeSubject?.id) {
      params.set('grade_subject_id', selectedGradeSubject.id);
      params.set('scope', 'single');
    } else {
      params.set('scope', 'all');
    }

    const downloadUrl = `/api/question-bank/backup/export?${params.toString()}`;

    // Tạo link ẩn để tải tệp trực tiếp
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setExporting(false);
    }, 1500);
  };

  // 2. Xử lý khi người dùng chọn tệp phục hồi
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setRestoreResult(null);
    setPreviewManifest(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const b64 = event.target.result;
      setFileBase64(b64);

      // Gửi lên server để inspect xem trước
      setInspecting(true);
      try {
        const res = await fetch('/api/question-bank/backup/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: b64 })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Không thể đọc tệp sao lưu');
        }
        setPreviewManifest(data.manifest);
      } catch (err) {
        setErrorMsg(err.message);
        setSelectedFile(null);
      } finally {
        setInspecting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 3. Xử lý bấm phục hồi dữ liệu
  const handleRestoreSubmit = async (e) => {
    e.preventDefault();
    if (!fileBase64) {
      setErrorMsg('Vui lòng chọn tệp sao lưu (.vnlanqb, .vnlanqp hoặc .zip)');
      return;
    }

    if (restoreMode === 'replace') {
      const targetName = previewManifest?.scope === 'all'
        ? 'TẤT CẢ CÁC MÔN CÓ TRONG BẢN SAO LƯU'
        : `${previewManifest?.grade_name} - ${previewManifest?.subject_name}`;
      if (!window.confirm(`⚠️ CẢNH BÁO CHẾ ĐỘ GHI ĐÈ:\n\nToàn bộ câu hỏi cũ của [${targetName}] trong hệ thống sẽ bị xóa và thay thế bằng dữ liệu từ file sao lưu.\n\nThầy/Cô có chắc chắn muốn tiếp tục?`)) {
        return;
      }
    }

    setRestoring(true);
    setErrorMsg('');
    setRestoreResult(null);

    try {
      const res = await fetch('/api/question-bank/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          mode: restoreMode,
          handleDuplicates
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Phục hồi thất bại');
      }

      setRestoreResult(data);
      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setRestoring(false);
    }
  };

  // Reset form phục hồi
  const handleResetRestore = () => {
    setSelectedFile(null);
    setPreviewManifest(null);
    setFileBase64('');
    setRestoreResult(null);
    setErrorMsg('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn select-none">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shadow-2xs">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Sao Lưu & Phục Hồi <span className="text-blue-600">Ngân Hàng Câu Hỏi</span>
              </h2>
              <p className="text-xs text-slate-500">Quản lý đóng gói và chuyển giao kho câu hỏi VNLAN an toàn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition text-sm cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tabs: [Sao Lưu (Export)] | [Phục Hồi (Restore)] */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 pt-3 gap-2">
          <button
            onClick={() => { setActiveTab('export'); setErrorMsg(''); }}
            className={`pb-3 px-4 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'export'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Download className="w-4 h-4" /> Sao Lưu (Xuất Tệp .vnlanqb)
          </button>
          <button
            onClick={() => { setActiveTab('restore'); setErrorMsg(''); }}
            className={`pb-3 px-4 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'restore'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" /> Phục Hồi (Nhập Tệp Vào Kho)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm flex-1 bg-white">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: SAO LƯU (EXPORT) */}
          {activeTab === 'export' && (
            <div className="space-y-5">
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  1. Chọn Phạm Vi Sao Lưu:
                </label>

                {/* Option 1: Chỉ môn học hiện tại */}
                <label className={`block p-4 rounded-xl border cursor-pointer transition ${
                  exportScope === 'single'
                    ? 'bg-blue-50/60 border-blue-400 text-slate-900 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === 'single'}
                      onChange={() => setExportScope('single')}
                      className="mt-1 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <span>Chỉ sao lưu môn đang chọn:</span>
                        <span className="px-2 py-0.5 rounded bg-blue-100 border border-blue-200 text-blue-800 text-xs font-bold">
                          {selectedGradeSubject?.grade_name || 'Khối'} - {selectedGradeSubject?.subject_name || 'Môn'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Phù hợp khi Thầy/Cô muốn lưu trữ riêng môn của mình hoặc chia sẻ file cho đồng nghiệp cùng tổ bộ môn ở trường khác.
                      </p>
                    </div>
                  </div>
                </label>

                {/* Option 2: Toàn bộ ngân hàng câu hỏi */}
                <label className={`block p-4 rounded-xl border cursor-pointer transition ${
                  exportScope === 'all'
                    ? 'bg-blue-50/60 border-blue-400 text-slate-900 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === 'all'}
                      onChange={() => setExportScope('all')}
                      className="mt-1 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-slate-900">
                        Sao lưu TOÀN BỘ Ngân hàng câu hỏi (Tất cả các khối & môn học)
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Đóng gói trọn vẹn toàn bộ câu hỏi của tất cả các môn từ Khối 6 đến Khối 12. Dành cho quản trị viên muốn sao lưu dự phòng toàn trường.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {/* Tùy chọn đóng gói hình ảnh */}
              <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="text-xs text-slate-700">
                  <strong className="text-slate-900">Tự động đóng gói hình ảnh:</strong> Toàn bộ hình ảnh, đồ thị, sơ đồ đính kèm trong câu hỏi sẽ được nén vào tệp sao lưu để không bị lỗi ảnh khi chuyển máy.
                </div>
              </div>

              {/* Nút Export */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-2xs transition cursor-pointer"
                >
                  {exporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang nén dữ liệu và tạo tệp sao lưu...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Tạo & Tải Tệp Sao Lưu (.vnlanqb)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PHỤC HỒI (RESTORE) */}
          {activeTab === 'restore' && (
            <div className="space-y-5">
              {!previewManifest ? (
                /* 1. Khu vực tải file lên */
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    1. Chọn Tệp Sao Lưu (.vnlanqb, .vnlanqp hoặc .zip):
                  </label>

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer transition bg-slate-50/60 hover:bg-blue-50/30 group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".vnlanqb,.vnlanqp,.zip"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mb-3 group-hover:scale-105 transition shadow-2xs">
                      {inspecting ? <RefreshCw className="w-7 h-7 animate-spin" /> : <FileArchive className="w-7 h-7" />}
                    </div>
                    <div className="font-bold text-slate-900 text-sm">
                      {inspecting ? 'Đang phân tích tệp sao lưu...' : 'Nhấp để chọn tệp sao lưu hoặc kéo thả vào đây'}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Hỗ trợ định dạng tệp sao lưu VNLAN (.vnlanqb, .vnlanqp, .zip)
                    </div>
                  </div>
                </div>
              ) : (
                /* 2. Khung xem trước thông tin bản sao lưu & tùy chọn phục hồi */
                <form onSubmit={handleRestoreSubmit} className="space-y-4 animate-fadeIn">
                  {/* File info banner */}
                  <div className="p-4 bg-slate-50 border border-blue-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-slate-900">Thông Tin Tệp Sao Lưu Hợp Lệ</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetRestore}
                        className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium"
                      >
                        Chọn tệp khác
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="text-slate-500 text-[11px] block">Phạm vi:</span>
                        <strong className="text-blue-700 font-semibold truncate block mt-0.5">
                          {previewManifest.scope === 'all' ? 'Tất cả các môn' : `${previewManifest.grade_name} - ${previewManifest.subject_name}`}
                        </strong>
                      </div>

                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="text-slate-500 text-[11px] block">Tổng câu hỏi:</span>
                        <strong className="text-emerald-700 font-semibold block mt-0.5">
                          {previewManifest.stats?.total_questions || 0} câu
                        </strong>
                      </div>

                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="text-slate-500 text-[11px] block">Chủ đề & Bài:</span>
                        <strong className="text-amber-700 font-semibold block mt-0.5">
                          {previewManifest.stats?.total_topics || 0} CĐ • {previewManifest.stats?.total_lessons || 0} Bài
                        </strong>
                      </div>

                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="text-slate-500 text-[11px] block">Hình ảnh:</span>
                        <strong className="text-indigo-700 font-semibold block mt-0.5">
                          {previewManifest.stats?.packaged_images || previewManifest.stats?.total_images || 0} ảnh
                        </strong>
                      </div>
                    </div>

                    {/* Chi tiết mức độ */}
                    <div className="text-[11px] text-slate-500 flex items-center gap-3 pt-1 font-medium">
                      <span>🟢 Biết: <strong className="text-slate-800">{previewManifest.stats?.levels?.biet || 0}</strong></span>
                      <span>•</span>
                      <span>🔵 Hiểu: <strong className="text-slate-800">{previewManifest.stats?.levels?.hieu || 0}</strong></span>
                      <span>•</span>
                      <span>🟠 Vận dụng: <strong className="text-slate-800">{previewManifest.stats?.levels?.van_dung || 0}</strong></span>
                    </div>
                  </div>

                  {/* Chọn chế độ phục hồi */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      2. Chọn Chế Độ Phục Hồi:
                    </label>

                    {/* Mode 1: Merge (Khuyến nghị) */}
                    <label className={`block p-3.5 rounded-xl border cursor-pointer transition ${
                      restoreMode === 'merge'
                        ? 'bg-emerald-50/70 border-emerald-400 text-slate-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="restoreMode"
                          checked={restoreMode === 'merge'}
                          onChange={() => setRestoreMode('merge')}
                          className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div className="space-y-0.5">
                          <div className="font-bold text-xs sm:text-sm text-emerald-800 flex items-center gap-1.5">
                            <CopyCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Chế độ Gộp & Bổ Sung (Merge - Khuyến nghị an toàn)</span>
                          </div>
                          <p className="text-[11px] sm:text-xs text-slate-500">
                            Thêm câu hỏi mới vào ngân hàng. Tự động phát hiện và <strong>bỏ qua các câu hỏi đã có sẵn</strong> để không tạo câu hỏi trùng lặp, giữ nguyên các môn khác.
                          </p>
                        </div>
                      </div>
                    </label>

                    {/* Mode 2: Replace */}
                    <label className={`block p-3.5 rounded-xl border cursor-pointer transition ${
                      restoreMode === 'replace'
                        ? 'bg-rose-50/70 border-rose-400 text-slate-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="restoreMode"
                          checked={restoreMode === 'replace'}
                          onChange={() => setRestoreMode('replace')}
                          className="mt-1 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                        <div className="space-y-0.5">
                          <div className="font-bold text-xs sm:text-sm text-rose-800 flex items-center gap-1.5">
                            <FolderSync className="w-3.5 h-3.5 text-rose-600" />
                            <span>Chế độ Ghi Đè Làm Mới (Replace / Overwrite)</span>
                          </div>
                          <p className="text-[11px] sm:text-xs text-slate-500">
                            Xóa toàn bộ câu hỏi cũ của môn trong file sao lưu và nạp mới hoàn toàn. Thích hợp khi muốn cập nhật đồng bộ chuẩn hóa từ tổ trưởng bộ môn.
                          </p>
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Kết quả phục hồi (nếu có) */}
                  {restoreResult && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 animate-fadeIn text-xs text-slate-800">
                      <div className="font-bold text-emerald-700 text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{restoreResult.message}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-slate-600">
                        <div>Đã thêm mới: <strong className="text-slate-900">{restoreResult.imported_questions} câu</strong></div>
                        <div>Bỏ qua trùng lặp: <strong className="text-amber-700">{restoreResult.skipped_questions} câu</strong></div>
                        <div>Khôi phục ảnh: <strong className="text-blue-700">{restoreResult.restored_images} ảnh</strong></div>
                      </div>
                    </div>
                  )}

                  {/* Nút bấm thực thi */}
                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleResetRestore}
                      className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={restoring}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition cursor-pointer"
                    >
                      {restoring ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang phục hồi dữ liệu...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>Bắt Đầu Phục Hồi Dữ Liệu</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-600" />
            <span>Định dạng tệp chuẩn: <strong className="text-slate-700">.vnlanqp / .vnlanqb</strong> (VNLAN Question Package / Bank)</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition cursor-pointer shadow-2xs font-semibold"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
