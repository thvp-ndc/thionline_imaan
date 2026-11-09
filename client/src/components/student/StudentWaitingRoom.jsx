import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Clock, ShieldAlert, Laptop, UserCheck, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function StudentWaitingRoom({ examData, onExamStarted }) {
  const { attempt, session } = examData;
  const [checking, setChecking] = useState(false);
  const socketRef = useRef(null);

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
      console.warn('Fullscreen bypassed in waiting room:', err);
    }
  };

  useEffect(() => {
    requestBrowserFullscreen();

    // Connect socket and listen for exam start broadcast
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('student_join_exam', {
        attemptId: attempt.id,
        sessionId: session.id,
        studentCode: attempt.student_code,
        studentName: attempt.student_name,
        machineName: window.navigator.userAgent.slice(0, 40)
      });
    });

    socket.on('exam_started_broadcast', async (broadcastData) => {
      // Re-trigger fullscreen and start
      requestBrowserFullscreen();
      try {
        const joinRes = await fetch('/api/student/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionCode: session.session_code,
            studentCode: attempt.student_code,
            studentName: attempt.student_name,
            className: attempt.class_name
          })
        });
        const joinData = await joinRes.json();
        if (joinData.success && !joinData.waitingForTeacher) {
          onExamStarted(joinData);
          return;
        }
      } catch (err) {
        console.error('Error fetching student paper on start broadcast:', err);
      }

      // Fallback
      onExamStarted({
        ...examData,
        waitingForTeacher: false,
        session: {
          ...examData.session,
          status: 'in_progress',
          start_time: broadcastData.startTime,
          duration_minutes: broadcastData.durationMinutes || examData.session.duration_minutes
        },
        examPaper: broadcastData.examPaper,
        remainingSeconds: (Number(broadcastData.durationMinutes || examData.session.duration_minutes) || 45) * 60
      });
    });

    // Also poll every 8 seconds as fail-safe fallback
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${session.session_code}`);
        const data = await res.json();
        if (data.success && data.session && data.session.status === 'in_progress') {
          // Re-join to fetch paper
          const joinRes = await fetch('/api/student/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionCode: session.session_code,
              studentCode: attempt.student_code,
              studentName: attempt.student_name,
              className: attempt.class_name
            })
          });
          const joinData = await joinRes.json();
          if (joinData.success && !joinData.waitingForTeacher) {
            onExamStarted(joinData);
          }
        }
      } catch (e) {}
    }, 8000);

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [attempt.id, session.id]);

  const handleManualCheck = async () => {
    try {
      setChecking(true);
      const res = await fetch('/api/student/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: session.session_code,
          studentCode: attempt.student_code,
          studentName: attempt.student_name,
          className: attempt.class_name
        })
      });
      const data = await res.json();
      if (data.success) {
        if (!data.waitingForTeacher) {
          onExamStarted(data);
        } else {
          alert('Giám thị vẫn chưa phát lệnh bắt đầu làm bài. Vui lòng tiếp tục chờ!');
        }
      }
    } catch (err) {
      alert('Lỗi kiểm tra: ' + err.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col items-center justify-center p-6 select-none relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-3xl -top-32 -left-32 pointer-events-none"></div>
      <div className="absolute w-[500px] h-[500px] bg-indigo-400/10 rounded-full blur-3xl -bottom-32 -right-32 pointer-events-none"></div>

      <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xl relative z-10 space-y-7 text-center">
        {/* Top Waiting Badge */}
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold uppercase tracking-wider mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
            Phòng Chờ Làm Bài Của Học Sinh
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {session.title || 'Ca Thi Phòng Máy'}
          </h2>
          <p className="text-slate-500 text-xs mt-1.5 font-medium">
            Mã ca: <strong className="text-blue-600 font-mono text-sm">{session.session_code}</strong> • Thời gian: <strong className="text-amber-700 font-mono text-sm">{session.duration_minutes || 45} phút</strong>
          </p>
        </div>

        {/* Student Identification Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left grid grid-cols-2 gap-4 text-xs font-sans shadow-2xs">
          <div>
            <span className="text-slate-500 block">Thí sinh:</span>
            <strong className="text-slate-900 text-sm font-bold">{attempt.student_name}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Số báo danh (SBD):</span>
            <strong className="text-blue-600 font-mono text-base font-bold">{attempt.student_code}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Lớp / Khối:</span>
            <strong className="text-slate-800 text-sm font-semibold">{attempt.class_name || 'Tự do'}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Trạng thái thiết bị:</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Đã khóa 1 máy an toàn
            </span>
          </div>
        </div>

        {/* Big Waiting Status Indicator */}
        <div className="p-6 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-3">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto animate-pulse">
            <Clock className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold text-blue-900">
            ĐÃ ĐIỂM DANH THÀNH CÔNG
          </h4>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            Học sinh vui lòng giữ trật tự và ngồi tại vị trí máy tính. Khi giám thị bấm <strong>"Bắt Đầu Làm Bài"</strong>, màn hình sẽ tự động chuyển sang làm bài và đồng hồ đếm ngược sẽ bắt đầu.
          </p>
        </div>

        {/* Important Guidelines */}
        <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1.5 shadow-2xs">
          <div className="font-bold text-slate-800 flex items-center gap-1.5 uppercase text-xs mb-1">
            <ShieldAlert className="w-4 h-4 text-blue-600" /> Quy định phòng thi:
          </div>
          <p>• Không bấm phím Windows, Alt+Tab hoặc rời khỏi cửa sổ bài thi (vi phạm quá 3 lần sẽ bị khóa bài).</p>
          <p>• Mỗi học sinh chỉ được đăng nhập trên 1 máy tính duy nhất trong suốt ca thi.</p>
          <p>• Hệ thống sẽ tự động lưu đáp án sau mỗi thao tác chọn câu hỏi.</p>
        </div>

        {/* Manual Refresh Button */}
        <div>
          <button
            disabled={checking}
            onClick={handleManualCheck}
            className="px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs rounded-xl font-bold transition inline-flex items-center gap-2 border border-slate-200 shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Đang kiểm tra...' : 'Kiểm tra trạng thái ca thi'}
          </button>
        </div>
      </div>
    </div>
  );
}
