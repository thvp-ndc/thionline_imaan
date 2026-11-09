import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Clock, CheckCircle, AlertTriangle, Send, ShieldAlert, Flag, Check, FileText, Maximize2, Eye, Keyboard } from 'lucide-react';
import MathContent from '../common/MathContent';
import QuestionOptions from '../common/QuestionOptions';
import { handleVietnameseKeyDown } from '../../utils/vietnameseIME';

export default function StudentExam({ examData, onExamFinished }) {
  const { attempt, session, examPaper, savedAnswers: initialAnswers, remainingSeconds: initialRemainingSeconds } = examData;
  const questions = examPaper?.questions || [];

  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState(() => {
    const map = {};
    (initialAnswers || []).forEach(a => {
      map[a.question_id] = {
        selected_options: a.selected_options || [],
        essay_content: a.essay_content || '',
        short_answer: a.short_answer || ''
      };
    });
    // Fallback: khôi phục từ localStorage nếu trước đó có gián đoạn mạng
    try {
      if (attempt?.id) {
        const localCached = localStorage.getItem(`vnlan_backup_ans_${attempt.id}`);
        if (localCached) {
          const parsed = JSON.parse(localCached);
          Object.assign(map, parsed);
        }
      }
    } catch (e) {}
    return map;
  });

  // Tự động lưu bản sao dự phòng vào LocalStorage mỗi khi có thay đổi đáp án
  useEffect(() => {
    if (attempt?.id && Object.keys(answers).length > 0) {
      try {
        localStorage.setItem(`vnlan_backup_ans_${attempt.id}`, JSON.stringify(answers));
      } catch (e) {}
    }
  }, [answers, attempt?.id]);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Dual-Channel Auto-Save: Realtime WebSocket + HTTP Persistence Redundancy
  const saveAnswer = (questionId, payload) => {
    if (!attempt?.id || !questionId) return;
    const data = {
      attemptId: attempt.id,
      questionId,
      selectedOptions: payload.selected_options || payload.selectedOptions,
      essayContent: payload.essay_content !== undefined ? payload.essay_content : payload.essayContent,
      shortAnswer: payload.short_answer !== undefined ? payload.short_answer : payload.shortAnswer
    };

    // Kênh 1: Realtime WebSocket (Độ trễ thấp < 10ms)
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('student_save_answer', data);
    }

    // Kênh 2: HTTP Save Fallback (Đảm bảo 100% không mất bài dù mạng LAN rớt WebSocket hay quá tải)
    fetch('/api/student/save-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(r => r.json())
      .then(d => {
        if (d && d.success) {
          setLastSavedTime(new Date().toLocaleTimeString('vi-VN'));
        }
      })
      .catch(() => {});
  };

  // Heartbeat Background Sync: Đồng bộ toàn bộ tiến độ lên máy chủ định kỳ 15 giây
  useEffect(() => {
    if (!attempt?.id) return;

    const syncInterval = setInterval(() => {
      const curAnswers = answersRef.current || answers;
      if (!curAnswers || Object.keys(curAnswers).length === 0) return;

      const payload = Object.entries(curAnswers).map(([qId, ans]) => ({
        questionId: qId,
        selectedOptions: ans.selected_options,
        essayContent: ans.essay_content,
        shortAnswer: ans.short_answer
      }));

      fetch('/api/student/sync-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: attempt.id,
          answers: payload
        })
      })
        .then(r => r.json())
        .then(d => {
          if (d && d.success) {
            setLastSavedTime(new Date().toLocaleTimeString('vi-VN'));
          }
        })
        .catch(() => {});
    }, 15000);

    return () => clearInterval(syncInterval);
  }, [attempt?.id]);

  // Vietnamese IME State
  const [imeMode, setImeMode] = useState(() => {
    try {
      return localStorage.getItem('lan_exam_ime_mode') || 'telex';
    } catch (e) {
      return 'telex';
    }
  });

  const handleImeModeChange = (mode) => {
    setImeMode(mode);
    try {
      localStorage.setItem('lan_exam_ime_mode', mode);
    } catch (e) {}
  };

  const [showVieKeyboardWarning, setShowVieKeyboardWarning] = useState(false);

  // Ref container câu hỏi của thí sinh để tự động cuộn lên đầu câu khi chuyển câu
  const questionCardRef = useRef(null);

  // Tự động cuộn mượt về đầu khi thí sinh chuyển câu
  useEffect(() => {
    if (questionCardRef.current) {
      questionCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentQIndex]);

  // Phím tắt bàn phím ← và → để thí sinh chuyển câu (Bảo vệ tuyệt đối khi đang gõ tự luận / input)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target;
      if (!target) return;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        setCurrentQIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' && questions?.length) {
        setCurrentQIndex(prev => Math.min(questions.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [questions]);

  // Tự động phát hiện bàn phím VIE của Windows khi bấm số mà ra chữ
  useEffect(() => {
    const detectVieKeyboard = (e) => {
      if (e.code && e.code.startsWith('Digit') && 'ăâêôđ'.includes(e.key.toLowerCase())) {
        setShowVieKeyboardWarning(true);
      }
    };
    window.addEventListener('keydown', detectVieKeyboard);
    return () => window.removeEventListener('keydown', detectVieKeyboard);
  }, []);

  const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
  const sessionMinutes = Number(session?.duration_minutes) || 45;
  const initialTime = (initialRemainingSeconds !== undefined && initialRemainingSeconds > 0)
    ? initialRemainingSeconds
    : sessionMinutes * 60;

  const [remainingSeconds, setRemainingSeconds] = useState(initialTime);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [violationsCount, setViolationsCount] = useState(attempt?.violations_count || 0);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [isExamSuspended, setIsExamSuspended] = useState(false);
  const [violationMsg, setViolationMsg] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);

  const socketRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastViolationTimeRef = useRef(0);
  const isSubmittedRef = useRef(false);
  const MAX_ALLOWED_VIOLATIONS = 3;

  // Web Audio API beep sound for violation warnings
  const playViolationBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(850, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(350, ctx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {}
  };

  // Fullscreen helper
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
      setIsFullscreen(true);

      // Lock keyboard if supported (Chrome/Edge in Fullscreen)
      if (navigator.keyboard && navigator.keyboard.lock) {
        navigator.keyboard.lock(['Escape', 'Tab']).catch(() => {});
      }
    } catch (err) {
      console.warn('Could not activate fullscreen:', err);
    }
  };

  // Auto request fullscreen on mount
  useEffect(() => {
    requestBrowserFullscreen();
  }, []);

  // Initialize Socket.io connection for real-time exam communication
  useEffect(() => {
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

    socket.on('answer_saved_ack', () => {
      setLastSavedTime(new Date().toLocaleTimeString('vi-VN'));
    });

    socket.on('exam_error', (data) => {
      console.warn('[Exam Socket] Cảnh báo máy thi:', data?.message);
    });

    socket.on('extra_time_granted', ({ minutes }) => {
      setRemainingSeconds(prev => prev + minutes * 60);
      alert(`🔔 GIÁM THỊ ĐÃ BÙ THỜI GIAN: Bạn được cộng thêm ${minutes} phút!`);
    });

    socket.on('command_exam_resumed', ({ extraMinutes, message }) => {
      if (extraMinutes) {
        setRemainingSeconds(prev => prev + extraMinutes * 60);
      }
      setIsExamSuspended(false);
      setViolationsCount(0);
      setShowViolationModal(false);
      requestBrowserFullscreen();
      alert(message || '🔔 BÀI THI ĐÃ ĐƯỢC MỞ LẠI: Bạn có thể tiếp tục làm bài!');
    });

    socket.on('command_force_logout', ({ reason }) => {
      alert(reason || '⚠️ GIÁM THỊ ĐÃ THU HỒI PHIÊN ĐĂNG NHẬP NÀY.');
      try {
        localStorage.removeItem(`vnlan_backup_ans_${attempt.id}`);
      } catch (e) {}
      window.location.reload();
    });

    socket.on('command_exam_retake', ({ message }) => {
      alert(message || '🔔 GIÁM THỊ ĐÃ CẤP QUYỀN THI LẠI TỪ ĐẦU.');
      try {
        localStorage.removeItem(`vnlan_backup_ans_${attempt.id}`);
      } catch (e) {}
      window.location.reload();
    });

    socket.on('command_force_submitted', ({ reason }) => {
      alert(`⚠️ HẾT GIỜ HOẶC CÓ LỆNH THU BÀI TỪ GIÁM THỊ: ${reason}`);
      handleSubmitExam();
    });

    socket.on('exam_submit_confirmed', (result) => {
      isSubmittedRef.current = true;
      setIsSubmitting(false);
      try {
        localStorage.removeItem(`vnlan_backup_ans_${attempt.id}`);
      } catch (e) {}
      onExamFinished({
        ...result,
        student_name: attempt.student_name,
        student_code: attempt.student_code,
        class_name: attempt.class_name
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Timer countdown: Starts on mount and runs reliably every second
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Anti-cheat window listeners & Fullscreen enforcement
  useEffect(() => {
    let blurTimer = null;

    const checkFullscreenState = () => {
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
      setIsFullscreen(fs);
      if (!fs) {
        reportViolation('exit_fullscreen', 'Thoát khỏi chế độ Toàn Màn Hình (Fullscreen)');
      }
    };

    const handleBlur = () => {
      // Micro-blur filter: Chờ 2 giây để tránh cảnh báo oan do pop-up Unikey, Windows Update hoặc chạm chuột ngoài mép
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        reportViolation('focus_loss', 'Rời cửa sổ thi hoặc chuyển đổi ứng dụng (>2s)');
      }, 2000);
    };

    const handleFocus = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        reportViolation('tab_switch', 'Ẩn cửa sổ bài thi hoặc mở tab trình duyệt khác');
      }
    };

    const handleKeyDown = (e) => {
      // 1. Prevent F11 (Fullscreen toggle by user), F12 (Inspect)
      if (e.key === 'F11' || e.key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', `Nhấn phím cấm: ${e.key}`);
        return;
      }

      // 2. Prevent F5 or Ctrl+R (Page refresh)
      if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 3. Prevent Ctrl+T (New tab), Ctrl+N (New window), Ctrl+W (Close tab)
      if (e.ctrlKey && ['t', 'T', 'n', 'N', 'w', 'W'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', `Cố tình mở/đóng tab: Ctrl+${e.key.toUpperCase()}`);
        return;
      }

      // 4. Prevent Ctrl+Tab, Ctrl+Shift+Tab (Switch browser tabs)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', 'Cố tình chuyển tab (Ctrl+Tab)');
        return;
      }

      // 5. Prevent Devtools shortcuts: Ctrl+Shift+I, J, C
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', 'Cố tình mở công cụ kiểm tra (Inspect)');
        return;
      }

      // 6. Prevent Ctrl+U (View source)
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 7. Prevent Alt+Tab if trapped by browser
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', 'Cố tình chuyển ứng dụng (Alt+Tab)');
        return;
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Bạn có chắc chắn muốn rời khỏi bài thi? Bài làm có thể bị gián đoạn!';
      return e.returnValue;
    };

    document.addEventListener('fullscreenchange', checkFullscreenState);
    document.addEventListener('webkitfullscreenchange', checkFullscreenState);
    document.addEventListener('mozfullscreenchange', checkFullscreenState);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('fullscreenchange', checkFullscreenState);
      document.removeEventListener('webkitfullscreenchange', checkFullscreenState);
      document.removeEventListener('mozfullscreenchange', checkFullscreenState);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const reportViolation = (type, details) => {
    // Debounce to prevent 1 blur/alt-tab from registering multiple times within 1.5s
    const now = Date.now();
    if (now - lastViolationTimeRef.current < 1500) {
      return;
    }
    lastViolationTimeRef.current = now;

    // Play warning sound
    playViolationBeep();

    setViolationsCount(prev => {
      const nextCount = prev + 1;
      setViolationMsg(details);
      setShowViolationModal(true);

      if (socketRef.current) {
        socketRef.current.emit('student_violation', {
          attemptId: attempt.id,
          violationType: type,
          details,
          violationsCount: nextCount
        });
      }

      // Khi đạt 3 lần vi phạm: Tạm dừng bài thi và chuyển sang trạng thái chờ Giám thị mở khóa (KHÔNG tự thu bài)
      if (nextCount >= MAX_ALLOWED_VIOLATIONS) {
        setIsExamSuspended(true);
      }

      return nextCount;
    });
  };

  const handleResumeExam = async () => {
    setShowViolationModal(false);
    await requestBrowserFullscreen();
  };

  const currentQ = questions[currentQIndex] || null;
  const currentAnswer = currentQ ? answers[currentQ.id] || { selected_options: [], essay_content: '', short_answer: '' } : null;

  const handleSelectOption = (optId) => {
    if (!currentQ) return;
    let newSelected = [];

    if (currentQ.question_type === 'single_choice' || currentQ.question_type === 'true_false') {
      newSelected = [optId];
    } else if (currentQ.question_type === 'multiple_choice') {
      const prev = currentAnswer.selected_options || [];
      if (prev.includes(optId)) {
        newSelected = prev.filter(id => id !== optId);
      } else {
        newSelected = [...prev, optId];
      }
    }

    const updatedAns = {
      ...currentAnswer,
      selected_options: newSelected
    };

    const updated = {
      ...answers,
      [currentQ.id]: updatedAns
    };
    setAnswers(updated);
    answersRef.current = updated;

    // Lưu bài ngay lập tức qua Kênh đôi (WebSocket + HTTP Fallback)
    saveAnswer(currentQ.id, updatedAns);
  };

  const handleSelectTrueFalse = (subId, choice) => {
    if (!currentQ) return;
    const prev = (currentAnswer.selected_options && typeof currentAnswer.selected_options === 'object' && !Array.isArray(currentAnswer.selected_options))
      ? { ...currentAnswer.selected_options }
      : {};

    prev[subId.toLowerCase()] = choice;

    const updatedAns = {
      ...currentAnswer,
      selected_options: prev
    };

    const updated = {
      ...answers,
      [currentQ.id]: updatedAns
    };
    setAnswers(updated);
    answersRef.current = updated;

    // Lưu bài ngay lập tức qua Kênh đôi (WebSocket + HTTP Fallback)
    saveAnswer(currentQ.id, updatedAns);
  };

  const handleEssayChange = (text) => {
    if (!currentQ) return;

    const updatedAns = {
      ...currentAnswer,
      essay_content: text
    };

    const updated = {
      ...answers,
      [currentQ.id]: updatedAns
    };
    setAnswers(updated);
    answersRef.current = updated;

    // Debounce save for essay text
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveAnswer(currentQ.id, updatedAns);
    }, 600);
  };

  const handleShortAnswerChange = (text) => {
    if (!currentQ) return;

    const updatedAns = {
      ...currentAnswer,
      short_answer: text
    };

    const updated = {
      ...answers,
      [currentQ.id]: updatedAns
    };
    setAnswers(updated);
    answersRef.current = updated;

    // Debounce save for short answer text
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveAnswer(currentQ.id, updatedAns);
    }, 400);
  };

  const toggleFlagQuestion = (qId) => {
    setFlaggedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const handleSubmitExam = async () => {
    if (isSubmitting || isSubmittedRef.current) return;
    setIsSubmitting(true);

    const answersPayload = Object.entries(answers).map(([qId, ans]) => ({
      questionId: qId,
      selectedOptions: ans.selected_options,
      essayContent: ans.essay_content,
      shortAnswer: ans.short_answer
    }));

    // 1. Thử nộp bài qua WebSocket (kèm mảng answers để đảm bảo không mất câu trả lời vừa gõ)
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('student_submit_exam', {
        attemptId: attempt.id,
        answers: answersPayload
      });
    }

    // 2. HTTP Fallback: Nếu mạng LAN chập chờn / rớt WebSocket, tự động nộp qua HTTP sau 2.5s
    setTimeout(async () => {
      if (!isSubmittedRef.current) {
        console.warn('[Exam Submit] WebSocket chập chờn hoặc rớt kết nối. Đang kích hoạt HTTP fallback...');
        try {
          const res = await fetch('/api/student/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              attemptId: attempt.id,
              answers: answersPayload
            })
          });
          const data = await res.json();
          if (data.success && data.gradeResult) {
            isSubmittedRef.current = true;
            setIsSubmitting(false);
            try {
              localStorage.removeItem(`vnlan_backup_ans_${attempt.id}`);
            } catch (e) {}
            onExamFinished({
              ...data.gradeResult,
              student_name: attempt.student_name,
              student_code: attempt.student_code,
              class_name: attempt.class_name
            });
          } else {
            console.error('[Exam Submit] HTTP fallback phản hồi lỗi:', data.message);
          }
        } catch (err) {
          console.error('[Exam Submit] Lỗi kết nối HTTP fallback:', err);
        }
      }
    }, 2500);
  };

  // Format remaining time
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isTimeLow = remainingSeconds <= 300; // < 5 mins

  // Helper check if question is answered
  const isQuestionAnswered = (q, a) => {
    if (!a) return false;
    if (q.question_type === 'essay') return a.essay_content && a.essay_content.trim().length > 0;
    if (q.question_type === 'short_answer') return a.short_answer && a.short_answer.trim().length > 0;
    if (q.question_type === 'true_false') {
      if (!a.selected_options) return false;
      if (typeof a.selected_options === 'object' && !Array.isArray(a.selected_options)) {
        return Object.values(a.selected_options).some(v => v === 'T' || v === 'F');
      }
      return Array.isArray(a.selected_options) && a.selected_options.length > 0;
    }
    return a.selected_options && a.selected_options.length > 0;
  };

  // Count answered questions
  const answeredCount = questions.filter(q => isQuestionAnswered(q, answers[q.id])).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col select-none">
      {/* Top Fixed Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4">
          <img 
            src="/vnlan-icon.png" 
            alt="VNLAN Icon" 
            className="w-9 h-9 object-contain drop-shadow-xs select-none" 
          />
          <div>
            <h1 className="text-sm font-bold text-slate-900 line-clamp-1">{session.exam_title}</h1>
            <p className="text-xs text-slate-500">
              Thí sinh: <strong className="text-blue-700">{attempt.student_name}</strong> (SBD: <strong className="text-slate-800 font-mono">{attempt.student_code}</strong>)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          {/* Vietnamese IME Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-xl text-xs">
            <span className="text-slate-500 font-bold text-[10.5px] uppercase mr-1 hidden sm:inline flex items-center gap-1">
              <Keyboard className="w-3.5 h-3.5 text-blue-600" /> Gõ TV:
            </span>
            <button
              type="button"
              onClick={() => handleImeModeChange('telex')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition ${
                imeMode === 'telex' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Gõ tiếng Việt kiểu Telex (s, f, r, x, j, aa, ee, oo, w, dd)"
            >
              Telex
            </button>
            <button
              type="button"
              onClick={() => handleImeModeChange('vni')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition ${
                imeMode === 'vni' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Gõ tiếng Việt kiểu VNI (1, 2, 3, 4, 5, 6, 7, 8, 9)"
            >
              VNI
            </button>
            <button
              type="button"
              onClick={() => handleImeModeChange('off')}
              className={`px-2 py-1 rounded-lg font-bold text-xs transition ${
                imeMode === 'off' ? 'bg-slate-200 text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Tắt bộ gõ tiếng Việt (chế độ tiếng Anh thuần)"
            >
              Tắt (EN)
            </button>
          </div>

          {/* Auto-save status */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>{lastSavedTime ? `Đã lưu: ${lastSavedTime}` : 'Đã kết nối máy chủ'}</span>
          </div>

          {/* Countdown Clock */}
          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-xl font-mono text-base font-black border transition ${
            isTimeLow ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse' : 'bg-blue-50 text-blue-700 border-blue-200'
          }`}>
            <Clock className="w-4 h-4" />
            <span>{timeFormatted}</span>
          </div>

          {/* Nộp Bài Button */}
          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" /> Nộp Bài Thi
          </button>
        </div>
      </header>

      {/* Cảnh báo Bàn phím VIE hệ thống của Windows */}
      {showVieKeyboardWarning && (
        <div className="bg-amber-50 border-b border-amber-300 px-6 py-2.5 flex items-center justify-between text-amber-900 text-xs shadow-sm sticky top-[57px] z-20">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 animate-bounce" />
            <div>
              <strong className="text-amber-800">CẢNH BÁO BÀN PHÍM PHÒNG MÁY:</strong> Hệ điều hành đang bật bàn phím tiếng Việt (VIE) làm phím số 1, 2, 3... biến thành chữ "ă, â, ê...".
              Thí sinh hãy nhấn tổ hợp phím <kbd className="px-1.5 py-0.5 bg-amber-100 border border-amber-300 rounded font-bold text-amber-950 shadow-xs">Windows + Phím cách (Space)</kbd> hoặc <kbd className="px-1.5 py-0.5 bg-amber-100 border border-amber-300 rounded font-bold text-amber-950 shadow-xs">Alt + Shift</kbd> để chuyển sang bàn phím <strong>ENG</strong>!
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowVieKeyboardWarning(false)}
            className="ml-4 px-3 py-1 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-800 rounded-lg text-xs font-bold shrink-0 transition"
          >
            Đã hiểu ✕
          </button>
        </div>
      )}

      {/* Main Examination Area: Master-Detail 2-Column Split View */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-6 items-start">
        {/* Left Column: Active Question Card (Main Focus Area) */}
        {currentQ && (
          <div ref={questionCardRef} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-sm min-w-0">
            <div>
              {/* Question Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold text-sm">
                    Câu {currentQIndex + 1}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                    currentQ.question_type === 'essay'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : currentQ.question_type === 'true_false'
                      ? 'bg-teal-50 text-teal-700 border border-teal-200'
                      : currentQ.question_type === 'multiple_choice'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    {currentQ.question_type === 'essay'
                      ? 'Tự Luận'
                      : currentQ.question_type === 'true_false'
                      ? '⚖️ Đúng / Sai (BGDĐT 2025)'
                      : currentQ.question_type === 'multiple_choice'
                      ? '☑️ Nhiều lựa chọn (Checklist)'
                      : 'Trắc nghiệm (1 đáp án)'}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
                    {currentQ.max_score} điểm
                  </span>
                </div>

                <button
                  onClick={() => toggleFlagQuestion(currentQ.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    flaggedQuestions.has(currentQ.id) ? 'bg-amber-50 text-amber-700 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" /> {flaggedQuestions.has(currentQ.id) ? 'Bỏ gắn cờ' : 'Đánh dấu xem lại'}
                </button>
              </div>

              {/* Question Statement */}
              <div className="border-l-4 border-l-blue-600 bg-gradient-to-r from-blue-50/30 to-slate-50/50 p-4 sm:p-5 rounded-r-2xl border-y border-r border-slate-200/90 shadow-2xs mb-6 text-slate-900 text-base sm:text-[16px] leading-relaxed font-sans">
                <MathContent content={currentQ.content || ''} />
              </div>

              {/* Question Body: TỰ LUẬN VS ĐÚNG/SAI VS TRẮC NGHIỆM */}
              {currentQ.question_type === 'essay' ? (
                /* ESSAY TEXTAREA */
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 font-medium bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4" /> Dạng câu hỏi tự luận - Soạn bài trực tiếp vào khung dưới đây:
                    </span>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                      {/* Tiện ích bộ gõ nhanh tại ô tự luận */}
                      <div className="flex items-center gap-1 bg-white border border-slate-300 px-1.5 py-0.5 rounded-md text-[11px]">
                        <span className="text-slate-500 font-semibold text-[10px]">Gõ TV:</span>
                        <button
                          type="button"
                          onClick={() => handleImeModeChange('telex')}
                          className={`px-1.5 py-0.5 rounded font-bold transition text-[10.5px] ${imeMode === 'telex' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          Telex
                        </button>
                        <button
                          type="button"
                          onClick={() => handleImeModeChange('vni')}
                          className={`px-1.5 py-0.5 rounded font-bold transition text-[10.5px] ${imeMode === 'vni' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          VNI
                        </button>
                        <button
                          type="button"
                          onClick={() => handleImeModeChange('off')}
                          className={`px-1.5 py-0.5 rounded font-bold transition text-[10.5px] ${imeMode === 'off' ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          Tắt
                        </button>
                      </div>
                      <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hidden md:inline">
                        Phím Tab: thụt lề 4 dấu cách
                      </span>
                      <span className="font-mono text-slate-600">
                        Số từ: {currentAnswer.essay_content ? currentAnswer.essay_content.trim().split(/\s+/).filter(Boolean).length : 0} | Ký tự: {currentAnswer.essay_content ? currentAnswer.essay_content.length : 0}
                      </span>
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={currentAnswer.essay_content || ''}
                    onChange={e => handleEssayChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = e.target.selectionStart;
                        const end = e.target.selectionEnd;
                        const val = e.target.value;
                        const newVal = val.substring(0, start) + '    ' + val.substring(end);
                        handleEssayChange(newVal);
                        setTimeout(() => {
                          e.target.selectionStart = e.target.selectionEnd = start + 4;
                        }, 0);
                        return;
                      }
                      handleVietnameseKeyDown(e, imeMode, currentAnswer.essay_content || '', handleEssayChange);
                    }}
                    placeholder="Gõ nội dung bài làm tự luận hoặc đoạn mã lập trình của bạn tại đây... (Hỗ trợ gõ tiếng Việt Telex/VNI trực tiếp, thụt lề bằng Tab, tự động lưu)"
                    style={{ tabSize: 4 }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-slate-900 text-sm leading-relaxed focus:bg-white focus:border-blue-500 focus:outline-none font-mono resize-y shadow-xs"
                  />
                  {currentAnswer.essay_content && (currentAnswer.essay_content.includes('```') || currentAnswer.essay_content.includes('$') || currentAnswer.essay_content.includes('![')) && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl animate-fadeIn">
                      <div className="text-xs font-bold text-blue-600 mb-1.5 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5" /> Xem trước định dạng bài làm (Mã Code / Công thức / Hình ảnh):
                      </div>
                      <div className="text-sm text-slate-800">
                        <MathContent content={currentAnswer.essay_content} />
                      </div>
                    </div>
                  )}
                </div>
              ) : currentQ.question_type === 'short_answer' ? (
                /* PHẦN TRẮC NGHIỆM TRẢ LỜI NGẮN (DẠNG 3 BGDĐT 2025) */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs">
                    <span className="text-blue-700 font-bold flex items-center gap-1.5">
                      ✏️ PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN
                    </span>
                    <span className="text-blue-600 font-medium">
                      Thí sinh nhập đáp số / câu trả lời ngắn vào ô bên dưới (hệ thống tự động lưu).
                    </span>
                  </div>

                  <div className="bg-slate-50 p-5 rounded-2xl border border-blue-100 space-y-3">
                    <label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" /> Nhập đáp số của bạn:
                    </label>
                    <input
                      type="text"
                      value={currentAnswer.short_answer || ''}
                      onChange={e => handleShortAnswerChange(e.target.value)}
                      placeholder="Nhập kết quả, đáp số hoặc giá trị cần trả lời..."
                      className="w-full max-w-lg bg-white border-2 border-blue-400 focus:border-blue-600 rounded-xl px-4 py-3 text-slate-900 text-base font-mono font-bold tracking-wider focus:outline-none focus:ring-4 focus:ring-blue-100 transition shadow-xs"
                    />
                    <p className="text-xs text-slate-500">
                      💡 Gợi ý: Có thể nhập số nguyên, số thập phân (hệ thống chấp nhận cả <code>12</code>, <code>6.18</code> hoặc <code>6,18</code>) hoặc chuỗi ký tự theo yêu cầu của câu hỏi.
                    </p>
                  </div>
                </div>
              ) : currentQ.question_type === 'true_false' ? (
                /* BẢNG CHỌN ĐÚNG / SAI 4 Ý THEO CHUẨN BGDĐT 2025 */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs">
                    <span className="text-teal-800 font-bold flex items-center gap-1.5">
                      ⚖️ PHẦN TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d)
                    </span>
                    <span className="text-teal-700 font-medium">
                      Trong mỗi ý, thí sinh click chọn [ĐÚNG] hoặc [SAI].
                    </span>
                  </div>

                  <div className="space-y-3">
                    {(currentQ.options || []).map((opt) => {
                      const subId = opt.id.toLowerCase();
                      let studentChoice = null;
                      if (currentAnswer.selected_options) {
                        if (typeof currentAnswer.selected_options === 'object' && !Array.isArray(currentAnswer.selected_options)) {
                          studentChoice = currentAnswer.selected_options[subId] || null;
                        } else if (Array.isArray(currentAnswer.selected_options)) {
                          const found = currentAnswer.selected_options.find(x => typeof x === 'string' && x.startsWith(subId + ':'));
                          if (found) studentChoice = found.split(':')[1]?.toUpperCase();
                        }
                      }

                      return (
                        <div
                          key={opt.id}
                          className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            studentChoice
                              ? 'bg-teal-50/60 border-teal-300 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start gap-3 flex-1">
                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm font-mono flex-shrink-0 transition ${
                              studentChoice ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {opt.id})
                            </span>
                            <div className="text-sm text-slate-800 mt-1 leading-relaxed">
                              <MathContent content={opt.text || opt.content || ''} />
                            </div>
                          </div>

                          {/* 2 Nút ĐÚNG và SAI */}
                          <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0 pt-2 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleSelectTrueFalse(subId, 'T')}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer ${
                                studentChoice === 'T'
                                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 shadow-sm scale-105'
                                  : 'bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-300'
                              }`}
                            >
                              <Check className="w-4 h-4" /> ĐÚNG
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectTrueFalse(subId, 'F')}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer ${
                                studentChoice === 'F'
                                  ? 'bg-rose-600 text-white ring-2 ring-rose-300 shadow-sm scale-105'
                                  : 'bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-700 border border-slate-300'
                              }`}
                            >
                              ✕ SAI
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* MULTIPLE CHOICE / SINGLE CHOICE OPTIONS */
                <div className="space-y-3">
                  {currentQ.question_type === 'multiple_choice' ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs mb-3">
                      <span className="text-indigo-800 font-bold flex items-center gap-1.5">
                        ☑️ CÂU HỎI NHIỀU LỰA CHỌN (CHECKLIST)
                      </span>
                      <span className="text-indigo-700 font-medium">
                        Thí sinh có thể tích chọn nhiều phương án. Bấm vào từng phương án để chọn/bỏ chọn.
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                      <span>Các phương án lựa chọn:</span>
                      <div className="h-px bg-slate-200 flex-1"></div>
                    </div>
                  )}

                  <QuestionOptions
                    options={currentQ.options || []}
                    questionType={currentQ.question_type}
                    mode="interactive"
                    selectedOptions={currentAnswer.selected_options || []}
                    onSelectOption={handleSelectOption}
                  />
                </div>
              )}
            </div>

            {/* Bottom Nav Buttons (Previous / Next) */}
            <div className="pt-6 mt-6 border-t border-slate-200 flex items-center justify-between">
              <button
                disabled={currentQIndex === 0}
                onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                ← Câu Trước (←)
              </button>

              <button
                disabled={currentQIndex === questions.length - 1}
                onClick={() => setCurrentQIndex(prev => Math.min(questions.length - 1, prev + 1))}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:pointer-events-none text-white rounded-lg text-xs font-semibold transition shadow-xs cursor-pointer"
              >
                Câu Kế Tiếp (→) →
              </button>
            </div>
          </div>
        )}

        {/* Right Column: Question Navigation Sidebar (Palette) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col h-fit shadow-sm lg:sticky lg:top-20">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
            <span className="text-xs font-bold uppercase text-slate-700">Bảng Câu Hỏi</span>
            <span className="text-xs text-slate-500 font-medium">{answeredCount}/{questions.length} đã làm</span>
          </div>

          {/* Question Circles Grid */}
          <div className="grid grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {questions.map((q, idx) => {
              const a = answers[q.id];
              const isDone = isQuestionAnswered(q, a);
              const isCurrent = idx === currentQIndex;
              const isFlagged = flaggedQuestions.has(q.id);

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQIndex(idx)}
                  className={`h-9 rounded-lg font-bold text-xs flex items-center justify-center transition relative cursor-pointer ${
                    isCurrent
                      ? 'ring-2 ring-blue-300 bg-blue-600 text-white font-black shadow-xs'
                      : isDone
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {idx + 1}
                  {isFlagged && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full"></span>
                  )}
                  {q.question_type === 'essay' && (
                    <span className={`absolute bottom-0.5 right-0.5 text-[8px] font-mono ${isCurrent || isDone ? 'text-white/80' : 'text-amber-600'}`}>TL</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 space-y-1.5 text-[11px] text-slate-600">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-600"></span> Đã trả lời
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300"></span> Chưa làm
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-blue-600 ring-2 ring-blue-300"></span> Đang xem
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Đã gắn cờ xem lại
            </div>
          </div>
        </div>
      </div>

      {/* Cảnh Báo Vi Phạm Modal */}
      {(showViolationModal || isExamSuspended) && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-rose-500 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <ShieldAlert className="w-16 h-16 text-rose-600 mx-auto animate-pulse" />
            <h3 className="text-xl font-black text-rose-700 uppercase tracking-wider">
              {violationsCount >= MAX_ALLOWED_VIOLATIONS || isExamSuspended
                ? 'BÀI THI TẠM THỜI BỊ KHÓA'
                : 'CẢNH BÁO VI PHẠM NỘI QUY THI!'}
            </h3>
            {violationMsg && (
              <p className="text-sm text-slate-700">
                Hệ thống phát hiện: <strong>{violationMsg}</strong>
              </p>
            )}
            <p className="text-xs text-slate-500">
              Số lần vi phạm của bạn: <strong className="text-rose-600 text-sm">{violationsCount} / {MAX_ALLOWED_VIOLATIONS}</strong> lần. Thông tin và thời điểm vi phạm đã được truyền trực tiếp đến màn hình Giám Thị!
            </p>
            {violationsCount >= MAX_ALLOWED_VIOLATIONS || isExamSuspended ? (
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-300 text-left space-y-2.5">
                <p className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                  🛑 BÀI THI TẠM THỜI BỊ KHÓA DO VI PHẠM QUY CHẾ 3 LẦN
                </p>
                <p className="text-xs text-rose-700 leading-relaxed">
                  Hệ thống đã ghi nhận vi phạm và gửi thông báo đến Giám thị phòng thi để kiểm tra và xử lý mở khóa.
                </p>
                <div className="pt-2 flex items-center justify-center gap-2 text-xs font-semibold text-rose-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
                  Đang chờ Giám thị xử lý từ máy điều khiển...
                </div>
              </div>
            ) : (
              <button
                onClick={handleResumeExam}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" /> Tôi Đã Hiểu & Bật Lại Toàn Màn Hình
              </button>
            )}
          </div>
        </div>
      )}

      {/* Màn Hình Bắt Buộc Toàn Màn Hình (Fullscreen Lock Overlay) */}
      {!isFullscreen && (
        <div className="fixed inset-0 z-40 bg-slate-900/75 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-md w-full bg-white border-2 border-amber-500 rounded-3xl p-8 shadow-2xl space-y-5">
            <div className="w-20 h-20 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 mx-auto flex items-center justify-center">
              <Maximize2 className="w-10 h-10 animate-bounce" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-wider">
              Yêu Cầu Toàn Màn Hình
            </h2>
            <p className="text-sm text-slate-600">
              Quy chế thi bắt buộc bài làm phải luôn ở chế độ <strong>Toàn Màn Hình</strong>. Nội dung câu hỏi tạm thời bị che mờ để đảm bảo tính công bằng.
            </p>
            <p className="text-xs text-amber-700 font-medium">
              Số lần vi phạm / thoát màn hình: <strong>{violationsCount} / {MAX_ALLOWED_VIOLATIONS}</strong>
            </p>
            <button
              onClick={requestBrowserFullscreen}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-sm transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
            >
              <Maximize2 className="w-4 h-4" /> BẬT LẠI TOÀN MÀN HÌNH ĐỂ LÀM BÀI
            </button>
          </div>
        </div>
      )}

      {/* Xác Nhận Nộp Bài Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Xác Nhận Nộp Bài Thi</h3>
            <p className="text-sm text-slate-600">
              Bạn đã hoàn thành <strong className="text-emerald-600">{answeredCount}/{questions.length}</strong> câu hỏi.
            </p>
            {answeredCount < questions.length && (
              <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                ⚠️ Bạn vẫn còn {questions.length - answeredCount} câu chưa trả lời. Bạn có chắc chắn muốn nộp bài sớm không?
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-sm font-medium transition"
              >
                Tiếp Tục Làm Bài
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitExam}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition shadow"
              >
                {isSubmitting ? 'Đang nộp...' : 'Đồng Ý Nộp Bài'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
