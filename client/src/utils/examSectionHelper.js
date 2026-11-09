/**
 * examSectionHelper.js (Client Version)
 * Tiện ích dùng chung duy nhất (Single Source of Truth) cho việc phân chia phần thi,
 * đánh số câu hỏi, xử lý template placeholder và tính toán độ rộng bảng động trên Web.
 * 
 * Tuân thủ Quy chuẩn Khảo thí và Ý kiến Thẩm định KH-20261101-SHUFFLE-PRINT-TEMPLATE-ENHANCE.
 */

export const STANDARD_PARTS = [
  {
    partId: 'part1',
    standardPartNumber: 1,
    standardRoman: 'I',
    defaultTitle: 'CÂU HỎI TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN',
    types: ['single_choice', 'multiple_choice'],
    getInstruction: (start, end) =>
      `Thí sinh trả lời từ câu ${start} đến câu ${end}. Mỗi câu hỏi thí sinh chỉ chọn một phương án A, B, C hoặc D.`
  },
  {
    partId: 'part2',
    standardPartNumber: 2,
    standardRoman: 'II',
    defaultTitle: 'CÂU HỎI TRẮC NGHIỆM ĐÚNG / SAI',
    types: ['true_false'],
    getInstruction: (start, end, tfGuide) =>
      tfGuide
        ? String(tfGuide)
        : `Thí sinh trả lời từ câu ${start} đến câu ${end}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn Đúng hoặc Sai.`
  },
  {
    partId: 'part3',
    standardPartNumber: 3,
    standardRoman: 'III',
    defaultTitle: 'CÂU HỎI TRẮC NGHIỆM TRẢ LỜI NGẮN',
    types: ['short_answer'],
    getInstruction: (start, end) =>
      `Thí sinh trả lời từ câu ${start} đến câu ${end}. Thí sinh ghi đáp số hoặc kết quả vào phần trả lời.`
  },
  {
    partId: 'part4',
    standardPartNumber: 4,
    standardRoman: 'IV',
    defaultTitle: 'CÂU HỎI TỰ LUẬN',
    types: ['essay'],
    getInstruction: () => `Thí sinh trình bày bài làm tự luận chi tiết.`
  }
];

export const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * Phân chia câu hỏi thành các phần thi chuẩn Khảo thí
 */
export function buildExamSections(questions = [], options = {}) {
  const restartNumberingPerPart = options.restartNumberingPerPart !== false;
  const continuousRomanNumbers = Boolean(options.continuousRomanNumbers);
  const tfPolicyGuide = options.tfPolicyGuide || null;
  const customPartTitles = options.customPartTitles || {};

  const allQuestions = Array.isArray(questions) ? questions : [];

  const rawSections = STANDARD_PARTS.map(def => {
    const partQuestions = allQuestions.filter(q => q && def.types.includes(q.question_type));
    return {
      definition: def,
      questions: partQuestions,
      count: partQuestions.length
    };
  });

  const activeSections = rawSections.filter(s => s.count > 0);
  let runningGlobalCounter = 1;

  return activeSections.map((sec, activeIdx) => {
    const def = sec.definition;

    const roman = continuousRomanNumbers
      ? ROMAN_NUMERALS[activeIdx] || String(activeIdx + 1)
      : def.standardRoman;

    const partNumber = continuousRomanNumbers
      ? activeIdx + 1
      : def.standardPartNumber;

    const baseTitle = customPartTitles[def.partId] || def.defaultTitle;
    const fullTitle = `PHẦN ${roman}. ${baseTitle} (${sec.count} CÂU)`;

    let startQuestionNumber = 1;
    let endQuestionNumber = sec.count;

    if (!restartNumberingPerPart) {
      startQuestionNumber = runningGlobalCounter;
      endQuestionNumber = runningGlobalCounter + sec.count - 1;
      runningGlobalCounter = endQuestionNumber + 1;
    }

    const instruction = def.getInstruction(startQuestionNumber, endQuestionNumber, tfPolicyGuide);

    const questionsWithPartOrder = sec.questions.map((q, qIdx) => ({
      ...q,
      partOrder: restartNumberingPerPart ? (qIdx + 1) : (startQuestionNumber + qIdx),
      globalOrder: runningGlobalCounter + qIdx
    }));

    return {
      partId: def.partId,
      partNumber,
      roman,
      title: baseTitle,
      fullTitle,
      instruction,
      count: sec.count,
      startQuestionNumber,
      endQuestionNumber,
      questions: questionsWithPartOrder
    };
  });
}

/**
 * Thay thế an toàn các placeholder trong tiêu đề đề thi và văn bản mẫu
 */
export function replacePlaceholders(text = '', data = {}) {
  if (!text || typeof text !== 'string') return '';

  const schoolName = data.schoolName ?? data.tentruong ?? '';
  const examTitle = data.examTitle ?? data.cleanExamTitle ?? data.tenkythi ?? '';
  const schoolYear = data.schoolYear ?? data.namhoc ?? '';
  const subjectName = data.subjectName ?? data.monhoc ?? '';
  const gradeName = data.gradeName ?? data.gradeText ?? data.tenkhoi ?? '';
  const variantCode = data.variantCode ?? data.made ?? '';
  const durationMinutes = data.durationMinutes ?? data.tgian ?? '';
  const totalPages = data.totalPages ?? data.sotrang ?? '';
  const instructionNote = data.instructionNote ?? data.luuy ?? '(Lưu ý: Học sinh LÀM BÀI TRÊN PHIẾU TRẢ LỜI TRẮC NGHIỆM)';

  return text
    .replace(/<tentruong>/gi, schoolName)
    .replace(/<tenkythi>/gi, examTitle)
    .replace(/<namhoc>/gi, schoolYear)
    .replace(/<monhoc>/gi, subjectName)
    .replace(/<tenkhoi>/gi, gradeName)
    .replace(/\[<#made>\]|\[<#made>\]/gi, `[${variantCode}]`)
    .replace(/<#made>|<#made>/gi, variantCode)
    .replace(/<tgian>/gi, String(durationMinutes))
    .replace(/<#sotrang>/gi, String(totalPages))
    .replace(/<luuy>/gi, instructionNote);
}
