/**
 * Utility cho câu hỏi trắc nghiệm Đúng/Sai theo chuẩn Bộ GD&ĐT 2025
 * Quy chế chấm lũy tiến:
 * - Đúng 1 ý: 0.10 điểm (10% maxScore)
 * - Đúng 2 ý: 0.25 điểm (25% maxScore)
 * - Đúng 3 ý: 0.50 điểm (50% maxScore)
 * - Đúng 4 ý: 1.00 điểm (100% maxScore)
 * - Đúng 0 ý: 0.00 điểm
 */

function extractTrueFalseChoice(data, letter) {
  if (!data || !letter) return null;
  const key = String(letter).trim().toLowerCase();

  // 1. Data dạng Object: { a: 'T', b: 'F' } hoặc { A: 'T' }
  if (typeof data === 'object' && !Array.isArray(data)) {
    const rawVal = data[key] !== undefined ? data[key] : (data[key.toUpperCase()] !== undefined ? data[key.toUpperCase()] : null);
    if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
      const v = String(rawVal).trim().toUpperCase();
      if (v === 'T' || v === 'Đ' || v === 'D' || v === 'TRUE' || v === '1') return 'T';
      if (v === 'F' || v === 'S' || v === 'FALSE' || v === '0') return 'F';
    }
    return null;
  }

  // 2. Data dạng Mảng: ['a:T', 'b:F'] hoặc ['a=T', 'b=F'] hoặc ['a-T', 'b-F']
  if (Array.isArray(data)) {
    const found = data.find(x => {
      if (typeof x !== 'string') return false;
      const lower = x.toLowerCase();
      return lower.startsWith(key + ':') || lower.startsWith(key + '=') || lower.startsWith(key + '-');
    });
    if (found) {
      const part = found.split(/[:=\-]/)[1]?.trim().toUpperCase();
      if (part === 'T' || part === 'Đ' || part === 'D' || part === 'TRUE' || part === '1') return 'T';
      if (part === 'F' || part === 'S' || part === 'FALSE' || part === '0') return 'F';
    }

    // Trường hợp mảng chỉ chứa các phím được chọn là Đúng: ['a', 'c']
    const hasKeyValue = data.some(x => typeof x === 'string' && (x.includes(':') || x.includes('=') || x.includes('-')));
    if (!hasKeyValue && data.length > 0) {
      const set = new Set(data.map(x => String(x).trim().toLowerCase()));
      const allValidLetters = data.every(x => typeof x === 'string' && ['a', 'b', 'c', 'd'].includes(x.trim().toLowerCase()));
      if (allValidLetters) {
        return set.has(key) ? 'T' : 'F';
      }
      if (set.has(key)) return 'T';
    }
  }

  return null;
}

function normalizeTrueFalseMap(val, defaultUnset = null) {
  const result = { a: defaultUnset, b: defaultUnset, c: defaultUnset, d: defaultUnset };
  if (!val) return result;

  for (const k of ['a', 'b', 'c', 'd']) {
    const choice = extractTrueFalseChoice(val, k);
    result[k] = choice !== null ? choice : defaultUnset;
  }

  return result;
}

function calculateTrueFalseScore(studentSelected, correctAnswer, maxScore = 1.0, subKeys = ['a', 'b', 'c', 'd']) {
  // Bài làm học sinh: nếu chưa chọn ý nào thì giữ nguyên null (không tự ý gán F)
  const studentMap = normalizeTrueFalseMap(studentSelected, null);
  // Đáp án chuẩn của đề thi: mặc định 'F' nếu thiếu
  const correctMap = normalizeTrueFalseMap(correctAnswer, 'F');

  let correctCount = 0;
  const details = {};

  subKeys.forEach(k => {
    const studentChoice = studentMap[k];
    const keyChoice = correctMap[k];
    // Đúng khi và chỉ khi thí sinh CÓ chọn và lựa chọn trùng với đáp án đúng
    const isItemCorrect = (studentChoice !== null && studentChoice !== undefined && studentChoice === keyChoice);
    if (isItemCorrect) correctCount++;
    details[k] = {
      studentChoice, // 'T', 'F', hoặc null (Chưa chọn)
      keyChoice,     // 'T' hoặc 'F'
      isCorrect: isItemCorrect
    };
  });

  const ratios = [0.0, 0.10, 0.25, 0.50, 1.00];
  const ratio = (subKeys.length === 4 && correctCount <= 4)
    ? (ratios[correctCount] ?? 0.0)
    : (correctCount / (subKeys.length || 1));

  const scoreObtained = Math.round(Number(maxScore) * ratio * 100) / 100;

  return {
    correctCount,
    totalSubItems: subKeys.length,
    ratio,
    scoreObtained,
    isAllCorrect: correctCount === subKeys.length,
    details
  };
}

function resolveCorrectAnswers(q) {
  if (!q) return [];
  let ca = [];
  if (q.correct_answers !== undefined && q.correct_answers !== null) {
    ca = q.correct_answers;
  } else if (q.correct_answers_json) {
    try { ca = JSON.parse(q.correct_answers_json); } catch (e) { ca = []; }
  }
  if (typeof ca === 'string') {
    try { ca = JSON.parse(ca); } catch (e) {}
  }
  return ca;
}

/**
 * Hoán vị các ý a, b, c, d của câu hỏi Đúng/Sai (Phần II)
 * - Xáo trộn ngẫu nhiên nội dung các ý nhận định
 * - Giữ nguyên nhãn chuẩn a, b, c, d cố định tại chỗ theo quy chế Bộ GD&ĐT 2025
 * - Tự động ánh xạ và bảo toàn trạng thái Đúng (T) / Sai (F) sang vị trí nhãn mới
 * - Fail-Closed: Bắt buộc từ chối sinh đề nếu có mệnh đề không thể xác định đáp án dứt khoát
 */
function shuffleTrueFalseOptions(q, shuffleArrayFn, options = {}) {
  const { strict = true } = options;
  if (!q) return q;
  const TF_LABELS = ['a', 'b', 'c', 'd'];
  let qOptions = q.options ? JSON.parse(JSON.stringify(q.options)) : [];
  if (!Array.isArray(qOptions) || qOptions.length <= 1) {
    return q;
  }

  const rawCorrect = resolveCorrectAnswers(q);
  const qId = q.id || q.bank_question_id || 'UNKNOWN';

  // 1. Gắn kèm giá trị Đúng (T) / Sai (F) gốc cho từng ý nhận định (chặt chẽ Fail-Closed)
  const items = qOptions.map((opt, idx) => {
    const posLabel = TF_LABELS[idx] || String.fromCharCode(97 + idx);
    const origId = opt.id ? String(opt.id).toLowerCase() : posLabel;
    const optLabel = opt.label ? String(opt.label).toLowerCase() : null;

    // Tìm đáp án đa tầng: Khớp ID gốc -> Khớp label -> Khớp vị trí chỉ số
    let choice = extractTrueFalseChoice(rawCorrect, origId);
    if (choice === null && optLabel) {
      choice = extractTrueFalseChoice(rawCorrect, optLabel);
    }
    if (choice === null) {
      choice = extractTrueFalseChoice(rawCorrect, posLabel);
    }

    if (choice === null && strict) {
      throw new Error(
        `Câu hỏi Đúng/Sai [ID: ${qId}] có mệnh đề thứ ${idx + 1} (id: "${opt.id || ''}", pos: "${posLabel}") ` +
        `không thể xác định rõ giá trị Đúng (T) hoặc Sai (F) từ dữ liệu đáp án. ` +
        `Hệ thống từ chối hoán vị để tránh sai lệch kết quả chấm thi.`
      );
    }

    const origVal = choice !== null ? choice : '-';
    return {
      originalId: origId,
      text: opt.text || opt.content || '',
      content: opt.content || opt.text || '',
      origVal
    };
  });

  // 2. Xáo trộn ngẫu nhiên danh sách các ý nhận định
  const shuffledItems = typeof shuffleArrayFn === 'function' ? shuffleArrayFn(items) : items;

  // 3. Tái tạo options với nhãn chuẩn a, b, c, d
  const newOptions = shuffledItems.map((item, idx) => {
    const label = TF_LABELS[idx] || item.originalId;
    return {
      id: label,
      label: label,
      text: item.text,
      content: item.content
    };
  });

  // 4. Ánh xạ lại bản đồ đáp án Đúng/Sai theo nhãn mới & lưu vết options_map
  const newCorrectAnswers = {};
  const optionsMap = {};
  shuffledItems.forEach((item, idx) => {
    const newKey = TF_LABELS[idx] || item.originalId;
    newCorrectAnswers[newKey] = item.origVal;
    optionsMap[newKey] = item.originalId;
  });

  return {
    ...q,
    options: newOptions,
    options_map: optionsMap,
    correct_answers: newCorrectAnswers,
    correct_answers_json: JSON.stringify(newCorrectAnswers)
  };
}

module.exports = {
  extractTrueFalseChoice,
  normalizeTrueFalseMap,
  calculateTrueFalseScore,
  resolveCorrectAnswers,
  shuffleTrueFalseOptions
};
