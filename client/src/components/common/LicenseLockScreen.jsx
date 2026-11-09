import React, { useState } from 'react';
import { Lock, ShieldAlert, Key, Copy, Check, RefreshCw, AlertCircle, PhoneCall, Mail } from 'lucide-react';

export default function LicenseLockScreen({ licenseStatus, onRefreshStatus }) {
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedHwid, setCopiedHwid] = useState(false);

  const handleCopyHwid = () => {
    if (licenseStatus?.hwid) {
      navigator.clipboard.writeText(licenseStatus.hwid);
      setCopiedHwid(true);
      setTimeout(() => setCopiedHwid(false), 2500);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!licenseKeyInput.trim()) {
      setErrorMsg('Vui lòng dán chuỗi License Key');
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
        throw new Error(data.message || 'Kích hoạt không thành công');
      }

      // Kích hoạt thành công -> reload lại trạng thái
      if (onRefreshStatus) {
        await onRefreshStatus();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isTampered = licenseStatus?.is_tampered;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Background glow */}
      <div className="absolute w-[500px] h-[500px] bg-rose-600/10 rounded-full blur-3xl top-1/4 left-1/2 -translate-x-1/2 pointer-events-none"></div>

      <div className="max-w-lg w-full bg-slate-900 border border-rose-900/50 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
        {/* Header Icon & Title */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/50">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <div className="inline-block px-3 py-1 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-semibold rounded-full uppercase tracking-wider">
              {isTampered ? 'Cảnh Báo Vi Phạm Bản Quyền' : 'Hết Hạn Dùng Thử 15 Ngày'}
            </div>
            <h1 className="text-2xl font-black text-white">
              Phần Mềm <span className="text-sky-400">VNLAN</span> Đã Bị Khóa
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              {isTampered
                ? 'Hệ thống phát hiện đồng hồ máy tính bị lùi hoặc can thiệp dữ liệu bản quyền. Toàn bộ tính năng đã tạm khóa để bảo vệ dữ liệu.'
                : 'Thời hạn 15 ngày trải nghiệm miễn phí đã kết thúc. Vui lòng kích hoạt bản quyền để tiếp tục sử dụng tất cả tính năng tổ chức thi và ngân hàng đề.'}
            </p>
          </div>
        </div>

        {/* HWID Box */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Mã Máy Chủ Của Bạn (Hardware ID):</span>
            <span className="text-[11px] text-slate-500">Gửi mã này cho tác giả</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={licenseStatus?.hwid || 'Đang tải...'}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 font-mono text-xs text-sky-400 font-bold tracking-wider select-all"
            />
            <button
              type="button"
              onClick={handleCopyHwid}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl flex items-center gap-1.5 text-xs font-medium transition shrink-0 active:scale-95"
            >
              {copiedHwid ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Đã chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Activation Form */}
        <form onSubmit={handleActivate} className="space-y-3">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-sky-400" />
            <span>Nhập Khóa Bản Quyền Kích Hoạt (License Key):</span>
          </label>
          <textarea
            rows={3}
            value={licenseKeyInput}
            onChange={(e) => setLicenseKeyInput(e.target.value)}
            placeholder="Dán chuỗi khóa bản quyền tác giả gửi tại đây..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition resize-none"
          />

          {errorMsg && (
            <div className="text-xs text-rose-400 bg-rose-950/60 border border-rose-800/80 p-3 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !licenseKeyInput.trim()}
            className="w-full py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-sky-950"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang kiểm tra chữ ký bản quyền...</span>
              </>
            ) : (
              <>
                <Key className="w-4 h-4" />
                <span>Kích Hoạt Bản Quyền & Mở Khóa Hệ Thống</span>
              </>
            )}
          </button>
        </form>

        {/* Hotline & Hỗ trợ kỹ thuật */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-3.5 h-3.5 text-sky-400" />
            <span>Hotline Kỹ thuật: <strong className="text-white">0962058362</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-emerald-400" />
            <span>Email: <strong className="text-white">thvp.ndc@gmail.com</strong></span>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500 pt-2 border-t border-slate-800/80">
          Hệ Thống Thi Trực Tuyến Mạng LAN Offline © 2026 <strong className="text-slate-400 font-semibold">VNLAN</strong>
        </div>
      </div>
    </div>
  );
}
