/**
 * Tiện ích dùng chung duy nhất (Single Source of Truth) cho xử lý câu hỏi Đúng/Sai (Part II)
 * Tuân thủ Quy chế Bộ GD&ĐT 2025 và tiêu chuẩn kỹ thuật VNLAN Exam Master v1.0.0
 * 
 * Phân biệt rõ 3 trạng thái:
 * - 'T': Xác định chắc chắn là ĐÚNG
 * - 'F': Xác định chắc chắn là SAI
 * - null: Dữ liệu không đủ để kết luận / không xác định / lỗi định dạng / xung đột dữ liệu
 */

export const VALID_KEYS = ['a', 'b', 'c', 'd'];
export const ENTRY_PATTERN = /^\s*([a-d])\s*[:=]\s*(T|F|TRUE|FALSE|1|0|ĐÚNG|SAI|Đ|D|S)\s*$/i;
const ANY_KEY_VALUE_PATTERN = /^\s*([^:=]+)\s*[:=]\s*(.*)$/;

/**
 * Phân tích trạng thái Đúng/Sai của một ý (a, b, c, d)
 * @param {any} data - Dữ liệu đáp án (Array, Object, chuỗi JSON, v.v.)
 * @param {string} letter - Ký tự ý ('a', 'b', 'c', 'd')
 * @returns {'T' | 'F' | null}
 */
export function getTrueFalseState(data, letter) {
  if (!letter || typeof letter !== 'string') return null;
  const key = letter.trim().toLowerCase();
  if (!VALID_KEYS.includes(key)) return null;

  if (data === null || data === undefined) return null;

  // 1. Nếu data là chuỗi JSON: parse an toàn
  let parsedData = data;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      // Kiểm tra xung đột khóa lặp trong chuỗi JSON object gốc trước khi parse
      if (trimmed.startsWith('{')) {
        const jsonKeyValRegex = /"([a-d])"\s*:\s*("(?:T|F|TRUE|FALSE|1|0|ĐÚNG|SAI|Đ|D|S)"|true|false|1|0)/gi;
        const keyMap = {};
        let m;
        while ((m = jsonKeyValRegex.exec(trimmed)) !== null) {
          const k = m[1].toLowerCase();
          const cleanVal = m[2].replace(/"/g, '');
          const tf = mapValueToTF(cleanVal);
          if (!keyMap[k]) keyMap[k] = new Set();
          if (tf !== null) keyMap[k].add(tf);
        }
        for (const k in keyMap) {
          if (keyMap[k].size > 1) {
            return null; // Phát hiện khóa lặp nhưng mâu thuẫn giá trị trong chuỗi JSON -> null
          }
        }
      }

      try {
        parsedData = JSON.parse(trimmed);
      } catch {
        return null; // Chuỗi JSON lỗi cú pháp (TF-07, TF-14) -> không xác định
      }
    } else {
      // Chuỗi đơn lẻ (ví dụ "b:T" hoặc "b=1")
      const singleMatch = trimmed.match(ENTRY_PATTERN);
      if (singleMatch) {
        if (singleMatch[1].toLowerCase() === key) {
          return mapValueToTF(singleMatch[2]);
        }
        return null;
      }
      return null;
    }
  }

  // 2. Data dạng Object: { a: 'T', b: 'F' } hoặc { A: true, B: false }
  if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
    const keys = Object.keys(parsedData);
    if (keys.length === 0) return null; // Object rỗng -> null

    // Kiểm tra tính hợp lệ: phải có ít nhất 1 khóa thuộc VALID_KEYS (TF-16)
    const hasValidKey = keys.some(k => VALID_KEYS.includes(k.toLowerCase()));
    if (!hasValidKey) return null;

    const rawVal = parsedData[key] !== undefined ? parsedData[key] : parsedData[key.toUpperCase()];
    if (rawVal === undefined || rawVal === null || rawVal === '') {
      return null; // Không có thông tin cho ý này (TF-15, TF-20) -> null
    }
    return mapValueToTF(rawVal);
  }

  // 3. Data dạng Array
  if (Array.isArray(parsedData)) {
    if (parsedData.length === 0) return null; // Mảng rỗng -> chưa xác định

    let hasKeyValueEntry = false;
    let hasPlainKeyEntry = false;
    let hasInvalidEntry = false;

    // Rà soát tính hợp lệ của toàn bộ phần tử trong mảng
    for (const item of parsedData) {
      if (typeof item !== 'string') {
        hasInvalidEntry = true;
        break;
      }
      const trimmed = item.trim();
      const kvMatch = trimmed.match(ANY_KEY_VALUE_PATTERN);
      if (kvMatch) {
        const rawKey = kvMatch[1].trim().toLowerCase();
        // Khóa phải nằm trong ['a', 'b', 'c', 'd'] (TF-13)
        if (!VALID_KEYS.includes(rawKey)) {
          hasInvalidEntry = true;
          break;
        }
        // Giá trị phải là giá trị T/F hợp lệ
        const tfVal = mapValueToTF(kvMatch[2].trim());
        if (tfVal === null) {
          hasInvalidEntry = true;
          break;
        }
        hasKeyValueEntry = true;
      } else {
        const lowerItem = trimmed.toLowerCase();
        if (VALID_KEYS.includes(lowerItem)) {
          hasPlainKeyEntry = true;
        } else {
          // Không phải key-value, cũng không phải phím a-d hợp lệ (TF-16)
          hasInvalidEntry = true;
          break;
        }
      }
    }

    // Nếu mảng chứa phần tử dị thường hoặc khóa không hợp lệ -> từ chối (TF-13, TF-16)
    if (hasInvalidEntry) return null;

    // Nếu mảng trộn lẫn cả dạng key-value và plain key (TF-12: ['b', 'd:T']) -> từ chối do xung đột định dạng
    if (hasKeyValueEntry && hasPlainKeyEntry) return null;

    // 3A. Định dạng toàn bộ Key-Value: ['a:F', 'b:T', 'c:F', 'd:T']
    if (hasKeyValueEntry) {
      const matchesForKey = [];
      for (const item of parsedData) {
        const kvMatch = item.trim().match(ANY_KEY_VALUE_PATTERN);
        if (kvMatch && kvMatch[1].trim().toLowerCase() === key) {
          matchesForKey.push(mapValueToTF(kvMatch[2].trim()));
        }
      }

      if (matchesForKey.length === 0) {
        return null; // Khóa thiếu trong mảng key-value -> null
      }

      // Kiểm tra xung đột: nếu có cả 'T' và 'F' cho cùng một khóa (TF-11: ['b:T', 'b:F']) -> null
      const uniqueVals = new Set(matchesForKey);
      if (uniqueVals.size > 1) {
        return null; // Xung đột dữ liệu
      }
      return matchesForKey[0];
    }

    // 3B. Định dạng toàn bộ Plain Keys: ['b', 'd']
    // QUY ƯỚC CHUẨN HÓA DỮ LIỆU:
    // Áp dụng khi và chỉ khi 100% phần tử trong mảng là các phím hợp lệ ['a', 'b', 'c', 'd'].
    // Các phím xuất hiện trong mảng là các ý ĐÚNG ('T'); các phím vắng mặt là các ý SAI ('F').
    if (hasPlainKeyEntry) {
      const cleanKeys = parsedData.map(item => String(item).trim().toLowerCase());
      return cleanKeys.includes(key) ? 'T' : 'F';
    }

    return null;
  }

  return null;
}

/**
 * Chuyển đổi các giá trị đa hình về 'T', 'F', hoặc null
 */
export function mapValueToTF(val) {
  if (val === true || val === 1) return 'T';
  if (val === false || val === 0) return 'F';
  if (typeof val === 'string') {
    const s = val.trim().toUpperCase();
    if (s === 'T' || s === 'TRUE' || s === '1' || s === 'ĐÚNG' || s === 'Đ' || s === 'D') return 'T';
    if (s === 'F' || s === 'FALSE' || s === '0' || s === 'SAI' || s === 'S') return 'F';
  }
  return null;
}

/**
 * Trả về nhãn hiển thị trực quan: 'Đúng', 'Sai', hoặc '-' (khi không xác định)
 * @param {any} data 
 * @param {string} letter 
 * @returns {'Đúng' | 'Sai' | '-'}
 */
export function getTrueFalseDisplayLabel(data, letter) {
  const state = getTrueFalseState(data, letter);
  if (state === 'T') return 'Đúng';
  if (state === 'F') return 'Sai';
  return '-';
}

/**
 * Kiểm tra xem ý này có đúng hay không
 * @param {any} data 
 * @param {string} letter 
 * @returns {boolean | null} true nếu đúng, false nếu sai, null nếu không xác định
 */
export function isTrueFalseOptionCorrect(data, letter) {
  const state = getTrueFalseState(data, letter);
  if (state === 'T') return true;
  if (state === 'F') return false;
  return null;
}

/**
 * Chuẩn hóa đáp án thành bản đồ 4 ý { a, b, c, d }
 * Giữ nguyên null tại các vị trí không xác định, không ép dữ liệu lỗi thành 'F'
 * @param {any} data 
 * @param {any} defaultUnset - Giá trị mặc định khi không xác định (mặc định là null)
 * @returns {{ a: 'T'|'F'|any, b: 'T'|'F'|any, c: 'T'|'F'|any, d: 'T'|'F'|any }}
 */
export function normalizeTrueFalseMap(data, defaultUnset = null) {
  const result = { a: defaultUnset, b: defaultUnset, c: defaultUnset, d: defaultUnset };
  if (!data) return result;

  for (const k of VALID_KEYS) {
    const state = getTrueFalseState(data, k);
    result[k] = state !== null ? state : defaultUnset;
  }
  return result;
}
