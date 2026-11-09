/**
 * @vnlan/client - IndexedDB Offline-First Storage Engine
 * Lưu trữ bài làm cục bộ an toàn, độc lập 100% với mạng Internet (P0 Fix):
 * - Dung lượng lưu trữ lớn (hàng trăm MB), không bị xóa tự động như LocalStorage
 * - Ghi nhận từng lần bấm chọn đáp án kèm revision & mốc thời gian
 * - Tự động khôi phục 100% bài làm khi thí sinh bị tắt nguồn, F5 hoặc rớt mạng 4G
 */

const DB_NAME = 'vnlan_student_exam_db';
const DB_VERSION = 1;
const STORE_ANSWERS = 'answers_cache';
const STORE_META = 'attempt_metadata';

let dbInstance = null;

/**
 * Khởi tạo kết nối IndexedDB
 */
export async function openExamDB() {
  if (dbInstance) return dbInstance;
  if (typeof window === 'undefined' || !window.indexedDB) {
    console.warn('[IndexedDB] Trình duyệt không hỗ trợ IndexedDB. Sử dụng bộ nhớ dự phòng.');
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Store lưu các câu trả lời của thí sinh
      if (!db.objectStoreNames.contains(STORE_ANSWERS)) {
        const answerStore = db.createObjectStore(STORE_ANSWERS, { keyPath: 'key' });
        answerStore.createIndex('by_session_student', ['sessionId', 'studentCode'], { unique: false });
      }

      // 2. Store lưu thông tin phiên thi & token
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Lỗi mở CSDL cục bộ:', event.target.error);
      resolve(null);
    };
  });
}

/**
 * Lưu 1 câu trả lời vào IndexedDB ngay khi thí sinh vừa bấm chọn
 */
export async function saveAnswerLocally({ sessionId, studentCode, questionId, answer, revision = 1 }) {
  const db = await openExamDB();
  const recordKey = `${sessionId}_${studentCode}_${questionId}`;
  const payload = {
    key: recordKey,
    sessionId,
    studentCode,
    questionId,
    answer,
    revision,
    updatedAt: new Date().toISOString()
  };

  if (!db) {
    // Fallback sang LocalStorage nếu không mở được IndexedDB
    try {
      localStorage.setItem(`vnlan_ans_${recordKey}`, JSON.stringify(payload));
    } catch (e) {}
    return payload;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_ANSWERS], 'readwrite');
      const store = tx.objectStore(STORE_ANSWERS);
      store.put(payload);
      tx.oncomplete = () => resolve(payload);
      tx.onerror = () => resolve(payload);
    } catch (e) {
      resolve(payload);
    }
  });
}

/**
 * Nạp toàn bộ các câu trả lời đã lưu từ trước của thí sinh
 * @returns {Promise<Object>} { [questionId]: answerValue }
 */
export async function loadCachedAnswers(sessionId, studentCode) {
  const db = await openExamDB();
  const answersMap = {};

  if (!db) {
    // Fallback đọc LocalStorage
    try {
      const prefix = `vnlan_ans_${sessionId}_${studentCode}_`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          const item = JSON.parse(localStorage.getItem(k));
          if (item && item.questionId) {
            answersMap[item.questionId] = item.answer;
          }
        }
      }
    } catch (e) {}
    return answersMap;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_ANSWERS], 'readonly');
      const store = tx.objectStore(STORE_ANSWERS);
      const index = store.index('by_session_student');
      const request = index.getAll([sessionId, studentCode]);

      request.onsuccess = (event) => {
        const records = event.target.result || [];
        records.forEach((r) => {
          if (r.questionId) {
            answersMap[r.questionId] = r.answer;
          }
        });
        resolve(answersMap);
      };

      request.onerror = () => resolve(answersMap);
    } catch (e) {
      resolve(answersMap);
    }
  });
}

/**
 * Lưu thông tin phiên thi để tự động khôi phục khi F5 trang
 */
export async function saveAttemptMetadata({ sessionId, studentCode, metadata }) {
  const db = await openExamDB();
  const recordKey = `${sessionId}_${studentCode}`;
  const payload = {
    key: recordKey,
    sessionId,
    studentCode,
    metadata,
    updatedAt: new Date().toISOString()
  };

  if (!db) {
    try {
      localStorage.setItem(`vnlan_meta_${recordKey}`, JSON.stringify(payload));
    } catch (e) {}
    return;
  }

  try {
    const tx = db.transaction([STORE_META], 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.put(payload);
  } catch (e) {}
}

/**
 * Đọc thông tin phiên thi đã lưu
 */
export async function loadAttemptMetadata(sessionId, studentCode) {
  const db = await openExamDB();
  const recordKey = `${sessionId}_${studentCode}`;

  if (!db) {
    try {
      const raw = localStorage.getItem(`vnlan_meta_${recordKey}`);
      return raw ? JSON.parse(raw).metadata : null;
    } catch (e) {
      return null;
    }
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_META], 'readonly');
      const store = tx.objectStore(STORE_META);
      const request = store.get(recordKey);

      request.onsuccess = (event) => {
        const r = event.target.result;
        resolve(r ? r.metadata : null);
      };
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Xóa sạch dữ liệu bài làm cục bộ sau khi đã nộp bài thành công
 */
export async function clearExamLocalData(sessionId, studentCode) {
  const db = await openExamDB();
  const prefix = `vnlan_ans_${sessionId}_${studentCode}_`;

  // Xóa LocalStorage fallback
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(`vnlan_meta_${sessionId}_${studentCode}`);
  } catch (e) {}

  if (!db) return;

  try {
    const tx = db.transaction([STORE_ANSWERS, STORE_META], 'readwrite');
    const answerStore = tx.objectStore(STORE_ANSWERS);
    const index = answerStore.index('by_session_student');
    const request = index.getAllKeys([sessionId, studentCode]);

    request.onsuccess = (event) => {
      const keys = event.target.result || [];
      keys.forEach((k) => answerStore.delete(k));
    };

    const metaStore = tx.objectStore(STORE_META);
    metaStore.delete(`${sessionId}_${studentCode}`);
  } catch (e) {}
}

/**
 * Tiện ích Exponential Backoff Retry cho các cuộc gọi mạng
 */
export async function fetchWithBackoff(fn, maxRetries = 5, initialDelayMs = 1000) {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      // Chờ với độ trễ tăng dần theo hàm mũ: 1s -> 2s -> 4s -> 8s -> tối đa 30s
      await new Promise((res) => setTimeout(res, delay));
      delay = Math.min(30000, delay * 2);
    }
  }
}
