import React, { useState, useEffect } from 'react';
import { Laptop, ShieldCheck, UserCheck, KeyRound, AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

export default function StudentLogin({ onLoginSuccess }) {
  const [sessionCode, setSessionCode] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState('');
  const [isAutoIdentified, setIsAutoIdentified] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDeviceLocked, setIsDeviceLocked] = useState(false);
  const [lockedIp, setLockedIp] = useState('');
  const [requestStatus, setRequestStatus] = useState(''); // '' | 'sent_swap' | 'sent_wrong'
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [vieKeyboardDetected, setVieKeyboardDetected] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState(null);

  useEffect(() => {
    fetch('/api/system/school-info')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.schoolInfo) setSchoolInfo(d.schoolInfo);
      })
      .catch(() => {});
  }, []);

  // Tự động chuyển đổi số bị gõ thành chữ do bàn phím tiếng Việt VIE của Windows
  const cleanVieNumbers = (str) => {
    if (!str) return '';
    const hasVie = /[ăắằẳẵặâấầẩẫậêếềểễệôốồổỗộđĐ]/i.test(str);
    if (hasVie) {
      setVieKeyboardDetected(true);
    }
    return str
      .replace(/[ăắằẳẵặ]/gi, '1')
      .replace(/[âấầẩẫậ]/gi, '2')
      .replace(/[êếềểễệ]/gi, '3')
      .replace(/[ôốồổỗộ]/gi, '4')
      .replace(/[đĐ]/gi, '0');
  };

  // Auto-lookup student details when SBD is typed
  useEffect(() => {
    const code = studentCode.trim().toUpperCase();
    if (!code) {
      setIsAutoIdentified(false);
      setIsSearching(false);
      setNotFound(false);
      setStudentName('');
      setClassName('');
      return;
    }

    setIsSearching(true);
    setNotFound(false);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/students/lookup/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.success && data.found && data.student) {
          setStudentName(data.student.student_name || '');
          setClassName(data.student.class_name || '');
          setIsAutoIdentified(true);
          setNotFound(false);
          setError('');
        } else {
          setIsAutoIdentified(false);
          setNotFound(true);
        }
      } catch (e) {
        setIsAutoIdentified(false);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [studentCode]);

  const requestBrowserFullscreen = async () => {
    try {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request bypassed:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!sessionCode.trim() || !studentCode.trim()) {
      setError('Vui lòng điền đầy đủ Mã ca thi và Số báo danh.');
      return;
    }

    // Trigger fullscreen directly on user click gesture
    await requestBrowserFullscreen();

    try {
      setLoading(true);
      setError('');
      setIsDeviceLocked(false);
      setRequestStatus('');

      const res = await fetch('/api/student/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: sessionCode.trim().toUpperCase(),
          studentCode: studentCode.trim().toUpperCase(),
          studentName: studentName.trim(),
          className: className.trim().toUpperCase()
        })
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Không thể đăng nhập vào ca thi.');
        setIsDeviceLocked(Boolean(data.isDeviceLocked));
        setLockedIp(data.lockedIp || '');
        return;
      }

      // Reinforce fullscreen
      await requestBrowserFullscreen();
      onLoginSuccess(data);
    } catch (err) {
      setError('Không thể kết nối đến máy chủ mạng LAN: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeviceSwap = async () => {
    try {
      setIsSendingRequest(true);
      const res = await fetch('/api/student/request-device-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: sessionCode.trim().toUpperCase(),
          studentCode: studentCode.trim().toUpperCase(),
          studentName: studentName.trim()
        })
      });
      const d = await res.json();
      if (d.success) {
        setRequestStatus('sent_swap');
      } else {
        alert(d.message || 'Lỗi gửi yêu cầu');
      }
    } catch (e) {
      alert('Lỗi kết nối máy chủ: ' + e.message);
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleReportWrongLogin = async () => {
    try {
      setIsSendingRequest(true);
      const res = await fetch('/api/student/report-wrong-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: sessionCode.trim().toUpperCase(),
          studentCode: studentCode.trim().toUpperCase(),
          studentName: studentName.trim(),
          lockedIp
        })
      });
      const d = await res.json();
      if (d.success) {
        setRequestStatus('sent_wrong');
      } else {
        alert(d.message || 'Lỗi gửi báo cáo');
      }
    } catch (e) {
      alert('Lỗi kết nối máy chủ: ' + e.message);
    } finally {
      setIsSendingRequest(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 select-none relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-3xl -top-32 -left-32 pointer-events-none"></div>
      <div className="absolute w-[500px] h-[500px] bg-indigo-400/10 rounded-full blur-3xl -bottom-32 -right-32 pointer-events-none"></div>

      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-9 shadow-xl relative z-10">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <img 
              src="/vnlan-logo.png" 
              alt="VNLAN Logo" 
              className="h-16 w-auto object-contain drop-shadow-sm select-none" 
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            <span className="text-blue-600">VNLAN</span> - Cổng làm bài của học sinh
          </h1>
          {schoolInfo?.school_name && (
            <div className="text-xs font-bold text-blue-700 tracking-wide uppercase mt-1">
              {schoolInfo.school_name}
            </div>
          )}
          <p className="text-slate-500 text-xs mt-1 font-medium">Hệ Thống Khảo Thí Mạng Cục Bộ LAN Offline</p>
        </div>

        {vieKeyboardDetected && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
            <div>
              <div className="font-bold text-amber-950">Phát hiện bàn phím tiếng Việt Windows (VIE)!</div>
              <div className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                Hệ thống đã tự sửa các ký tự <strong className="text-slate-900">ă, â, ê...</strong> thành số <strong className="text-slate-900">1, 2, 3...</strong>. Bạn nên nhấn tổ hợp phím <kbd className="px-1.5 py-0.5 bg-amber-100 border border-amber-300 rounded text-amber-900 font-mono font-bold">Win + Space</kbd> để chuyển sang bàn phím <strong>ENG</strong>.
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Hộp Thoại Hỗ Trợ Xử Lý Khóa Thiết Bị / Đổi Máy / Trùng SBD */}
        {isDeviceLocked && (
          <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs space-y-3 animate-fadeIn">
            <div className="flex items-center gap-2 text-amber-950 font-bold text-xs uppercase tracking-wide">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <span>Hỗ Trợ Xử Lý Sự Cố Đăng Nhập</span>
            </div>
            <p className="text-amber-900 text-[11px] leading-relaxed">
              Tài khoản SBD <strong className="text-slate-900 font-mono font-bold">{studentCode}</strong> đang được ghi nhận tại máy khác 
              {lockedIp ? <span className="font-mono text-slate-900 font-bold"> ({lockedIp})</span> : ''}.
              Vui lòng chọn tình huống của em bên dưới để báo Giám thị:
            </p>

            {requestStatus === 'sent_swap' ? (
              <div className="p-2.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl font-bold flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Đã gửi yêu cầu Đổi Máy! Vui lòng chờ Giám thị duyệt rồi bấm "Vào Phòng Thi & Làm Bài" lại.</span>
              </div>
            ) : requestStatus === 'sent_wrong' ? (
              <div className="p-2.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl font-bold flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Đã báo Giám thị có bạn nhập nhầm SBD! Giám thị sẽ đá máy nhầm ra và mở khóa cho em ngay.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSendingRequest}
                  onClick={handleRequestDeviceSwap}
                  className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Máy cũ của em bị đơ/mất nguồn, em xin chuyển sang máy này"
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>Máy Cũ Bị Treo (Đổi Máy)</span>
                </button>
                <button
                  type="button"
                  disabled={isSendingRequest}
                  onClick={handleReportWrongLogin}
                  className="w-full py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Em chưa từng ngồi máy đó, có bạn khác đã gõ nhầm SBD của em"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Bạn Khác Nhập Nhầm SBD</span>
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Mã Ca Thi (Phòng Thi)</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="text"
                value={sessionCode}
                onChange={e => setSessionCode(cleanVieNumbers(e.target.value).toUpperCase())}
                placeholder="Nhập mã ca thi..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-3 text-slate-900 font-mono font-bold uppercase focus:border-blue-500 focus:bg-white focus:outline-none text-sm placeholder:text-slate-400 transition shadow-2xs"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Số Báo Danh (SBD)</label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="text"
                value={studentCode}
                onChange={e => setStudentCode(cleanVieNumbers(e.target.value).toUpperCase())}
                placeholder="Nhập số báo danh..."
                className={`w-full bg-slate-50 border ${isAutoIdentified ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20' : 'border-slate-200'} rounded-xl py-3 pl-10 pr-10 text-slate-900 font-mono font-bold uppercase focus:border-blue-500 focus:bg-white focus:outline-none text-sm placeholder:text-slate-400 transition shadow-2xs`}
                required
              />
              {isSearching && (
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin absolute right-3 top-3.5" />
              )}
              {isAutoIdentified && !isSearching && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-3 top-3.5" />
              )}
            </div>

            {/* Thông tin học sinh tự động nhận diện */}
            {isAutoIdentified && (
              <div className="mt-2.5 p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl animate-fadeIn">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-1">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                  <span>Xác nhận thông tin thí sinh:</span>
                </div>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2 pl-5">
                  <span className="text-base text-emerald-950 font-bold">{studentName}</span>
                  {className && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs rounded-md border border-emerald-200 font-bold">
                      Lớp {className}
                    </span>
                  )}
                </div>
              </div>
            )}

            {notFound && !isSearching && (
              <div className="mt-2 text-xs text-amber-700 pl-1 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
                <span>Không tìm thấy SBD trong danh sách học sinh. Vui lòng kiểm tra lại.</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Đang xác thực...' : 'Vào Phòng Thi & Làm Bài'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Chế độ Kiosk bảo mật phòng máy
          </span>
          <span className="text-slate-400">Khóa Alt+Tab & Win Key</span>
        </div>
      </div>
    </div>
  );
}
