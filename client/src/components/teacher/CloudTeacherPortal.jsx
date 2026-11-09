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
  Server, 
  Plus,
  Play,
  Pause,
  Trash2,
  FileSpreadsheet,
  Download,
  PenTool,
  Award,
  Sparkles,
  Copy,
  Check,
  ChevronRight,
  HelpCircle,
  Clock,
  BookOpen,
  Eye,
  AlertCircle
} from 'lucide-react';

export default function CloudTeacherPortal({ onLogout, onSwitchToStudent }) {
  const [activeTab, setActiveTab] = useState('sessions'); // 'sessions' | 'submissions' | 'grading' | 'kv-guide'
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [storageStatus, setStorageStatus] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  // Modal tạo ca thi
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('Tin học');
  const [newDuration, setNewDuration] = useState(45);
  const [newQuestions, setNewQuestions] = useState([
    {
      id: 'q1',
      type: 'single_choice',
      content: 'CPU là viết tắt của cụm từ nào sau đây?',
      options: [
        { id: 'A', text: 'Central Processing Unit' },
        { id: 'B', text: 'Central Program Unit' },
        { id: 'C', text: 'Computer Personal Unit' },
        { id: 'D', text: 'Control Processing Unit' }
      ],
      correct_answer: 'A',
      max_score: 2.0
    },
    {
      id: 'q2',
      type: 'essay',
      content: 'Hãy nêu ý nghĩa của việc sao lưu dữ liệu thường xuyên trên máy tính cá nhân?',
      max_score: 8.0
    }
  ]);

  // Modal chấm tự luận
  const [selectedSubForGrading, setSelectedSubForGrading] = useState(null);
  const [essayScoreInput, setEssayScoreInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

  const token = localStorage.getItem('vnlan_teacher_token') || '';

  // 1. Tải danh sách ca thi & trạng thái Vercel KV
  const loadData = async () => {
    setLoading(true);
    try {
      // Tải danh sách ca thi
      const res = await fetch('/api/teacher?action=sessions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
        if (!selectedSessionId && data.sessions.length > 0) {
          setSelectedSessionId(data.sessions[0].id);
        }
      }

      // Tải trạng thái storage
      const statusRes = await fetch('/api/teacher?action=storage_status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const statusData = await statusRes.json();
      if (statusData.success) {
        setStorageStatus(statusData);
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 2. Tải danh sách bài nộp của ca thi đang chọn
  const loadSubmissions = async (sessionId) => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/teacher?action=submissions&session_id=${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.submissions)) {
        setSubmissions(data.submissions);
      }
    } catch (err) {
      console.error('Lỗi tải bài nộp:', err);
    }
  };

  useEffect(() => {
    if (selectedSessionId) {
      loadSubmissions(selectedSessionId);
    }
  }, [selectedSessionId]);

  // Bật/tắt ca thi
  const handleToggleSession = async (sId, currentStatus) => {
    try {
      const nextStatus = currentStatus === 'active' ? 'closed' : 'active';
      const res = await fetch('/api/teacher?action=toggle_session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: sId, status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        setSessions(sessions.map(s => s.id === sId ? { ...s, status: nextStatus } : s));
        setStatusMsg({ type: 'success', text: `Đã ${nextStatus === 'active' ? 'mở' : 'đóng'} ca thi ${sId}!` });
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } catch (err) {
      alert('Lỗi thao tác ca thi: ' + err.message);
    }
  };

  // Xóa ca thi
  const handleDeleteSession = async (sId) => {
    if (!window.confirm(`Thầy/Cô có chắc chắn muốn xóa ca thi [${sId}]?`)) return;
    try {
      const res = await fetch('/api/teacher?action=delete_session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: sId })
      });
      const data = await res.json();
      if (data.success) {
        setSessions(sessions.filter(s => s.id !== sId));
        if (selectedSessionId === sId) {
          setSelectedSessionId(sessions.find(s => s.id !== sId)?.id || '');
        }
        setStatusMsg({ type: 'success', text: 'Đã xóa ca thi thành công!' });
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } catch (err) {
      alert('Lỗi xóa ca thi: ' + err.message);
    }
  };

  // Tạo ca thi mới
  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      alert('Vui lòng nhập tên ca thi!');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/teacher?action=create_session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          subject_name: newSubject.trim(),
          duration_minutes: Number(newDuration),
          questions: newQuestions
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewTitle('');
        await loadData();
        setSelectedSessionId(data.sessionId);
        setStatusMsg({ type: 'success', text: `Tạo ca thi mới thành công! Mã ca thi: ${data.sessionId}` });
        setTimeout(() => setStatusMsg(null), 4000);
      } else {
        alert(data.error || 'Có lỗi xảy ra khi tạo ca thi!');
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Nạp đề thi mẫu 2025
  const handleSeedSample = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/teacher?action=seed_sample', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        await loadData();
        setSelectedSessionId('DEMO2025');
        setStatusMsg({ type: 'success', text: 'Đã nạp đề mẫu 2025 (Mã ca: DEMO2025) thành công!' });
        setTimeout(() => setStatusMsg(null), 4000);
      }
    } catch (err) {
      alert('Lỗi nạp đề mẫu: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Lưu điểm chấm tự luận
  const handleSaveEssayGrade = async () => {
    if (!selectedSubForGrading) return;
    const scoreNum = parseFloat(essayScoreInput);
    if (isNaN(scoreNum) || scoreNum < 0) {
      alert('Vui lòng nhập số điểm tự luận hợp lệ!');
      return;
    }

    try {
      const res = await fetch('/api/teacher?action=grade_essay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          session_id: selectedSessionId,
          student_code: selectedSubForGrading.student_code,
          essay_score: scoreNum,
          teacher_feedback: feedbackInput
        })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedSubForGrading(null);
        await loadSubmissions(selectedSessionId);
        setStatusMsg({ type: 'success', text: `Đã chấm xong bài học sinh ${selectedSubForGrading.student_code}! Điểm mới: ${data.newScore}` });
        setTimeout(() => setStatusMsg(null), 4000);
      } else {
        alert(data.error || 'Lỗi khi lưu điểm tự luận!');
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + err.message);
    }
  };

  // Xuất bảng điểm Excel (CSV UTF-8 với BOM)
  const handleExportCSV = () => {
    if (submissions.length === 0) {
      alert('Chưa có bài nộp nào để xuất bảng điểm!');
      return;
    }
    const currentSession = sessions.find(s => s.id === selectedSessionId);
    const sessionName = currentSession ? currentSession.title : selectedSessionId;

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += `BẢNG ĐIỂM CA THI: ${sessionName}\n`;
    csvContent += `Mã ca thi: ${selectedSessionId} - Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}\n\n`;
    csvContent += 'STT,Số Báo Danh,Điểm Trắc Nghiệm,Điểm Tự Luận,Tổng Điểm (Thang 10),Thời Gian Nộp,Nhận Xét Giáo Viên\n';

    submissions.forEach((sub, idx) => {
      const mcq = sub.mcq_score !== undefined ? sub.mcq_score : (sub.score || 0);
      const essay = sub.essay_score !== undefined ? sub.essay_score : 0;
      const total = sub.score !== undefined ? sub.score : (mcq + essay);
      const time = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('vi-VN') : '';
      const feedback = (sub.teacher_feedback || '').replace(/"/g, '""');

      csvContent += `${idx + 1},"${sub.student_code}",${mcq},${essay},${total},"${time}","${feedback}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `BangDiem_${selectedSessionId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const currentSession = sessions.find(s => s.id === selectedSessionId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-slate-900/95 border-b border-slate-800 sticky top-0 z-30 backdrop-blur-md px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-bold shadow-inner">
              <Cloud className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-white text-base sm:text-lg">VNLAN Cloud Teacher</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  SERVERLESS ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">Trung Tâm Quản Trị Đề Thi & Chấm Điểm 100% GitHub + Vercel</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onSwitchToStudent}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 border border-slate-700"
              title="Mở giao diện làm bài của học sinh"
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Toast Alert Message */}
        {statusMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Tổng Số Ca Thi</div>
                <div className="text-xl font-bold text-white mt-0.5">{sessions.length}</div>
              </div>
            </div>
            <span className="text-xs text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
              {sessions.filter(s => s.status === 'active').length} Đang mở
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Tổng Số Bài Đã Nộp</div>
                <div className="text-xl font-bold text-white mt-0.5">
                  {storageStatus?.totalSubmissions || submissions.length}
                </div>
              </div>
            </div>
            <span className="text-xs text-slate-400">Cả hệ thống</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Lưu Trữ Vercel Storage</div>
                <div className="text-xs font-semibold text-white mt-0.5">
                  {storageStatus?.isKVConfigured ? '🟢 Vercel KV Đã Kết Nối' : '🟡 In-Memory (Bộ Nhớ Đệm)'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('kv-guide')}
              className="text-xs text-sky-400 hover:text-sky-300 underline"
            >
              Chi tiết
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 overflow-x-auto gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition flex items-center gap-2 ${
                activeTab === 'sessions'
                  ? 'bg-sky-500 text-white font-semibold shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Quản Lý Ca Thi ({sessions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition flex items-center gap-2 ${
                activeTab === 'submissions'
                  ? 'bg-sky-500 text-white font-semibold shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Bảng Điểm Trực Tiếp</span>
            </button>

            <button
              onClick={() => setActiveTab('kv-guide')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition flex items-center gap-2 ${
                activeTab === 'kv-guide'
                  ? 'bg-sky-500 text-white font-semibold shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Kết Nối Vercel Storage (KV)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* TAB 1: QUẢN LÝ CA THI */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Danh Sách Ca Thi Trực Tuyến</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Gửi mã ca thi cho học sinh để các em truy cập làm bài ngay trên điện thoại hoặc máy tính.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSeedSample}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
                  title="Nạp đề thi mẫu chuẩn Bộ GD&ĐT 2025"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Nạp Đề Mẫu 2025</span>
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold shadow-md shadow-sky-500/25 transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tạo Ca Thi Mới</span>
                </button>
              </div>
            </div>

            {sessions.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-white">Chưa có ca thi nào trên Cloud</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Thầy/Cô có thể bấm nút "Nạp Đề Mẫu 2025" để tạo ngay ca thi trải nghiệm với đầy đủ các dạng câu hỏi chuẩn Bộ GD&ĐT!
                </p>
                <button
                  onClick={handleSeedSample}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-medium"
                >
                  Nạp Đề Mẫu Ngay
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition group shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-800 text-sky-400 border border-slate-700">
                          {session.subject_name || 'Kiểm tra'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            session.status === 'active'
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border-rose-800'
                          }`}
                        >
                          {session.status === 'active' ? 'ĐANG MỞ' : 'ĐÃ ĐÓNG'}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-bold text-white text-base group-hover:text-sky-300 transition line-clamp-2">
                          {session.title}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {session.duration_minutes || 45} phút
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-500" />
                            {session.submissionsCount || 0} bài nộp
                          </span>
                        </div>
                      </div>

                      {/* Box mã ca thi để copy cho học sinh */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-400">Mã ca thi gửi học sinh:</div>
                          <div className="font-mono font-bold text-sky-400 text-sm tracking-wider">
                            {session.code || session.id}
                          </div>
                        </div>
                        <button
                          onClick={() => copyToClipboard(session.code || session.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition flex items-center gap-1"
                          title="Sao chép mã ca thi"
                        >
                          {copiedCode === (session.code || session.id) ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-[11px] text-emerald-400 font-semibold">Đã chép</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-[11px]">Chép mã</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleSession(session.id, session.status)}
                          className={`p-2 rounded-xl text-xs transition ${
                            session.status === 'active'
                              ? 'bg-amber-950/40 text-amber-400 hover:bg-amber-900/40 border border-amber-800/60'
                              : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/40 border border-emerald-800/60'
                          }`}
                          title={session.status === 'active' ? 'Đóng ca thi' : 'Mở ca thi'}
                        >
                          {session.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session.id)}
                          className="p-2 rounded-xl bg-rose-950/30 text-rose-400 hover:bg-rose-900/40 border border-rose-900/50 text-xs transition"
                          title="Xóa ca thi"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedSessionId(session.id);
                          setActiveTab('submissions');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold transition flex items-center gap-1"
                      >
                        <span>Xem Bảng Điểm</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: BẢNG ĐIỂM & BÀI NỘP TRỰC TIẾP */}
        {activeTab === 'submissions' && (
          <div className="space-y-4">
            {/* Header thanh lọc & Xuất Excel */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Bảng Điểm Ca Thi Trực Tuyến</h2>
                  <p className="text-xs text-slate-400">
                    {currentSession ? currentSession.title : 'Chọn ca thi để xem kết quả'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.code || s.id})
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleExportCSV}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/25 transition flex items-center gap-1.5"
                  title="Tải tệp Excel .CSV về máy"
                >
                  <Download className="w-4 h-4" />
                  <span>Xuất Excel (.CSV)</span>
                </button>
              </div>
            </div>

            {/* Bảng kết quả bài nộp */}
            {submissions.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-white">Chưa có học sinh nào nộp bài</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Thầy/Cô hãy gửi mã ca thi <strong className="text-sky-400 font-mono">{selectedSessionId}</strong> cho học sinh truy cập cổng thi để làm bài!
                </p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3.5 px-4 font-semibold">STT</th>
                        <th className="py-3.5 px-4 font-semibold">Số Báo Danh</th>
                        <th className="py-3.5 px-4 font-semibold text-center">Điểm Trắc Nghiệm</th>
                        <th className="py-3.5 px-4 font-semibold text-center">Điểm Tự Luận</th>
                        <th className="py-3.5 px-4 font-semibold text-center">Tổng Điểm</th>
                        <th className="py-3.5 px-4 font-semibold">Thời Gian Nộp</th>
                        <th className="py-3.5 px-4 font-semibold text-right">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {submissions.map((sub, idx) => {
                        const mcq = sub.mcq_score !== undefined ? sub.mcq_score : (sub.score || 0);
                        const essay = sub.essay_score !== undefined ? sub.essay_score : 0;
                        const total = sub.score !== undefined ? sub.score : (mcq + essay);

                        return (
                          <tr key={sub.id || idx} className="hover:bg-slate-800/40 transition">
                            <td className="py-3.5 px-4 text-slate-500 font-mono">{idx + 1}</td>
                            <td className="py-3.5 px-4 font-bold text-white font-mono flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                              {sub.student_code}
                            </td>
                            <td className="py-3.5 px-4 text-center font-semibold text-sky-400">
                              {mcq.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-4 text-center font-semibold text-amber-400">
                              {essay > 0 ? essay.toFixed(2) : (sub.teacher_feedback ? '0.00' : 'Chưa chấm')}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-lg font-bold text-xs ${
                                total >= 8.0
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : total >= 5.0
                                  ? 'bg-sky-950 text-sky-300 border border-sky-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}>
                                {total.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">
                              {sub.submitted_at ? new Date(sub.submitted_at).toLocaleTimeString('vi-VN') + ' ' + new Date(sub.submitted_at).toLocaleDateString('vi-VN') : '—'}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={() => {
                                  setSelectedSubForGrading(sub);
                                  setEssayScoreInput(sub.essay_score !== undefined ? String(sub.essay_score) : '0');
                                  setFeedbackInput(sub.teacher_feedback || '');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold transition inline-flex items-center gap-1"
                              >
                                <PenTool className="w-3.5 h-3.5" />
                                <span>Chấm Tự Luận</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: HƯỚNG DẪN KẾT NỐI VERCEL STORAGE */}
        {activeTab === 'kv-guide' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Kiến Trúc Vercel Storage (Vercel KV / Upstash)</h2>
                  <p className="text-xs text-slate-400">
                    Giải pháp 100% GitHub + Vercel: Không cần Supabase, không cần tài khoản ngoài, không cần gõ lệnh SQL.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs text-slate-400">Tình trạng hiện tại:</div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    {storageStatus?.isKVConfigured ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">Đã kích hoạt Vercel KV (Lưu vĩnh viễn)</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        <span className="text-amber-400">Đang chạy In-Memory Storage (Lưu tạm thời)</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {storageStatus?.isKVConfigured
                      ? 'Dữ liệu ca thi và bài nộp được lưu trữ bền vững trên cụm Redis toàn cầu của Vercel.'
                      : 'Hệ thống đang lưu tạm trong RAM. Để lưu bài vĩnh viễn khi tắt máy, Thầy/Cô chỉ cần kết nối Vercel KV theo 3 bước bên dưới!'}
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs text-slate-400">Ưu điểm vượt trội:</div>
                  <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                    <li>Miễn phí 100% vĩnh viễn (Hobby Plan 0đ)</li>
                    <li>Tốc độ đọc/ghi siêu tốc (&lt;10ms)</li>
                    <li>Tự động đồng bộ với GitHub khi cập nhật</li>
                    <li>Bảo mật tách biệt 100% đề thi và đáp án</li>
                  </ul>
                </div>
              </div>

              {/* Hướng dẫn kích hoạt Vercel KV */}
              <div className="border-t border-slate-800 pt-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Cách Kích Hoạt Vercel KV (Chỉ 1 phút - 3 cú click chuột)</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-1.5">
                    <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center">1</div>
                    <div className="text-xs font-bold text-white">Vào Vercel Dashboard</div>
                    <p className="text-[11px] text-slate-400">
                      Mở trang quản trị dự án <strong className="text-slate-200">imaan_exam</strong> trên vercel.com.
                    </p>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-1.5">
                    <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center">2</div>
                    <div className="text-xs font-bold text-white">Tạo Database KV</div>
                    <p className="text-[11px] text-slate-400">
                      Bấm vào tab <strong>Storage</strong> trên thanh menu &rarr; Chọn <strong>KV</strong> &rarr; Bấm <strong>Create</strong>.
                    </p>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-1.5">
                    <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center">3</div>
                    <div className="text-xs font-bold text-white">Bấm Connect Project</div>
                    <p className="text-[11px] text-slate-400">
                      Bấm nút <strong>Connect to Project</strong>. Vercel sẽ tự động nạp biến môi trường mà không cần copy hay gõ lệnh!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL TẠO CA THI MỚI */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-400" />
                <span>Tạo Ca Thi Mới Trực Tuyến</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tên Ca Thi *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Kiểm tra 15 phút Tin học HK2"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Môn Học</label>
                  <input
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Thời Gian (Phút)</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-slate-300 font-semibold">
                  <span>Câu hỏi mẫu mặc định:</span>
                  <span className="text-[11px] text-sky-400">2 câu (Trắc nghiệm + Tự luận)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Ca thi sẽ tự động được khởi tạo kèm 1 câu trắc nghiệm (2.0 điểm) và 1 câu tự luận (8.0 điểm). Thầy/Cô có thể chấm tự luận ngay sau khi học sinh nộp bài!
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold shadow-md shadow-sky-500/25"
                >
                  {loading ? 'Đang tạo...' : 'Tạo Ca Thi Ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CHẤM BÀI TỰ LUẬN */}
      {selectedSubForGrading && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <PenTool className="w-5 h-5 text-amber-400" />
                <span>Chấm Bài Tự Luận - SBD: {selectedSubForGrading.student_code}</span>
              </h3>
              <button
                onClick={() => setSelectedSubForGrading(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                <div className="text-[11px] text-slate-400">Điểm trắc nghiệm (Hệ thống đã tự chấm):</div>
                <div className="text-base font-bold text-sky-400">
                  {(selectedSubForGrading.mcq_score !== undefined ? selectedSubForGrading.mcq_score : (selectedSubForGrading.score || 0)).toFixed(2)} / 10.0
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nhập Điểm Tự Luận (Ví dụ: 0.0 - 8.0) *
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="10"
                  value={essayScoreInput}
                  onChange={(e) => setEssayScoreInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-amber-500"
                  placeholder="Nhập số điểm tự luận..."
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Lời Phê / Nhận Xét Của Thầy/Cô (Học sinh sẽ nhìn thấy khi xem điểm)
                </label>
                <textarea
                  rows="3"
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  placeholder="Ví dụ: Lập luận tốt, cần chú ý thêm về bảo mật tài khoản..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedSubForGrading(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleSaveEssayGrade}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-md shadow-amber-500/25"
                >
                  Lưu Điểm & Cập Nhật Tổng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
