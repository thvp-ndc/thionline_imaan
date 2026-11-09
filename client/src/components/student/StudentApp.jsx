import React, { useState } from 'react';
import StudentLogin from './StudentLogin';
import StudentWaitingRoom from './StudentWaitingRoom';
import StudentExam from './StudentExam';
import StudentResult from './StudentResult';

export default function StudentApp() {
  const [examData, setExamData] = useState(null);
  const [examResult, setExamResult] = useState(null);

  const handleLoginSuccess = (data) => {
    if (data.alreadySubmitted) {
      const att = data.attempt || {};
      const canView = att.total_score !== undefined && att.total_score !== null;
      setExamResult({
        show_score: canView,
        mcq_score: att.mcq_score,
        essay_score: att.essay_score,
        total_score: att.total_score,
        is_graded: att.is_graded,
        submitted_at: att.submitted_at,
        student_code: att.student_code,
        student_name: att.student_name,
        class_name: att.class_name,
        message: data.message || 'Bài thi của bạn đã được ghi nhận thành công trên máy chủ.'
      });
    } else {
      setExamData(data);
    }
  };

  const handleExamStarted = (updatedData) => {
    setExamData(updatedData);
  };

  const handleExamFinished = (result) => {
    setExamResult(result);
  };

  const handleRestart = () => {
    setExamData(null);
    setExamResult(null);
  };

  if (examResult) {
    return <StudentResult result={examResult} onRestart={handleRestart} />;
  }

  if (examData) {
    // If waiting for teacher to start exam
    if (examData.waitingForTeacher || examData.session?.status === 'waiting') {
      return <StudentWaitingRoom examData={examData} onExamStarted={handleExamStarted} />;
    }
    return <StudentExam examData={examData} onExamFinished={handleExamFinished} />;
  }

  return <StudentLogin onLoginSuccess={handleLoginSuccess} />;
}
