import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Eye, EyeOff, ArrowLeft, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function TeacherAuthGate({ onAuthenticated, onBack }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Vui lòng nhập mật khẩu quản trị!');
      triggerShake();
      return;
    }

    setLoading(true);
    setError('');

    try {
      let res = await fetch('/api/auth/teacher-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() })
      });

      // Hỗ trợ môi trường Cloud (Vercel Serverless API /api/auth/teacher)
      if (res.status === 404) {
        res = await fetch('/api/auth/teacher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode: password.trim() })
        });
      }

      const data = await res.json();

      if (res.ok && data.success) {
        sessionStorage.setItem('lan_exam_teacher_token', data.token);
        if (data.mustChangePassword) {
          sessionStorage.setItem('lan_exam_must_change_pwd', '1');
        } else {
          sessionStorage.removeItem('lan_exam_must_change_pwd');
        }
        if (onAuthenticated) {
          onAuthenticated(data.token);
        }
      } else {
        setError(data.message || 'Mật khẩu quản trị không chính xác!');
        triggerShake();
        if (inputRef.current) {
          inputRef.current.select();
        }
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại mạng!');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute w-[500px] h-[500px] bg-blue-100/60 rounded-full blur-3xl -top-32 -left-32 pointer-events-none"></div>
      <div className="absolute w-[500px] h-[500px] bg-indigo-100/50 rounded-full blur-3xl -bottom-32 -right-32 pointer-events-none"></div>

      <div className="max-w-md w-full relative z-10">
        {/* Card Box */}
        <div
          className={`bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 backdrop-blur-md transition-transform duration-200 ${
            shake ? 'animate-shake' : ''
          }`}
        >
          {/* Header Icon */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center mb-4">
              <img 
                src="/vnlan-icon.png" 
                alt="VNLAN Icon" 
                className="w-16 h-16 object-contain drop-shadow-sm select-none" 
              />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Xác Thực Quyền Giáo Viên
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-1.5 leading-relaxed">
              Vui lòng nhập mật khẩu quản trị để truy cập phân hệ giáo viên và quản lý đề thi.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Mật Khẩu Quản Trị
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Nhập mật khẩu..."
                  className="w-full pl-10 pr-11 py-3 bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl text-slate-800 text-sm placeholder-slate-400 outline-none transition font-medium shadow-2xs"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <span className="leading-snug font-medium">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-blue-600/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Xác Nhận Truy Cập</span>
                </>
              )}
            </button>
          </form>

          {/* Helper notice */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center text-xs text-slate-500 leading-relaxed">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-slate-600">
              💡 Mật khẩu mặc định ban đầu: <strong className="text-blue-600 font-mono text-sm select-all font-bold">admin123</strong>
              <div className="text-[11px] text-slate-400 mt-1">
                (Thầy/Cô có thể đổi mật khẩu bất kỳ lúc nào trong Bảng điều khiển)
              </div>
            </div>
          </div>

          {/* Back Button */}
          {onBack && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition py-1.5 px-3 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Quay lại trang chủ
              </button>
            </div>
          )}
        </div>

        {/* Security badge at bottom */}
        <div className="mt-4 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span>Bảo mật hệ thống phòng thi mạng LAN VNLAN Enterprise</span>
        </div>
      </div>
    </div>
  );
}
