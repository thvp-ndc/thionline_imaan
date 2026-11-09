import React, { useState } from 'react';
import {
  ShieldCheck, ShieldAlert, Key, Copy, Check, Lock, Award,
  AlertCircle, RefreshCw, PhoneCall, Mail, ExternalLink, Building2,
  Calendar, CheckCircle2, ChevronRight
} from 'lucide-react';

export default function LicenseModal({ isOpen, onClose, licenseStatus, schoolInfo, onRefreshStatus }) {
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedHwid, setCopiedHwid] = useState(false);
  const [showKeyInputForm, setShowKeyInputForm] = useState(false);
  const [systemSchool, setSystemSchool] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      fetch('/api/system/school-info')
        .then(r => r.json())
        .then(d => {
          if (d.success && d.schoolInfo?.school_name) {
            setSystemSchool(d.schoolInfo.school_name);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen || !licenseStatus) return null;

  const handleCopyHwid = () => {
    if (licenseStatus.hwid) {
      navigator.clipboard.writeText(licenseStatus.hwid);
      setCopiedHwid(true);
      setTimeout(() => setCopiedHwid(false), 2500);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!licenseKeyInput.trim()) {
      setErrorMsg('Vui lòng nhập chuỗi khóa bản quyền (License Key)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKeyInput.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Kích hoạt bản quyền thất bại');
      }

      setSuccessMsg(data.message || 'Kích hoạt bản quyền VNLAN thành công!');
      setLicenseKeyInput('');
      setShowKeyInputForm(false);
      if (onRefreshStatus) {
        await onRefreshStatus();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isExpired = licenseStatus.is_expired;
  const isLicensed = licenseStatus.is_licensed;
  const isTrial = licenseStatus.is_trial;
  const isTampered = licenseStatus.is_tampered;

  // Hiển thị form nhập key mặc định nếu chưa active; nếu đã active thì chỉ hiện khi người dùng click "Cập nhật khóa bản quyền khác"
  const shouldShowForm = !isLicensed || showKeyInputForm;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
              isLicensed
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : isExpired || isTampered
                ? 'bg-rose-50 text-rose-600 border border-rose-200'
                : 'bg-amber-50 text-amber-600 border border-amber-200'
            }`}>
              {isLicensed ? (
                <ShieldCheck className="w-5 h-5" />
              ) : isExpired || isTampered ? (
                <Lock className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  Thông Tin Bản Quyền <span className="text-blue-600">VNLAN</span>
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Enterprise
                </span>
              </div>
              <p className="text-xs text-slate-500">Hệ Thống Khảo Thí Trực Tuyến Mạng LAN Offline Chuẩn Quốc Gia</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition text-sm"
          >
            ✕
          </button>
        </div>

        {/* Nội dung Modal */}
        <div className="p-6 space-y-5 text-sm max-h-[80vh] overflow-y-auto">
          {/* TRƯỜNG HỢP 1: BẢN QUYỀN ĐÃ KÍCH HOẠT (ACTIVE / LIFETIME) -> DIGITAL CERTIFICATE CARD */}
          {isLicensed ? (
            <div className="space-y-4">
              {/* Giấy chứng nhận số Digital License Certificate Card */}
              <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-slate-50 p-5 shadow-xs">
                {/* Dấu chìm bảo mật */}
                <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                  <ShieldCheck className="w-40 h-40 text-emerald-900" />
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Bản Quyền Doanh Nghiệp (LIFETIME)</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-800 pt-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span>{schoolInfo?.school_name || systemSchool || licenseStatus.client_name || 'Đơn Vị Khách Hàng Sở Hữu'}</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Hệ thống đã kích hoạt chứng chỉ điện tử chính thức, được bảo vệ bởi chữ ký bảo mật RSA-2048 & mã hóa phần cứng.
                    </p>
                  </div>

                  <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
                    <Award className="w-6 h-6" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 mt-4 border-t border-emerald-100/80 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Thời hạn giấy phép:</span>
                    <strong className="text-slate-700 font-semibold flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      {licenseStatus.expiry_date === 'LIFETIME' || !licenseStatus.expiry_date
                        ? 'Vĩnh viễn (LIFETIME)'
                        : licenseStatus.expiry_date}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Phiên bản phát hành:</span>
                    <strong className="text-slate-700 font-semibold font-mono block mt-0.5">
                      VNLAN v2.6.0 Enterprise
                    </strong>
                  </div>
                </div>
              </div>

              {/* Nút mờ cập nhật khóa khác */}
              {!showKeyInputForm ? (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowKeyInputForm(true)}
                    className="text-xs text-slate-500 hover:text-blue-600 font-medium transition inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    <span>Cập nhật khóa bản quyền khác hoặc gia hạn</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowKeyInputForm(false)}
                    className="text-xs text-slate-500 hover:text-slate-700 font-medium transition"
                  >
                    Ẩn biểu mẫu nhập khóa
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* TRƯỜNG HỢP 2: ĐANG DÙNG THỬ HOẶC HẾT HẠN */
            <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${
              isExpired || isTampered
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {isExpired || isTampered ? (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <span>Trạng thái:</span>
                  {isTrial && <span className="text-amber-700">Dùng thử thương mại (Còn {licenseStatus.days_left} ngày)</span>}
                  {isExpired && <span className="text-rose-700 font-bold">Hết hạn dùng thử phần mềm</span>}
                  {isTampered && <span className="text-rose-700 font-bold">Phát hiện can thiệp thời gian hệ thống!</span>}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {licenseStatus.message || licenseStatus.reason || 'Vui lòng cung cấp mã phần cứng cho đại lý để nhận mã kích hoạt bản quyền VNLAN chính thức.'}
                </p>
              </div>
            </div>
          )}

          {/* KHỐI HWID: MÃ ĐỊNH DANH PHẦN CỨNG MÁY CHỦ */}
          <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Mã Nhận Diện Máy Chủ (Hardware ID - HWID):</span>
              </label>
              <span className="text-[11px] text-slate-500">Khóa gắn theo bo mạch chủ & CPU</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={licenseStatus.hwid || 'Đang nhận diện...'}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-xs text-slate-800 tracking-wider focus:outline-none select-all shadow-2xs font-semibold"
              />
              <button
                type="button"
                onClick={handleCopyHwid}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition shrink-0 active:scale-95 shadow-2xs"
              >
                {copiedHwid ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sao chép</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              * Cung cấp mã định danh này cho Bộ phận Hỗ trợ Khách hàng hoặc Đại lý ủy quyền để nhận Key kích hoạt.
            </p>
          </div>

          {/* FORM NHẬP KEY: CHỈ HIỂN THỊ KHI CHƯA KÍCH HOẠT HOẶC KHI BẤM "CẬP NHẬT KHÓA KHÁC" */}
          {shouldShowForm && (
            <form onSubmit={handleActivate} className="space-y-3 pt-3 border-t border-slate-200">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-blue-600" />
                <span>Nhập Khóa Kích Hoạt Bản Quyền (License Key):</span>
              </label>

              <textarea
                rows={3}
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                placeholder="Dán chuỗi khóa bản quyền (ví dụ: VNLAN-KEY-ey...)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition resize-none"
              />

              {errorMsg && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">
                  Khóa được bảo vệ bằng chữ ký số bất đối xứng RSA
                </span>
                <button
                  type="submit"
                  disabled={submitting || !licenseKeyInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-sm cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang xác thực...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      <span>Kích Hoạt Ngay</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Hotline & Thông tin liên hệ hỗ trợ bản quyền B2B */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/60 p-3 rounded-xl border">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
              <span>Hotline Kỹ thuật: <strong className="text-slate-700">0962058362</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-emerald-600" />
              <span>Email: <strong className="text-slate-700">thvp.ndc@gmail.com</strong></span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Bản quyền giải pháp © 2026 VNLAN Inc. All rights reserved.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
