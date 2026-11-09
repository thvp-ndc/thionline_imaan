/**
 * @vnlan/online - Universal Storage Client for Vercel Storage (Vercel KV / Upstash Redis)
 * Hỗ trợ 100% GitHub + Vercel (Không cần Supabase):
 * 1. Khi chạy trên Vercel: Tự động kết nối Vercel KV qua REST API (Zero-Dependency)
 * 2. Khi chạy Offline / Kiểm thử: Tự động dùng Bộ nhớ RAM đệm (In-Memory Fallback)
 */

const SAMPLE_SESSION_ID = 'DEMO2025';

const SAMPLE_SESSION_DATA = {
  id: SAMPLE_SESSION_ID,
  code: SAMPLE_SESSION_ID,
  title: 'Đề Thi Thử Nghiệm Chuẩn Đổi Mới 2025 (VNLAN)',
  subject_name: 'Tin Học & KHTN',
  duration_minutes: 45,
  status: 'active',
  score_release_mode: 'immediate',
  allow_review: true,
  created_at: new Date('2026-01-01T08:00:00Z').toISOString()
};

const SAMPLE_PUBLIC_QUESTIONS = [
  {
    id: 'q1',
    type: 'single_choice',
    order_index: 1,
    content: 'Thiết bị nào sau đây là thiết bị vào (Input Device) của máy tính?',
    options: [
      { id: 'A', text: 'Bàn phím (Keyboard)' },
      { id: 'B', text: 'Màn hình (Monitor)' },
      { id: 'C', text: 'Máy in (Printer)' },
      { id: 'D', text: 'Loa (Speaker)' }
    ],
    max_score: 1.0
  },
  {
    id: 'q2',
    type: 'single_choice',
    order_index: 2,
    content: 'Trong hệ nhị phân (Binary), giá trị của dãy bit 1010 tương ứng với số thập phân nào?',
    options: [
      { id: 'A', text: '8' },
      { id: 'B', text: '10' },
      { id: 'C', text: '12' },
      { id: 'D', text: '14' }
    ],
    max_score: 1.0
  },
  {
    id: 'q3',
    type: 'single_choice',
    order_index: 3,
    content: 'Giao thức bảo mật phổ biến nhất hiện nay dùng để mã hóa kết nối web là gì?',
    options: [
      { id: 'A', text: 'HTTP' },
      { id: 'B', text: 'FTP' },
      { id: 'C', text: 'HTTPS' },
      { id: 'D', text: 'Telnet' }
    ],
    max_score: 1.0
  },
  {
    id: 'q4',
    type: 'true_false',
    order_index: 4,
    content: 'Xét tính Đúng/Sai của các nhận định sau về an toàn thông tin trên mạng Internet:',
    items: [
      { id: 'a', text: 'Nên đặt mật khẩu dài có chữ hoa, chữ thường, số và ký tự đặc biệt.' },
      { id: 'b', text: 'Có thể chia sẻ mã OTP ngân hàng cho người lạ khi họ yêu cầu xác minh tài khoản.' },
      { id: 'c', text: 'Không nên bấm vào các đường link lạ nhận được từ tin nhắn không rõ nguồn gốc.' },
      { id: 'd', text: 'Tất cả các mạng Wifi công cộng miễn phí đều đảm bảo an toàn tuyệt đối.' }
    ],
    max_score: 1.0
  },
  {
    id: 'q5',
    type: 'short_answer',
    order_index: 5,
    content: 'Một tệp tin có dung lượng 2048 KB. Hỏi dung lượng đó tương đương bao nhiêu Megabyte (MB)? (Điền một số nguyên)',
    scoring_config: { answer_format: 'integer', trim_whitespace: true },
    max_score: 1.0
  },
  {
    id: 'q6',
    type: 'essay',
    order_index: 6,
    content: 'Hãy nêu ít nhất 2 biện pháp em thường áp dụng để bảo vệ dữ liệu cá nhân khi sử dụng mạng xã hội hoặc máy tính ở trường?',
    max_score: 5.0
  }
];

const SAMPLE_SECRET_KEYS = {
  q1: 'A',
  q2: 'B',
  q3: 'C',
  q4: { a: true, b: false, c: true, d: false },
  q5: ['2', '2.0', '2 MB']
};

class UniversalStorageClient {
  constructor() {
    this.apiUrl = process.env.KV_REST_API_URL || '';
    this.apiToken = process.env.KV_REST_API_TOKEN || '';
    this.isKVConfigured = !!(this.apiUrl && this.apiToken);
    
    // Bộ nhớ RAM cục bộ phục vụ Unit Test và chế độ Fallback
    this.localStore = new Map();
  }

  /**
   * Đọc dữ liệu theo Khóa (Key)
   */
  async get(key) {
    if (this.isKVConfigured) {
      try {
        const res = await fetch(`${this.apiUrl.replace(/\/$/, '')}/get/${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${this.apiToken}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.result === null || data.result === undefined) return null;
        try {
          return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
        } catch (e) {
          return data.result;
        }
      } catch (err) {
        console.error(`[Vercel KV] Lỗi đọc khóa ${key}:`, err.message);
        return this.localStore.get(key) || null;
      }
    }
    return this.localStore.get(key) || null;
  }

  /**
   * Ghi dữ liệu theo Khóa (Key)
   */
  async set(key, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    this.localStore.set(key, value);

    if (this.isKVConfigured) {
      try {
        await fetch(`${this.apiUrl.replace(/\/$/, '')}/set/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(serialized)
        });
      } catch (err) {
        console.error(`[Vercel KV] Lỗi ghi khóa ${key}:`, err.message);
      }
    }
    return true;
  }

  /**
   * Xóa một Khóa
   */
  async del(key) {
    this.localStore.delete(key);
    if (this.isKVConfigured) {
      try {
        await fetch(`${this.apiUrl.replace(/\/$/, '')}/del/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiToken}` }
        });
      } catch (err) {
        console.error(`[Vercel KV] Lỗi xóa khóa ${key}:`, err.message);
      }
    }
    return true;
  }

  // ====================================================================
  // NGHIỆP VỤ THI TRỰC TUYẾN DÀNH CHO VERCEL STORAGE
  // ====================================================================

  async seedSampleIfEmpty() {
    const index = (await this.get('sessions:index')) || [];
    if (!index.includes(SAMPLE_SESSION_ID)) {
      await this.saveSession(SAMPLE_SESSION_ID, SAMPLE_SESSION_DATA);
      await this.savePaper(SAMPLE_SESSION_ID, {
        id: `paper_${SAMPLE_SESSION_ID}`,
        session_id: SAMPLE_SESSION_ID,
        version: 1,
        questions_payload: SAMPLE_PUBLIC_QUESTIONS
      });
      await this.saveAnswerKey(SAMPLE_SESSION_ID, {
        session_id: SAMPLE_SESSION_ID,
        answer_key_payload: SAMPLE_SECRET_KEYS
      });
    }
  }

  async getSession(sessionId) {
    if (!sessionId) return null;
    const cleanId = String(sessionId).trim();
    let session = await this.get(`session:${cleanId}`);
    
    // Nếu chưa tìm thấy, thử tìm theo mã không phân biệt hoa thường hoặc khớp mẫu
    if (!session) {
      const all = await this.listSessions();
      session = all.find(s => s.id?.toLowerCase() === cleanId.toLowerCase() || s.code?.toLowerCase() === cleanId.toLowerCase());
    }

    if (!session && cleanId.toUpperCase() === SAMPLE_SESSION_ID) {
      await this.seedSampleIfEmpty();
      session = await this.get(`session:${SAMPLE_SESSION_ID}`);
    }

    return session || null;
  }

  async saveSession(sessionId, sessionData) {
    await this.set(`session:${sessionId}`, sessionData);
    // Cập nhật danh sách tổng ca thi
    const index = (await this.get('sessions:index')) || [];
    if (!index.includes(sessionId)) {
      index.push(sessionId);
      await this.set('sessions:index', index);
    }
    return sessionData;
  }

  async deleteSession(sessionId) {
    await this.del(`session:${sessionId}`);
    await this.del(`paper:${sessionId}`);
    await this.del(`secret_key:${sessionId}`);
    
    const index = (await this.get('sessions:index')) || [];
    const newIndex = index.filter(id => id !== sessionId);
    await this.set('sessions:index', newIndex);
    return true;
  }

  async listSessions() {
    await this.seedSampleIfEmpty();
    const index = (await this.get('sessions:index')) || [];
    const sessions = [];
    for (const sId of index) {
      const s = await this.get(`session:${sId}`);
      if (s) sessions.push(s);
    }
    return sessions;
  }

  async getPaper(sessionId) {
    let paper = await this.get(`paper:${sessionId}`);
    if (!paper && sessionId?.toUpperCase() === SAMPLE_SESSION_ID) {
      await this.seedSampleIfEmpty();
      paper = await this.get(`paper:${SAMPLE_SESSION_ID}`);
    }
    return paper;
  }

  async savePaper(sessionId, paperData) {
    return await this.set(`paper:${sessionId}`, paperData);
  }

  async getAnswerKey(sessionId) {
    let key = await this.get(`secret_key:${sessionId}`);
    if (!key && sessionId?.toUpperCase() === SAMPLE_SESSION_ID) {
      await this.seedSampleIfEmpty();
      key = await this.get(`secret_key:${SAMPLE_SESSION_ID}`);
    }
    return key;
  }

  async saveAnswerKey(sessionId, keyData) {
    return await this.set(`secret_key:${sessionId}`, keyData);
  }

  async getAttempt(sessionId, studentCode) {
    return await this.get(`attempt:${sessionId}:${studentCode}`);
  }

  async saveAttempt(sessionId, studentCode, attemptData) {
    return await this.set(`attempt:${sessionId}:${studentCode}`, attemptData);
  }

  async getSubmission(sessionId, studentCode) {
    return await this.get(`submission:${sessionId}:${studentCode}`);
  }

  async saveSubmission(sessionId, studentCode, submissionData) {
    await this.set(`submission:${sessionId}:${studentCode}`, submissionData);
    // Ghi nhận vào danh sách bài nộp của ca thi
    const subIndexKey = `submissions_index:${sessionId}`;
    const subList = (await this.get(subIndexKey)) || [];
    if (!subList.includes(studentCode)) {
      subList.push(studentCode);
      await this.set(subIndexKey, subList);
    }
    return submissionData;
  }

  async listSubmissions(sessionId) {
    const subIndexKey = `submissions_index:${sessionId}`;
    const studentCodes = (await this.get(subIndexKey)) || [];
    const submissions = [];
    for (const code of studentCodes) {
      const sub = await this.getSubmission(sessionId, code);
      if (sub) submissions.push(sub);
    }
    return submissions;
  }
}

let storageInstance = null;

export function getStorageClient() {
  if (!storageInstance) {
    storageInstance = new UniversalStorageClient();
  }
  return storageInstance;
}

export default getStorageClient;
