import React, { useState, useEffect } from 'react';
import TeacherDashboard from './components/teacher/TeacherDashboard';
import TeacherAuthGate from './components/teacher/TeacherAuthGate';
import StudentApp from './components/student/StudentApp';
import OnlineStudentPortal from './components/online/OnlineStudentPortal';
import LicenseLockScreen from './components/common/LicenseLockScreen';
import LicenseModal from './components/common/LicenseModal';
import { BookOpen, Laptop, Wifi, Shield, CheckCircle2, Award, Key } from 'lucide-react';

export default function App() {
  const isCloudMode = typeof window !== 'undefined' && (
    import.meta.env.VITE_APP_TARGET === 'cloud' ||
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('supabase')
  );

  const [role, setRole] = useState(() => {
    const path = window.location.pathname.toLowerCase();
    if (path.startsWith('/teacher')) return 'teacher';
    if (path.startsWith('/student')) return 'student';
    return isCloudMode ? 'student' : null; // Trên Cloud mặc định mở Cổng Thi Học Sinh
  });

  const [teacherToken, setTeacherToken] = useState(() => {
    return sessionStorage.getItem('lan_exam_teacher_token') || null;
  });

  const [serverInfo, setServerInfo] = useState(null);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);

  const fetchLicenseStatus = async () => {
    if (isCloudMode) return; // Môi trường Cloud bỏ qua kiểm tra phần cứng offline
    try {
      const res = await fetch('/api/license/status');
      const data = await res.json();
      if (data.success) {
        setLicenseStatus(data);
      }
    } catch (err) {
      console.error('Lỗi kiểm tra bản quyền:', err);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
  }, []);

  useEffect(() => {
    fetch('/api/system/info')
      .then(r => r.json())
      .then(d => { if (d.success) setServerInfo(d); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (teacherToken) {
      fetch('/api/auth/teacher-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: teacherToken })
      })
        .then(r => r.json())
        .then(d => {
          if (!d.authenticated) {
            sessionStorage.removeItem('lan_exam_teacher_token');
            setTeacherToken(null);
          }
        })
        .catch(console.error);
    }
  }, [teacherToken]);

  // NẾU BẢN QUYỀN HẾT HẠN HOẶC BỊ GIAN LẬN THỜI GIAN: KHÓA TOÀN BỘ HỆ THỐNG (Chỉ áp dụng Offline LAN)
  if (!isCloudMode && licenseStatus && (licenseStatus.is_expired || licenseStatus.is_tampered)) {
    return (
      <LicenseLockScreen
        licenseStatus={licenseStatus}
        onRefreshStatus={fetchLicenseStatus}
      />
    );
  }

  if (role === 'teacher') {
    if (!teacherToken) {
      return (
        <TeacherAuthGate
          onAuthenticated={(token) => {
            setTeacherToken(token);
          }}
          onBack={() => {
            window.history.pushState({}, '', '/');
            setRole(isCloudMode ? 'student' : null);
          }}
        />
      );
    }
    return (
      <TeacherDashboard
        licenseStatus={licenseStatus}
        onRefreshLicense={fetchLicenseStatus}
        onLogout={() => {
          sessionStorage.removeItem('lan_exam_teacher_token');
          setTeacherToken(null);
          window.history.pushState({}, '', '/');
          setRole(isCloudMode ? 'student' : null);
        }}
      />
    );
  }

  // Môi trường Cloud: Học sinh sử dụng Cổng thi Online tối ưu Mobile & Serverless
  if (isCloudMode || role === 'student') {
    return isCloudMode ? <OnlineStudentPortal /> : <StudentApp />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute w-96 h-96 bg-sky-600/10 rounded-full blur-3xl -top-20 -left-20 pointer-events-none"></div>
      <div className="absolute w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none"></div>

      <div className="max-w-xl w-full text-center space-y-8 relative z-10">
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> MÁY CHỦ MẠNG LAN HOẠT ĐỘNG TỐT
            </div>

            {/* Badge Bản quyền VNLAN */}
            {licenseStatus && (
              <button
                type="button"
                onClick={() => setIsLicenseModalOpen(true)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition hover:opacity-90 active:scale-95 ${
                  licenseStatus.is_licensed
                    ? 'bg-sky-950/80 border-sky-700 text-sky-400'
                    : 'bg-amber-950/80 border-amber-700 text-amber-400'
                }`}
                title="Nhấp để xem chi tiết bản quyền và kích hoạt"
              >
                <Award className="w-3.5 h-3.5" />
                <span>
                  {licenseStatus.is_licensed
                    ? `Bản Quyền: ${licenseStatus.client_name || 'Chính Thức'}`
                    : `Dùng thử (còn ${licenseStatus.days_left} ngày)`}
                </span>
                <Key className="w-3 h-3 ml-0.5 opacity-70" />
              </button>
            )}
          </div>
          <div className="flex justify-center pt-2 pb-1">
            <img 
              src="/vnlan-logo.png" 
              alt="VNLAN Logo" 
              className="h-20 sm:h-24 w-auto object-contain drop-shadow-md select-none brightness-105" 
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Hệ Thống Thi Trực Tuyến Mạng LAN Offline
          </h1>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Giải pháp tổ chức kiểm tra trắc nghiệm & tự luận ngoại tuyến (Offline) cho phòng máy trường học và trung tâm đào tạo
          </p>
        </div>

        {/* Server Info Banner */}
        {serverInfo && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-xs flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-2 font-mono">
              <Wifi className="w-4 h-4 text-sky-400" /> IP LAN Máy Chủ: <strong className="text-white text-sm">http://{serverInfo.serverIp}:{serverInfo.port}</strong>
            </span>
            <span className="text-slate-500">UDP Beacon: Port 41234</span>
          </div>
        )}

        {/* Role Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => {
              window.history.pushState({}, '', '/teacher');
              setRole('teacher');
            }}
            className="group bg-slate-900 border border-slate-800 hover:border-sky-500 rounded-2xl p-6 text-left transition-all duration-300 hover:shadow-xl hover:shadow-sky-500/10 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-white group-hover:text-sky-400 transition">Dành Cho Giáo Viên</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Soạn đề trắc nghiệm & tự luận, mở ca thi, giám sát trực tiếp 30-100 máy trạm, chấm tự luận và xuất Excel.
              </p>
            </div>
            <div className="mt-6 text-xs font-semibold text-sky-400 flex items-center gap-1">
              Truy cập bảng điều khiển ➔
            </div>
          </button>

          <button
            onClick={() => {
              window.history.pushState({}, '', '/student');
              setRole('student');
            }}
            className="group bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-2xl p-6 text-left transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/10 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <Laptop className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-white group-hover:text-emerald-400 transition">VNLAN - Cổng làm bài của học sinh</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Đăng nhập phòng thi, làm bài trắc nghiệm & soạn bài tự luận, đếm ngược thời gian, tự động lưu đáp án.
              </p>
            </div>
            <div className="mt-6 text-xs font-semibold text-emerald-400 flex items-center gap-1">
              Vào cổng làm bài ➔
            </div>
          </button>
        </div>

        {/* Feature Highlights */}
        <div className="pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400">
          <span className="flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" /> Trắc Nghiệm & Tự Luận
          </span>
          <span className="flex items-center justify-center gap-1">
            <Shield className="w-3.5 h-3.5 text-rose-400" /> Chống Gian Lận Kiosk
          </span>
          <span className="flex items-center justify-center gap-1">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" /> Tự Dò IP UDP Beacon
          </span>
        </div>
      </div>

      {/* Modal Quản lý và Kích hoạt bản quyền VNLAN */}
      <LicenseModal
        isOpen={isLicenseModalOpen}
        onClose={() => setIsLicenseModalOpen(false)}
        licenseStatus={licenseStatus}
        schoolInfo={serverInfo?.schoolInfo}
        onRefreshStatus={fetchLicenseStatus}
      />
    </div>
  );
}
