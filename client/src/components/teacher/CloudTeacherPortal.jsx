import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  ShieldCheck, 
  Database, 
  ArrowLeft, 
  LogOut, 
  RefreshCw, 
  CheckCircle2, 
  Users, 
  Laptop, 
  Server, 
  ExternalLink,
  BookOpen,
  Info
} from 'lucide-react';

export default function CloudTeacherPortal({ onLogout, onSwitchToStudent }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState({ online: true, checkedAt: new Date().toLocaleTimeString('vi-VN') });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-30 backdrop-blur-md px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-bold">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-white text-base sm:text-lg">VNLAN Cloud Admin</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  SERVERLESS ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">Trung tâm Điều phối & Cổng Thi Trực Tuyến Học Sinh</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onSwitchToStudent}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5"
              title="Chuyển sang giao diện Cổng thi học sinh"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Cổng Thi Học Sinh</span>
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/80 text-rose-300 text-xs font-medium transition flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Đăng Xuất</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Hạ Tầng Điện Toán</div>
              <div className="text-sm font-bold text-white mt-0.5">Vercel Edge Functions</div>
              <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3 h-3" /> Hoạt động 24/7 (0đ/Free Tier)
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Cơ Sở Dữ Liệu</div>
              <div className="text-sm font-bold text-white mt-0.5">Supabase PostgreSQL + RLS</div>
              <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3 h-3" /> Bảo mật Row Level Security
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Bảo Mật Đề & Chấm Điểm</div>
              <div className="text-sm font-bold text-white mt-0.5">@vnlan/core Server-Side</div>
              <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3 h-3" /> Tách biệt đáp án 100%
              </div>
            </div>
          </div>
        </div>

        {/* Operating Instructions */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white">Quy Trình Vận Hành Thi Trực Tuyến Chuẩn (Solo Teacher)</h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Hệ thống áp dụng mô hình <strong>Hybrid Cloud</strong>: Toàn bộ việc quản lý đề thi, ngân hàng câu hỏi, trộn đề và in bảng điểm được thực hiện trên <strong>phần mềm VNLAN máy tính của Thầy/Cô (Offline)</strong>. Cổng Vercel này đóng vai trò tiếp nhận bài thi của học sinh trên điện thoại hoặc máy tính ở nhà.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-[10px]">1</span>
                Đẩy Đề Lên Cloud
              </div>
              <p className="text-[12px] text-slate-400 leading-normal">
                Trên máy bàn giáo viên, mở Ca thi cần tổ chức và bấm nút <strong>"Đẩy ca thi lên Cloud"</strong>.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px]">2</span>
                Học Sinh Làm Bài
              </div>
              <p className="text-[12px] text-slate-400 leading-normal">
                Học sinh truy cập trang web này, nhập Số báo danh và Mã ca thi để làm bài. Bài nộp được Serverless tự chấm ngay lập tức.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[10px]">3</span>
                Kéo Kết Quả Về
              </div>
              <p className="text-[12px] text-slate-400 leading-normal">
                Trên máy bàn giáo viên, bấm <strong>"Kéo bài từ Cloud về máy bàn"</strong>. Hệ thống tự động ghi nhận vào SQLite để xuất bảng điểm.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Thầy/Cô muốn học sinh bắt đầu làm bài kiểm tra?</span>
          </div>
          <button
            onClick={onSwitchToStudent}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20"
          >
            <span>Mở Cổng Thi Học Sinh</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </main>
    </div>
  );
}
