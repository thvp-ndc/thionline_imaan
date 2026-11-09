import React, { useState, useEffect, useRef } from 'react';
import ExamManager from './ExamManager';
import LiveMonitor from './LiveMonitor';
import EssayGrading from './EssayGrading';
import ResultsExport from './ResultsExport';
import StudentManager from './StudentManager';
import QuestionBankManager from './QuestionBankManager';
import ChangePasswordModal from './ChangePasswordModal';
import LicenseModal from '../common/LicenseModal';
import SchoolInfoModal from './SchoolInfoModal';
import { APP_VERSION_LABEL } from '../../config/version';
import { BookOpen, Laptop, FileEdit, Award, Wifi, Users, Globe, Copy, Check, Download, QrCode, X, KeyRound, Lock, Layers, ShieldCheck, Key, Building2, Edit2, ExternalLink, Database, Upload, FileText, Clock, BarChart3, HelpCircle } from 'lucide-react';

const VALID_TABS = ['questions', 'exams', 'sessions', 'reports', 'students'];

function getInitialTab() {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      if (tabParam === 'question_bank') return 'questions';
      if (tabParam === 'results') return 'reports';
      if (VALID_TABS.includes(tabParam)) return tabParam;
    }
    const saved = localStorage.getItem('vnlan_teacher_active_tab');
    if (saved) {
      if (saved === 'question_bank') return 'questions';
      if (saved === 'results') return 'reports';
      if (VALID_TABS.includes(saved)) return saved;
    }
  }
  return 'sessions'; // Mặc định mở Quản lý Ca thi
}

export default function TeacherDashboard({ onLogout, licenseStatus, onRefreshLicense }) {
  const [currentTab, setCurrentTab] = useState(getInitialTab); // 'questions', 'exams', 'sessions', 'reports', 'students', 'monitor', 'grading'
  const [activeSessionId, setActiveSessionId] = useState(null);

  const handleTabChange = (tab) => {
    setCurrentTab(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vnlan_teacher_active_tab', tab);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    }
  };

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && VALID_TABS.includes(tab)) {
        setCurrentTab(tab);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const [serverInfo, setServerInfo] = useState({ serverIp: '...', port: 3000 });
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(() => {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('lan_exam_must_change_pwd') === '1';
  });
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const restoreFileInputRef = useRef(null);

  const handleDownloadBackup = async () => {
    setBackupLoading(true);
    try {
      const token = sessionStorage.getItem('lan_exam_teacher_token');
      const res = await fetch('/api/system/backup', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Không thể tạo bản sao lưu');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VNLAN_Backup_CSDL_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Lỗi sao lưu hệ thống: ' + err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = (file) => {
    if (!file) return;
    if (!window.confirm(`⚠️ CẢNH BÁO KHÔI PHỤC DỮ LIỆU:\n\nBạn đang chuẩn bị khôi phục dữ liệu từ tệp:\n[${file.name}]\n\nToàn bộ cơ sở dữ liệu và hình ảnh hiện tại sẽ được thay thế bằng dữ liệu trong file sao lưu.\nBạn có chắc chắn muốn tiếp tục không?`)) {
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
      return;
    }

    setBackupLoading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result;
        const token = sessionStorage.getItem('lan_exam_teacher_token');
        const res = await fetch('/api/system/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ fileBase64: base64 })
        });
        const data = await res.json();
        if (data.success) {
          alert(`✅ KHÔI PHỤC THÀNH CÔNG:\n${data.message || 'Đã khôi phục toàn bộ CSDL và dữ liệu.'}\n\nHệ thống sẽ tải lại trang ngay bây giờ.`);
          window.location.reload();
        } else {
          alert('Lỗi khôi phục: ' + data.message);
        }
      } catch (err) {
        alert('Lỗi kết nối máy chủ khi khôi phục: ' + err.message);
      } finally {
        setBackupLoading(false);
        if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      alert('Không thể đọc file sao lưu.');
      setBackupLoading(false);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    fetch('/api/system/info')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setServerInfo(data);
          if (data.schoolInfo) setSchoolInfo(data.schoolInfo);
        }
      })
      .catch(console.error);

    fetch('/api/system/school-info')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.schoolInfo) {
          setSchoolInfo(data.schoolInfo);
        }
      })
      .catch(console.error);
  }, []);

  const handleSelectSessionForMonitor = (sessionId) => {
    setActiveSessionId(sessionId);
    setCurrentTab('monitor');
  };

  const handleOpenEssayGrading = (sessionId) => {
    setActiveSessionId(sessionId);
    setCurrentTab('grading');
  };

  const handleOpenResults = (sessionId) => {
    setActiveSessionId(sessionId);
    setCurrentTab('results');
  };

  const studentUrl = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? `${window.location.origin}/student`
    : `http://${serverInfo.serverIp || 'localhost'}:${serverInfo.port || 3000}/student`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(studentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [showAccountMenu, setShowAccountMenu] = useState(false);

  // Close account menu on click outside
  useEffect(() => {
    const handleOutside = (e) => {
      if (!e.target.closest('[data-account-menu]')) {
        setShowAccountMenu(false);
      }
    };
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased">
      {/* Top Navbar & Tab Menu Container (Cố định Hàng 1 và Hàng 2 tổng chiều cao 100px) */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-2xs print:hidden">
        {/* Hàng 1: SaaS Enterprise Standard (h-14 = 56px) */}
        <div className="border-b border-slate-100 px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Cột bên trái: Logo VNLAN mới + Text VNLAN (Bold) + Badge v1.0.0 Offline */}
        <div className="flex items-center gap-2.5 shrink-0">
          <img 
            src="/vnlan-icon.png" 
            alt="VNLAN" 
            className="w-8 h-8 object-contain select-none drop-shadow-2xs" 
          />
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 tracking-tight text-base">VNLAN</span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/80 font-mono">
              {APP_VERSION_LABEL}
            </span>
          </div>
        </div>

        {/* Cột giữa: Tên trường học gọn gàng, trang nhã + Icon bút chì mờ */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-slate-50/80 hover:bg-slate-100/70 border border-slate-200/70 rounded-lg max-w-sm lg:max-w-md truncate transition">
          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span 
            className="text-xs font-medium text-slate-700 truncate"
            title={schoolInfo?.school_name || 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH'}
          >
            {schoolInfo?.school_name || licenseStatus?.client_name || 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH'}
          </span>
          <button
            type="button"
            onClick={() => setShowSchoolModal(true)}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded transition cursor-pointer shrink-0"
            title="Chỉnh sửa thông tin trường học"
          >
            <Edit2 className="w-3 h-3" />
          </button>
        </div>

        {/* Cột bên phải: 1 Pill Badge duy nhất cho mạng LAN + Nút Phòng Thi + Avatar GV tối giản */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Pill Badge duy nhất: Chấm tròn xanh animate-pulse + IP (LAN Active) */}
          <div className="relative group">
            <div
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100/90 border border-slate-200/90 rounded-full text-xs font-mono text-slate-700 transition cursor-pointer select-none shadow-2xs"
              title="Nhấp để sao chép địa chỉ phòng thi học sinh"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-medium text-slate-700 text-xs">
                {serverInfo.serverIp || '192.168.1.13'} <span className="text-emerald-700 font-semibold">(LAN Active)</span>
              </span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 animate-fadeIn" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
              )}
            </div>

            {/* Tooltip khi hover hiển thị đầy đủ thông tin link */}
            <div className="absolute right-0 top-full mt-2 hidden group-hover:flex flex-col bg-white text-slate-800 text-xs rounded-xl py-2 px-3 shadow-xl whitespace-nowrap z-50 border border-slate-200 animate-fadeIn pointer-events-none">
              <div className="flex items-center gap-2 text-slate-700">
                <span className="text-slate-500">Máy chủ IP:</span>
                <strong className="text-emerald-700 font-mono">{serverInfo.serverIp}:{serverInfo.port || 3000}</strong>
              </div>
              <div className="flex items-center gap-2 text-slate-700 mt-1">
                <span className="text-slate-500">Địa chỉ làm bài:</span>
                <strong className="text-blue-700 font-mono">{studentUrl}</strong>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 pt-1 border-t border-slate-100 text-center font-medium">
                Nhấp chuột để sao chép link học sinh
              </div>
            </div>
          </div>

          {/* Màn hình thí sinh */}
          <a
            href="/student"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition font-medium shadow-2xs"
            title="Mở giao diện phòng thi của học sinh (để kiểm tra hoặc trình chiếu)"
          >
            <span>Phòng Thi</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>

          {/* Avatar GV Dropdown tối giản */}
          <div className="relative" data-account-menu>
            <button
              onClick={() => setShowAccountMenu(prev => !prev)}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200/80 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 transition cursor-pointer shadow-2xs"
              title="Tài khoản & Thiết lập"
            >
              GV
            </button>

            {showAccountMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-fadeIn divide-y divide-slate-100">
                <div className="px-3.5 py-2.5 bg-slate-50/50">
                  <div className="text-xs font-bold text-slate-800">Quản Trị Giáo Viên</div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">{serverInfo.serverIp}:{serverInfo.port || 3000}</div>
                  <div className="text-[11px] text-blue-600 font-medium truncate mt-0.5">
                    {schoolInfo?.school_name || licenseStatus?.client_name || 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH'}
                  </div>
                </div>

                <div className="py-1">
                  {/* Bản Quyền VNLAN nằm bên trong Menu Dropdown */}
                  <button
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowLicenseModal(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:text-blue-700 hover:bg-blue-50/60 flex items-center justify-between transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className={`w-3.5 h-3.5 ${licenseStatus?.is_licensed ? 'text-emerald-600' : 'text-amber-500'}`} />
                      <span className="font-medium">Thông Tin Bản Quyền</span>
                    </div>
                    {licenseStatus && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                        licenseStatus.is_licensed
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {licenseStatus.is_licensed ? 'Active' : `${licenseStatus.days_left} ngày`}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowSchoolModal(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition cursor-pointer"
                  >
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Cấu Hình Thông Tin Trường</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowPasswordModal(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                    <span>Đổi Mật Khẩu Quản Trị</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowAccountMenu(false);
                      handleDownloadBackup();
                    }}
                    disabled={backupLoading}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition cursor-pointer"
                    title="Đóng gói toàn bộ CSDL và hình ảnh ra file .zip để lưu vào USB"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>{backupLoading ? 'Đang xuất sao lưu...' : 'Sao Lưu CSDL Ra USB (.zip)'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowAccountMenu(false);
                      if (restoreFileInputRef.current) restoreFileInputRef.current.click();
                    }}
                    disabled={backupLoading}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition cursor-pointer"
                    title="Nạp file sao lưu .zip từ USB để khôi phục lại đề thi và điểm số"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{backupLoading ? 'Đang xử lý...' : 'Phục Hồi CSDL Từ Bản Sao Lưu'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowDomainModal(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tên Miền & Mã QR Thi</span>
                  </button>
                </div>

                {onLogout && (
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowAccountMenu(false);
                        if (window.confirm('Thầy/Cô có muốn khóa phân hệ giáo viên và đăng xuất không?')) {
                          onLogout();
                        }
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 flex items-center gap-2 transition font-medium cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-rose-500" />
                      <span>Khóa Phân Hệ & Đăng Xuất</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Hàng 2: Sub-Navbar Navigation Tabs (h-11 = 44px) */}
        <div className="px-4 sm:px-6 h-11 flex items-center bg-white border-b border-slate-200/60">
          <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-4">
            <nav className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none text-xs font-medium">
              {/* 1. Ngân Hàng Câu Hỏi */}
              <button
                onClick={() => handleTabChange('questions')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  currentTab === 'questions'
                    ? 'bg-slate-100 text-blue-700 font-bold border border-slate-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Ngân Hàng Câu Hỏi</span>
              </button>

              {/* 2. Đề Thi */}
              <button
                onClick={() => handleTabChange('exams')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  currentTab === 'exams'
                    ? 'bg-slate-100 text-blue-700 font-bold border border-slate-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Đề Thi</span>
              </button>

              {/* 3. Quản Lý Ca Thi */}
              <button
                onClick={() => handleTabChange('sessions')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  currentTab === 'sessions'
                    ? 'bg-slate-100 text-blue-700 font-bold border border-slate-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Quản Lý Ca Thi</span>
              </button>

              {/* 4. Báo Cáo & Điểm Số */}
              <button
                onClick={() => handleTabChange('reports')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  currentTab === 'reports'
                    ? 'bg-slate-100 text-blue-700 font-bold border border-slate-200/90 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Báo Cáo & Điểm Số</span>
              </button>
            </nav>

            {/* Nút phụ góc phải: [👥 Danh Sách Lớp & Học Sinh] */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleTabChange('students')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer text-xs font-semibold ${
                  currentTab === 'students'
                    ? 'bg-slate-100 text-blue-700 border border-slate-300 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/80 shadow-2xs'
                }`}
                title="Quản lý danh sách lớp học, số báo danh và học sinh"
              >
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>👥 Danh Sách Lớp & Học Sinh</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pb-6 pt-0">
        {currentTab === 'questions' && (
          <QuestionBankManager
            onNavigateToExams={() => handleTabChange('exams')}
          />
        )}
        {currentTab === 'exams' && (
          <ExamManager
            mode="exams"
            onSelectSessionForMonitor={handleSelectSessionForMonitor}
            onSelectSessionForResults={handleOpenResults}
            onOpenEssayGrading={handleOpenEssayGrading}
          />
        )}
        {currentTab === 'sessions' && (
          <ExamManager
            mode="sessions"
            onSelectSessionForMonitor={handleSelectSessionForMonitor}
            onSelectSessionForResults={handleOpenResults}
            onOpenEssayGrading={handleOpenEssayGrading}
          />
        )}
        {currentTab === 'students' && (
          <StudentManager />
        )}
        {currentTab === 'monitor' && activeSessionId && (
          <LiveMonitor
            sessionId={activeSessionId}
            onBack={() => handleTabChange('sessions')}
            onOpenEssayGrading={handleOpenEssayGrading}
            onOpenResults={handleOpenResults}
          />
        )}
        {currentTab === 'grading' && activeSessionId && (
          <EssayGrading
            sessionId={activeSessionId}
            onBack={() => setCurrentTab('monitor')}
            onOpenResults={handleOpenResults}
          />
        )}
        {currentTab === 'reports' && (
          <ResultsExport
            sessionId={activeSessionId}
            onSelectSession={(id) => setActiveSessionId(id)}
            onBack={() => handleTabChange('sessions')}
            onOpenEssayGrading={handleOpenEssayGrading}
          />
        )}
      </main>

      {/* Modal Tên Miền & Lối Tắt Phòng Thi */}
      {showDomainModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-800">
            <button
              onClick={() => setShowDomainModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Địa Chỉ Đăng Nhập Của Học Sinh</h3>
                <p className="text-xs text-slate-500">Đường dẫn kết nối trong mạng LAN phòng máy (theo trình duyệt/IP máy chủ)</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Đường dẫn học sinh gõ trên trình duyệt:
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    readOnly
                    value={studentUrl}
                    className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-blue-700 font-mono font-bold text-sm focus:outline-none select-all shadow-2xs"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Đã chép' : 'Sao chép'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  💡 Học sinh trên các máy con chỉ cần mở trình duyệt (Chrome, Edge, Cốc Cốc) và truy cập địa chỉ trên để vào phòng làm bài.
                </p>
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <div className="font-bold flex items-center gap-1.5 text-amber-900 mb-1">
                  ⚠️ Nếu máy học sinh không kết nối được:
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800/90 mb-2">
                  Do Tường lửa (Windows Firewall) trên máy giáo viên đang chặn kết nối ngoài vào. Vui lòng tải và nhấp đúp file bên dưới trên máy giáo viên:
                </p>
                <a
                  href="/api/system/download-firewall-fix"
                  download="MoKhoaTuongLua_ChoPhepMayHocSinh.bat"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow-xs transition"
                >
                  <Download className="w-3.5 h-3.5" /> Tải File Mở Khóa Tường Lửa (1-Click)
                </a>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">
                  Tải file Lối Tắt cài sẵn cho máy học sinh (1-Click):
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <a
                    href="/api/system/download-launcher"
                    download="ThiOnline.html"
                    className="p-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition flex items-center gap-2.5 group shadow-2xs"
                  >
                    <Download className="w-4 h-4 text-blue-600 group-hover:scale-110 transition" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">File ThiOnline.html</div>
                      <div className="text-[10px] text-slate-500">Tự động dò IP & mở thi</div>
                    </div>
                  </a>

                  <a
                    href="/api/system/download-bat"
                    download="CaiDatPhongMay.bat"
                    className="p-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition flex items-center gap-2.5 group shadow-2xs"
                  >
                    <Download className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">File Cài Đặt Desktop .bat</div>
                      <div className="text-[10px] text-slate-500">Tạo icon Desktop máy con</div>
                    </div>
                  </a>
                </div>
              </div>

              <div className="text-center pt-2">
                <button
                  onClick={() => setShowDomainModal(false)}
                  className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Đóng Cửa Sổ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input phục vụ Khôi Phục CSDL từ USB */}
      <input
        type="file"
        ref={restoreFileInputRef}
        accept=".zip"
        onChange={(e) => handleRestoreBackup(e.target.files?.[0])}
        className="hidden"
      />

      {/* Modal Đổi Mật Khẩu Quản Trị */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          sessionStorage.removeItem('lan_exam_must_change_pwd');
        }}
        onSuccess={() => {
          setShowPasswordModal(false);
          sessionStorage.removeItem('lan_exam_must_change_pwd');
        }}
      />

      {/* Modal Quản Lý & Kích Hoạt Bản Quyền VNLAN */}
      <LicenseModal
        isOpen={showLicenseModal}
        onClose={() => setShowLicenseModal(false)}
        licenseStatus={licenseStatus}
        schoolInfo={schoolInfo}
        onRefreshStatus={onRefreshLicense}
      />

      {/* Modal Cấu Hình Thông Tin Trường Học */}
      <SchoolInfoModal
        isOpen={showSchoolModal}
        onClose={() => setShowSchoolModal(false)}
        onSaved={(newInfo) => {
          setSchoolInfo(newInfo);
          if (typeof onRefreshLicense === 'function') onRefreshLicense();
        }}
      />
    </div>
  );
}

