import React, { useState } from 'react';
import { Hash, Sparkles, X, Check, AlertCircle, ArrowRight, Layers } from 'lucide-react';

export default function AutoAssignSbdModal({
  isOpen,
  onClose,
  selectedScope, // { type: 'ALL' | 'GRADE' | 'CLASS' | 'SELECTED', value: any, count: number }
  selectedIds = [],
  classList = [],
  onSuccess
}) {
  if (!isOpen) return null;

  const [prefixMode, setPrefixMode] = useState('class_prefix'); // 'class_prefix' | 'custom_prefix'
  const [customPrefix, setCustomPrefix] = useState('SBD');
  const [digits, setDigits] = useState(2);
  const [startNum, setStartNum] = useState(1);
  const [sortByName, setSortByName] = useState(true);
  const [overwrite, setOverwrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Scope selection
  const [scopeType, setScopeType] = useState(
    selectedIds.length > 0 
      ? 'selected' 
      : (selectedScope?.type === 'CLASS' ? 'class' : selectedScope?.type === 'GRADE' ? 'grade' : 'all')
  );

  const scopeLabel = () => {
    if (scopeType === 'selected') return `${selectedIds.length} học sinh đang chọn`;
    if (scopeType === 'class') return `Lớp ${selectedScope?.value || 'đang chọn'}`;
    if (scopeType === 'grade') return `Khối ${selectedScope?.value || 'đang chọn'}`;
    return `Toàn trường (${selectedScope?.totalCount || 'tất cả'} học sinh)`;
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        scope: scopeType,
        className: scopeType === 'class' ? selectedScope?.value : null,
        grade: scopeType === 'grade' ? selectedScope?.value : null,
        studentIds: scopeType === 'selected' ? selectedIds : [],
        prefixMode,
        customPrefix: customPrefix.trim().toUpperCase(),
        digits: Number(digits),
        startNum: Number(startNum),
        sortByName,
        overwrite
      };

      const res = await fetch('/api/students/auto-assign-sbd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data);
        onClose();
      } else {
        setError(data.message || 'Lỗi khi đánh Số Báo Danh');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const padNum = (num, len) => String(num).padStart(len, '0');
  const previewExample1 = prefixMode === 'class_prefix' 
    ? `${selectedScope?.type === 'CLASS' ? selectedScope.value : '10A1'}${padNum(startNum, digits)}`
    : `${(customPrefix || 'SBD').toUpperCase()}${padNum(startNum, digits)}`;
  const previewExample2 = prefixMode === 'class_prefix' 
    ? `${selectedScope?.type === 'CLASS' ? selectedScope.value : '10A1'}${padNum(Number(startNum) + 1, digits)}`
    : `${(customPrefix || 'SBD').toUpperCase()}${padNum(Number(startNum) + 1, digits)}`;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-800 animate-fadeIn">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Đánh Số Báo Danh Tự Động</h3>
              <p className="text-xs text-slate-500">Tự động cấp SBD theo mã lớp hoặc tiền tố chuẩn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleAssign} className="space-y-4">
          {/* Phạm vi áp dụng */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Phạm Vi Đánh Số</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScopeType('selected')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    scopeType === 'selected'
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold">Mục Đang Chọn</div>
                  <div className="text-[11px] opacity-75">{selectedIds.length} học sinh</div>
                </button>
              )}
              {selectedScope?.type === 'CLASS' && (
                <button
                  type="button"
                  onClick={() => setScopeType('class')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    scopeType === 'class'
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold">Lớp {selectedScope.value}</div>
                  <div className="text-[11px] opacity-75">{selectedScope.count} học sinh</div>
                </button>
              )}
              {selectedScope?.type === 'GRADE' && (
                <button
                  type="button"
                  onClick={() => setScopeType('grade')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    scopeType === 'grade'
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold">Khối {selectedScope.value}</div>
                  <div className="text-[11px] opacity-75">{selectedScope.count} học sinh</div>
                </button>
              )}
              <button
                type="button"
                onClick={() => setScopeType('all')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  scopeType === 'all'
                    ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">Toàn Trường</div>
                <div className="text-[11px] opacity-75">Tất cả lớp học</div>
              </button>
            </div>
          </div>

          {/* Quy tắc định dạng mã */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Quy Tắc Tạo SBD</label>
            <div className="space-y-2">
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                prefixMode === 'class_prefix' ? 'bg-blue-50/70 border-blue-400' : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="prefixMode"
                  checked={prefixMode === 'class_prefix'}
                  onChange={() => setPrefixMode('class_prefix')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">Theo Mã Lớp + Số Thứ Tự (Khuyên dùng)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Ví dụ: Lớp 10A1 đánh từ <strong>10A101, 10A102...</strong> Lớp 11A1 đánh từ <strong>11A101...</strong>
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                prefixMode === 'custom_prefix' ? 'bg-blue-50/70 border-blue-400' : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="prefixMode"
                  checked={prefixMode === 'custom_prefix'}
                  onChange={() => setPrefixMode('custom_prefix')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-900">Tiền Tố Tùy Chỉnh (Toàn phòng/toàn trường)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Ví dụ: <strong>SBD001, SBD002...</strong> hoặc <strong>THI001...</strong>
                  </div>
                  {prefixMode === 'custom_prefix' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-slate-600 font-medium">Tiền tố:</span>
                      <input
                        type="text"
                        value={customPrefix}
                        onChange={e => setCustomPrefix(e.target.value.toUpperCase())}
                        placeholder="SBD"
                        className="w-28 px-2.5 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg uppercase focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Cấu hình số chữ số và bắt đầu */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Độ Dài Chữ Số</label>
              <select
                value={digits}
                onChange={e => setDigits(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:border-blue-500 focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value={2}>2 chữ số (01, 02... 99)</option>
                <option value={3}>3 chữ số (001, 002... 999)</option>
                <option value={4}>4 chữ số (0001, 0002...)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Bắt Đầu Từ Số</label>
              <input
                type="number"
                min={1}
                value={startNum}
                onChange={e => setStartNum(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Tùy chọn bổ sung */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-800 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={sortByName}
                onChange={e => setSortByName(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 w-4 h-4"
              />
              <span>Sắp xếp học sinh theo bảng chữ cái Họ và Tên (chuẩn Tiếng Việt A-Z) trước khi đánh số</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-800 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={e => setOverwrite(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 w-4 h-4"
              />
              <span>Đánh lại toàn bộ học sinh (bỏ chọn nếu chỉ muốn đánh cho HS chưa có SBD)</span>
            </label>
          </div>

          {/* Mẫu kết quả xem trước */}
          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs flex items-center justify-between">
            <span className="text-slate-600 font-medium">Mẫu SBD phát ra:</span>
            <div className="flex items-center gap-1.5 font-mono font-bold text-blue-700">
              <span className="bg-white px-2 py-0.5 rounded border border-blue-200">{previewExample1}</span>
              <span>,</span>
              <span className="bg-white px-2 py-0.5 rounded border border-blue-200">{previewExample2}</span>
              <span>, ...</span>
            </div>
          </div>

          {/* Nút hành động */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{submitting ? 'Đang thực hiện...' : `Xác Nhận Đánh SBD (${scopeLabel()})`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
