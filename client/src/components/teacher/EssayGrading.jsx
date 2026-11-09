import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, CheckCircle2, FileEdit, Award, HelpCircle, Save, Download, FileText, ChevronRight, User, AlertCircle, Sparkles } from 'lucide-react';
import StudentPaperModal from './StudentPaperModal';
import MathContent from '../common/MathContent';

export default function EssayGrading({ sessionId, onBack, onOpenResults }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const [selectedAnswerId, setSelectedAnswerId] = useState(null);
  const [manualScore, setManualScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'ungraded', 'graded'
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingAttemptId, setViewingAttemptId] = useState(null);

  const fetchEssays = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/teacher/sessions/${sessionId}/essays`);
      const data = await res.json();
      if (data.success) {
        const subs = data.submissions || [];
        setSubmissions(subs);
        if (subs.length > 0) {
          // Default pick first attempt & its first question
          const firstAttId = subs[0].attempt_id;
          setSelectedAttemptId(firstAttId);
          const firstSub = subs.find(s => s.attempt_id === firstAttId);
          if (firstSub) {
            setSelectedAnswerId(firstSub.answer_id);
            setManualScore(firstSub.manual_score !== null ? firstSub.manual_score : '');
            setFeedback(firstSub.teacher_feedback || '');
          }
        }
      }
    } catch (err) {
      console.error('Fetch essays error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEssays();
  }, [sessionId]);

  // Group submissions by student attempt
  const students = useMemo(() => {
    const map = {};
    submissions.forEach(sub => {
      if (!map[sub.attempt_id]) {
        map[sub.attempt_id] = {
          attempt_id: sub.attempt_id,
          student_code: sub.student_code,
          student_name: sub.student_name,
          class_name: sub.class_name,
          client_ip: sub.client_ip,
          questions: []
        };
      }
      map[sub.attempt_id].questions.push(sub);
    });
    return Object.values(map);
  }, [submissions]);

  // Filter students based on status and search term
  const filteredStudents = useMemo(() => {
    return students.filter(st => {
      const allGraded = st.questions.every(q => q.manual_score !== null);
      const noneGraded = st.questions.every(q => q.manual_score === null);
      
      if (filterStatus === 'graded' && !allGraded) return false;
      if (filterStatus === 'ungraded' && allGraded) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchCode = st.student_code && st.student_code.toLowerCase().includes(term);
        const matchName = st.student_name && st.student_name.toLowerCase().includes(term);
        if (!matchCode && !matchName) return false;
      }
      return true;
    });
  }, [students, filterStatus, searchTerm]);

  // Current active student
  const currentStudent = useMemo(() => {
    return students.find(st => st.attempt_id === selectedAttemptId) || (students.length > 0 ? students[0] : null);
  }, [students, selectedAttemptId]);

  // Current active question of current student
  const currentQuestions = useMemo(() => {
    return currentStudent ? currentStudent.questions : [];
  }, [currentStudent]);

  const currentSub = useMemo(() => {
    return currentQuestions.find(q => q.answer_id === selectedAnswerId) || (currentQuestions.length > 0 ? currentQuestions[0] : null);
  }, [currentQuestions, selectedAnswerId]);

  // When changing student or sub
  const handleSelectStudent = (st) => {
    setSelectedAttemptId(st.attempt_id);
    // Find first ungraded question of this student, or first question
    const firstUngraded = st.questions.find(q => q.manual_score === null) || st.questions[0];
    if (firstUngraded) {
      setSelectedAnswerId(firstUngraded.answer_id);
      setManualScore(firstUngraded.manual_score !== null ? firstUngraded.manual_score : '');
      setFeedback(firstUngraded.teacher_feedback || '');
    }
  };

  const handleSelectQuestion = (q) => {
    setSelectedAnswerId(q.answer_id);
    setManualScore(q.manual_score !== null ? q.manual_score : '');
    setFeedback(q.teacher_feedback || '');
  };

  const handleSetQuickScore = (val) => {
    setManualScore(String(val));
  };

  const handleSaveGrade = async (e) => {
    if (e) e.preventDefault();
    if (!currentSub) return;
    if (manualScore === '' || isNaN(manualScore)) return alert('Vui lòng nhập điểm số hợp lệ!');

    const scoreNum = Number(manualScore);
    if (scoreNum < 0 || scoreNum > currentSub.question_max_score) {
      return alert(`Điểm phải nằm trong khoảng từ 0 đến ${currentSub.question_max_score}!`);
    }

    try {
      setSaving(true);
      const res = await fetch('/api/teacher/grade-essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answerId: currentSub.answer_id,
          manualScore: scoreNum,
          teacherFeedback: feedback
        })
      });
      const data = await res.json();
      if (data.success) {
        // Update local submissions
        const updatedSubmissions = submissions.map(s => s.answer_id === currentSub.answer_id ? {
          ...s,
          manual_score: scoreNum,
          teacher_feedback: feedback
        } : s);
        setSubmissions(updatedSubmissions);

        // Check for next ungraded question of the SAME student
        const currentStudentQuestions = updatedSubmissions.filter(s => s.attempt_id === currentSub.attempt_id);
        const nextUngradedInStudent = currentStudentQuestions.find(q => q.answer_id !== currentSub.answer_id && q.manual_score === null);

        if (nextUngradedInStudent) {
          // Switch to next question of this same student!
          setSelectedAnswerId(nextUngradedInStudent.answer_id);
          setManualScore(nextUngradedInStudent.manual_score !== null ? nextUngradedInStudent.manual_score : '');
          setFeedback(nextUngradedInStudent.teacher_feedback || '');
        } else {
          // Student finished all essay questions!
          // Find next student who has ungraded questions
          const otherStudents = students.filter(st => st.attempt_id !== currentSub.attempt_id);
          const nextStudentWithUngraded = otherStudents.find(st => {
            const stSubs = updatedSubmissions.filter(s => s.attempt_id === st.attempt_id);
            return stSubs.some(q => q.manual_score === null);
          });

          if (nextStudentWithUngraded) {
            const stSubs = updatedSubmissions.filter(s => s.attempt_id === nextStudentWithUngraded.attempt_id);
            const firstUn = stSubs.find(q => q.manual_score === null) || stSubs[0];
            setSelectedAttemptId(nextStudentWithUngraded.attempt_id);
            if (firstUn) {
              setSelectedAnswerId(firstUn.answer_id);
              setManualScore(firstUn.manual_score !== null ? firstUn.manual_score : '');
              setFeedback(firstUn.teacher_feedback || '');
            }
          }
        }
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi lưu điểm: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Progress stats
  const totalSubmissionsCount = submissions.length;
  const gradedSubmissionsCount = submissions.filter(s => s.manual_score !== null).length;
  const progressPct = totalSubmissionsCount > 0 ? Math.round((gradedSubmissionsCount / totalSubmissionsCount) * 100) : 0;

  const totalStudents = students.length;
  const fullyGradedStudents = students.filter(st => st.questions.every(q => q.manual_score !== null)).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
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
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileEdit className="w-5 h-5 text-amber-500" /> Bàn Chấm Thi Tự Luận Chuyên Dụng
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Chấm từng câu theo từng thí sinh, tự động chuyển câu thông minh và tính điểm tức thì
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-500 font-semibold uppercase">Tiến Độ Chấm Ca Thi</p>
            <p className="text-sm font-bold text-emerald-600">
              {fullyGradedStudents}/{totalStudents} thí sinh ({gradedSubmissionsCount}/{totalSubmissionsCount} câu - {progressPct}%)
            </p>
          </div>
          <button
            onClick={() => onOpenResults(sessionId)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition shadow-xs flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Báo Cáo & Xuất Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">Đang tải danh sách bài làm tự luận...</div>
      ) : submissions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-600 shadow-xs">
          <FileEdit className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <p className="text-base font-semibold text-slate-800">Không có câu hỏi tự luận nào cần chấm trong ca thi này.</p>
          <p className="text-xs text-slate-500 mt-1">Đề thi của ca này chỉ có các câu hỏi trắc nghiệm đã được hệ thống tự động chấm 100%.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar: Students List */}
          <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-4 flex flex-col h-[750px] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-600" /> Danh Sách Thí Sinh ({students.length})
              </h3>
            </div>

            {/* Search Box */}
            <input
              type="text"
              placeholder="Tìm SBD hoặc Họ tên..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white mb-2.5 transition"
            />

            {/* Filter Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg mb-3 text-[11px] font-semibold">
              <button
                onClick={() => setFilterStatus('all')}
                className={`py-1 rounded text-center transition ${filterStatus === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Tất cả ({students.length})
              </button>
              <button
                onClick={() => setFilterStatus('ungraded')}
                className={`py-1 rounded text-center transition ${filterStatus === 'ungraded' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Chưa xong ({students.length - fullyGradedStudents})
              </button>
              <button
                onClick={() => setFilterStatus('graded')}
                className={`py-1 rounded text-center transition ${filterStatus === 'graded' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Đã xong ({fullyGradedStudents})
              </button>
            </div>

            {/* Student Items List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredStudents.map(st => {
                const isSelected = st.attempt_id === selectedAttemptId;
                const totalQ = st.questions.length;
                const gradedQ = st.questions.filter(q => q.manual_score !== null).length;
                const isAllGraded = gradedQ === totalQ && totalQ > 0;
                const totalEssayScore = Math.round(st.questions.reduce((acc, q) => acc + (q.manual_score || 0), 0) * 100) / 100;
                const maxPossible = Math.round(st.questions.reduce((acc, q) => acc + (q.question_max_score || 0), 0) * 100) / 100;

                return (
                  <button
                    key={st.attempt_id}
                    onClick={() => handleSelectStudent(st)}
                    className={`w-full text-left p-3 rounded-xl border transition text-xs flex flex-col justify-between shadow-2xs ${
                      isSelected
                        ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-400/20'
                        : isAllGraded
                        ? 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        : 'bg-white border-slate-200 hover:border-amber-400 hover:bg-amber-50/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-blue-600">{st.student_code}</span>
                      {isAllGraded ? (
                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold text-[10px]">
                          ✓ Đạt: {totalEssayScore}/{maxPossible}đ
                        </span>
                      ) : gradedQ > 0 ? (
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-semibold text-[10px]">
                          Đang chấm: {gradedQ}/{totalQ} câu
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded text-[10px]">
                          Chưa chấm (0/{totalQ})
                        </span>
                      )}
                    </div>
                    <p className="text-slate-800 font-bold mt-1 truncate">{st.student_name}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                      <span>Lớp: {st.class_name || 'N/A'}</span>
                      <span className="font-mono text-[10px] text-slate-400">{st.client_ip || ''}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Workbench (Right 3 cols) */}
          {currentStudent && currentSub ? (
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-6 flex flex-col h-[750px] overflow-hidden shadow-xs">
              {/* Student Header Bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-blue-600 text-sm shadow-2xs">
                    {currentStudent.student_code.slice(-3)}
                  </div>
                  <div>
                    <h3 className="text-slate-900 font-bold text-base flex items-center gap-2">
                      {currentStudent.student_name}
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-mono font-medium">
                        SBD: {currentStudent.student_code}
                      </span>
                      {currentStudent.class_name && (
                        <span className="text-xs px-2 py-0.5 bg-slate-200/80 text-slate-700 rounded font-medium">
                          Lớp: {currentStudent.class_name}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tổng điểm tự luận hiện tại:{' '}
                      <strong className="text-amber-600 font-mono text-sm font-bold">
                        {Math.round(currentQuestions.reduce((sum, q) => sum + (q.manual_score || 0), 0) * 100) / 100}
                      </strong>{' '}
                      / {Math.round(currentQuestions.reduce((sum, q) => sum + (q.question_max_score || 0), 0) * 100) / 100} điểm
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingAttemptId(currentStudent.attempt_id)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
                    title="Xem toàn bộ bài làm, in ấn A4 hoặc tải file HTML của thí sinh này"
                  >
                    <FileText className="w-4 h-4" /> Xem Toàn Bộ Bài Thi
                  </button>
                </div>
              </div>

              {/* Question Navigation Tabs of Current Student */}
              <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                {currentQuestions.map((q, idx) => {
                  const isCurrent = q.answer_id === currentSub.answer_id;
                  const isQGraded = q.manual_score !== null;

                  return (
                    <button
                      key={q.answer_id}
                      onClick={() => handleSelectQuestion(q)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border flex-shrink-0 ${
                        isCurrent
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs ring-2 ring-amber-500/20'
                          : isQGraded
                          ? 'bg-slate-50 text-emerald-700 border-slate-200 hover:bg-slate-100'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-400 hover:bg-amber-50/20'
                      }`}
                    >
                      <span>Câu {q.order_index || idx + 1} ({q.question_max_score}đ)</span>
                      {isQGraded ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${isCurrent ? 'bg-amber-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                          {q.manual_score}đ
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px]">
                          Chưa chấm
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Question Statement Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 shadow-2xs">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded font-bold text-xs">
                    CÂU {currentSub.order_index} (Tự Luận - Tối Đa: {currentSub.question_max_score} điểm)
                  </span>
                </div>
                <div className="text-slate-800 font-medium text-sm leading-relaxed">
                  <MathContent content={currentSub.question_content} />
                </div>
              </div>

              {/* 2-Column Split: Student Answer (Left) vs Rubric & Grading Inputs (Right) */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden">
                {/* Student Essay Content */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col overflow-hidden shadow-2xs">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">BÀI LÀM CỦA THÍ SINH:</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {currentSub.essay_content ? currentSub.essay_content.trim().split(/\s+/).filter(Boolean).length : 0} từ | {currentSub.essay_content ? currentSub.essay_content.length : 0} ký tự
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans pr-2">
                    {currentSub.essay_content && currentSub.essay_content.trim() ? (
                      <MathContent content={currentSub.essay_content} />
                    ) : (
                      <div className="p-6 text-center text-slate-400 italic bg-white rounded-lg border border-dashed border-slate-200">
                        <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                        Thí sinh không làm câu này (Bỏ trống).
                      </div>
                    )}
                  </div>
                </div>

                {/* Rubric Guide & Grading Box */}
                <form onSubmit={handleSaveGrade} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col overflow-hidden shadow-2xs">
                  {/* Rubric Guide */}
                  <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                    <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3">
                      <h5 className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1.5">
                        <HelpCircle className="w-3.5 h-3.5" /> Barem Chấm & Đáp Án Mẫu:
                      </h5>
                      <div className="text-xs text-amber-900 leading-relaxed font-sans">
                        <MathContent content={currentSub.rubric_guide || 'Không có hướng dẫn chấm kèm theo.'} />
                      </div>
                    </div>

                    {/* Inputs */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Điểm Chấm (0.0 ➔ {currentSub.question_max_score}đ)
                        </label>
                        {/* Quick score buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetQuickScore(0)}
                            className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-bold transition shadow-2xs"
                          >
                            0đ
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetQuickScore(Math.round((currentSub.question_max_score / 2) * 10) / 10)}
                            className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[11px] font-bold transition shadow-2xs"
                          >
                            50% ({Math.round((currentSub.question_max_score / 2) * 10) / 10}đ)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetQuickScore(currentSub.question_max_score)}
                            className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-bold transition shadow-2xs"
                          >
                            Tối đa ({currentSub.question_max_score}đ)
                          </button>
                        </div>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={currentSub.question_max_score}
                        value={manualScore}
                        onChange={e => setManualScore(e.target.value)}
                        placeholder={`Nhập điểm 0.0 - ${currentSub.question_max_score}`}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-900 font-mono text-lg font-bold focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition shadow-2xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Nhận Xét / Lời Phê Cho Thí Sinh:
                      </label>
                      <textarea
                        value={feedback}
                        onChange={e => setFeedback(e.target.value)}
                        placeholder="Nhập lời phê, nhận xét ưu/nhược điểm bài làm..."
                        rows={3}
                        style={{ resize: 'vertical', minHeight: '75px' }}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition resize-y shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Submit Grade */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-xs"
                    >
                      <Save className="w-4 h-4" /> {saving ? 'Đang lưu...' : 'Lưu Điểm & Chấm Tiếp ➔'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-xs">
              Chọn một thí sinh ở cột bên trái để bắt đầu chấm bài.
            </div>
          )}
        </div>
      )}

      {/* Student Full Paper Modal */}
      {viewingAttemptId && (
        <StudentPaperModal
          attemptId={viewingAttemptId}
          sessionId={sessionId}
          onClose={() => setViewingAttemptId(null)}
        />
      )}
    </div>
  );
}
