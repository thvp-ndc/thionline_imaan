const db = require('../db');
const gradingService = require('./gradingService');
const examService = require('./examService');
const authService = require('./authService');
const licenseService = require('./licenseService');
const crypto = require('node:crypto');

// Map to track active sockets
const activeStudents = new Map(); // socketId -> { attemptId, sessionId, studentCode, clientIp }
let ioInstance = null;

function setupSocketIO(io) {
  ioInstance = io;
  io.on('connection', (socket) => {
    // 1. Teacher connects to monitor room (Require token or localhost origin)
    socket.on('teacher_join_room', ({ sessionId, token }) => {
      const clientIp = (socket.handshake.address || '').replace('::ffff:', '');
      const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1';
      const isAuthorized = isLocalhost || authService.verifyToken(token);

      if (!isAuthorized) {
        console.warn(`[Socket Security] Unauthorized attempt to join teacher room for session ${sessionId} from ${clientIp}`);
        return socket.emit('auth_error', { message: 'Phiên giáo viên không hợp lệ hoặc đã hết hạn.' });
      }

      const room = `teacher_session_${sessionId}`;
      socket.join(room);
      socket.sessionId = sessionId;
      socket.isTeacher = true;

      // Send initial roster state
      const students = db.prepare(`
        SELECT st.*, 
          (SELECT COUNT(*) FROM student_answers WHERE attempt_id = st.id AND (
            (selected_options_json IS NOT NULL AND selected_options_json != '[]' AND selected_options_json != '{}') OR 
            (essay_content IS NOT NULL AND TRIM(essay_content) != '') OR
            (short_answer IS NOT NULL AND TRIM(short_answer) != '')
          )) as answered_count
        FROM student_attempts st
        WHERE st.session_id = ?
        ORDER BY st.student_code ASC
      `).all(sessionId);

      socket.emit('teacher_roster_update', { students });
    });

    // 2. Student connects & joins session
    socket.on('student_join_exam', ({ attemptId, sessionId, studentCode, studentName, machineName }) => {
      // Dọn dẹp các socket cũ của cùng thí sinh này (tránh đếm trùng khi F5/reload hoặc rớt mạng)
      for (const [oldSockId, info] of activeStudents.entries()) {
        if (info.attemptId === attemptId && oldSockId !== socket.id) {
          activeStudents.delete(oldSockId);
        }
      }

      // Đếm số lượng thí sinh DUY NHẤT (Unique Attempt IDs)
      const uniqueActiveAttempts = new Set(Array.from(activeStudents.values()).map(s => s.attemptId));
      const isAlreadyInSession = uniqueActiveAttempts.has(attemptId);

      // Kiểm tra sĩ số ca thi: nếu học sinh đã được tạo bài thi trong ca thi này, luôn bảo đảm quyền kết nối
      const attemptRow = db.prepare('SELECT id, session_id FROM student_attempts WHERE id = ?').get(attemptId);
      if (!isAlreadyInSession && (!attemptRow || attemptRow.session_id !== sessionId)) {
        const licenseCheck = licenseService.canAcceptMoreStudents(uniqueActiveAttempts.size);
        if (!licenseCheck.allowed) {
          console.warn(`[Socket DRM] Từ chối kết nối máy thi: ${licenseCheck.reason}`);
          socket.emit('exam_error', {
            message: licenseCheck.reason || 'Phòng thi đã đạt giới hạn sĩ số của gói bản quyền hiện tại.'
          });
          return;
        }
      }

      socket.join(`session_${sessionId}`);
      socket.attemptId = attemptId;
      socket.sessionId = sessionId;
      socket.studentCode = studentCode;

      const clientIp = socket.handshake.address.replace('::ffff:', '');
      activeStudents.set(socket.id, { attemptId, sessionId, studentCode, clientIp });

      // Update attempt IP and machine
      db.prepare(`
        UPDATE student_attempts 
        SET client_ip = ?, client_machine_name = ?
        WHERE id = ?
      `).run(clientIp, machineName || 'Client PC', attemptId);

      // Notify teacher room
      io.to(`teacher_session_${sessionId}`).emit('student_status_change', {
        attemptId,
        studentCode,
        studentName,
        status: 'online',
        clientIp
      });
    });

    // 3. Realtime Auto-Save Answer (Trắc nghiệm, Đúng/Sai, Trả lời ngắn & Tự luận)
    socket.on('student_save_answer', ({ attemptId, questionId, selectedOptions, essayContent, shortAnswer }) => {
      try {
        // Tự động khôi phục nếu socket bị mất attemptId do race condition/reconnect nhưng attemptId hợp lệ
        if (!socket.attemptId || socket.attemptId !== attemptId) {
          const validAttempt = db.prepare('SELECT id, session_id, student_code FROM student_attempts WHERE id = ?').get(attemptId);
          if (validAttempt) {
            socket.attemptId = attemptId;
            socket.sessionId = validAttempt.session_id;
            socket.studentCode = validAttempt.student_code;
            socket.join(`session_${validAttempt.session_id}`);
          } else {
            console.warn(`[Socket Security] Spoofed student_save_answer from socket ${socket.id} (Expected: ${socket.attemptId}, Given: ${attemptId})`);
            return;
          }
        }

        const id = crypto.randomUUID();
        const selectedJson = selectedOptions ? JSON.stringify(selectedOptions) : null;
        const essay = essayContent !== undefined ? essayContent : null;
        const shortAns = shortAnswer !== undefined ? shortAnswer : null;

        // Upsert into student_answers
        db.prepare(`
          INSERT INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content, short_answer, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(attempt_id, question_id) DO UPDATE SET
            selected_options_json = COALESCE(excluded.selected_options_json, student_answers.selected_options_json),
            essay_content = COALESCE(excluded.essay_content, student_answers.essay_content),
            short_answer = COALESCE(excluded.short_answer, student_answers.short_answer),
            updated_at = CURRENT_TIMESTAMP
        `).run(id, attemptId, questionId, selectedJson, essay, shortAns);

        // Acknowledge back to student
        socket.emit('answer_saved_ack', {
          questionId,
          timestamp: Date.now()
        });

        // Broadcast progress update to teacher monitor
        if (socket.sessionId) {
          const answeredCount = db.prepare(`
            SELECT COUNT(*) as count FROM student_answers 
            WHERE attempt_id = ? AND (
              (selected_options_json IS NOT NULL AND selected_options_json != '[]' AND selected_options_json != '{}') OR 
              (essay_content IS NOT NULL AND TRIM(essay_content) != '') OR
              (short_answer IS NOT NULL AND TRIM(short_answer) != '')
            )
          `).get(attemptId).count;

          io.to(`teacher_session_${socket.sessionId}`).emit('student_progress_update', {
            attemptId,
            answeredCount
          });
        }
      } catch (err) {
        console.error('[Socket] Error auto-saving answer:', err.message);
      }
    });

    // 4. Report Violation (Alt+Tab, Win Key, Focus Loss, Kiosk breach)
    socket.on('student_violation', ({ attemptId, violationType, details }) => {
      try {
        if (!socket.attemptId || socket.attemptId !== attemptId) {
          return;
        }

        const row = db.prepare('SELECT violations_count, student_code, student_name, session_id FROM student_attempts WHERE id = ?').get(attemptId);
        if (!row) return;

        const newCount = (row.violations_count || 0) + 1;
        db.prepare('UPDATE student_attempts SET violations_count = ? WHERE id = ?').run(newCount, attemptId);

        db.prepare(`
          INSERT INTO activity_logs (id, session_id, student_code, event_type, details)
          VALUES (?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), row.session_id, row.student_code, violationType || 'violation', details || 'Phát hiện thoát toàn màn hình hoặc mất tiêu điểm');

        // Broadcast RED ALERT to teacher live monitor
        io.to(`teacher_session_${row.session_id}`).emit('student_violation_alert', {
          attemptId,
          studentCode: row.student_code,
          studentName: row.student_name,
          violationsCount: newCount,
          violationType,
          details,
          time: new Date().toLocaleTimeString('vi-VN')
        });
      } catch (err) {
        console.error('[Socket] Error recording violation:', err.message);
      }
    });

    // 5. Submit Exam
    socket.on('student_submit_exam', ({ attemptId, answers }) => {
      try {
        if (!socket.attemptId || socket.attemptId !== attemptId) {
          console.warn(`[Socket Security] Spoofed student_submit_exam from socket ${socket.id}`);
          return;
        }

        // Flush last-minute answers if provided (guarantees zero lost answers within debounce window)
        if (Array.isArray(answers) && answers.length > 0) {
          const upsertStmt = db.prepare(`
            INSERT INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content, short_answer, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(attempt_id, question_id) DO UPDATE SET
              selected_options_json = COALESCE(excluded.selected_options_json, student_answers.selected_options_json),
              essay_content = COALESCE(excluded.essay_content, student_answers.essay_content),
              short_answer = COALESCE(excluded.short_answer, student_answers.short_answer),
              updated_at = CURRENT_TIMESTAMP
          `);

          db.exec('BEGIN;');
          try {
            for (const a of answers) {
              const id = crypto.randomUUID();
              const selectedJson = a.selectedOptions !== undefined ? JSON.stringify(a.selectedOptions) : null;
              const essay = a.essayContent !== undefined ? a.essayContent : null;
              const shortAns = a.shortAnswer !== undefined ? a.shortAnswer : null;
              upsertStmt.run(id, attemptId, a.questionId, selectedJson, essay, shortAns);
            }
            db.exec('COMMIT;');
          } catch (txErr) {
            db.exec('ROLLBACK;');
            console.error('[Socket] Error flushing answers before submit:', txErr.message);
          }
        }

        db.prepare(`
          UPDATE student_attempts 
          SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(attemptId);

        const gradeResult = gradingService.autoGradeAttempt(attemptId);
        const updatedAttempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
        const session = socket.sessionId ? db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(socket.sessionId) : null;
        const studentResultDTO = examService.buildStudentResultDTO(updatedAttempt, session, gradeResult);

        socket.emit('exam_submit_confirmed', studentResultDTO);

        if (socket.sessionId) {
          io.to(`teacher_session_${socket.sessionId}`).emit('student_submitted_alert', {
            attemptId,
            gradeResult,
            submitted_at: updatedAttempt.submitted_at
          });
          io.to(`teacher_session_${socket.sessionId}`).emit('refresh_roster');
        }
      } catch (err) {
        console.error('[Socket] Error submitting exam:', err.message);
      }
    });

    // 6. TEACHER COMMAND: Add extra time (Requires verified teacher socket)
    socket.on('teacher_add_extra_time', ({ sessionId, attemptId, minutes }) => {
      if (!socket.isTeacher) {
        console.warn(`[Socket Security] Blocked unauthorized teacher_add_extra_time from ${socket.id}`);
        return socket.emit('auth_error', { message: 'Quyền bị từ chối: Chỉ giáo viên mới có thể bù thời gian.' });
      }

      if (attemptId) {
        // Extra time for single student
        db.prepare('UPDATE student_attempts SET extra_time_minutes = extra_time_minutes + ? WHERE id = ?').run(minutes, attemptId);
        
        // Find student socket
        for (const [sId, data] of activeStudents.entries()) {
          if (data.attemptId === attemptId) {
            io.to(sId).emit('extra_time_granted', { minutes });
            break;
          }
        }
      } else {
        // Extra time for all students in session
        db.prepare('UPDATE exam_sessions SET duration_minutes = duration_minutes + ? WHERE id = ?').run(minutes, sessionId);
        io.to(`session_${sessionId}`).emit('extra_time_granted', { minutes });
      }

      // Refresh teacher view
      io.to(`teacher_session_${sessionId}`).emit('refresh_roster');
    });

    // 7. TEACHER COMMAND: Force Submit (Requires verified teacher socket)
    socket.on('teacher_force_submit', ({ attemptId, sessionId }) => {
      if (!socket.isTeacher) {
        console.warn(`[Socket Security] Blocked unauthorized teacher_force_submit from ${socket.id}`);
        return socket.emit('auth_error', { message: 'Quyền bị từ chối: Chỉ giáo viên mới có thể thu bài.' });
      }

      db.prepare(`
        UPDATE student_attempts 
        SET status = 'forced_submitted', submitted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(attemptId);

      gradingService.autoGradeAttempt(attemptId);

      // Find student socket and command it to lock and submit
      for (const [sId, data] of activeStudents.entries()) {
        if (data.attemptId === attemptId) {
          io.to(sId).emit('command_force_submitted', {
            reason: 'Giám thị đã thực hiện thu bài cưỡng chế.'
          });
          break;
        }
      }

      io.to(`teacher_session_${sessionId}`).emit('refresh_roster');
    });

    // 8. TEACHER COMMAND: Unlock student device (Allow change PC)
    socket.on('teacher_unlock_student_device', ({ attemptId, sessionId }) => {
      if (!socket.isTeacher) {
        console.warn(`[Socket Security] Blocked unauthorized teacher_unlock_student_device from ${socket.id}`);
        return socket.emit('auth_error', { message: 'Quyền bị từ chối: Chỉ giáo viên mới có thể mở khóa thiết bị.' });
      }

      unlockStudentDevice(attemptId);
      io.to(`teacher_session_${sessionId}`).emit('refresh_roster');
    });

    // 9. TEACHER COMMAND: Resume student exam (Cho làm tiếp bài cũ)
    socket.on('teacher_resume_attempt', ({ attemptId, sessionId, extraTimeMinutes }) => {
      if (!socket.isTeacher) {
        console.warn(`[Socket Security] Blocked unauthorized teacher_resume_attempt from ${socket.id}`);
        return socket.emit('auth_error', { message: 'Quyền bị từ chối: Chỉ giáo viên mới có thể mở lại bài thi.' });
      }

      resumeStudentAttempt(attemptId, extraTimeMinutes);
      io.to(`teacher_session_${sessionId}`).emit('refresh_roster');
    });

    // 10. TEACHER COMMAND: Unlock violation (Mở khóa tạm dừng do 3 lần cảnh báo)
    socket.on('teacher_unlock_violation', ({ attemptId, sessionId }) => {
      if (!socket.isTeacher) {
        console.warn(`[Socket Security] Blocked unauthorized teacher_unlock_violation from ${socket.id}`);
        return socket.emit('auth_error', { message: 'Quyền bị từ chối: Chỉ giáo viên mới có thể mở khóa vi phạm.' });
      }

      unlockViolation(attemptId);
      io.to(`teacher_session_${sessionId}`).emit('refresh_roster');
    });

    // 11. TEACHER COMMAND: Kick wrong login device (Đá máy nhập nhầm SBD)
    socket.on('teacher_kick_wrong_login', ({ attemptId, sessionId, clearAnswers }) => {
      if (!socket.isTeacher) {
        console.warn(`[Socket Security] Blocked unauthorized teacher_kick_wrong_login from ${socket.id}`);
        return socket.emit('auth_error', { message: 'Quyền bị từ chối: Chỉ giáo viên mới có thể xử lý phiên đăng nhập.' });
      }

      kickWrongLoginDevice(attemptId, clearAnswers !== false);
      io.to(`teacher_session_${sessionId}`).emit('refresh_roster');
    });

    // 12. STUDENT REQUEST: Request device swap from login screen
    socket.on('student_request_device_swap', ({ sessionCode, studentCode, studentName, clientIp }) => {
      try {
        const sess = db.prepare('SELECT id FROM exam_sessions WHERE session_code = ?').get(sessionCode);
        if (sess) {
          io.to(`teacher_session_${sess.id}`).emit('student_device_swap_alert', {
            studentCode,
            studentName: studentName || studentCode,
            clientIp: clientIp || (socket.handshake.address || '').replace('::ffff:', ''),
            time: new Date().toLocaleTimeString('vi-VN')
          });
        }
      } catch (e) {
        console.error('[Socket] Error in student_request_device_swap:', e.message);
      }
    });

    // 13. STUDENT REPORT: Report wrong SBD collision from login screen
    socket.on('student_report_wrong_login', ({ sessionCode, studentCode, studentName, clientIp, lockedIp }) => {
      try {
        const sess = db.prepare('SELECT id FROM exam_sessions WHERE session_code = ?').get(sessionCode);
        if (sess) {
          io.to(`teacher_session_${sess.id}`).emit('student_wrong_login_alert', {
            studentCode,
            studentName: studentName || studentCode,
            clientIp: clientIp || (socket.handshake.address || '').replace('::ffff:', ''),
            lockedIp: lockedIp || 'Máy khác',
            time: new Date().toLocaleTimeString('vi-VN')
          });
        }
      } catch (e) {
        console.error('[Socket] Error in student_report_wrong_login:', e.message);
      }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      const student = activeStudents.get(socket.id);
      if (student) {
        activeStudents.delete(socket.id);
        io.to(`teacher_session_${student.sessionId}`).emit('student_status_change', {
          attemptId: student.attemptId,
          studentCode: student.studentCode,
          status: 'offline'
        });
      }
    });
  });
}

function isStudentOnlineOnOtherIp(studentCode, currentIp) {
  if (!studentCode) return { isOnline: false };
  for (const [sId, data] of activeStudents.entries()) {
    if (data.studentCode && data.studentCode.toUpperCase() === studentCode.toUpperCase()) {
      if (data.clientIp && data.clientIp !== currentIp) {
        return { isOnline: true, activeIp: data.clientIp, socketId: sId };
      }
    }
  }
  return { isOnline: false };
}

function unlockStudentDevice(attemptId) {
  for (const [sId, data] of activeStudents.entries()) {
    if (data.attemptId === attemptId) {
      activeStudents.delete(sId);
      break;
    }
  }
  db.prepare('UPDATE student_attempts SET is_device_locked = 0 WHERE id = ?').run(attemptId);
  return true;
}

function kickWrongLoginDevice(attemptId, clearAnswers = true) {
  for (const [sId, data] of activeStudents.entries()) {
    if (data.attemptId === attemptId) {
      if (ioInstance) {
        ioInstance.to(sId).emit('command_force_logout', {
          reason: 'Giám thị đã thu hồi phiên đăng nhập này do nhầm Số Báo Danh. Vui lòng đăng nhập lại đúng SBD của em.'
        });
      }
      activeStudents.delete(sId);
      break;
    }
  }

  if (clearAnswers) {
    db.prepare('DELETE FROM student_answers WHERE attempt_id = ?').run(attemptId);
  }

  db.prepare(`
    UPDATE student_attempts 
    SET client_ip = NULL, 
        is_device_locked = 0, 
        status = 'in_progress', 
        violations_count = 0, 
        submitted_at = NULL,
        mcq_score = NULL,
        essay_score = NULL,
        total_score = NULL
    WHERE id = ?
  `).run(attemptId);

  return true;
}

function resumeStudentAttempt(attemptId, extraTimeMinutes = 0) {
  const attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
  if (!attempt) return false;

  const extraMins = Number(extraTimeMinutes) || 0;
  const newExtra = (attempt.extra_time_minutes || 0) + extraMins;

  db.prepare(`
    UPDATE student_attempts
    SET status = 'in_progress',
        submitted_at = NULL,
        is_device_locked = 0,
        violations_count = 0,
        extra_time_minutes = ?
    WHERE id = ?
  `).run(newExtra, attemptId);

  // Notify student socket if connected
  for (const [sId, data] of activeStudents.entries()) {
    if (data.attemptId === attemptId) {
      if (ioInstance) {
        ioInstance.to(sId).emit('command_exam_resumed', {
          extraMinutes: extraMins,
          message: 'Giám thị đã mở lại bài thi. Bạn có thể tiếp tục làm bài!'
        });
      }
      break;
    }
  }

  return true;
}

function retakeStudentAttempt(attemptId) {
  const attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
  if (!attempt) return false;

  // Delete answers
  db.prepare('DELETE FROM student_answers WHERE attempt_id = ?').run(attemptId);

  // Notify active socket to restart
  for (const [sId, data] of activeStudents.entries()) {
    if (data.attemptId === attemptId) {
      if (ioInstance) {
        ioInstance.to(sId).emit('command_exam_retake', {
          message: 'Giám thị đã cấp quyền làm lại bài thi từ đầu.'
        });
      }
      activeStudents.delete(sId);
      break;
    }
  }

  // Reset attempt to new state
  db.prepare(`
    UPDATE student_attempts
    SET status = 'in_progress',
        start_time = CURRENT_TIMESTAMP,
        submitted_at = NULL,
        client_ip = NULL,
        is_device_locked = 0,
        violations_count = 0,
        extra_time_minutes = 0,
        mcq_score = NULL,
        essay_score = NULL,
        total_score = NULL,
        exam_paper_json = NULL
    WHERE id = ?
  `).run(attemptId);

  return true;
}

function unlockViolation(attemptId) {
  db.prepare('UPDATE student_attempts SET violations_count = 0 WHERE id = ?').run(attemptId);
  for (const [sId, data] of activeStudents.entries()) {
    if (data.attemptId === attemptId) {
      if (ioInstance) {
        ioInstance.to(sId).emit('command_exam_resumed', {
          message: 'Giám thị đã xóa cảnh báo vi phạm. Bạn có thể tiếp tục làm bài!'
        });
      }
      break;
    }
  }
  return true;
}

function broadcastProgressUpdate(sessionId, attemptId, answeredCount) {
  if (ioInstance && sessionId) {
    ioInstance.to(`teacher_session_${sessionId}`).emit('student_progress_update', {
      attemptId,
      answeredCount
    });
  }
}

module.exports = {
  setupSocketIO,
  isStudentOnlineOnOtherIp,
  unlockStudentDevice,
  kickWrongLoginDevice,
  resumeStudentAttempt,
  retakeStudentAttempt,
  unlockViolation,
  broadcastProgressUpdate
};

