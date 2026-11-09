/**
 * @vnlan/core - IExamRepository Interface Contract
 * Bản đặc tả hợp đồng lưu trữ chuẩn hóa cho cả 2 môi trường:
 * - Offline LAN (SQLite via better-sqlite3 / node:sqlite)
 * - Online Cloud (Supabase PostgreSQL)
 * 
 * Bất kỳ Adapter CSDL nào cũng PHẢI tuân thủ 100% chữ ký hàm và kiểu dữ liệu trả về này.
 */

class IExamRepository {
  /**
   * Lấy thông tin ca thi
   * @param {string} sessionId Mã ca thi
   * @returns {Promise<Object|null>} Thông tin ca thi
   */
  async getSession(sessionId) {
    throw new Error('Method not implemented: getSession');
  }

  /**
   * Lấy cấu trúc đề thi công khai (ĐÃ LOẠI BỎ ĐÁP ÁN ĐÚNG)
   * @param {string} sessionId Mã ca thi
   * @returns {Promise<Object|null>} { id, sessionId, questionsPayload, version }
   */
  async getPublicExamPaper(sessionId) {
    throw new Error('Method not implemented: getPublicExamPaper');
  }

  /**
   * Lấy đáp án bí mật (CHỈ DÀNH CHO BACKEND CHẤM ĐIỂM)
   * @param {string} sessionId Mã ca thi
   * @returns {Promise<Object|null>} { id, sessionId, answerKeyPayload }
   */
  async getSecretAnswerKey(sessionId) {
    throw new Error('Method not implemented: getSecretAnswerKey');
  }

  /**
   * Kiểm tra thông tin thí sinh trong Whitelist
   * @param {string} sessionId Mã ca thi
   * @param {string} studentCode SBD / Mã thí sinh
   * @returns {Promise<Object|null>} Thông tin thí sinh và hash mã truy cập
   */
  async getStudentWhitelist(sessionId, studentCode) {
    throw new Error('Method not implemented: getStudentWhitelist');
  }

  /**
   * Lấy hoặc tạo phiên thi cá nhân (Atomic Attempt)
   * @param {string} sessionId Mã ca thi
   * @param {string} studentCode SBD
   * @param {string} deviceTokenHash Mã băm thiết bị được ủy quyền
   * @returns {Promise<Object>} Thông tin attempt
   */
  async getOrCreateStudentAttempt(sessionId, studentCode, deviceTokenHash) {
    throw new Error('Method not implemented: getOrCreateStudentAttempt');
  }

  /**
   * Cập nhật nhịp tim & tiến độ (Heartbeat)
   * @param {string} attemptId ID phiên thi
   * @param {Object} payload { lastProgressAt, currentRevision }
   * @returns {Promise<boolean>}
   */
  async updateHeartbeat(attemptId, payload) {
    throw new Error('Method not implemented: updateHeartbeat');
  }

  /**
   * Lưu bài nộp chính thức (Idempotent Submission)
   * @param {Object} submissionData Dữ liệu bài nộp
   * @returns {Promise<Object>} Kết quả lưu bài
   */
  async saveSubmission(submissionData) {
    throw new Error('Method not implemented: saveSubmission');
  }

  /**
   * Kéo danh sách bài thi cần đồng bộ (Dành cho Sync Protocol)
   * @param {string} sessionId Mã ca thi
   * @param {number|string} cursor Con trỏ phân trang
   * @param {number} limit Số lượng bản ghi tối đa
   * @returns {Promise<Object>} { batchId, items, nextCursor, hasMore }
   */
  async pullUnsyncedSubmissions(sessionId, cursor, limit = 50) {
    throw new Error('Method not implemented: pullUnsyncedSubmissions');
  }

  /**
   * Xác nhận đồng bộ hoàn tất (Acknowledge)
   * @param {string} batchId Mã đợt đồng bộ
   * @param {Array<string>} itemIds Danh sách ID đã nhận thành công
   * @returns {Promise<boolean>}
   */
  async acknowledgeSyncedBatch(batchId, itemIds) {
    throw new Error('Method not implemented: acknowledgeSyncedBatch');
  }
}

module.exports = {
  IExamRepository
};
