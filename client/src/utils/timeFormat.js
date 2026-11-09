/**
 * Utility chuẩn hóa thời gian và chuyển đổi sang giờ hệ thống máy tính (GMT+7 / Việt Nam).
 * Khắc phục triệt để hiện tượng chuỗi SQLite CURRENT_TIMESTAMP (UTC không có Z) bị JavaScript coi là giờ Local,
 * dẫn đến việc hiển thị chậm 7 tiếng so với đồng hồ thực tế trên máy tính giáo viên.
 */

export function parseUtcDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    let s = val.trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const d = new Date(Number(s));
      return isNaN(d.getTime()) ? null : d;
    }
    // SQLite CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS" hoặc có thêm mili-giây
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) && !s.includes('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s) && !s.includes('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
      s = s + 'Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Định dạng thời gian nộp bài / thời gian sự kiện sang giờ địa phương máy tính.
 * @param {string|Date|number} val - Giá trị thời gian cần định dạng
 * @param {boolean} includeDate - True nếu muốn kèm ngày (HH:mm:ss - DD/MM/YYYY), False chỉ lấy giờ (HH:mm:ss)
 * @param {string} fallback - Chuỗi hiển thị mặc định nếu chưa có thời gian (mặc định: 'Chưa nộp')
 * @returns {string} Chuỗi thời gian đã chuyển đổi
 */
export function formatToLocalTime(val, includeDate = false, fallback = 'Chưa nộp') {
  const d = parseUtcDate(val);
  if (!d) return fallback;
  try {
    const timeStr = d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    if (includeDate) {
      const dateStr = d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      return `${timeStr} - ${dateStr}`;
    }
    return timeStr;
  } catch {
    return String(val);
  }
}
