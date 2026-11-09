import React, { useState, useEffect } from 'react';
import {
  X as CloseIcon, Eye, Download, Sparkles, Check, CheckCircle2,
  FileText, Layers, Table, ArrowLeft, Printer, ShieldCheck, HelpCircle
} from 'lucide-react';
import MathContent from '../common/MathContent';
import { getTrueFalseDisplayLabel, getTrueFalseState } from '../../utils/trueFalseHelper';
import { buildExamSections } from '../../utils/examSectionHelper';

export default function VariantExamPreviewModal({
  isOpen,
  onClose,
  previewData,
  onExportZip,
  onGenerateDb,
  exportingZip = false,
  generatingDb = false
}) {
  const [schoolInfo, setSchoolInfo] = useState({
    school_name: 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH',
    department_name: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
    academic_year: '2025 - 2026'
  });

  useEffect(() => {
    fetch('/api/system/school-info')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.schoolInfo) setSchoolInfo(d.schoolInfo);
      })
      .catch(() => {});
  }, []);

  if (!isOpen || !previewData || !previewData.variants || previewData.variants.length === 0) {
    return null;
  }

  const { title, grade_name, subject_name, duration_minutes, total_score, variants } = previewData;

  // Tab đang chọn: mã đề (ví dụ: '101') hoặc 'crosscheck' (Bảng đáp án soi chiếu)
  const [selectedTab, setSelectedTab] = useState(variants[0]?.code || 'crosscheck');

  // Chế độ xem: true = Kèm đáp án & barem (Bản GV) | false = Ẩn đáp án (Đề in HS)
  const [showAnswers, setShowAnswers] = useState(true);

  const currentVariant = variants.find(v => String(v.code) === String(selectedTab)) || variants[0];
  const customOptions = previewData.options || {};
  const sections = buildExamSections(currentVariant?.questions || [], {
    restartNumberingPerPart: customOptions.restartNumberingPerPart !== false,
    continuousRomanNumbers: Boolean(customOptions.continuousRomanNumbers),
    ...customOptions
  });

  // Phân nhóm câu hỏi của đề hiện tại thành 4 phần (hỗ trợ cho tab soi chiếu đối soát)
  const p1Questions = (currentVariant?.questions || []).filter(
    q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice'
  );
  const p2Questions = (currentVariant?.questions || []).filter(
    q => q.question_type === 'true_false'
  );
  const p3Questions = (currentVariant?.questions || []).filter(
    q => q.question_type === 'short_answer'
  );
  const p4Questions = (currentVariant?.questions || []).filter(
    q => q.question_type === 'essay'
  );

  // Tính điểm từng phần
  const p1Score = p1Questions.reduce((s, q) => s + (parseFloat(q.max_score) || 0.25), 0);
  const p2Score = p2Questions.reduce((s, q) => s + (parseFloat(q.max_score) || 1.0), 0);
  const p3Score = p3Questions.reduce((s, q) => s + (parseFloat(q.max_score) || 0.5), 0);
  const p4Score = p4Questions.reduce((s, q) => s + (parseFloat(q.max_score) || 1.0), 0);

  // Lấy danh sách câu hỏi dài nhất trong Phần I để vẽ bảng soi chiếu
  const maxP1Length = Math.max(...variants.map(v => (v.questions || []).filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice').length), 0);
  const maxP2Length = Math.max(...variants.map(v => (v.questions || []).filter(q => q.question_type === 'true_false').length), 0);
  const maxP3Length = Math.max(...variants.map(v => (v.questions || []).filter(q => q.question_type === 'short_answer').length), 0);

  const getP1Answer = (variant, index) => {
    const list = (variant.questions || []).filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
    const q = list[index];
    if (!q) return '-';
    if (Array.isArray(q.correct_answers)) return q.correct_answers.join(', ') || '-';
    return String(q.correct_answers || '-');
  };

  const getP2Answer = (variant, index, optKey) => {
    const list = (variant.questions || []).filter(q => q.question_type === 'true_false');
    const q = list[index];
    if (!q) return '-';
    return getTrueFalseDisplayLabel(q.correct_answers, optKey);
  };

  const getP3Answer = (variant, index) => {
    const list = (variant.questions || []).filter(q => q.question_type === 'short_answer');
    const q = list[index];
    if (!q) return '-';
    if (q.short_answer) return q.short_answer;
    if (Array.isArray(q.correct_answers)) return q.correct_answers[0] || '-';
    return String(q.correct_answers || '-');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[60] flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-6xl h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Thanh Tiêu Đề */}
        <div className="p-3.5 sm:px-6 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                Xem Trước Các Mã Đề Thi Hoán Vị (In Ấn & Đối Soát)
                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold">
                  {variants.length} Mã Đề
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {title} • {grade_name} - {subject_name} • Thời gian: {duration_minutes} phút • Thang điểm: {total_score}đ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle hiển thị đáp án */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowAnswers(false)}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  !showAnswers
                    ? 'bg-blue-600 text-white font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Xem dạng đề in phát cho học sinh làm bài (ẩn đáp án)"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Đề In (Ẩn Đáp Án)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAnswers(true)}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  showAnswers
                    ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Xem bản của giáo viên có kèm đáp án và thang điểm"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Kèm Đáp Án & Barem</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              title="Đóng cửa sổ xem trước"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Thanh Tabs Chọn Mã Đề & Bảng Soi Chiếu */}
        <div className="px-4 sm:px-6 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto shrink-0 py-2">
          <div className="flex items-center gap-1.5 flex-nowrap">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1 shrink-0">
              Mã đề:
            </span>
            {variants.map(v => (
              <button
                key={v.code}
                type="button"
                onClick={() => setSelectedTab(v.code)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs ${
                  selectedTab === v.code
                    ? 'bg-blue-600 text-white border border-blue-600 shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Mã Đề {v.code}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedTab === v.code ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {v.questions.length} câu
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setSelectedTab('crosscheck')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs ${
                selectedTab === 'crosscheck'
                  ? 'bg-emerald-600 text-white border border-emerald-600 shadow-xs'
                  : 'bg-white hover:bg-slate-50 text-emerald-800 border border-emerald-200'
              }`}
              title="Bảng đối soát đáp án tất cả các mã đề song song"
            >
              <Table className="w-3.5 h-3.5 text-emerald-500" />
              <span>📊 Bảng Đáp Án Soi Chiếu</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-medium shrink-0 hidden sm:block">
            {selectedTab === 'crosscheck'
              ? `Soi chiếu ${variants.length} mã đề`
              : `Đang xem: Mã đề ${currentVariant.code}`}
          </div>
        </div>

        {/* Nội Dung Chi Tiết (A4 Sheet Preview) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center">
          {selectedTab === 'crosscheck' ? (
            /* TAB: BẢNG MA TRẬN ĐÁP ÁN SOI CHIẾU ĐỐI SOÁT */
            <div className="w-full max-w-4xl bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-6">
              <div className="text-center pb-4 border-b border-slate-200">
                <h4 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">
                  Bảng Đáp Án Soi Chiếu Đối Soát Các Mã Đề
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  {title} • Môn: {subject_name} • Thời gian: {duration_minutes} phút
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  {variants.map(v => (
                    <span key={v.code} className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-bold text-xs border border-blue-200 font-mono">
                      MĐ {v.code}
                    </span>
                  ))}
                </div>
              </div>

              {/* 1. Phần I: Trắc nghiệm nhiều lựa chọn */}
              {maxP1Length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-sky-900 uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                    Phần I: Đáp Án Trắc Nghiệm Nhiều Lựa Chọn
                  </h5>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                    <table className="w-full text-center text-xs border-collapse">
                      <thead className="bg-sky-50/70 text-sky-950 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3 border-r border-slate-200 w-16">Câu</th>
                          {variants.map(v => (
                            <th key={v.code} className="py-2 px-3 border-r border-slate-200 font-bold">
                              Mã {v.code}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {Array.from({ length: maxP1Length }).map((_, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80">
                            <td className="py-1.5 px-3 border-r border-slate-200 font-bold text-slate-700 bg-slate-50">
                              Câu {idx + 1}
                            </td>
                            {variants.map(v => (
                              <td key={v.code} className="py-1.5 px-3 border-r border-slate-200 font-black text-blue-700">
                                {getP1Answer(v, idx)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. Phần II: Đúng / Sai */}
              {maxP2Length > 0 && (
                <div className="space-y-3 pt-2">
                  <h5 className="text-xs font-bold text-teal-900 uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                    Phần II: Đáp Án Đúng / Sai (Lệnh a, b, c, d)
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {variants.map(v => {
                      const vP2 = (v.questions || []).filter(q => q.question_type === 'true_false');
                      return (
                        <div key={v.code} className="border border-teal-200 rounded-xl overflow-hidden shadow-2xs">
                          <div className="bg-teal-50 px-3 py-1.5 border-b border-teal-200 font-bold text-teal-900 text-xs flex justify-between">
                            <span>Mã đề {v.code}</span>
                            <span className="text-[10px] text-teal-700">{vP2.length} câu</span>
                          </div>
                          <table className="w-full text-center text-xs">
                            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                              <tr>
                                <th className="py-1.5 px-2 border-r border-slate-200">Câu</th>
                                <th className="py-1.5 px-2 border-r border-slate-200">a)</th>
                                <th className="py-1.5 px-2 border-r border-slate-200">b)</th>
                                <th className="py-1.5 px-2 border-r border-slate-200">c)</th>
                                <th className="py-1.5 px-2">d)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                              {vP2.map((q, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="py-1 px-2 border-r border-slate-200 font-bold text-slate-700 bg-slate-50">
                                    C{idx + 1}
                                  </td>
                                  <td className={`py-1 px-2 border-r border-slate-200 ${getP2Answer(v, idx, 'a') === 'Đúng' ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-rose-700'}`}>
                                    {getP2Answer(v, idx, 'a')}
                                  </td>
                                  <td className={`py-1 px-2 border-r border-slate-200 ${getP2Answer(v, idx, 'b') === 'Đúng' ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-rose-700'}`}>
                                    {getP2Answer(v, idx, 'b')}
                                  </td>
                                  <td className={`py-1 px-2 border-r border-slate-200 ${getP2Answer(v, idx, 'c') === 'Đúng' ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-rose-700'}`}>
                                    {getP2Answer(v, idx, 'c')}
                                  </td>
                                  <td className={`py-1 px-2 ${getP2Answer(v, idx, 'd') === 'Đúng' ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-rose-700'}`}>
                                    {getP2Answer(v, idx, 'd')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Phần III: Trả lời ngắn */}
              {maxP3Length > 0 && (
                <div className="space-y-2 pt-2">
                  <h5 className="text-xs font-bold text-emerald-900 uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    Phần III: Đáp Án Trả Lời Ngắn
                  </h5>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                    <table className="w-full text-center text-xs border-collapse">
                      <thead className="bg-emerald-50/70 text-emerald-950 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3 border-r border-slate-200 w-16">Câu</th>
                          {variants.map(v => (
                            <th key={v.code} className="py-2 px-3 border-r border-slate-200 font-bold">
                              Mã {v.code}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {Array.from({ length: maxP3Length }).map((_, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80">
                            <td className="py-1.5 px-3 border-r border-slate-200 font-bold text-slate-700 bg-slate-50">
                              Câu {idx + 1}
                            </td>
                            {variants.map(v => (
                              <td key={v.code} className="py-1.5 px-3 border-r border-slate-200 font-bold text-emerald-800">
                                {getP3Answer(v, idx)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* TAB: XEM ĐỀ THI TỪNG MÃ ĐỀ DẠNG KHUNG IN A4 CHUẨN BỘ GD&ĐT */
            <div className="w-full max-w-4xl bg-white rounded-2xl shadow-md border border-slate-200 p-6 sm:p-10 space-y-6 text-slate-800 font-serif leading-relaxed">
              {/* Header khung đề thi chuẩn DeThiTemplateHeader.docx (Bảng 2 cột 4 hàng) */}
              <div className="border border-slate-400 font-sans text-xs select-none">
                <table className="w-full border-collapse">
                  <tbody>
                    {/* Hàng 1 */}
                    <tr className="border-b border-slate-300">
                      <td className="w-[48%] p-2.5 text-center border-r border-slate-300 align-middle">
                        <div className="font-bold text-slate-900 text-xs uppercase">
                          TRƯỜNG {(customOptions.schoolName || previewData.school_name || schoolInfo.school_name || 'THCS - THPT ĐẶNG CHÍ THANH').toUpperCase()}
                        </div>
                        <div className="text-[11px] text-slate-600 italic mt-0.5">
                          (Đề có {Math.ceil((currentVariant.questions.length || 1) / 5)} trang)
                        </div>
                      </td>
                      <td rowSpan={3} className="w-[52%] p-2.5 text-center align-middle space-y-0.5">
                        <div className="font-extrabold uppercase text-slate-900 text-sm">
                          ĐỀ {customOptions.examTitle || title?.toUpperCase() || 'KIỂM TRA'}
                        </div>
                        <div className="text-[11px] font-bold text-slate-800">
                          NĂM HỌC: {customOptions.schoolYear || schoolInfo.academic_year || '2025 - 2026'}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-700 italic">
                          Môn: {customOptions.subjectName || subject_name} - Khối: {customOptions.gradeName || grade_name} &nbsp; [{currentVariant.code}]
                        </div>
                        <div className="text-[11px] text-slate-600 italic">
                          Thời gian làm bài: {customOptions.durationMinutes || duration_minutes} phút
                        </div>
                      </td>
                    </tr>
                    {/* Hàng 2: Họ tên HS */}
                    <tr className="border-b border-slate-300">
                      <td className="w-[48%] px-3 py-1.5 border-r border-slate-300 text-slate-700">
                        Họ tên HS: ……………………………………………
                      </td>
                    </tr>
                    {/* Hàng 3: Lớp & SBD */}
                    <tr className="border-b border-slate-400">
                      <td className="w-[48%] px-3 py-1.5 border-r border-slate-300 text-slate-700">
                        Lớp: ………. SBD: ……………………………
                      </td>
                    </tr>
                    {/* Hàng 4: Lưu ý làm bài trên phiếu (Gộp 2 cột) */}
                    <tr className="bg-slate-50/50">
                      <td colSpan={2} className="p-2 text-center font-bold text-xs text-slate-900 italic border-t border-slate-400">
                        {customOptions.instructionNote || '(Lưu ý: Thí sinh LÀM BÀI TRÊN PHIẾU TRẢ LỜI TRẮC NGHIỆM)'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* DANH SÁCH CÁC PHẦN THI ĐỒNG BỘ VỚI BACKEND (buildExamSections) */}
              {sections.map((sec) => (
                <div key={sec.partId} className="space-y-4 pt-4 border-t border-slate-300 first:border-t-0 first:pt-0">
                  <div className="font-sans font-bold text-sm text-slate-900 border-b border-slate-200 pb-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span>{sec.fullTitle}</span>
                    <span className="text-xs font-normal text-slate-500 italic">
                      {sec.instruction}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {sec.questions.map((q, idx) => {
                      if (sec.partId === 'part1') {
                        const options = Array.isArray(q.options) ? q.options : [];
                        const correctAns = Array.isArray(q.correct_answers) ? q.correct_answers[0] : q.correct_answers;

                        return (
                          <div key={q.id || idx} className="space-y-2 text-xs">
                            <div className="font-sans font-bold text-slate-900 flex items-start gap-1.5">
                              <span className="shrink-0">Câu {q.partOrder}:</span>
                              <div className="font-normal font-serif text-slate-900 flex-1">
                                <MathContent content={q.content} />
                              </div>
                            </div>

                            {/* 4 Phương án A, B, C, D */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4">
                              {['A', 'B', 'C', 'D'].map((key) => {
                                const opt = options.find(o => o.key === key) || options[['A', 'B', 'C', 'D'].indexOf(key)];
                                const isCorrect = showAnswers && String(correctAns).toUpperCase() === key;

                                return (
                                  <div
                                    key={key}
                                    className={`p-2 rounded-lg border text-xs flex items-start gap-2 transition ${
                                      isCorrect
                                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold shadow-2xs'
                                        : 'bg-white border-slate-200 text-slate-800'
                                    }`}
                                  >
                                    <span className={`font-mono font-bold shrink-0 ${isCorrect ? 'text-emerald-700' : 'text-slate-700'}`}>
                                      {key}.
                                    </span>
                                    <div className="flex-1 font-serif">
                                      <MathContent content={opt?.text || opt?.content || ''} />
                                    </div>
                                    {isCorrect && (
                                      <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9.5px] font-sans font-bold shrink-0">
                                        ĐÁP ÁN
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      if (sec.partId === 'part2') {
                        const options = Array.isArray(q.options) ? q.options : [];
                        const ca = q.correct_answers || {};

                        return (
                          <div key={q.id || idx} className="space-y-2 text-xs">
                            <div className="font-sans font-bold text-slate-900 flex items-start gap-1.5">
                              <span className="shrink-0">Câu {q.partOrder}:</span>
                              <div className="font-normal font-serif text-slate-900 flex-1">
                                <MathContent content={q.content} />
                              </div>
                            </div>

                            {/* 4 Ý a, b, c, d */}
                            <div className="space-y-1.5 pl-4">
                              {['a', 'b', 'c', 'd'].map((key) => {
                                const opt = options.find(o => o.key === key) || options[['a', 'b', 'c', 'd'].indexOf(key)];
                                let valStr = '';
                                if (showAnswers) {
                                  const tfState = getTrueFalseState(ca, key);
                                  if (tfState === 'T') valStr = 'ĐÚNG';
                                  else if (tfState === 'F') valStr = 'SAI';
                                  else valStr = '-';
                                }

                                return (
                                  <div
                                    key={key}
                                    className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                                      valStr === 'ĐÚNG'
                                        ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950 font-medium'
                                        : valStr === 'SAI'
                                        ? 'bg-rose-50/50 border-rose-300 text-rose-950 font-medium'
                                        : 'bg-white border-slate-200 text-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2 flex-1">
                                      <span className="font-mono font-bold text-slate-700 shrink-0">
                                        {key})
                                      </span>
                                      <div className="font-serif">
                                        <MathContent content={opt?.text || opt?.content || ''} />
                                      </div>
                                    </div>
                                    {showAnswers && valStr && (
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-black shrink-0 ${
                                        valStr === 'ĐÚNG' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                      }`}>
                                        {valStr}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      if (sec.partId === 'part3') {
                        return (
                          <div key={q.id || idx} className="space-y-2 text-xs">
                            <div className="font-sans font-bold text-slate-900 flex items-start gap-1.5">
                              <span className="shrink-0">Câu {q.partOrder}:</span>
                              <div className="font-normal font-serif text-slate-900 flex-1">
                                <MathContent content={q.content} />
                              </div>
                            </div>

                            {showAnswers ? (
                              <div className="pl-4">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-xs font-mono font-bold">
                                  <span>Đáp án:</span>
                                  <span className="text-emerald-700 text-sm font-black">
                                    {q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] : '') || '(Chưa nhập)'}
                                  </span>
                                </span>
                              </div>
                            ) : (
                              // Khi thi trên phiếu trắc nghiệm (showPart3AnswerLines !== true), bỏ hoàn toàn dòng đáp án chấm lửng
                              customOptions.showPart3AnswerLines === true && (
                                <div className="pl-4 font-sans text-slate-400 text-[11px] italic">
                                  Trả lời: ........................................................................
                                </div>
                              )
                            )}
                          </div>
                        );
                      }

                      if (sec.partId === 'part4') {
                        return (
                          <div key={q.id || idx} className="space-y-2 text-xs">
                            <div className="font-sans font-bold text-slate-900 flex items-start gap-1.5">
                              <span className="shrink-0">Câu {q.partOrder} ({q.max_score || 1.0} điểm):</span>
                              <div className="font-normal font-serif text-slate-900 flex-1">
                                <MathContent content={q.content} />
                              </div>
                            </div>

                            {showAnswers && q.rubric_guide && (
                              <div className="pl-4 p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-sans text-[11px]">
                                <strong className="text-amber-800 block mb-1">Hướng dẫn chấm & barem:</strong>
                                <div className="font-serif text-slate-700 whitespace-pre-wrap">
                                  <MathContent content={q.rubric_guide} />
                                </div>
                              </div>
                            )}

                            {!showAnswers && !customOptions.omitEssayAnswerSection && (
                              <div className="pl-4 space-y-2 text-slate-400 font-sans text-xs italic">
                                <div>Bài làm:</div>
                                <div className="border-b border-dotted border-slate-300 h-4"></div>
                                <div className="border-b border-dotted border-slate-300 h-4"></div>
                                <div className="border-b border-dotted border-slate-300 h-4"></div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </div>
              ))}

              {/* Footer đề thi */}
              <div className="text-center pt-8 border-t border-slate-300 font-sans font-bold text-xs text-slate-600 space-y-1">
                <div>---------------- HẾT ----------------</div>
                <div className="text-[10px] font-normal italic text-slate-500">
                  (Cán bộ coi thi không giải thích gì thêm)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="p-3.5 sm:px-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay Lại Sửa Ma Trận</span>
          </button>

          <div className="flex items-center gap-2">
            {onExportZip && (
              <button
                type="button"
                onClick={onExportZip}
                disabled={exportingZip || generatingDb}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer"
                title="Tải trọn gói các file Word đề in theo chuẩn MauInDe.docx kèm file Excel ma trận đáp án soi chiếu"
              >
                <Download className="w-4 h-4" />
                {exportingZip ? 'Đang Đóng Gói In (.zip)...' : `Xuất Gói Đề In (.zip)`}
              </button>
            )}

            {onGenerateDb && (
              <button
                type="button"
                onClick={onGenerateDb}
                disabled={generatingDb || exportingZip}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer"
                title="Lưu các mã đề thi này vào CSDL để mở ca thi phòng máy trực tuyến"
              >
                <Sparkles className="w-4 h-4" />
                {generatingDb ? 'Đang Lưu Đề Vào Hệ Thống...' : `Lưu ${variants.length} Đề Vào Hệ Thống`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
