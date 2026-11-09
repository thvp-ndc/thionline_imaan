import React, { useState, useEffect } from 'react';
import { Building2, Landmark, Calendar, Check, Save, X, AlertCircle, RefreshCw } from 'lucide-react';

export default function SchoolInfoModal({ isOpen, onClose, onSaved }) {
  const [schoolName, setSchoolName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      setLoading(true);
      fetch('/api/system/school-info')
        .then(r => r.json())
        .then(data => {
          if (data.success && data.schoolInfo) {
            setSchoolName(data.schoolInfo.school_name || '');
            setDepartmentName(data.schoolInfo.department_name || '');
            setAcademicYear(data.schoolInfo.academic_year || '');
          }
        })
        .catch(err => {
          setErrorMsg('Lỗi kết nối máy chủ: ' + err.message);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!schoolName.trim()) {
      setErrorMsg('Vui lòng nhập tên trường học.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');

      const res = await fetch('/api/system/school-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_name: schoolName.trim(),
          department_name: departmentName.trim(),
          academic_year: academicYear.trim()
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Không thể lưu thông tin trường học.');
      }

      setSuccessMsg('Đã lưu thông tin trường học thành công!');
      if (onSaved) {
        onSaved(data.schoolInfo);
      }
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn select-none">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Cấu Hình Thông Tin Trường Học
              </h2>
              <p className="text-xs text-slate-500">
                Thông tin này sẽ hiển thị trên Header hệ thống, tiêu đề đề thi in Word và phiếu làm bài
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition text-sm cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Đang tải thông tin trường học...</span>
            </div>
          ) : (
            <>
              {/* Tên Trường */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Tên Trường Học / Đơn Vị Tổ Chức <strong className="text-rose-500">*</strong></span>
                </label>
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Ví dụ: TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-bold focus:bg-white focus:border-blue-600 focus:outline-none transition shadow-2xs placeholder:font-normal placeholder:text-slate-400"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Tên trường xuất hiện trên góc trái giao diện và đầu đề thi in Word.
                </span>
              </div>

              {/* Cơ Quan Chủ Quản */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-slate-500" />
                  <span>Cơ Quan Chủ Quản (Sở GD&ĐT / Phòng GD&ĐT)</span>
                </label>
                <input
                  type="text"
                  value={departmentName}
                  onChange={(e) => setDepartmentName(e.target.value)}
                  placeholder="Ví dụ: SỞ GIÁO DỤC VÀ ĐÀO TẠO"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 font-semibold focus:bg-white focus:border-blue-600 focus:outline-none transition shadow-2xs placeholder:font-normal placeholder:text-slate-400"
                />
              </div>

              {/* Năm Học */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Năm Học Mặc Định</span>
                </label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="Ví dụ: 2025 - 2026"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 font-semibold focus:bg-white focus:border-blue-600 focus:outline-none transition shadow-2xs placeholder:font-normal placeholder:text-slate-400"
                />
              </div>

              {/* Xem trước mẫu hiển thị Header đề thi */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-slate-600 uppercase text-[10.5px] block">Mẫu tiêu đề đề thi in Word:</span>
                <div className="font-serif bg-white p-2.5 border border-slate-200 rounded-lg text-center shadow-2xs space-y-0.5">
                  <div className="font-bold text-slate-700 text-xs">{(departmentName || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO').toUpperCase()}</div>
                  <div className="font-black text-slate-900 text-xs">{(schoolName || 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH').toUpperCase()}</div>
                  <div className="text-[11px] text-slate-500 italic">Năm học: {academicYear || '2025 - 2026'}</div>
                </div>
              </div>
            </>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu Thông Tin Trường</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
