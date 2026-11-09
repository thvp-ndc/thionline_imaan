import React, { useState, useEffect, useRef, useMemo } from 'react';
import MathContent from '../common/MathContent';
import {
  saveAnswerLocally,
  loadCachedAnswers,
  saveAttemptMetadata,
  loadAttemptMetadata,
  clearExamLocalData,
  fetchWithBackoff
} from '../../utils/indexedDBStorage';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Send,
  Wifi,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  Grid,
  X,
  Award,
  Sparkles,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Smartphone
} from 'lucide-react';

export default function OnlineStudentPortal() {
  // --- STATE QUẢN LÝ TIẾN TRÌNH ---
  const [step, setStep] = useState('login'); // 'login' | 'exam' | 'result'

  // State đăng nhập
  const [sessionId, setSessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session') || params.get('s') || '';
  });
  const [studentCode, setStudentCode] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // State ca thi & đề thi
  const [sessionToken, setSessionToken] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [studentProfile, setStudentProfile] = useState(null);

  // State làm bài
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionId]: answerValue }
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // State kết quả
  const [examResult, setExamResult] = useState(null);

  // Theo dõi trạng thái mạng
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // -------------------------------------------------------------
  // BƯỚC 1: XỬ LÝ ĐĂNG NHẬP (JOIN CA THI)
  // -------------------------------------------------------------
  const handleStudentLogin = async (e) => {
    e.preventDefault();
    if (!sessionId.trim() || !studentCode.trim()) {
      setLoginError('Vui lòng nhập đầy đủ Mã ca thi và Số báo danh!');
      return;
    }

    try {
      setLoginLoading(true);
      setLoginError('');

      const res = await fetch('/api/auth/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId.trim(),
          student_code: studentCode.trim().toUpperCase(),
          access_code: accessCode.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.error || 'Đăng nhập không thành công. Vui lòng kiểm tra lại!');
        return;
      }

      setSessionToken(data.examSessionToken);
      setStudentProfile({
        studentCode: data.studentCode,
        studentName: data.studentName,
        studentClass: data.studentClass
      });

      // Tải đề thi
      await fetchExamSession(data.examSessionToken);
    } catch (err) {
      setLoginError('Không thể kết nối đến máy chủ: ' + err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // Tải đề thi từ /api/session
  const fetchExamSession = async (token) => {
    try {
      const res = await fetch('/api/session', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoginError(data.error || 'Không thể tải đề thi!');
        return;
      }

      setSessionInfo(data.session);
      const rawQuestions = data.paper?.questions || [];
      setQuestions(rawQuestions);

      // Phục hồi câu trả lời từ IndexedDB nếu có (Chống mất bài khi F5 hoặc rớt mạng)
      const currentStudentCode = data.student?.studentCode || studentCode;
      const cachedAnswers = await loadCachedAnswers(data.session.id, currentStudentCode);
      if (cachedAnswers && Object.keys(cachedAnswers).length > 0) {
        setAnswers(cachedAnswers);
      }

      // Lưu metadata phiên thi để tự động khôi phục
      saveAttemptMetadata({
        sessionId: data.session.id,
        studentCode: currentStudentCode,
        metadata: {
          token,
          sessionInfo: data.session,
          studentProfile: data.student,
          deadlineAt: data.student?.deadlineAt
        }
      });

      // Tính thời gian còn lại ban đầu
      const deadline = new Date(data.student?.deadlineAt || data.session?.hardCutoffAt).getTime();
      const now = Date.now();
      const secLeft = Math.max(0, Math.floor((deadline - now) / 1000));
      setRemainingSeconds(secLeft);

      // Chuyển sang màn hình làm bài
      setStep('exam');
    } catch (err) {
      setLoginError('Lỗi tải đề thi: ' + err.message);
    }
  };

  // -------------------------------------------------------------
  // BƯỚC 2: ĐỒNG HỒ ĐẾM NGƯỢC & HEARTBEAT ĐỒNG BỘ
  // -------------------------------------------------------------
  useEffect(() => {
    if (step !== 'exam') return;

    // Giảm 1 giây mỗi giây
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Tự động nộp bài khi hết giờ
          handleAutoSubmitOnTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Heartbeat đồng bộ với máy chủ mỗi 30 giây
    const heartbeatTimer = setInterval(async () => {
      if (!sessionToken || !isOnline) return;
      try {
        const res = await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exam_session_token: sessionToken,
            is_progress_update: true,
            delta_answers: answers
          })
        });
        const d = await res.json();
        if (d.success && d.remainingSeconds !== undefined) {
          setRemainingSeconds(d.remainingSeconds);
        }
      } catch (e) {
        // Mất mạng ngầm, không làm phiền học sinh
      }
    }, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(heartbeatTimer);
    };
  }, [step, sessionToken, answers, isOnline]);

  // Format mm:ss hoặc hh:mm:ss
  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // -------------------------------------------------------------
  // BƯỚC 3: XỬ LÝ CHỌN ĐÁP ÁN (LOCAL AUTOSAVE VÀO INDEXEDDB)
  // -------------------------------------------------------------
  const currentQuestion = questions[currentIndex] || null;

  const handleSelectOption = (qId, optionId) => {
    const newAnswer = { selected_options: [optionId] };
    setAnswers((prev) => ({
      ...prev,
      [qId]: newAnswer
    }));

    // Ghi ngay lập tức vào IndexedDB (độ trễ < 1ms)
    if (sessionInfo?.id && studentProfile?.studentCode) {
      saveAnswerLocally({
        sessionId: sessionInfo.id,
        studentCode: studentProfile.studentCode,
        questionId: qId,
        answer: newAnswer
      });
    }
  };

  const handleSelectTrueFalse = (qId, subKey, choiceValue) => {
    const oldTF = answers[qId]?.true_false_answers || {};
    const newTF = { ...oldTF, [subKey]: choiceValue };
    const newAnswer = { true_false_answers: newTF };

    setAnswers((prev) => ({
      ...prev,
      [qId]: newAnswer
    }));

    // Ghi ngay lập tức vào IndexedDB
    if (sessionInfo?.id && studentProfile?.studentCode) {
      saveAnswerLocally({
        sessionId: sessionInfo.id,
        studentCode: studentProfile.studentCode,
        questionId: qId,
        answer: newAnswer
      });
    }
  };

  const handleShortAnswerChange = (qId, textValue) => {
    const newAnswer = { short_answer: textValue };
    setAnswers((prev) => ({
      ...prev,
      [qId]: newAnswer
    }));

    // Ghi ngay lập tức vào IndexedDB
    if (sessionInfo?.id && studentProfile?.studentCode) {
      saveAnswerLocally({
        sessionId: sessionInfo.id,
        studentCode: studentProfile.studentCode,
        questionId: qId,
        answer: newAnswer
      });
    }
  };

  // Tính số câu đã làm
  const answeredCount = useMemo(() => {
    let count = 0;
    questions.forEach((q) => {
      const a = answers[q.id];
      if (!a) return;
      if (a.selected_options?.length > 0) count++;
      else if (a.true_false_answers && Object.keys(a.true_false_answers).length > 0) count++;
      else if (a.short_answer && a.short_answer.trim().length > 0) count++;
    });
    return count;
  }, [questions, answers]);

  // -------------------------------------------------------------
  // BƯỚC 4: NỘP BÀI THI (IDEMPOTENT SUBMISSION)
  // -------------------------------------------------------------
  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setIsSubmitting(true);

    try {
      // Sinh mã định danh nộp bài duy nhất (Chống gửi trùng)
      const idempotencyKey = `idem_${sessionInfo?.id}_${studentProfile?.studentCode}_${Date.now()}`;

      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_session_token: sessionToken,
          idempotency_key: idempotencyKey,
          answers_payload: answers
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Nộp bài không thành công. Vui lòng thử lại!');
        setIsSubmitting(false);
        return;
      }

      // Xóa sạch bộ nhớ đệm cục bộ khi đã nộp bài thành công lên Server
      if (sessionInfo?.id && studentProfile?.studentCode) {
        await clearExamLocalData(sessionInfo.id, studentProfile.studentCode);
      }

      setExamResult(data);
      setStep('result');
    } catch (err) {
      alert('Không thể kết nối đến máy chủ khi nộp bài: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoSubmitOnTimeout = () => {
    alert('Hết giờ làm bài! Hệ thống đang tự động thu bài thi của bạn.');
    handleConfirmSubmit();
  };

  // -------------------------------------------------------------
  // GIAO DIỆN 1: MÀN HÌNH ĐĂNG NHẬP THI
  // -------------------------------------------------------------
  if (step === 'login') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute w-96 h-96 bg-sky-600/10 rounded-full blur-3xl -top-20 -left-20 pointer-events-none"></div>
        <div className="absolute w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none"></div>

        <div className="max-w-md w-full relative z-10">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> CỔNG THI TRỰC TUYẾN HYBRID CLOUD
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">Học Sinh Vào Thi</h1>
              <p className="text-slate-400 text-xs sm:text-sm">
                Quét mã QR hoặc nhập thông tin ca thi để bắt đầu làm bài
              </p>
            </div>

            {loginError && (
              <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Mã Ca Thi <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: TOAN10_GK1"
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Số Báo Danh (SBD) / Mã Học Sinh <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: 10A1_05"
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Mã Truy Cập / Ngày Sinh (nếu có)
                </label>
                <input
                  type="password"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Ví dụ: 2008-05-15 hoặc mã PIN"
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-sky-600/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loginLoading ? 'Đang kiểm tra...' : (
                  <>
                    <span>Bắt Đầu Làm Bài</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 text-center">
              <a
                href="/teacher"
                className="text-xs text-slate-400 hover:text-sky-400 transition"
              >
                Thầy/Cô quản trị? Bấm vào đây để đăng nhập
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // GIAO DIỆN 3: MÀN HÌNH KẾT QUẢ THI
  // -------------------------------------------------------------
  if (step === 'result') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-950 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white">Nộp Bài Thành Công!</h2>
            <p className="text-slate-400 text-xs sm:text-sm">
              Bài thi của thí sinh <span className="text-sky-400 font-bold">{studentProfile?.studentName}</span> ({studentProfile?.studentCode}) đã được ghi nhận an toàn trên Cloud.
            </p>
          </div>

          {examResult?.isImmediateRelease && examResult?.score !== null && (
            <div className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Điểm Số Đạt Được</span>
              <div className="text-5xl font-black text-emerald-400 tracking-tight">
                {examResult.score} <span className="text-base font-normal text-slate-400">/ 10</span>
              </div>
              <p className="text-xs text-slate-400 pt-2">
                Số câu làm đúng: {examResult.correctCount} / {examResult.totalQuestions} câu
              </p>
            </div>
          )}

          {!examResult?.isImmediateRelease && (
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300">
              Điểm số bài thi đang được bảo mật. Giáo viên sẽ công bố kết quả cho cả lớp sau khi ca thi kết thúc.
            </div>
          )}

          <div className="text-xs text-slate-500 pt-2">
            Thời điểm nộp: {new Date(examResult?.submittedAt || Date.now()).toLocaleTimeString('vi-VN')} - {new Date().toLocaleDateString('vi-VN')}
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm transition"
          >
            Quay Về Trang Chủ
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // GIAO DIỆN 2: MÀN HÌNH LÀM BÀI MOBILE RESPONSIVE
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-20 select-none">
      {/* 1. HEADER CỐ ĐỊNH PHÍA TRÊN */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 flex items-center gap-1.5 text-xs font-bold active:scale-95 transition"
            title="Mở danh sách câu hỏi"
          >
            <Grid className="w-4 h-4" />
            <span className="hidden sm:inline">Câu hỏi</span>
            <span className="bg-sky-950 text-sky-300 px-1.5 py-0.5 rounded-md text-[11px] border border-sky-800">
              {answeredCount}/{questions.length}
            </span>
          </button>

          <div className="hidden md:block text-xs font-medium text-slate-300 truncate max-w-[200px]">
            {sessionInfo?.title}
          </div>
        </div>

        {/* Đồng hồ đếm ngược đồng bộ máy chủ */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-sm tracking-wider border shadow-sm ${
            remainingSeconds < 300
              ? 'bg-rose-950/90 text-rose-300 border-rose-700 animate-pulse'
              : 'bg-sky-950/80 text-sky-300 border-sky-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{formatTime(remainingSeconds)}</span>
        </div>

        {/* Nút nộp bài góc phải */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
            {isOnline ? (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <Wifi className="w-3.5 h-3.5" /> Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <WifiOff className="w-3.5 h-3.5" /> Lưu tạm
              </span>
            )}
          </div>

          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Nộp Bài</span>
          </button>
        </div>
      </header>

      {/* 2. NỘI DUNG CÂU HỎI TRUNG TÂM */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {currentQuestion && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
            {/* Header Câu hỏi */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="px-3 py-1 rounded-full bg-sky-950 text-sky-400 border border-sky-800 text-xs font-bold uppercase tracking-wider">
                Câu {currentIndex + 1} / {questions.length}
              </span>
              <span className="text-xs font-medium text-slate-400">
                Điểm: {currentQuestion.max_score || 0.25}đ
              </span>
            </div>

            {/* Nội dung đề bài */}
            <div className="text-slate-100 text-base sm:text-lg leading-relaxed space-y-3">
              <MathContent content={currentQuestion.content} />
            </div>

            {/* CÁC PHƯƠNG ÁN LỰA CHỌN */}
            {/* Dạng 1: Trắc nghiệm đơn (single_choice) */}
            {currentQuestion.question_type === 'single_choice' && (
              <div className="space-y-3 pt-2">
                {(currentQuestion.options || []).map((opt, idx) => {
                  const optId = opt.id || String.fromCharCode(65 + idx);
                  const isSelected = answers[currentQuestion.id]?.selected_options?.[0] === optId;

                  return (
                    <button
                      key={optId}
                      onClick={() => handleSelectOption(currentQuestion.id, optId)}
                      className={`w-full text-left p-4 rounded-2xl border transition flex items-start gap-3.5 active:scale-[0.99] ${
                        isSelected
                          ? 'bg-sky-950/70 border-sky-500 text-white shadow-md shadow-sky-500/10'
                          : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 border ${
                          isSelected
                            ? 'bg-sky-500 border-sky-400 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300'
                        }`}
                      >
                        {optId}
                      </div>
                      <div className="flex-1 text-sm sm:text-base leading-normal">
                        <MathContent content={opt.text || opt.content || ''} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Dạng 2: Đúng / Sai 4 ý (true_false theo BGDĐT 2025) */}
            {currentQuestion.question_type === 'true_false' && (
              <div className="space-y-3 pt-2">
                {['a', 'b', 'c', 'd'].map((subKey, idx) => {
                  const subItem = (currentQuestion.options || [])[idx] || {};
                  const currentChoice = answers[currentQuestion.id]?.true_false_answers?.[subKey] || null;

                  return (
                    <div
                      key={subKey}
                      className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 flex-1">
                        <span className="w-6 h-6 rounded-md bg-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center shrink-0 uppercase">
                          {subKey}
                        </span>
                        <div className="text-sm text-slate-200 leading-normal">
                          <MathContent content={subItem.text || subItem.content || ''} />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleSelectTrueFalse(currentQuestion.id, subKey, 'T')}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs border transition ${
                            currentChoice === 'T'
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                              : 'bg-slate-700/80 border-slate-600 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          Đúng
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectTrueFalse(currentQuestion.id, subKey, 'F')}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs border transition ${
                            currentChoice === 'F'
                              ? 'bg-rose-600 border-rose-500 text-white shadow-sm'
                              : 'bg-slate-700/80 border-slate-600 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          Sai
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Dạng 3: Trả lời ngắn (short_answer) */}
            {currentQuestion.question_type === 'short_answer' && (
              <div className="pt-2 space-y-2">
                <label className="block text-xs font-medium text-slate-400">
                  Nhập câu trả lời của bạn vào ô bên dưới:
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={answers[currentQuestion.id]?.short_answer || ''}
                  onChange={(e) => handleShortAnswerChange(currentQuestion.id, e.target.value)}
                  placeholder="Ví dụ: 2.5 hoặc -12"
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3.5 text-base font-bold text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* 3. THANH ĐIỀU HƯỚNG CỐ ĐỊNH PHÍA DƯỚI (BOTTOM BAR) */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 flex items-center justify-between max-w-3xl mx-auto">
        <button
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center gap-1.5 disabled:opacity-40 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Câu trước</span>
        </button>

        <span className="text-xs font-semibold text-slate-400">
          Câu {currentIndex + 1} / {questions.length}
        </span>

        <button
          onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
          disabled={currentIndex === questions.length - 1}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center gap-1.5 disabled:opacity-40 transition"
        >
          <span>Câu tiếp</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </footer>

      {/* 4. MODAL / DRAWER DANH SÁCH TOÀN BỘ CÂU HỎI */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-sm bg-slate-900 border-l border-slate-800 h-full p-5 flex flex-col space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Grid className="w-4 h-4 text-sky-400" />
                <span>Danh Sách Câu Hỏi</span>
              </h3>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-5 gap-2 pr-1 content-start">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const a = answers[q.id];
                const hasAnswer =
                  a?.selected_options?.length > 0 ||
                  (a?.true_false_answers && Object.keys(a.true_false_answers).length > 0) ||
                  (a?.short_answer && a.short_answer.trim().length > 0);

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setIsDrawerOpen(false);
                    }}
                    className={`h-11 rounded-xl text-xs font-bold border transition flex items-center justify-center ${
                      isCurrent
                        ? 'border-sky-400 bg-sky-950 text-sky-300 ring-2 ring-sky-400/50'
                        : hasAnswer
                        ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-400 flex items-center justify-around">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-600 inline-block"></span> Đã làm
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700 inline-block"></span> Chưa làm
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-sky-950 border border-sky-400 inline-block"></span> Đang xem
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL XÁC NHẬN NỘP BÀI */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center">Xác Nhận Nộp Bài</h3>
            <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700 text-center space-y-2">
              <p className="text-sm text-slate-300">
                Bạn đã hoàn thành <span className="text-emerald-400 font-bold">{answeredCount}</span> / {questions.length} câu hỏi.
              </p>
              {answeredCount < questions.length && (
                <p className="text-xs text-amber-400 font-medium">
                  ⚠️ Còn {questions.length - answeredCount} câu chưa trả lời!
                </p>
              )}
            </div>
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              Sau khi nộp, bạn sẽ không thể thay đổi đáp án. Bạn có chắc chắn muốn nộp bài ngay bây giờ?
            </p>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Làm tiếp
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition"
              >
                Nộp Bài Ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
