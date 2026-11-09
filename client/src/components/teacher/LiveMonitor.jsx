import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { ShieldAlert, Users, Clock, AlertTriangle, CheckCircle, RefreshCw, PlusCircle, StopCircle, ArrowLeft, Laptop, Play, KeyRound, Globe, Copy, Check, Download, FileEdit, BarChart2, UserX, Unlock, RotateCcw, X, Megaphone } from 'lucide-react';
import { formatToLocalTime } from '../../utils/timeFormat';

export default function LiveMonitor({ sessionId, onBack, onOpenEssayGrading, onOpenResults }) {
  const [session, setSession] = useState(null);
  const [students, setStudents] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [violationsList, setViolationsList] = useState([]);
  const [socket, setSocket] = useState(null);
  const [selectedStudentForAction, setSelectedStudentForAction] = useState(null);
  const [extraMinutes, setExtraMinutes] = useState(5);
  const [startingExam, setStartingExam] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [serverInfo, setServerInfo] = useState({ serverIp: '...', port: 3000 });
  const [copiedLink, setCopiedLink] = useState(false);
  const [emergencyAlerts, setEmergencyAlerts] = useState([]);

  useEffect(() => {
    fetch('/api/system/info')
      .then(r => r.json())
      .then(d => { if (d.success) setServerInfo(d); })
      .catch(() => {});
  }, []);

  const calculateRemainingSeconds = (sess) => {
    if (!sess || !sess.duration_minutes) return 0;
    if (sess.status === 'waiting') {
      return Number(sess.duration_minutes) * 60;
    }
    if (sess.status === 'finished') {
      return 0;
    }
    if (!sess.start_time) {
      return Number(sess.duration_minutes) * 60;
    }

    let startIso = String(sess.start_time);
    if (!startIso.endsWith('Z') && !startIso.includes('+')) {
      startIso = startIso.replace(' ', 'T') + 'Z';
    }
    const startTimeMs = new Date(startIso).getTime();
    if (isNaN(startTimeMs)) return Number(sess.duration_minutes) * 60;

    const totalAllowedSeconds = Number(sess.duration_minutes) * 60;
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
    return Math.max(0, totalAllowedSeconds - elapsedSeconds);
  };

  const formatCountdown = (totalSec) => {
    if (totalSec <= 0) return '00:00';
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const fetchInitialData = async () => {
    try {
      const res = await fetch(`/api/teacher/sessions/${sessionId}/live`);
      const data = await res.json();
      if (data.success) {
        setSession(data.session);
        setStudents(data.students || []);
        setTotalQuestions(data.totalQuestions || 0);
      }
    } catch (err) {
      console.error('Fetch live data error:', err);
    }
  };

  useEffect(() => {
    fetchInitialData();

    // Polling dự phòng định kỳ 10 giây để đảm bảo máy giáo viên luôn đồng bộ 100% tiến độ học sinh
    const pollInterval = setInterval(() => {
      fetch(`/api/teacher/sessions/${sessionId}/live`)
        .then(r => r.json())
        .then(data => {
          if (data && data.success && Array.isArray(data.students)) {
            setStudents(prev => {
              const freshMap = new Map(data.students.map(s => [s.id, s]));
              return prev.map(oldSt => {
                const fresh = freshMap.get(oldSt.id);
                if (!fresh) return oldSt;
                return {
                  ...oldSt,
                  ...fresh,
                  isOnline: oldSt.isOnline !== undefined ? oldSt.isOnline : fresh.isOnline
                };
              });
            });
          }
        })
        .catch(() => {});
    }, 10000);

    const newSocket = io({ path: '/socket.io' });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      const token = sessionStorage.getItem('lan_exam_teacher_token');
      newSocket.emit('teacher_join_room', { sessionId, token });
    });

    newSocket.on('teacher_roster_update', ({ students: roster }) => {
      setStudents(roster || []);
    });

    newSocket.on('student_status_change', ({ attemptId, status, clientIp, studentCode, studentName }) => {
      setStudents(prev => {
        const exists = prev.find(s => s.id === attemptId);
        if (exists) {
          return prev.map(s => s.id === attemptId ? { ...s, isOnline: status === 'online', client_ip: clientIp || s.client_ip } : s);
        } else if (status === 'online') {
          return [...prev, { id: attemptId, student_code: studentCode, student_name: studentName, client_ip: clientIp, isOnline: true, answered_count: 0, violations_count: 0, status: 'in_progress' }];
        }
        return prev;
      });
    });

    newSocket.on('student_progress_update', ({ attemptId, answeredCount }) => {
      setStudents(prev => prev.map(s => s.id === attemptId ? { ...s, answered_count: answeredCount } : s));
    });

    newSocket.on('student_violation_alert', (violation) => {
      // Play audio beep notification if allowed
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch (e) {}

      setViolationsList(prev => [violation, ...prev.slice(0, 49)]);

      setStudents(prev => prev.map(s => s.id === violation.attemptId ? {
        ...s,
        violations_count: violation.violationsCount
      } : s));

      // Tự động đẩy vào danh sách xử lý khẩn cấp nếu học sinh chạm 3 lần vi phạm
      if (violation.violationsCount >= 3) {
        setEmergencyAlerts(prev => {
          const exists = prev.some(a => a.attemptId === violation.attemptId && a.type === 'violation_lock');
          if (exists) return prev;
          return [{
            id: `violation_${violation.attemptId}_${Date.now()}`,
            type: 'violation_lock',
            attemptId: violation.attemptId,
            studentCode: violation.studentCode,
            studentName: violation.studentName,
            message: violation.details || 'Vi phạm quy chế 3 lần (Rời toàn màn hình/chuyển tab)',
            time: violation.time || new Date().toLocaleTimeString('vi-VN'),
            violationsCount: violation.violationsCount
          }, ...prev];
        });
      }
    });

    newSocket.on('student_device_swap_alert', (data) => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } catch (e) {}

      setEmergencyAlerts(prev => {
        const exists = prev.some(a => a.attemptId === data.attemptId && a.type === 'device_swap');
        if (exists) return prev;
        return [{
          id: `swap_${data.attemptId}_${Date.now()}`,
          type: 'device_swap',
          attemptId: data.attemptId,
          studentCode: data.studentCode,
          studentName: data.studentName,
          requestIp: data.requestIp,
          message: data.message,
          time: data.time || new Date().toLocaleTimeString('vi-VN')
        }, ...prev];
      });
    });

    newSocket.on('student_wrong_login_alert', (data) => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch (e) {}

      setEmergencyAlerts(prev => {
        const exists = prev.some(a => a.attemptId === data.attemptId && a.type === 'wrong_login');
        if (exists) return prev;
        return [{
          id: `wrong_${data.attemptId}_${Date.now()}`,
          type: 'wrong_login',
          attemptId: data.attemptId,
          studentCode: data.studentCode,
          studentName: data.studentName,
          victimIp: data.victimIp,
          currentIp: data.currentIp,
          message: data.message,
          time: data.time || new Date().toLocaleTimeString('vi-VN')
        }, ...prev];
      });
    });

    newSocket.on('student_submitted_alert', ({ attemptId, gradeResult, submitted_at }) => {
      setStudents(prev => prev.map(s => s.id === attemptId ? {
        ...s,
        status: 'submitted',
        submitted_at: submitted_at || s.submitted_at || new Date().toISOString(),
        mcq_score: gradeResult.mcq_score,
        essay_score: gradeResult.essay_score,
        total_score: gradeResult.total_score,
        is_graded: gradeResult.is_graded
      } : s));
    });

    newSocket.on('refresh_roster', () => {
      fetchInitialData();
    });

    return () => {
      clearInterval(pollInterval);
      newSocket.disconnect();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;
    setRemainingSeconds(calculateRemainingSeconds(session));

    if (session.status !== 'in_progress') return;

    const timer = setInterval(() => {
      setRemainingSeconds(calculateRemainingSeconds(session));
    }, 1000);

    return () => clearInterval(timer);
  }, [session?.status, session?.start_time, session?.duration_minutes]);

  const handleAddExtraTime = (attemptId = null) => {
    if (!socket) return;
    socket.emit('teacher_add_extra_time', {
      sessionId,
      attemptId,
      minutes: Number(extraMinutes)
    });
    alert(`Đã cộng thêm ${extraMinutes} phút!`);
    setSelectedStudentForAction(null);
  };

  const handleForceSubmit = (attemptId, studentName) => {
    if (!confirm(`Bạn có chắc chắn muốn THU BÀI CƯỠNG CHẾ đối với thí sinh [${studentName}]?`)) return;
    if (!socket) return;
    socket.emit('teacher_force_submit', { attemptId, sessionId });
  };

  const handleStartSession = async () => {
    if (!confirm(`Bạn có chắc chắn muốn BẮT ĐẦU LÀM BÀI cho ca thi [${session?.session_code}]?\n\nTất cả thí sinh đang ở phòng chờ sẽ đồng loạt bắt đầu làm bài và đồng hồ đếm ngược sẽ bắt đầu chạy.`)) return;
    setStartingExam(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã phát lệnh bắt đầu ca thi thành công!');
        setSession(prev => prev ? { ...prev, status: 'in_progress' } : prev);
        fetchInitialData();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Không thể bắt đầu ca thi: ' + err.message);
    } finally {
      setStartingExam(false);
    }
  };

  const getAuthHeaders = () => {
    const token = sessionStorage.getItem('lan_exam_teacher_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}`, 'x-teacher-token': token } : {})
    };
  };

  const handleUnlockDevice = async (attemptId, studentName, alertId = null) => {
    if (!alertId && !confirm(`Mở khóa đổi máy cho thí sinh [${studentName}]?\n\nSau khi mở khóa, thí sinh có thể đăng nhập vào máy tính khác trong phòng máy để làm tiếp mà không bị chặn.`)) return;
    try {
      const res = await fetch(`/api/teacher/attempts/${attemptId}/unlock-device`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Đã mở khóa thiết bị cho thí sinh [${studentName}] thành công!`);
        if (alertId) {
          setEmergencyAlerts(prev => prev.filter(a => a.id !== alertId));
        }
        fetchInitialData();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi khi mở khóa thiết bị: ' + err.message);
    }
  };

  const handleKickWrongLogin = async (attemptId, studentName, alertId = null) => {
    const confirmKick = confirm(
      `THU HỒI PHIÊN ĐĂNG NHẬP NHẦM - THÍ SINH [${studentName}]:\n\n` +
      `Bấm [OK] để ĐÁ máy đang chiếm SBD và XÓA SẠCH câu trả lời rác (Khuyên dùng để học sinh làm bài mới).\n\n` +
      `Bấm [Cancel / Hủy] nếu chỉ muốn ĐÁ máy nhầm nhưng GIỮ LẠI các câu đã tích.`
    );
    try {
      const res = await fetch(`/api/teacher/attempts/${attemptId}/kick-wrong-login`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ clearAnswers: confirmKick })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Đã thu hồi phiên đăng nhập nhầm của [${studentName}]. SBD đã được mở khóa!`);
        if (alertId) {
          setEmergencyAlerts(prev => prev.filter(a => a.id !== alertId));
        }
        fetchInitialData();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi khi đá máy đăng nhập nhầm: ' + err.message);
    }
  };

  const handleUnlockViolation = async (attemptId, studentName, alertId = null) => {
    try {
      const res = await fetch(`/api/teacher/attempts/${attemptId}/unlock-violation`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Đã xóa cảnh báo vi phạm cho thí sinh [${studentName}]. Thí sinh có thể tiếp tục làm bài.`);
        if (alertId) {
          setEmergencyAlerts(prev => prev.filter(a => a.id !== alertId));
        }
        fetchInitialData();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi khi mở khóa vi phạm: ' + err.message);
    }
  };

  const handleResumeAttempt = async (attemptId, studentName, alertId = null) => {
    const extraMinsStr = prompt(`Mở lại bài thi cho thí sinh [${studentName}] làm tiếp bài đang dang dở.\n\nNhập số phút muốn cộng thêm cho thí sinh (nhập 0 nếu không cộng thêm giờ):`, '0');
    if (extraMinsStr === null) return;
    const extraMins = parseInt(extraMinsStr) || 0;

    try {
      const res = await fetch(`/api/teacher/attempts/${attemptId}/resume`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ extraTimeMinutes: extraMins })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Đã mở lại bài thi cho thí sinh [${studentName}] thành công!`);
        if (alertId) {
          setEmergencyAlerts(prev => prev.filter(a => a.id !== alertId));
        }
        fetchInitialData();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi khi mở lại bài thi: ' + err.message);
    }
  };

  const handleRetakeAttempt = async (attemptId, studentName, alertId = null) => {
    if (!confirm(`⚠️ CẢNH BÁO THI LẠI TỪ ĐẦU:\n\nBạn có chắc chắn muốn cho thí sinh [${studentName}] THI LẠI TỪ ĐẦU?\n\n- Toàn bộ kết quả và câu trả lời cũ sẽ bị XÓA.\n- Thí sinh sẽ bốc đề ngẫu nhiên mới và tính giờ lại từ đầu.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/teacher/attempts/${attemptId}/retake`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Đã đặt lại bài thi cho thí sinh [${studentName}]. Thí sinh có thể vào thi lại từ đầu.`);
        if (alertId) {
          setEmergencyAlerts(prev => prev.filter(a => a.id !== alertId));
        }
        fetchInitialData();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi khi cấp quyền thi lại: ' + err.message);
    }
  };

  const handleFinishSession = async () => {
    if (!confirm(`Bạn có chắc chắn muốn KẾT THÚC CA THI [${session?.session_code}]?\n\nHệ thống sẽ:\n1. Tự động thu bài và chấm trắc nghiệm tất cả thí sinh đang thi.\n2. Khóa ca thi, không cho phép học sinh mới vào.\n3. Chuyển sang màn hình Báo Cáo Điểm.`)) return;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/finish`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        onOpenResults(sessionId);
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Không thể kết thúc ca thi: ' + err.message);
    }
  };

  const handleReleaseScores = async () => {
    if (!confirm(`Bạn có chắc chắn muốn CÔNG BỐ ĐIỂM cho ca thi [${session?.session_code}]?\n\nSau khi công bố, học sinh trong ca thi này sẽ được phép xem điểm và chi tiết kết quả bài làm trên máy tính của mình.`)) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/release-scores`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã công bố điểm cho ca thi thành công!');
        fetch(`/api/teacher/sessions/${sessionId}/live`)
          .then(r => r.json())
          .then(d => { if (d.session) setSession(d.session); });
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Không thể công bố điểm: ' + err.message);
    }
  };

  const stats = {
    total: students.length,
    submitted: students.filter(s => s.status === 'submitted' || s.status === 'forced_submitted').length,
    violating: students.filter(s => (s.violations_count || 0) > 0).length,
    online: students.filter(s => s.isOnline !== false && s.status === 'in_progress').length
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Info Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900">{session?.title || 'Phòng Thi Trực Tuyến'}</h2>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-mono font-bold text-sm">
                MÃ: {session?.session_code}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Đề thi: <span className="text-slate-800 font-semibold">{session?.exam_title}</span> | Thời lượng: {session?.duration_minutes} phút | Tổng số câu: {totalQuestions} câu
            </p>
          </div>
        </div>

        {/* Realtime Countdown Timer Badge */}
        <div className="flex items-center">
          {session?.status === 'in_progress' ? (
            remainingSeconds > 0 ? (
              <div
                className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all ${
                  remainingSeconds <= 300
                    ? 'bg-rose-50 border-rose-300 shadow-md shadow-rose-100 animate-pulse text-rose-700'
                    : 'bg-slate-50 border-slate-200 text-blue-700 shadow-2xs'
                }`}
                title={remainingSeconds <= 300 ? 'Cảnh báo: Ca thi còn dưới 5 phút!' : 'Thời gian làm bài còn lại của ca thi'}
              >
                <div className="flex items-center justify-center">
                  <Clock className={`w-6 h-6 ${remainingSeconds <= 300 ? 'text-rose-600 animate-spin-slow' : 'text-blue-600'}`} />
                </div>
                <div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${remainingSeconds <= 300 ? 'text-rose-700' : 'text-slate-500'}`}>
                    {remainingSeconds <= 300 ? '⚠️ SẮP HẾT GIỜ' : 'THỜI GIAN CÒN LẠI'}
                  </div>
                  <div className="text-2xl font-black font-mono tracking-wider">
                    {formatCountdown(remainingSeconds)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-700 shadow-md animate-pulse">
                <StopCircle className="w-6 h-6 text-rose-600 animate-bounce" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">TRẠNG THÁI CA THI</div>
                  <div className="text-xl font-black font-mono text-rose-800">00:00 (HẾT GIỜ)</div>
                </div>
              </div>
            )
          ) : session?.status === 'waiting' ? (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 shadow-2xs">
              <Clock className="w-5 h-5 text-amber-600" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">THỜI LƯỢNG CA THI</div>
                <div className="text-sm font-bold font-mono text-amber-900">{session?.duration_minutes} phút (Chưa bắt đầu)</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-2xs">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CA THI</div>
                <div className="text-sm font-bold text-slate-800">Đã kết thúc</div>
              </div>
            </div>
          )}
        </div>

        {/* Contextual Action Bar - State Driven (SaaS Enterprise shadcn/ui style) */}
        <div className="flex flex-wrap items-center gap-2">
          {session?.status === 'waiting' && (
            <>
              <button
                onClick={() => onOpenEssayGrading(sessionId)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Mở giao diện chấm bài tự luận"
              >
                <FileEdit className="w-3.5 h-3.5 text-slate-500" />
                <span>Chấm Tự Luận</span>
              </button>
              <button
                onClick={() => onOpenResults(sessionId)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Xem bảng điểm & in bài nộp"
              >
                <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Báo Cáo Điểm</span>
              </button>
            </>
          )}

          {session?.status === 'in_progress' && (
            <>
              {/* Primary / Soft Action: Bù Giờ */}
              <button
                onClick={() => handleAddExtraTime(null)}
                className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Cộng 5 phút làm bài cho toàn phòng"
              >
                <PlusCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Bù Giờ (+5p)</span>
              </button>
              {/* Secondary Actions */}
              <button
                onClick={() => onOpenEssayGrading(sessionId)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Mở giao diện chấm bài tự luận"
              >
                <FileEdit className="w-3.5 h-3.5 text-slate-500" />
                <span>Chấm Tự Luận</span>
              </button>
              <button
                onClick={() => onOpenResults(sessionId)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Xem bảng điểm & kết quả"
              >
                <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Báo Cáo Điểm</span>
              </button>
              {/* Destructive Action */}
              <button
                onClick={handleFinishSession}
                className="px-3.5 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Tự động thu bài tất cả máy con và đóng ca thi"
              >
                <StopCircle className="w-3.5 h-3.5 text-rose-500" />
                <span>Thu Bài / Kết Thúc</span>
              </button>
            </>
          )}

          {session?.status === 'finished' && (
            <>
              {/* Primary Action */}
              <button
                onClick={() => onOpenResults(sessionId)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="Xem báo cáo điểm số và in bài thi"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Báo Cáo Điểm & In Bài</span>
              </button>
              {/* Secondary Actions */}
              <button
                onClick={() => window.open(`/api/sessions/${sessionId}/export-excel`, '_blank')}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Tải bảng điểm Excel (.xlsx)"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Xuất Excel (.xlsx)</span>
              </button>
              <button
                onClick={() => onOpenEssayGrading(sessionId)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Mở giao diện chấm bài tự luận"
              >
                <FileEdit className="w-3.5 h-3.5 text-slate-500" />
                <span>Chấm Tự Luận</span>
              </button>
            </>
          )}

          {/* Nút Công Bố Điểm cho ca thi có chế độ manual_release */}
          {session?.score_release_mode === 'manual_release' && (
            session?.scores_released_at ? (
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Đã Mở Điểm</span>
              </span>
            ) : (
              <button
                onClick={handleReleaseScores}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="Mở khóa công bố điểm cho học sinh phòng thi"
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>Công Bố Điểm</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Time Expired Notice Banner */}
      {session?.status === 'in_progress' && remainingSeconds === 0 && (
        <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h3 className="font-bold text-rose-900 text-sm">
                ĐÃ HẾT THỜI GIAN LÀM BÀI QUY ĐỊNH ({session?.duration_minutes} PHÚT)
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Các thí sinh chưa nộp bài có thể đang hoàn tất nộp. Thầy/Cô có thể bấm <strong>"Bù Giờ (+5p)"</strong> nếu muốn gia hạn, hoặc bấm <strong>"Thu Bài / Kết Thúc"</strong> để tự động thu bài toàn bộ học sinh.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddExtraTime(null)}
              className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-blue-600" /> Bù Giờ (+5p)
            </button>
            <button
              onClick={handleFinishSession}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <StopCircle className="w-4 h-4" /> Thu Bài & Kết Thúc Ngay
            </button>
          </div>
        </div>
      )}

      {/* Waiting Room Card - SaaS Enterprise */}
      {session?.status === 'waiting' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                  Chế độ phòng chờ
                </span>
                <span className="text-xs text-slate-400 font-mono">• Thời lượng: {session?.duration_minutes} phút</span>
              </div>
              <h3 className="font-bold text-slate-900 text-base mt-1">
                Sẵn sàng phát đề và tính giờ cho toàn bộ thí sinh
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Học sinh khi đăng nhập sẽ ở phòng chờ và được điểm danh. Khi thầy/cô bấm kích hoạt, toàn phòng sẽ đồng loạt nhận đề và bắt đầu đếm ngược thời gian làm bài.
              </p>
            </div>
          </div>
          <button
            onClick={handleStartSession}
            disabled={startingExam}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-semibold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{startingExam ? 'Đang kích hoạt...' : 'BẮT ĐẦU LÀM BÀI CHO TOÀN PHÒNG'}</span>
          </button>
        </div>
      )}

      {/* Student Access Instructions Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Học sinh mở trình duyệt truy cập:</span>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded font-mono font-bold text-sm select-all">
                {typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
                  ? `${window.location.origin}/student`
                  : `http://${serverInfo.serverIp || 'localhost'}:${serverInfo.port || 3000}/student`}
              </span>
            </div>
            <div className="text-xs text-slate-600 mt-1 flex items-center gap-2">
              <span>Mã Ca Thi: <strong className="text-amber-800 font-mono font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{session?.session_code}</strong></span>
              <span>•</span>
              <span className="text-slate-500">Học sinh chỉ cần nhập SBD, hệ thống sẽ tự động xác thực danh tính.</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const url = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
                ? `${window.location.origin}/student`
                : `http://${serverInfo.serverIp || 'localhost'}:${serverInfo.port || 3000}/student`;
              navigator.clipboard.writeText(url);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedLink ? 'Đã chép link' : 'Sao chép link'}
          </button>
          <a
            href="/api/system/download-launcher"
            download="ThiOnline.html"
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
            title="Tải file mở phòng thi tự động đặt trên màn hình học sinh"
          >
            <Download className="w-3.5 h-3.5" /> Tải Shortcut Máy Con
          </a>
        </div>
      </div>

      {/* Emergency Action Alerts Banner (Yêu Cầu Khẩn Cấp: Đổi Máy / Nhập Nhầm SBD / Khóa Vi Phạm) */}
      {emergencyAlerts.length > 0 && (
        <div className="space-y-3">
          {emergencyAlerts.map(alert => (
            <div
              key={alert.id}
              className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2 ${
                alert.type === 'wrong_login'
                  ? 'bg-amber-50/95 border-amber-300 text-amber-900 ring-1 ring-amber-400'
                  : alert.type === 'violation_lock'
                  ? 'bg-rose-50/95 border-rose-300 text-rose-900 ring-1 ring-rose-400'
                  : 'bg-blue-50/95 border-blue-300 text-blue-900 ring-1 ring-blue-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 ${
                  alert.type === 'wrong_login'
                    ? 'bg-amber-100 text-amber-700 border-amber-300'
                    : alert.type === 'violation_lock'
                    ? 'bg-rose-100 text-rose-700 border-rose-300'
                    : 'bg-blue-100 text-blue-700 border-blue-300'
                }`}>
                  {alert.type === 'wrong_login' ? (
                    <UserX className="w-5 h-5 animate-bounce" />
                  ) : alert.type === 'violation_lock' ? (
                    <ShieldAlert className="w-5 h-5 animate-pulse" />
                  ) : (
                    <KeyRound className="w-5 h-5 animate-pulse" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                      alert.type === 'wrong_login'
                        ? 'bg-amber-200 text-amber-900'
                        : alert.type === 'violation_lock'
                        ? 'bg-rose-200 text-rose-900'
                        : 'bg-blue-200 text-blue-900'
                    }`}>
                      {alert.type === 'wrong_login'
                        ? '🚨 BÁO CÁO NHẬP NHẦM SBD'
                        : alert.type === 'violation_lock'
                        ? '🛑 BÀI THI BỊ TẠM KHÓA (3 LẦN VI PHẠM)'
                        : '⚡ YÊU CẦU ĐỔI MÁY (MÁY CŨ BỊ TREO)'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">• {alert.time}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 mt-1">
                    Thí sinh: <span className="text-blue-700">{alert.studentName}</span> (SBD: <span className="font-mono">{alert.studentCode}</span>)
                  </p>
                  <p className="text-xs opacity-90 mt-0.5">
                    {alert.type === 'wrong_login' && (
                      <>Học sinh báo bị máy khác chiếm SBD. Máy gửi yêu cầu: <code className="font-mono bg-white/60 px-1 py-0.5 rounded">{alert.victimIp || 'máy mới'}</code></>
                    )}
                    {alert.type === 'device_swap' && (
                      <>Máy tính cũ bị treo/đơ, học sinh đã chuyển sang máy mới: <code className="font-mono bg-white/60 px-1 py-0.5 rounded">{alert.requestIp || 'máy mới'}</code></>
                    )}
                    {alert.type === 'violation_lock' && (
                      <>Đã chạm giới hạn 3 lần cảnh báo vi phạm quy chế (rời màn hình / chuyển tab). Bài thi tạm khóa chờ mở khóa.</>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {alert.type === 'wrong_login' && (
                  <button
                    onClick={() => handleKickWrongLogin(alert.attemptId, alert.studentName, alert.id)}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserX className="w-4 h-4" /> Đá Máy Nhầm & Cho Vào Thi
                  </button>
                )}

                {alert.type === 'device_swap' && (
                  <button
                    onClick={() => handleUnlockDevice(alert.attemptId, alert.studentName, alert.id)}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Unlock className="w-4 h-4" /> Cho Phép Đổi Máy
                  </button>
                )}

                {alert.type === 'violation_lock' && (
                  <>
                    <button
                      onClick={() => handleUnlockViolation(alert.attemptId, alert.studentName, alert.id)}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Unlock className="w-4 h-4" /> Mở Khóa Cho Làm Tiếp
                    </button>
                    <button
                      onClick={() => handleRetakeAttempt(alert.attemptId, alert.studentName, alert.id)}
                      className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Cho Thi Lại Từ Đầu
                    </button>
                  </>
                )}

                <button
                  onClick={() => setEmergencyAlerts(prev => prev.filter(a => a.id !== alert.id))}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-black/5 rounded-lg transition cursor-pointer"
                  title="Bỏ qua thông báo này"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Realtime KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold">Tổng Thí Sinh</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
          </div>
          <Users className="w-8 h-8 text-blue-500 opacity-80" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold">Đang Làm Bài</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{stats.online}</p>
          </div>
          <Laptop className="w-8 h-8 text-emerald-500 opacity-80" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold">Đã Nộp Bài</p>
            <p className="text-2xl font-black text-indigo-600 mt-1">{stats.submitted}</p>
          </div>
          <CheckCircle className="w-8 h-8 text-indigo-500 opacity-80" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold">Cảnh Báo Gian Lận</p>
            <p className={`text-2xl font-black mt-1 ${stats.violating > 0 ? 'text-rose-600 animate-pulse' : 'text-slate-400'}`}>
              {stats.violating}
            </p>
          </div>
          <ShieldAlert className={`w-8 h-8 ${stats.violating > 0 ? 'text-rose-500 animate-bounce' : 'text-slate-400'}`} />
        </div>
      </div>

      {/* Realtime Urgent Cheat Alert Banner */}
      {violationsList.length > 0 && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 font-medium">
            <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 animate-pulse" />
            <span>
              <strong className="text-rose-800">CẢNH BÁO MỚI NHẤT [{violationsList[0].time}]:</strong> Thí sinh <strong className="text-slate-900">{violationsList[0].studentName}</strong> (SBD: {violationsList[0].studentCode}) - {violationsList[0].details} (Tổng: <strong className="text-rose-600">{violationsList[0].violationsCount} lần</strong>)
            </span>
          </div>
          <span className="text-[11px] px-2.5 py-1 bg-rose-100 text-rose-700 border border-rose-200 rounded font-bold uppercase tracking-wider">
            Phát Hiện Vi Phạm
          </span>
        </div>
      )}

      {/* Main Content: Lưới phòng máy (Left) & Bảng Nhật Ký Vi Phạm (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Computer Grid (2 cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Laptop className="w-5 h-5 text-blue-600" /> Sơ Đồ Máy Thí Sinh Thời Gian Thực ({students.length})
            </h3>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Đang thi</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Vi phạm</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span> Đã nộp</span>
            </div>
          </div>

          {students.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Laptop className="w-12 h-12 mx-auto text-slate-300 animate-pulse" />
              <p className="font-medium text-slate-600">Đang chờ thí sinh kết nối từ các máy trạm trong phòng máy...</p>
              <p className="text-xs text-slate-400">Thí sinh nhập mã ca thi: <strong className="text-blue-600 font-bold">{session?.session_code}</strong></p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {students.map(st => {
                const isViolated = (st.violations_count || 0) > 0;
                const isSubmitted = st.status === 'submitted' || st.status === 'forced_submitted';
                const progressPct = totalQuestions > 0 ? Math.round(((st.answered_count || 0) / totalQuestions) * 100) : 0;

                return (
                  <div
                    key={st.id}
                    className={`rounded-xl p-4 border transition-all relative flex flex-col justify-between ${
                      isViolated && !isSubmitted
                        ? 'bg-rose-50/70 border-rose-300 shadow-sm shadow-rose-100 ring-1 ring-rose-400'
                        : isSubmitted
                        ? 'bg-slate-50/90 border-slate-200 opacity-90'
                        : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-2xs'
                    }`}
                  >
                    <div>
                      {/* Top row */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs bg-slate-100 text-blue-700 px-2 py-0.5 rounded border border-slate-200">
                          {st.student_code}
                        </span>
                        {isViolated && (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-full flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="w-3 h-3" /> {st.violations_count} lỗi
                          </span>
                        )}
                      </div>

                      {/* Name & IP */}
                      <h4 className="font-bold text-slate-900 text-sm mt-2 line-clamp-1">{st.student_name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center justify-between">
                        <span>IP: {st.client_ip || 'LAN'}</span>
                        {st.class_name && <span>{st.class_name}</span>}
                      </p>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>Tiến độ:</span>
                          <span className="font-semibold text-slate-700">{st.answered_count || 0}/{totalQuestions} câu</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isSubmitted ? 'bg-indigo-600' : isViolated ? 'bg-rose-500' : 'bg-emerald-600'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Status / Score */}
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        {isSubmitted ? (
                          <div className="flex flex-col">
                            <span className="text-indigo-600 font-bold">
                              Đã nộp bài | Điểm: {st.total_score}đ
                            </span>
                            {st.submitted_at && (
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Nộp lúc: {formatToLocalTime(st.submitted_at)}
                              </span>
                            )}
                          </div>
                        ) : session?.status === 'waiting' || st.status === 'waiting' ? (
                          <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                            <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" /> Chờ phát đề
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span> Đang thi
                          </span>
                        )}
                        {st.extra_time_minutes > 0 && (
                          <span className="text-amber-600 font-mono text-[11px] font-bold">+{st.extra_time_minutes}p</span>
                        )}
                      </div>
                    </div>

                    {/* Quick actions for teacher */}
                    {isSubmitted ? (
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                        <button
                          onClick={() => handleResumeAttempt(st.id, st.student_name)}
                          className="flex-1 py-1 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer"
                          title="Mở lại bài thi cho thí sinh làm tiếp (giữ nguyên bài làm cũ)"
                        >
                          <Play className="w-3 h-3" /> Làm Tiếp
                        </button>
                        <button
                          onClick={() => handleRetakeAttempt(st.id, st.student_name)}
                          className="py-1 px-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer"
                          title="Hủy bài cũ và cho thí sinh thi lại đề mới từ đầu"
                        >
                          <RotateCcw className="w-3 h-3" /> Thi Lại
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                        {st.violations_count >= 3 && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleUnlockViolation(st.id, st.student_name)}
                              className="flex-1 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer"
                              title="Xóa 3 lần cảnh báo vi phạm để mở khóa cho thí sinh làm bài"
                            >
                              <Unlock className="w-3 h-3" /> Mở Khóa Vi Phạm
                            </button>
                            <button
                              onClick={() => handleRetakeAttempt(st.id, st.student_name)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                              title="Hủy bài và cho thí sinh thi lại đề mới từ đầu"
                            >
                              <RotateCcw className="w-3 h-3" /> Thi Lại
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedStudentForAction(st);
                            }}
                            className="flex-1 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition cursor-pointer"
                            title="Cộng thêm phút làm bài"
                          >
                            + Bù giờ
                          </button>
                          <button
                            onClick={() => handleUnlockDevice(st.id, st.student_name)}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                            title="Mở khóa đổi sang máy khác"
                          >
                            <KeyRound className="w-3 h-3" /> Đổi máy
                          </button>
                          <button
                            onClick={() => handleKickWrongLogin(st.id, st.student_name)}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                            title="Đá máy nhập nhầm SBD này"
                          >
                            <UserX className="w-3 h-3" /> Đá nhầm
                          </button>
                          <button
                            onClick={() => handleForceSubmit(st.id, st.student_name)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded text-xs font-semibold transition cursor-pointer"
                            title="Thu bài cưỡng chế"
                          >
                            <StopCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Violations Live Feed (1 col) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col h-[650px] shadow-xs">
          <h3 className="font-bold text-slate-900 text-base mb-3 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" /> Nhật Ký Vi Phạm Thời Gian Thực
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Hệ thống tự động phát hiện thí sinh thoát toàn màn hình, bấm Alt+Tab, phím Win hoặc mất focus.
          </p>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {violationsList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm italic">
                <CheckCircle className="w-8 h-8 text-emerald-500/60 mb-2" />
                Chưa ghi nhận vi phạm nào. Phòng thi trật tự!
              </div>
            ) : (
              violationsList.map((v, idx) => (
                <div key={idx} className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-rose-700 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {v.studentName} ({v.studentCode})
                    </span>
                    <span className="text-slate-500 font-mono">{v.time}</span>
                  </div>
                  <p className="text-slate-700 font-medium">Hành vi: {v.details || 'Mất tiêu điểm / Rời cửa sổ thi'}</p>
                  <p className="text-rose-700">Tổng số lần vi phạm của thí sinh: <strong className="font-bold">{v.violationsCount}</strong> lần</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal Bù Giờ Cá Nhân */}
      {selectedStudentForAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <h4 className="font-bold text-slate-900 text-lg">Bù Giờ Làm Bài</h4>
            <p className="text-sm text-slate-600">
              Cộng thêm thời gian cho thí sinh: <strong className="text-blue-600 font-bold">{selectedStudentForAction.student_name}</strong> ({selectedStudentForAction.student_code})
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Số phút cộng thêm:</label>
              <input
                type="number"
                min="1"
                max="60"
                value={extraMinutes}
                onChange={e => setExtraMinutes(e.target.value)}
                className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl p-2.5 text-slate-900 outline-none transition font-medium"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedStudentForAction(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition"
              >
                Hủy
              </button>
              <button
                onClick={() => handleAddExtraTime(selectedStudentForAction.id)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition shadow-xs"
              >
                Xác Nhận Cộng Giờ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
