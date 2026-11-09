const db = require('../db');
const crypto = require('node:crypto');
const XLSX = require('xlsx');

class StudentService {
  getAllStudents(className = null) {
    if (className && className !== 'ALL') {
      return db.prepare('SELECT * FROM students WHERE class_name = ? ORDER BY student_code ASC, student_name ASC').all(className);
    }
    return db.prepare('SELECT * FROM students ORDER BY class_name ASC, student_code ASC, student_name ASC').all();
  }

  getDistinctClasses() {
    const rows = db.prepare("SELECT DISTINCT class_name FROM students WHERE class_name IS NOT NULL AND class_name != '' ORDER BY class_name ASC").all();
    return rows.map(r => r.class_name);
  }

  getStudentByCode(code) {
    if (!code) return null;
    const cleanCode = code.trim();
    // 1. Kiểm tra bảng danh sách học sinh
    const st = db.prepare('SELECT * FROM students WHERE UPPER(student_code) = UPPER(?)').get(cleanCode);
    if (st) return st;

    // 2. Kiểm tra nếu học sinh từng làm bài trong các ca trước
    const attempt = db.prepare('SELECT student_code, student_name, class_name FROM student_attempts WHERE UPPER(student_code) = UPPER(?) ORDER BY start_time DESC LIMIT 1').get(cleanCode);
    if (attempt) {
      return {
        id: 'attempt_' + cleanCode,
        student_code: attempt.student_code,
        student_name: attempt.student_name,
        class_name: attempt.class_name
      };
    }

    return null;
  }

  createStudent({ student_code, student_name, class_name, gender = '', dob = '' }) {
    if (!student_name || !student_name.trim()) throw new Error('Vui lòng nhập Họ và Tên học sinh');

    const cleanCode = student_code && student_code.trim() ? student_code.trim().toUpperCase() : null;
    if (cleanCode) {
      const existing = this.getStudentByCode(cleanCode);
      if (existing) throw new Error(`Số báo danh [${cleanCode}] đã tồn tại trong danh sách`);
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO students (id, student_code, student_name, class_name, gender, dob)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, cleanCode, student_name.trim(), (class_name || '').trim().toUpperCase(), gender || '', (dob || '').trim());

    return db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  }

  updateStudent(id, { student_code, student_name, class_name, gender = '', dob = '' }) {
    if (!student_name || !student_name.trim()) throw new Error('Vui lòng nhập Họ và Tên học sinh');

    const cleanCode = student_code && student_code.trim() ? student_code.trim().toUpperCase() : null;
    if (cleanCode) {
      // Check duplicate code on other record
      const existing = db.prepare('SELECT * FROM students WHERE UPPER(student_code) = UPPER(?) AND id != ?').get(cleanCode, id);
      if (existing) throw new Error(`Số báo danh [${cleanCode}] đã được sử dụng bởi học sinh khác`);
    }

    db.prepare(`
      UPDATE students 
      SET student_code = ?, student_name = ?, class_name = ?, gender = ?, dob = ?
      WHERE id = ?
    `).run(cleanCode, student_name.trim(), (class_name || '').trim().toUpperCase(), gender || '', (dob || '').trim(), id);

    return db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  }

  deleteStudent(id) {
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
    return true;
  }

  deleteStudents(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return { deletedCount: 0 };
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`DELETE FROM students WHERE id IN (${placeholders})`);
    const info = stmt.run(...ids);
    return { deletedCount: info.changes };
  }

  deleteStudentsByClass(className) {
    if (!className) throw new Error('Vui lòng chỉ định tên lớp cần xóa');
    const stmt = db.prepare('DELETE FROM students WHERE UPPER(class_name) = UPPER(?)');
    const info = stmt.run(className.trim());
    return { deletedCount: info.changes };
  }

  // Tự động đánh Số Báo Danh (Auto-assign SBD)
  autoAssignSbd({
    scope = 'all', // 'all', 'grade', 'class', 'selected'
    className = null,
    grade = null,
    studentIds = [],
    prefixMode = 'class_prefix', // 'class_prefix', 'custom_prefix'
    customPrefix = 'SBD',
    digits = 2,
    startNum = 1,
    sortByName = true,
    overwrite = true // true = đánh lại toàn bộ; false = chỉ đánh cho HS chưa có SBD
  }) {
    let query = 'SELECT * FROM students WHERE 1=1';
    const params = [];

    if (scope === 'class' && className) {
      query += ' AND UPPER(class_name) = UPPER(?)';
      params.push(className.trim());
    } else if (scope === 'grade' && grade) {
      query += ' AND class_name LIKE ?';
      params.push(`${grade}%`);
    } else if (scope === 'selected' && Array.isArray(studentIds) && studentIds.length > 0) {
      const placeholders = studentIds.map(() => '?').join(',');
      query += ` AND id IN (${placeholders})`;
      params.push(...studentIds);
    }

    const students = db.prepare(query).all(...params);
    if (!students || students.length === 0) {
      return { success: true, updatedCount: 0, message: 'Không có học sinh nào phù hợp với phạm vi đã chọn.' };
    }

    // Helper sắp xếp theo chuẩn Tiếng Việt (Tên trước, Họ đệm sau)
    const getSortKey = (fullName) => {
      if (!fullName) return { first: '', last: '' };
      const parts = fullName.trim().split(/\s+/);
      const first = parts[parts.length - 1];
      const last = parts.slice(0, parts.length - 1).join(' ');
      return { first, last };
    };

    const padNumber = (num, len) => String(num).padStart(Math.max(2, Number(len) || 2), '0');

    // Lấy danh sách toàn bộ SBD đang có trong DB để đảm bảo không trùng
    const allExistingCodes = new Set(
      db.prepare("SELECT student_code FROM students WHERE student_code IS NOT NULL AND student_code != ''").all().map(r => r.student_code.toUpperCase())
    );

    // Gom nhóm học sinh theo lớp
    const classGroups = {};
    for (const st of students) {
      const cls = (st.class_name || 'CHUNG').trim().toUpperCase();
      if (!classGroups[cls]) classGroups[cls] = [];
      classGroups[cls].push(st);
    }

    const updates = [];

    if (prefixMode === 'class_prefix') {
      // Đánh số theo từng lớp: ví dụ 10A101, 10A102...
      for (const [cls, list] of Object.entries(classGroups)) {
        if (sortByName) {
          list.sort((a, b) => {
            const aK = getSortKey(a.student_name);
            const bK = getSortKey(b.student_name);
            const cmp = aK.first.localeCompare(bK.first, 'vi', { sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            return aK.last.localeCompare(bK.last, 'vi', { sensitivity: 'base' });
          });
        }

        // Nếu overwrite = true, giải phóng mã cũ của các học sinh trong lớp này
        if (overwrite) {
          for (const st of list) {
            if (st.student_code) allExistingCodes.delete(st.student_code.toUpperCase());
          }
        }

        let currentIdx = Number(startNum) || 1;
        for (const st of list) {
          if (!overwrite && st.student_code && st.student_code.trim() !== '') {
            continue;
          }
          // Tìm số tiếp theo chưa bị trùng
          let candidateCode = '';
          while (true) {
            candidateCode = `${cls}${padNumber(currentIdx, digits)}`;
            if (!allExistingCodes.has(candidateCode)) break;
            currentIdx++;
          }
          allExistingCodes.add(candidateCode);
          updates.push({ id: st.id, oldCode: st.student_code, newCode: candidateCode, name: st.student_name, className: cls });
          currentIdx++;
        }
      }
    } else {
      // Đánh số toàn phòng/toàn trường theo Tiền tố tùy chỉnh (VD: SBD001, SBD002...)
      let flatList = [...students];
      if (sortByName) {
        flatList.sort((a, b) => {
          const classCmp = (a.class_name || '').localeCompare(b.class_name || '');
          if (classCmp !== 0) return classCmp;
          const aK = getSortKey(a.student_name);
          const bK = getSortKey(b.student_name);
          const cmp = aK.first.localeCompare(bK.first, 'vi', { sensitivity: 'base' });
          if (cmp !== 0) return cmp;
          return aK.last.localeCompare(bK.last, 'vi', { sensitivity: 'base' });
        });
      }

      if (overwrite) {
        for (const st of flatList) {
          if (st.student_code) allExistingCodes.delete(st.student_code.toUpperCase());
        }
      }

      const pfx = (customPrefix || 'SBD').trim().toUpperCase();
      let currentIdx = Number(startNum) || 1;
      for (const st of flatList) {
        if (!overwrite && st.student_code && st.student_code.trim() !== '') {
          continue;
        }
        let candidateCode = '';
        while (true) {
          candidateCode = `${pfx}${padNumber(currentIdx, digits)}`;
          if (!allExistingCodes.has(candidateCode)) break;
          currentIdx++;
        }
        allExistingCodes.add(candidateCode);
        updates.push({ id: st.id, oldCode: st.student_code, newCode: candidateCode, name: st.student_name, className: st.class_name });
        currentIdx++;
      }
    }

    if (updates.length === 0) {
      return { success: true, updatedCount: 0, message: 'Tất cả học sinh trong phạm vi đã có Số Báo Danh.' };
    }

    // Thực hiện trong SQLite Transaction dùng mã tạm TEMP_ để tránh xung đột UNIQUE constraint
    db.exec('BEGIN TRANSACTION;');
    try {
      const tempStmt = db.prepare('UPDATE students SET student_code = ? WHERE id = ?');
      for (const u of updates) {
        tempStmt.run(`TEMP_${crypto.randomUUID()}`, u.id);
      }

      const updateStmt = db.prepare('UPDATE students SET student_code = ? WHERE id = ?');
      for (const u of updates) {
        updateStmt.run(u.newCode, u.id);
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return {
      success: true,
      updatedCount: updates.length,
      samplePreview: updates.slice(0, 5)
    };
  }

  // Xuất file Excel danh sách học sinh kèm Số Báo Danh
  exportStudentsExcel({ className = null, grade = null, sbdStatus = null, search = null }) {
    let query = 'SELECT * FROM students WHERE 1=1';
    const params = [];

    if (className && className !== 'ALL') {
      query += ' AND UPPER(class_name) = UPPER(?)';
      params.push(className.trim());
    } else if (grade) {
      query += ' AND class_name LIKE ?';
      params.push(`${grade}%`);
    }

    let rows = db.prepare(query + ' ORDER BY class_name ASC, student_code ASC, student_name ASC').all(...params);

    if (sbdStatus === 'HAS_SBD') {
      rows = rows.filter(r => r.student_code && r.student_code.trim() !== '');
    } else if (sbdStatus === 'NO_SBD') {
      rows = rows.filter(r => !r.student_code || r.student_code.trim() === '');
    }

    if (search && search.trim()) {
      const kw = search.trim().toLowerCase();
      rows = rows.filter(r =>
        (r.student_code && r.student_code.toLowerCase().includes(kw)) ||
        (r.student_name && r.student_name.toLowerCase().includes(kw)) ||
        (r.class_name && r.class_name.toLowerCase().includes(kw))
      );
    }

    const excelData = rows.map((st, index) => ({
      'STT': index + 1,
      'Số Báo Danh': st.student_code || '',
      'Họ và Tên': st.student_name,
      'Ngày Sinh': st.dob || '',
      'Lớp': st.class_name || '',
      'Giới Tính': st.gender || '',
      'Ký Tên / Ghi Chú': ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 28 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 22 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DanhSachSBD');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    let fileName = 'Danh_Sach_Hoc_Sinh_SBD.xlsx';
    if (className && className !== 'ALL') {
      fileName = `Danh_Sach_SBD_Lop_${className}.xlsx`;
    } else if (grade) {
      fileName = `Danh_Sach_SBD_Khoi_${grade}.xlsx`;
    }

    return { fileName, buffer, count: rows.length };
  }

  importStudentsFromExcel(fileBuffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet);

    if (!rawRows || rawRows.length === 0) {
      throw new Error('File Excel rỗng hoặc không có dữ liệu');
    }

    const insertWithCode = db.prepare(`
      INSERT INTO students (id, student_code, student_name, class_name, gender, dob)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_code) DO UPDATE SET
        student_name = excluded.student_name,
        class_name = excluded.class_name,
        gender = excluded.gender,
        dob = excluded.dob
    `);

    const insertWithoutCode = db.prepare(`
      INSERT INTO students (id, student_code, student_name, class_name, gender, dob)
      VALUES (?, NULL, ?, ?, ?, ?)
    `);

    const formatDob = (val) => {
      if (val === null || val === undefined) return '';
      if (val instanceof Date) {
        const d = String(val.getDate()).padStart(2, '0');
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const y = val.getFullYear();
        return `${d}/${m}/${y}`;
      }
      const str = String(val).trim();
      if (!str) return '';
      // Excel serial date number
      if (/^\d{5}$/.test(str)) {
        const num = parseInt(str, 10);
        const date = new Date((num - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) {
          const d = String(date.getUTCDate()).padStart(2, '0');
          const m = String(date.getUTCMonth() + 1).padStart(2, '0');
          const y = date.getUTCFullYear();
          return `${d}/${m}/${y}`;
        }
      }
      // If YYYY-MM-DD
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
        const [y, m, d] = str.split('-');
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
      }
      return str;
    };

    let importedCount = 0;
    for (const row of rawRows) {
      let code = row['Số Báo Danh'] || row['SBD'] || row['Mã Học Sinh'] || row['student_code'] || row['Code'];
      let name = row['Họ và Tên'] || row['Họ Tên'] || row['Họ và tên'] || row['Tên'] || row['student_name'];
      let dobVal = row['Ngày Sinh'] || row['Ngày sinh'] || row['DOB'] || row['NgaySinh'] || row['BirthDate'] || row['Năm Sinh'] || row['Năm sinh'] || row['Ngay sinh'];
      let className = row['Lớp'] || row['Lớp Học'] || row['class_name'] || row['Class'] || '';
      let gender = row['Giới Tính'] || row['Giới tính'] || row['gender'] || '';

      if (name && String(name).trim()) {
        const cleanName = String(name).trim();
        const cleanClass = String(className).trim().toUpperCase();
        const cleanGender = String(gender).trim();
        const cleanDob = formatDob(dobVal);

        if (code && String(code).trim()) {
          insertWithCode.run(
            crypto.randomUUID(),
            String(code).trim().toUpperCase(),
            cleanName,
            cleanClass,
            cleanGender,
            cleanDob
          );
        } else {
          insertWithoutCode.run(
            crypto.randomUUID(),
            cleanName,
            cleanClass,
            cleanGender,
            cleanDob
          );
        }
        importedCount++;
      }
    }

    return { importedCount };
  }

  generateTemplateExcel() {
    const sampleData = [
      {
        'STT': 1,
        'Số Báo Danh': '10A101',
        'Họ và Tên': 'Nguyễn Văn An',
        'Ngày Sinh': '15/04/2008',
        'Lớp': '10A1',
        'Giới Tính': 'Nam'
      },
      {
        'STT': 2,
        'Số Báo Danh': '10A102',
        'Họ và Tên': 'Trần Thị Mai',
        'Ngày Sinh': '22/08/2008',
        'Lớp': '10A1',
        'Giới Tính': 'Nữ'
      },
      {
        'STT': 3,
        'Số Báo Danh': '10A103',
        'Họ và Tên': 'Lê Hoàng Nam',
        'Ngày Sinh': '05/11/2008',
        'Lớp': '10A1',
        'Giới Tính': 'Nam'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 16 },
      { wch: 25 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DanhSachHocSinh');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      fileName: 'Mau_Danh_Sach_Hoc_Sinh.xlsx',
      buffer
    };
  }
}

module.exports = new StudentService();
